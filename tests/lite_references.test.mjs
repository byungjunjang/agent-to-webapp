import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCHEMA_HEADINGS, RUN_HEADINGS } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase1.mjs';
import { DASHBOARD_VERDICTS, SKILL_VERDICTS, VERDICT_PREFIX, DASHBOARD_SECTIONS, SKILL_SECTIONS } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase2.mjs';
import { CONTRACT_HEADINGS, SPEC_HEADINGS, SPEC_RULES, SPEC_PROMPT, SPEC_FIELDS } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase3.mjs';
import { DASHBOARD_REPORT_HEADINGS, SKILL_REPORT_HEADINGS } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase4.mjs';
import {
  DASHBOARD_BRIEF_HEADINGS, SKILL_BRIEF_HEADINGS, DASHBOARD_PROMPT_MUST, SKILL_PROMPT_MUST,
  TIERS_HEADING, TIERS, ISSUES_HEADING, DECISION, PROTECTION, FRESHNESS, DURATION_KEYWORD, HUMAN_CHECK,
} from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase5.mjs';

const REF = '.claude/skills/agent-to-webapp-lite/references';
const doc = (mode, n) => readFileSync(`${REF}/${mode}/phase-${n}.md`, 'utf8');

test('dashboard 단계 문서가 게이트 상수를 담는다', () => {
  const p1 = doc('dashboard', 1);
  for (const h of SCHEMA_HEADINGS) assert.ok(p1.includes(h), h);
  const p2 = doc('dashboard', 2);
  for (const v of DASHBOARD_VERDICTS) assert.ok(p2.includes(`${VERDICT_PREFIX} ${v}`), v);
  for (const s of DASHBOARD_SECTIONS) assert.ok(p2.includes(s), s);
  const p3 = doc('dashboard', 3);
  for (const h of CONTRACT_HEADINGS) assert.ok(p3.includes(h), h);
  const p4 = doc('dashboard', 4);
  // 4단계 게이트가 run-2 에 checkSchemaDoc 을 쓰므로 일곱 절 전부가 문서에 있어야 한다
  for (const h of [...SCHEMA_HEADINGS, ...DASHBOARD_REPORT_HEADINGS]) assert.ok(p4.includes(h), h);
  assert.ok(p4.includes('rollback 3'));
  const p5 = doc('dashboard', 5);
  for (const h of DASHBOARD_BRIEF_HEADINGS) assert.ok(p5.includes(h), h);
});

test('skill 단계 문서가 게이트 상수를 담는다', () => {
  const p1 = doc('skill', 1);
  for (const h of RUN_HEADINGS) assert.ok(p1.includes(h), h);
  assert.ok(p1.includes('output.json'));
  const p2 = doc('skill', 2);
  for (const v of SKILL_VERDICTS) assert.ok(p2.includes(`${VERDICT_PREFIX} ${v}`), v);
  for (const s of SKILL_SECTIONS) assert.ok(p2.includes(s), s);
  const p3 = doc('skill', 3);
  for (const s of [...SPEC_HEADINGS, SPEC_RULES, SPEC_PROMPT, ...SPEC_FIELDS]) assert.ok(p3.includes(s), s);
  const p4 = doc('skill', 4);
  for (const h of SKILL_REPORT_HEADINGS) assert.ok(p4.includes(h), h);
  assert.ok(p4.includes('rollback 3'));
  const p5 = doc('skill', 5);
  for (const h of SKILL_BRIEF_HEADINGS) assert.ok(p5.includes(h), h);
});

test('프롬프트 5 가 PROMPT_MUST 를 그대로 담는다', () => {
  const d5 = doc('dashboard', 5);
  const di = d5.indexOf('### 프롬프트 5');
  assert.ok(di !== -1, 'dashboard phase-5 에 프롬프트 5 절');
  for (const m of DASHBOARD_PROMPT_MUST) assert.ok(d5.slice(di).includes(m), `dashboard 프롬프트 5 에 ${m}`);
  const s5 = doc('skill', 5);
  const si = s5.indexOf('### 프롬프트 5');
  assert.ok(si !== -1, 'skill phase-5 에 프롬프트 5 절');
  for (const m of SKILL_PROMPT_MUST) assert.ok(s5.slice(si).includes(m), `skill 프롬프트 5 에 ${m}`);
});

test('브리프 틀이 헤딩을 순서대로 담고 고정 문자열이 있다', () => {
  const pairs = [
    ['brief-template-dashboard.md', DASHBOARD_BRIEF_HEADINGS, [FRESHNESS, PROTECTION]],
    ['brief-template-skill.md', SKILL_BRIEF_HEADINGS, [DURATION_KEYWORD, PROTECTION, HUMAN_CHECK]],
  ];
  for (const [file, headings, musts] of pairs) {
    const text = readFileSync(`${REF}/${file}`, 'utf8');
    let last = -1;
    for (const h of headings) {
      const i = text.indexOf(`\n${h}\n`);
      assert.ok(i > last, `${file}: 없거나 순서가 틀림 ${h}`);
      last = i;
    }
    for (const s of [TIERS_HEADING, ISSUES_HEADING, DECISION, ...TIERS, ...musts]) assert.ok(text.includes(s), `${file}: ${s}`);
    const deploy = text.slice(text.indexOf(`\n${headings[6]}\n`));
    const boxes = deploy.match(/^- \[ \] /gm) ?? [];
    assert.ok(boxes.length >= 5, `${file}: 7절 체크박스 ${boxes.length}개`);
  }
});

test('단계 문서가 자기 게이트 명령을 알려준다', () => {
  for (const mode of ['dashboard', 'skill']) {
    for (const n of [1, 2, 3, 4, 5]) {
      assert.ok(doc(mode, n).includes(`check_lite.mjs ${n}`), `${mode}/phase-${n}`);
    }
    assert.ok(doc(mode, 2).includes('--approve'));
    assert.ok(doc(mode, 3).includes('--approve'));
  }
});

test('skill 브리프 틀: API 키 줄은 판정이 Claude 호출 유지일 때만이다', () => {
  const text = readFileSync(`${REF}/brief-template-skill.md`, 'utf8');
  const keyLines = text.split('\n').filter(l => /ANTHROPIC_API_KEY|API 키|sk-ant|\.env\.local/.test(l));
  assert.ok(keyLines.length >= 2, '키 안내 자체는 남는다');
  for (const l of keyLines) assert.ok(l.includes('Claude 호출 유지'), `조건 없이 키를 전제한다: ${l}`);
});
