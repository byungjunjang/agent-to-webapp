import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { BRIEF_HEADINGS } from '../.claude/skills/agent-to-webapp/scripts/lib/phase5.mjs';
import { RUN_HEADINGS } from '../.claude/skills/agent-to-webapp/scripts/lib/phase1.mjs';
import { QUADRANTS, VERDICTS, VERDICT_PREFIX } from '../.claude/skills/agent-to-webapp/scripts/lib/phase2.mjs';
import { FIELD_ACTOR, FIELD_IN, FIELD_OUT, FIELD_FAIL, UNRULED_HEADING, DIAGRAM_HEADING, COMMON_SCHEMA_HEADING } from '../.claude/skills/agent-to-webapp/scripts/lib/phase3.mjs';
import { REPORT_MODEL, REPORT_INPUT, REPORT_HUMAN, REPORT_EXTERNAL, REPORT_FIXES } from '../.claude/skills/agent-to-webapp/scripts/lib/phase4.mjs';

const REF = '.claude/skills/agent-to-webapp/references';

test('port-brief-template.md 는 BRIEF_HEADINGS 일곱 개를 순서대로 담는다', () => {
  const text = readFileSync(`${REF}/port-brief-template.md`, 'utf8');
  let last = -1;
  for (const h of BRIEF_HEADINGS) {
    const i = text.indexOf(`\n${h}\n`);
    assert.ok(i > last, `없거나 순서가 틀림: ${h}`);
    last = i;
  }
  assert.ok(text.includes('## 스타일 (선택)'));
});

test('배포 확인 체크리스트는 브리프 틀 7절 안에 있다 (다음 세션이 스킬 경로 없이 읽는다)', () => {
  assert.ok(!existsSync(`${REF}/deploy-checklist.md`), 'deploy-checklist.md 는 브리프 틀로 흡수됐다');
  const text = readFileSync(`${REF}/port-brief-template.md`, 'utf8');
  const start = text.indexOf('\n## 7. 배포 후 검증\n');
  const end = text.indexOf('\n## ', start + 1);
  const section = text.slice(start, end === -1 ? undefined : end);
  const boxes = section.match(/^- \[ \] /gm) ?? [];
  assert.ok(boxes.length >= 5, `7절 체크박스 ${boxes.length}개`);
  assert.ok(section.includes('deploy-report.md'));
});

// 경량화: 프롬프트는 단계 문서 안에 있다. 게이트가 찾는 고정 문자열이 그 프롬프트에 들어 있어야 한다.
test('phase-N.md 가 자기 프롬프트를 담고, 게이트 상수와 문자열이 같다', () => {
  const doc = (n) => readFileSync(`${REF}/phase-${n}.md`, 'utf8');
  assert.ok(!existsSync(`${REF}/prompts.md`), 'prompts.md 는 단계 문서로 흡수됐다');
  const p1 = doc(1);
  assert.ok(p1.includes('<!-- agent-to-webapp:start -->') && p1.includes('<!-- agent-to-webapp:end -->'));
  for (const h of RUN_HEADINGS) assert.ok(p1.includes(h), h);
  const p2 = doc(2);
  for (const q of QUADRANTS) assert.ok(p2.includes(q), q);
  for (const v of VERDICTS) assert.ok(p2.includes(`${VERDICT_PREFIX} ${v}`), v);
  assert.ok(p2.includes('tools.md'), '색인을 먼저 읽게 한다');
  const p3 = doc(3);
  for (const s of [FIELD_ACTOR, FIELD_IN, FIELD_OUT, FIELD_FAIL, UNRULED_HEADING, DIAGRAM_HEADING, COMMON_SCHEMA_HEADING]) assert.ok(p3.includes(s), s);
  assert.ok(p3.includes('출력과 같음'), '스키마 참조 형식');
  const p4 = doc(4);
  for (const s of [REPORT_MODEL, REPORT_INPUT, REPORT_HUMAN, REPORT_EXTERNAL, REPORT_FIXES]) assert.ok(p4.includes(s), s);
  assert.ok(p4.includes('verify-template') && p4.includes('steps/index.ts') && p4.includes('--from'));
  const p5 = doc(5);
  assert.ok(p5.includes('create-next-app') && p5.includes('src/lib/workflow/'));
});

test('--runs 와 --model 이 SKILL.md 와 단계 문서에 있다', () => {
  const skill = readFileSync('.claude/skills/agent-to-webapp/SKILL.md', 'utf8');
  assert.ok(skill.includes('--runs') && skill.includes('--model'));
  const p1 = readFileSync(`${REF}/phase-1.md`, 'utf8');
  assert.ok(p1.includes('<MODEL>') && p1.includes('runs'));
  const p2 = readFileSync(`${REF}/phase-2.md`, 'utf8');
  assert.ok(p2.includes('관찰 <RUNS>회'), '프롬프트 2 가 관찰 횟수를 말한다');
  const p4 = readFileSync(`${REF}/phase-4.md`, 'utf8');
  assert.ok(p4.includes('A2W_MODEL') && p4.includes('STATUS'));
});

test('병렬 관찰: 프롬프트 1 은 입력 폴더 앞 숫자로 번호를 정하고, 안내는 세션을 동시에 열게 한다', () => {
  const p1 = readFileSync(`${REF}/phase-1.md`, 'utf8');
  assert.ok(p1.includes('입력 폴더 이름의 앞 숫자'), '번호 규칙');
  assert.ok(!p1.includes('이미 있는 run 파일 다음 번호'), '다음 번호 규칙은 없앴다');
  assert.ok(p1.includes('동시에'), '동시 관찰 안내');
  assert.ok(p1.includes('관찰 방식'), 'README 에 동시·차례 판단을 적는다');
});
