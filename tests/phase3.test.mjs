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

const SIMPLIFY = '## 웹 앱 간소화\n- 없음\n';
const GOOD = `# workflow: rfq\n${GOOD_DIAGRAM}## 단계\n${STEP(1, '스펙 추출')}${STEP(2, '루트 판정', '코드')}## 규칙화 불가\n- 없음\n${SIMPLIFY}`;

function app(text) {
  const a = makeApp();
  write(a, `${A2W}/workflow.md`, text);
  return join(a, A2W);
}

test('parseWorkflow: 단계·필드·규칙화 불가 항목', () => {
  const w = parseWorkflow(GOOD);
  assert.equal(w.steps.length, 2);
  assert.deepEqual(w.steps[0], { n: 1, name: '스펙 추출', actor: 'LLM', schemaIn: { json: true, ref: null }, schemaOut: { json: true, ref: null }, failure: '2회 재시도 후 사람 확인' });
  assert.equal(w.steps[1].actor, '코드');
  assert.deepEqual(w.unruled, ['없음']);
  assert.equal(w.hasUnruledSection, true);
});

test('parseDiagram: 노드 번호와 class. 라벨 안의 S9 는 노드가 아니다', () => {
  assert.deepEqual(parseDiagram(GOOD), { found: true, nodes: [1, 2], classes: { 1: 'llm', 2: 'code' }, edges: [[1, 2], [2, 1]] });
  const short = DIAGRAM('S1:::code --> S2{{"2 확인"}}:::human', 'class S3,S4 llm');
  assert.deepEqual(parseDiagram(short), { found: true, nodes: [1, 2, 3, 4], classes: { 1: 'code', 2: 'human', 3: 'llm', 4: 'llm' }, edges: [[1, 2]] });
  assert.deepEqual(parseDiagram('# 흐름도 없음\n'), { found: false, nodes: [], classes: {}, edges: [] });
});

test('parseDiagram: 화살표는 체인·라벨 두 문법·점선을 읽고, 끝점과 잇는 것은 뺀다', () => {
  const d = parseDiagram(DIAGRAM(
    'IN["입력"] --> S1["1 a"] --> S2(["2 b"]) --> S3',
    'S3 -->|"실패: 재추출"| S2',
    'S3 -- "통과" --> S4{{"4 c"}}',
    'S1 -.->|"못 가름"| NA("needs_attention")',
    'S4 -.-> S1',
    'classDef code fill:#e8eef7,stroke:#4a6fa5,color:#1a1a1a',
    'class S1,S3 code',
  ));
  assert.deepEqual(d.edges, [[1, 2], [2, 3], [3, 2], [3, 4], [4, 1]]);
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
  const r = checkPhase3(app(`${DIAGRAM('S1(["1 a"])', 'class S1 llm')}## 단계\n${STEP(1, 'a')}${SIMPLIFY}`));
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some(w => w.includes('규칙화 불가')));
  assert.equal(checkPhase3(app('# 빈 문서\n')).ok, false);
});

// 경량화: 단계 N 의 출력은 대개 단계 N+1 의 입력이다. JSON 을 되풀이하지 않고 참조로 쓴다.
const REF_STEP = (n, name, inLine, outLine, actor = '코드') => `### 단계 ${n}: ${name}
- 실행 주체: ${actor}
- 입력 스키마: ${inLine}
- 출력 스키마: ${outLine}
- 규칙: 그대로
- 실패 처리: 중단
`;
const COMMON = '## 공통 스키마\n### Specs\n```json\n{ "material": "string" }\n```\n';
const DIAGRAM3 = DIAGRAM('S1(["1 a"]) --> S2["2 b"] --> S3{{"3 c"}}', 'class S1 llm', 'class S2 code', 'class S3 human');

test('phase3: 입력 스키마가 앞 단계 출력·공통 스키마·입력과 같음 참조면 통과', () => {
  const text = `${DIAGRAM3}${COMMON}## 단계\n${STEP(1, 'a')}${REF_STEP(2, 'b', '단계 1 출력과 같음', '공통 스키마 Specs')}${REF_STEP(3, 'c', '단계 2 출력과 같음', '입력과 같음', '사람')}## 규칙화 불가\n- 없음\n${SIMPLIFY}`;
  const r = checkPhase3(app(text));
  assert.deepEqual(r.errors, []);
  const w = parseWorkflow(text);
  assert.deepEqual(w.steps[1].schemaIn, { json: false, ref: { step: 1 } });
  assert.deepEqual(w.steps[1].schemaOut, { json: false, ref: { common: 'Specs' } });
  assert.deepEqual(w.steps[2].schemaOut, { json: false, ref: { same: true } });
  assert.deepEqual(w.steps[0].schemaIn, { json: true, ref: null });
});

