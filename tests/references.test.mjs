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

test('deploy-checklist.md 가 있고 체크박스가 5개 이상', () => {
  const p = `${REF}/deploy-checklist.md`;
  assert.ok(existsSync(p));
  const boxes = readFileSync(p, 'utf8').match(/^- \[ \] /gm) ?? [];
  assert.ok(boxes.length >= 5, `${boxes.length}개`);
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
