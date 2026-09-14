import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, A2W } from './helpers.mjs';
import { checkPhase3, parseWorkflow, parseDiagram } from '../.claude/skills/agent-to-webapp/scripts/lib/phase3.mjs';

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

// 흐름도 절. lines 는 flowchart 아래에 들어갈 줄들.
const DIAGRAM = (...lines) => `## 흐름도\n\`\`\`mermaid\nflowchart TD\n${lines.map(l => `  ${l}\n`).join('')}\`\`\`\n`;

const GOOD_DIAGRAM = DIAGRAM(
  'S1(["1 스펙 추출"]) --> S2["2 루트 판정"]',
  'S2 -- "S9 아님 · 1회" --> S1',
  'S2 -.-> NA["needs_attention"]',
  'class S1 llm',
  'class S2 code',
);

const GOOD = `# workflow: rfq\n${GOOD_DIAGRAM}## 단계\n${STEP(1, '스펙 추출')}${STEP(2, '루트 판정', '코드')}## 규칙화 불가\n- 없음\n`;

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

test('parseDiagram: 노드 번호와 class. 라벨 안의 S9 는 노드가 아니다', () => {
  assert.deepEqual(parseDiagram(GOOD), { found: true, nodes: [1, 2], classes: { 1: 'llm', 2: 'code' } });
  const short = DIAGRAM('S1:::code --> S2{{"2 확인"}}:::human', 'class S3,S4 llm');
  assert.deepEqual(parseDiagram(short), { found: true, nodes: [1, 2, 3, 4], classes: { 1: 'code', 2: 'human', 3: 'llm', 4: 'llm' } });
  assert.deepEqual(parseDiagram('# 흐름도 없음\n'), { found: false, nodes: [], classes: {} });
});

test('phase3: 정상 통과', () => {
  const r = checkPhase3(app(GOOD));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  assert.equal(r.rejudge, false);
  assert.equal(r.stepCount, 2);
});

test('phase3: json 블록·실패 처리·실행 주체 빠지면 각각 실패', () => {
  const broken = `${DIAGRAM('S1["1 x"]', 'class S1 code')}## 단계\n### 단계 1: x\n- 실행 주체: 로봇\n- 입력 스키마: {"a":1}\n- 출력 스키마:\n\`\`\`json\n{}\n\`\`\`\n## 규칙화 불가\n- 없음\n`;
  const r = checkPhase3(app(broken));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('실행 주체')));
  assert.ok(r.errors.some(e => e.includes('입력 스키마') && e.includes('json')));
  assert.ok(r.errors.some(e => e.includes('실패 처리')));
});

test('phase3: 흐름도 절이나 mermaid 블록이 없으면 실패', () => {
  const none = checkPhase3(app(GOOD.replace(GOOD_DIAGRAM, '')));
  assert.equal(none.ok, false);
  assert.ok(none.errors.some(e => e.includes('흐름도') && e.includes('mermaid')));
  const plain = checkPhase3(app(GOOD.replace('```mermaid', '```')));
  assert.equal(plain.ok, false);
  assert.ok(plain.errors.some(e => e.includes('mermaid')));
});

test('phase3: 흐름도 노드가 단계 헤딩과 어긋나면 실패', () => {
  const missing = checkPhase3(app(GOOD.replace(GOOD_DIAGRAM, DIAGRAM('S1(["1 스펙 추출"]) --> DONE', 'class S1 llm'))));
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some(e => e.includes('S2') && e.includes('없음')));
  const extra = checkPhase3(app(GOOD.replace('class S2 code', 'class S2 code\n  S2 --> S3["3 유령"]\n  class S3 code')));
  assert.equal(extra.ok, false);
  assert.ok(extra.errors.some(e => e.includes('S3') && e.includes('단계 3')));
});

test('phase3: 흐름도 class 가 실행 주체와 다르면 실패', () => {
  const wrong = checkPhase3(app(GOOD.replace('class S2 code', 'class S2 llm')));
  assert.equal(wrong.ok, false);
  assert.ok(wrong.errors.some(e => e.includes('단계 2') && e.includes('코드') && e.includes('llm')));
  const noClass = checkPhase3(app(GOOD.replace('  class S2 code\n', '')));
  assert.equal(noClass.ok, false);
  assert.ok(noClass.errors.some(e => e.includes('단계 2') && e.includes('class')));
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
  const r = checkPhase3(app(`${DIAGRAM('S1(["1 a"])', 'class S1 llm')}## 단계\n${STEP(1, 'a')}`));
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some(w => w.includes('규칙화 불가')));
  assert.equal(checkPhase3(app('# 빈 문서\n')).ok, false);
});
