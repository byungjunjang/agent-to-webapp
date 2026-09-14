import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeApp, write, A2W } from './helpers.mjs';
import { normalize, hasHeading, sectionBody } from '../.claude/skills/agent-to-webapp/scripts/lib/md.mjs';
import { checkPhase1, buildToolIndex, RUN_HEADINGS } from '../.claude/skills/agent-to-webapp/scripts/lib/phase1.mjs';

const RUN = `# run\n${RUN_HEADINGS[0]}\n1. 읽기\n${RUN_HEADINGS[1]}\n- 도면이 흐려서 재독취\n${RUN_HEADINGS[2]}\n- 없음\n`;

function goodApp() {
  const app = makeApp();
  for (const n of [1, 2, 3]) write(app, `${A2W}/runs/run-${n}.md`, RUN);
  write(app, `${A2W}/runs/inputs/README.md`, '# 왜 이 셋인가\n');
  for (const f of ['easy.md', 'normal.md', 'edge.md']) write(app, `${A2W}/runs/inputs/${f}`, 'x');
  return app;
}

test('md: normalize/hasHeading/sectionBody', () => {
  const t = normalize('# T\r\n## A\r\nbody a\r\n## B\r\n\r\n## C\r\n');
  assert.ok(!t.includes('\r'));
  assert.ok(hasHeading(t, '## A'));
  assert.ok(!hasHeading(t, '## Z'));
  assert.equal(sectionBody(t, '## A'), 'body a');
  assert.equal(sectionBody(t, '## B').trim(), '');
  assert.equal(sectionBody(t, '## Z'), null);
});

test('phase1: 정상 통과', () => {
  const r = checkPhase1(join(goodApp(), A2W));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('phase1: run 2개면 실패, 헤딩 빠지면 실패', () => {
  const app = makeApp();
  write(app, `${A2W}/runs/run-1.md`, RUN);
  write(app, `${A2W}/runs/run-2.md`, '# run\n## 수행한 단계\n');
  write(app, `${A2W}/runs/inputs/README.md`, 'r');
  for (const f of ['a', 'b', 'c']) write(app, `${A2W}/runs/inputs/${f}`, 'x');
  const r = checkPhase1(join(app, A2W));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('3개 이상')));
  assert.ok(r.errors.some(e => e.includes('run-2.md') && e.includes(RUN_HEADINGS[1])));
});

test('phase1: inputs README 없거나 입력 2개면 실패', () => {
  const app = makeApp();
  for (const n of [1, 2, 3]) write(app, `${A2W}/runs/run-${n}.md`, RUN);
  write(app, `${A2W}/runs/inputs/a`, 'x');
  write(app, `${A2W}/runs/inputs/b`, 'x');
  const r = checkPhase1(join(app, A2W));
  assert.ok(r.errors.some(e => e.includes('README.md')));
  assert.ok(r.errors.some(e => e.includes('입력이 2개')));
});

test('phase1: runs/tools/*.jsonl 을 ts 순서로 run-N.tools.jsonl 에 짝짓는다', () => {
  const app = goodApp();
  write(app, `${A2W}/runs/tools/s-b.jsonl`, '{"ts":"2026-09-12T02:00:00Z","tool":"Read"}\n');
  write(app, `${A2W}/runs/tools/s-a.jsonl`, '{"ts":"2026-09-12T01:00:00Z","tool":"Bash"}\n');
  const r = checkPhase1(join(app, A2W));
  assert.equal(r.ok, true);
  const run1 = readFileSync(join(app, A2W, 'runs/run-1.tools.jsonl'), 'utf8');
  assert.ok(run1.includes('"Bash"'));
  assert.ok(existsSync(join(app, A2W, 'runs/run-2.tools.jsonl')));
  assert.ok(!existsSync(join(app, A2W, 'runs/run-3.tools.jsonl')));
  assert.ok(r.warnings.some(w => w.includes('훅 기록 2개') && w.includes('run 파일 3개')));
});

// 경량화: 2단계 서브에이전트가 jsonl 340KB 대신 읽을 색인. 게이트가 코드로 만든다.
const REC = (ts, tool, input) => JSON.stringify({ ts, session: 'sess-1', event: 'PostToolUse', tool, input: JSON.stringify(input) });

