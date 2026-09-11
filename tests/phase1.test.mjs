import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeApp, write, A2W } from './helpers.mjs';
import { normalize, hasHeading, sectionBody } from '../.claude/skills/agent-to-webapp/scripts/lib/md.mjs';
import { checkPhase1, RUN_HEADINGS } from '../.claude/skills/agent-to-webapp/scripts/lib/phase1.mjs';

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
