import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, A2W } from './helpers.mjs';
import { checkPhase3, parseWorkflow } from '../.claude/skills/agent-to-webapp/scripts/lib/phase3.mjs';

const STEP = (n, name, actor = 'LLM') => `### 단계 ${n}: ${name}
- 실행 주체: ${actor}
- 입력 스키마:
\`\`\`json
{ "a": "string" }
\`\`\`
- 출력 스키마:
\`\`\`json
{ "b": "string" }
\`\`\`
- 프롬프트 초안: 읽고 뽑아라
- 실패 처리: 2회 재시도 후 사람 확인
`;

const GOOD = `# workflow: rfq\n## 단계\n${STEP(1, '스펙 추출')}${STEP(2, '루트 판정', '코드')}## 규칙화 불가\n- 없음\n`;

function app(text) {
  const a = makeApp();
  write(a, `${A2W}/workflow.md`, text);
  return join(a, A2W);
}

test('parseWorkflow: 단계·필드·규칙화 불가 항목', () => {
  const w = parseWorkflow(GOOD);
  assert.equal(w.steps.length, 2);
  assert.deepEqual(w.steps[0], { n: 1, name: '스펙 추출', actor: 'LLM', hasInputSchema: true, hasOutputSchema: true, failure: '2회 재시도 후 사람 확인' });
  assert.equal(w.steps[1].actor, '코드');
  assert.deepEqual(w.unruled, ['없음']);
  assert.equal(w.hasUnruledSection, true);
});

test('phase3: 정상 통과', () => {
  const r = checkPhase3(app(GOOD));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  assert.equal(r.rejudge, false);
  assert.equal(r.stepCount, 2);
});

test('phase3: json 블록·실패 처리·실행 주체 빠지면 각각 실패', () => {
  const broken = `## 단계\n### 단계 1: x\n- 실행 주체: 로봇\n- 입력 스키마: {"a":1}\n- 출력 스키마:\n\`\`\`json\n{}\n\`\`\`\n## 규칙화 불가\n- 없음\n`;
  const r = checkPhase3(app(broken));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('실행 주체')));
  assert.ok(r.errors.some(e => e.includes('입력 스키마') && e.includes('json')));
  assert.ok(r.errors.some(e => e.includes('실패 처리')));
});

test('phase3: 규칙화 불가 항목은 재배치돼야 통과', () => {
  const ok = GOOD.replace('- 없음', '- 도면 해상도 판단 → LLM 단계 1\n- 납기 누락 -> 사람 확인 지점 2');
  assert.equal(checkPhase3(app(ok)).ok, true);
  const bad = GOOD.replace('- 없음', '- 도면 해상도 판단 (그냥 어려움)');
  const r = checkPhase3(app(bad));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('LLM 단계') && e.includes('사람 확인')));
});

test('phase3: 재판정 항목이 있으면 rejudge', () => {
  const r = checkPhase3(app(GOOD.replace('- 없음', '- 실패 시 수집 순서 자체가 바뀜 → 재판정: 순서가 흔들린다')));
  assert.equal(r.ok, false);
  assert.equal(r.rejudge, true);
});

test('phase3: 규칙화 불가 절이 없으면 경고, 단계가 없으면 실패', () => {
  const r = checkPhase3(app(`## 단계\n${STEP(1, 'a')}`));
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some(w => w.includes('규칙화 불가')));
  assert.equal(checkPhase3(app('# 빈 문서\n')).ok, false);
});