test('buildToolIndex: 순번·시각·도구·대상 표와 5분 이상 공백 표시', () => {
  const md = buildToolIndex('run-1', [
    JSON.parse(REC('2026-09-11T08:49:30.000Z', 'Bash', { command: 'ls ../x\n# 두 줄' })),
    JSON.parse(REC('2026-09-11T08:50:00.000Z', 'Read', { file_path: 'C:/t/SKILL.md' })),
    JSON.parse(REC('2026-09-11T09:15:00.000Z', 'Write', { file_path: 'C:/t/out.json' })),
  ]);
  assert.ok(md.startsWith('# run-1 도구 호출 색인'));
  assert.ok(md.includes('sess-1'));
  assert.ok(md.includes('호출 3회'));
  assert.ok(md.includes('| 1 | 08:49:30 | Bash | ls ../x # 두 줄 |'), md);
  assert.ok(md.includes('| 2 | 08:50:00 | Read | SKILL.md |'), md);
  assert.ok(md.includes('| 3 | 09:15:00 | Write | out.json | 공백 25분 0초 |'), md);
  assert.ok(md.includes('Bash 1 · Read 1 · Write 1'));
});

test('buildToolIndex: 대상은 한 줄 80자에서 자르고 옛 형식(내용 포함)도 경로만 뽑는다', () => {
  const md = buildToolIndex('run-2', [
    JSON.parse(REC('2026-09-11T08:00:00.000Z', 'Write', { file_path: 'C:/t/a.md', content: 'x'.repeat(500) })),
    JSON.parse(REC('2026-09-11T08:00:01.000Z', 'Bash', { command: 'c'.repeat(300) })),
    { ts: '2026-09-11T08:00:02.000Z', session: 'sess-1', tool: null, raw: '{"kind":"shell"}' },
  ]);
  assert.ok(md.includes('| 1 | 08:00:00 | Write | a.md |'), md);
  assert.ok(md.includes(`| 2 | 08:00:01 | Bash | ${'c'.repeat(80)}… |`), md);
  assert.ok(md.includes('| 3 | 08:00:02 | ? | {"kind":"shell"} |'), md);
});

test('phase1: 짝지은 run-N.tools.jsonl 마다 run-N.tools.md 색인을 쓴다', () => {
  const app = goodApp();
  write(app, `${A2W}/runs/tools/s.jsonl`, `${REC('2026-09-11T01:00:00.000Z', 'Read', { file_path: 'x.md' })}\n${REC('2026-09-11T01:00:05.000Z', 'Bash', { command: 'ls' })}\n`);
  const r = checkPhase1(join(app, A2W));
  assert.equal(r.ok, true);
  const idx = readFileSync(join(app, A2W, 'runs/run-1.tools.md'), 'utf8');
  assert.ok(idx.includes('| 2 | 01:00:05 | Bash | ls |'));
  assert.ok(r.notes.some(n => n.includes('run-1.tools.md')));
  // 다시 돌리면 다시 만든다(파생 파일). 손으로 고친 것은 남지 않는다
  write(app, `${A2W}/runs/run-1.tools.md`, '손으로 고침');
  checkPhase1(join(app, A2W));
  assert.ok(!readFileSync(join(app, A2W, 'runs/run-1.tools.md'), 'utf8').includes('손으로 고침'));
});

test('buildToolIndex: 절대 경로의 공통 뿌리를 떼어 대상을 짧게 쓴다', () => {
  const md = buildToolIndex('run-1', [
    JSON.parse(REC('2026-09-11T08:00:00.000Z', 'Read', { file_path: 'C:\\Users\\x\\proj\\a.md' })),
    JSON.parse(REC('2026-09-11T08:00:01.000Z', 'Write', { file_path: 'C:/Users/x/proj/sub/b.md' })),
    JSON.parse(REC('2026-09-11T08:00:02.000Z', 'Bash', { command: 'cd "C:/Users/x/proj" && ls ../proj-app' })),
  ]);
  assert.ok(md.includes('경로는 C:/Users/x/proj 기준'), md);
  assert.ok(md.includes('| 1 | 08:00:00 | Read | a.md |'), md);
  assert.ok(md.includes('| 2 | 08:00:01 | Write | sub/b.md |'), md);
  assert.ok(md.includes('| 3 | 08:00:02 | Bash | cd "." && ls ../proj-app |'), md);
});