test('phase3: 참조가 없는 단계·없는 공통 스키마·순환을 가리키면 실패', () => {
  const noStep = `${DIAGRAM3}${COMMON}## 단계\n${STEP(1, 'a')}${REF_STEP(2, 'b', '단계 9 출력과 같음', '공통 스키마 Specs')}${STEP(3, 'c', '사람')}## 규칙화 불가\n- 없음\n`;
  assert.ok(checkPhase3(app(noStep)).errors.some(e => e.includes('단계 2') && e.includes('단계 9')));
  const noCommon = `${DIAGRAM3}## 단계\n${STEP(1, 'a')}${REF_STEP(2, 'b', '단계 1 출력과 같음', '공통 스키마 Specs')}${STEP(3, 'c', '사람')}## 규칙화 불가\n- 없음\n`;
  assert.ok(checkPhase3(app(noCommon)).errors.some(e => e.includes('단계 2') && e.includes('공통 스키마') && e.includes('Specs')));
  const cycle = `${DIAGRAM3}${COMMON}## 단계\n${STEP(1, 'a')}${REF_STEP(2, 'b', '단계 3 출력과 같음', '입력과 같음')}${REF_STEP(3, 'c', '단계 2 출력과 같음', '입력과 같음', '사람')}## 규칙화 불가\n- 없음\n`;
  assert.ok(checkPhase3(app(cycle)).errors.some(e => e.includes('순환')));
});

// 웹 앱 간소화: 3단계가 웹 앱에 필요 없는 단계 경계를 점검했는지. 절이 없으면 실패, 합칠 만한 코드 단계는 경고.
const CODE_STEPS = (n) => Array.from({ length: n }, (_, i) => REF_STEP(i + 1, `c${i + 1}`, i === 0 ? '공통 스키마 Specs' : `단계 ${i} 출력과 같음`, '공통 스키마 Specs')).join('');
const flow = (...lines) => `${DIAGRAM(...lines)}${COMMON}## 단계\n`;

test('phase3: 웹 앱 간소화 절이 없거나 비면 실패', () => {
  const none = checkPhase3(app(GOOD.replace(SIMPLIFY, '')));
  assert.equal(none.ok, false);
  assert.ok(none.errors.some(e => e.includes('## 웹 앱 간소화')));
  const empty = checkPhase3(app(GOOD.replace(SIMPLIFY, '## 웹 앱 간소화\n\n')));
  assert.equal(empty.ok, false);
  assert.ok(empty.errors.some(e => e.includes('## 웹 앱 간소화')));
});

test('phase3: 분기 없이 이어지는 코드 단계는 경고하고 통과는 막지 않는다', () => {
  const text = `${flow('S1["1 c1"] --> S2["2 c2"] --> S3["3 c3"]', 'class S1,S2,S3 code')}${CODE_STEPS(3)}## 규칙화 불가\n- 없음\n${SIMPLIFY}`;
  const r = checkPhase3(app(text));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  const merge = r.warnings.filter(w => w.includes('분기 없이'));
  assert.equal(merge.length, 2);
  assert.ok(merge[0].includes('단계 1·2') && merge[0].includes('## 웹 앱 간소화'));
  assert.ok(merge[1].includes('단계 2·3'));
});

test('phase3: 되돌아가기·건너뛰기가 걸린 코드 단계 쌍과 코드-LLM 쌍은 경고하지 않는다', () => {
  const branched = `${flow(
    'S1["1 c1"] --> S2["2 c2"] --> S3["3 c3"] --> S4["4 c4"]',
    'S2 -->|"검증 실패"| S1',
    'S1 -->|"건너뜀"| S4',
    'class S1,S2,S3,S4 code',
  )}${CODE_STEPS(4)}## 규칙화 불가\n- 없음\n${SIMPLIFY}`;
  const r = checkPhase3(app(branched));
  assert.deepEqual(r.errors, []);
  // 1·2: 1 이 4 로도 간다. 2·3: 2 가 1 로도 간다. 3·4: 4 로 1 이 들어온다
  assert.ok(!r.warnings.some(w => w.includes('분기 없이')), r.warnings.join('\n'));

  const mixed = `${flow('S1(["1 a"]) --> S2["2 b"] --> S3{{"3 c"}}', 'class S1 llm', 'class S2 code', 'class S3 human')}${STEP(1, 'a')}${REF_STEP(2, 'b', '단계 1 출력과 같음', '공통 스키마 Specs')}${REF_STEP(3, 'c', '단계 2 출력과 같음', '입력과 같음', '사람')}## 규칙화 불가\n- 없음\n${SIMPLIFY}`;
  assert.ok(!checkPhase3(app(mixed)).warnings.some(w => w.includes('분기 없이')));
});

// 조건부 판정(override 포함)이면 조건을 흐름도 다음 '## 조건' 에 적는다. 판정은 STATUS verdict, 없으면 verdict.md 에서 읽는다.
test('phase3: 판정이 조건부면 ## 조건 절이 있어야 한다', () => {
  const r = checkPhase3(app(GOOD), { verdict: '조건부 고정 가능' });
  assert.ok(r.errors.some(e => e.includes('## 조건')), r.errors.join('\n'));
  const withCond = GOOD.replace('## 단계\n', '## 조건\n- 관찰 1회, 미관찰 분기: 재견적\n## 단계\n');
  assert.deepEqual(checkPhase3(app(withCond), { verdict: '조건부 고정 가능' }).errors, []);
  assert.deepEqual(checkPhase3(app(GOOD), { verdict: '고정 가능' }).errors, []);
});

test('phase3: STATUS verdict 가 없는 옛 작업은 verdict.md 의 판정 줄로 본다', () => {
  const d = app(GOOD);
  write(d, 'verdict.md', '판정: 조건부 고정 가능(관찰 1회)\n');
  assert.ok(checkPhase3(d).errors.some(e => e.includes('## 조건')));
  assert.deepEqual(checkPhase3(d, { verdict: '고정 가능' }).errors, []);
});
