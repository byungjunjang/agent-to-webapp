import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { BRIEF_HEADINGS } from '../.claude/skills/agent-to-webapp/scripts/lib/phase5.mjs';

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
