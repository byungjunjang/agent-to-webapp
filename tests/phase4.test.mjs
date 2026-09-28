import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, rmSync } from 'node:fs';
import { makeApp, write, A2W } from './helpers.mjs';
import { checkPhase4 } from '../.claude/skills/agent-to-webapp/scripts/lib/phase4.mjs';

const REPORT = `# 재검증 report
## 모델
claude-sonnet-5
## 입력 1: easy
차이 없음
## 입력 2: normal
수량 표기 차이
## 입력 3: edge
에스컬레이션 동일
## 사람이 봤어야 할 것
- 없음
## 외부 서비스로 뺄 단계
- 없음
`;

// 3단계 산출물. 4단계 게이트가 steps/ 의 번호·이름·실행 주체를 이것과 대조한다.
const WORKFLOW = `# workflow
## 흐름도
## 단계
### 단계 1: 추출
- 실행 주체: 코드
- 입력 스키마: 공통 스키마 x
- 출력 스키마: 입력과 같음
- 실패 처리: 멈춤
`;

// 단계 파일 하나. 실제 산출물처럼 n·name·actor 가 객체 리터럴의 줄 하나씩이다.
function stepFile(n, name, actor) {
  return `import type { Step } from '../lib/step.ts';\nexport const step${n}: Step = {\n  n: ${n},\n  name: '${name}',\n  actor: '${actor}',\n  run(input) { return input; },\n};\n`;
}

function verifyApp(report = REPORT, { steps = true } = {}) {
  const a = makeApp();
  const v = `${A2W}/verify`;
  write(a, `${A2W}/workflow.md`, WORKFLOW);
  write(a, `${v}/run.ts`, 'export {};');
  write(a, `${v}/package.json`, '{"name":"verify","type":"module"}');
  write(a, `${v}/.gitignore`, 'node_modules\n.env\n');
  write(a, `${v}/lib/step.ts`, 'export {};');
  write(a, `${v}/lib/llm.ts`, 'export {};');
  if (steps) { write(a, `${v}/steps/index.ts`, 'export const steps = [step1];'); write(a, `${v}/steps/01-추출.ts`, stepFile(1, '추출', 'code')); }
  write(a, `${v}/report.md`, report);
  return join(a, A2W);
}

test('phase4: 정상 통과', () => {
  const r = checkPhase4(verifyApp());
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  assert.equal(r.stepCount, 1);
});

test('phase4: steps 없으면 실패', () => {
  const r = checkPhase4(verifyApp(REPORT, { steps: false }));
  assert.ok(r.errors.some(e => e.includes('steps/')));
});

test('phase4: 모델·입력 3·외부 서비스 절 검사', () => {
  const noModel = REPORT.replace('claude-sonnet-5\n', '');
  assert.ok(checkPhase4(verifyApp(noModel)).errors.some(e => e.includes('모델')));
  const twoInputs = REPORT.replace('## 입력 3: edge\n에스컬레이션 동일\n', '');
  assert.ok(checkPhase4(verifyApp(twoInputs)).errors.some(e => e.includes('입력 3')));
  const noExternal = REPORT.replace('## 외부 서비스로 뺄 단계\n- 없음\n', '');
  assert.ok(checkPhase4(verifyApp(noExternal)).errors.some(e => e.includes('외부 서비스')));
});

test('phase4: 사람 절이 없으면 경고만', () => {
  const r = checkPhase4(verifyApp(REPORT.replace('## 사람이 봤어야 할 것\n- 없음\n', '')));
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some(w => w.includes('사람이 봤어야')));
});

test('phase4: verify/.gitignore 에 .env 가 없으면 실패 (API 키 커밋 방지)', () => {
  const d = verifyApp();
  writeFileSync(join(d, 'verify', '.gitignore'), 'node_modules\n', 'utf8');
  const r = checkPhase4(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('.gitignore') && e.includes('.env')));
});

test('phase4: .gitignore 의 /.env, .env/ 표기도 인정한다', () => {
  const d = verifyApp();
  writeFileSync(join(d, 'verify', '.gitignore'), '/node_modules/\r\n/.env\r\n', 'utf8');
  assert.deepEqual(checkPhase4(d).errors, []);
});

test('phase4: 재검증 중 고친 것이 있으면 workflow.md 반영을 경고한다', () => {
  const fixed = REPORT + '## 재검증 중 고친 것\n- 단계 5 도구 스키마를 항목별 판정으로 바꿨다\n';
  const r = checkPhase4(verifyApp(fixed));
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some(w => w.includes('workflow.md')));
  const none = REPORT + '## 재검증 중 고친 것\n- 없음\n';
  assert.ok(!checkPhase4(verifyApp(none)).warnings.some(w => w.includes('workflow.md')));
});

test('phase4: verify 폴더 없으면 실패', () => {
  assert.equal(checkPhase4(join(makeApp(), A2W)).ok, false);
});

// 경량화: 러너와 라이브러리는 스킬 자산이다. LLM 이 쓰는 것은 steps/ 뿐이고, 러너를 고쳤으면 경고한다.
test('phase4: steps/index.ts 가 없으면 실패', () => {
  const d = verifyApp();
  rmSync(join(d, 'verify', 'steps', 'index.ts'));
  const r = checkPhase4(d);
  assert.ok(r.errors.some(e => e.includes('steps/index.ts')));
});

// 러너가 lib/step.ts·lib/llm.ts 를 import 한다. 5단계가 verify/lib/ 를 웹 앱으로 복사한다(2026-09-28 리뷰).
test('phase4: verify/lib/step.ts·llm.ts 가 없으면 실패', () => {
  const d = verifyApp();
  rmSync(join(d, 'verify/lib/llm.ts'));
  assert.ok(checkPhase4(d).errors.some(e => e.includes('verify/lib/llm.ts')));
});

test('phase4: index.ts 만 있고 단계 파일이 없으면 실패', () => {
  const d = verifyApp(REPORT, { steps: false });
  write(d, 'verify/steps/index.ts', 'export const steps = [];');
  assert.ok(checkPhase4(d).errors.some(e => e.includes('steps/') && e.includes('단계')));
});

test('phase4: run.ts·lib 가 템플릿과 다르면 경고, 같으면 조용', () => {
  const skill = makeApp('a2w-skill-');
  write(skill, 'assets/verify-template/run.ts', 'export {};\n');
  write(skill, 'assets/verify-template/lib/step.ts', 'export const x = 1;\n');
  const same = verifyApp();
  write(same, 'verify/lib/step.ts', 'export const x = 1;\r\n');
  assert.ok(!checkPhase4(same, { skillDir: skill }).warnings.some(w => w.includes('템플릿')));
  const changed = verifyApp();
  write(changed, 'verify/run.ts', 'export const hacked = 1;');
  const r = checkPhase4(changed, { skillDir: skill });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some(w => w.includes('run.ts') && w.includes('템플릿')));
});

test('phase4: 입력 절에 차이 표가 없으면 경고', () => {
  const r = checkPhase4(verifyApp());
  assert.ok(r.warnings.some(w => w.includes('입력 1') && w.includes('차이 표')));
  const withTable = REPORT.replace('차이 없음', '| 항목 | 로컬 | 스크립트 | 판정 |\n|---|---|---|---|\n| 단가 | 1 | 1 | 일치 |');
  assert.ok(!checkPhase4(verifyApp(withTable)).warnings.some(w => w.includes('입력 1') && w.includes('차이 표')));
});

test('phase4: runs 가 1 이면 입력 절도 1개만 요구한다', () => {
  const one = REPORT.replace('## 입력 2: normal\n수량 표기 차이\n## 입력 3: edge\n에스컬레이션 동일\n', '');
  assert.ok(checkPhase4(verifyApp(one)).errors.some(e => e.includes('입력 2')));
  assert.deepEqual(checkPhase4(verifyApp(one), { runs: 1 }).errors, []);
});

// 설계서와 코드 대조: workflow.md 의 '### 단계 N' 과 steps/ 의 n·name·actor 가 같아야 한다. 학습자가 3단계에서 승인한
// 설계와 5단계가 웹 앱으로 복사하는 코드가 어긋나는 것을 모델의 자기 보고에 기대지 않고 게이트가 잡는다.
const WORKFLOW2 = WORKFLOW + `### 단계 2: 판정
- 실행 주체: LLM
- 입력 스키마: 단계 1 출력과 같음
- 출력 스키마: 공통 스키마 x
- 실패 처리: 재시도
`;
const OK_FILES = { '01-추출.ts': stepFile(1, '추출', 'code'), '02-판정.ts': stepFile(2, '판정', 'llm') };

function stepsApp(files) {
  const d = verifyApp(REPORT, { steps: false });
  write(d, 'workflow.md', WORKFLOW2);
  write(d, 'verify/steps/index.ts', 'export const steps = [];');
  for (const [f, text] of Object.entries(files)) write(d, `verify/steps/${f}`, text);
  return d;
}

test('phase4: steps 의 번호·이름·실행 주체가 workflow.md 와 같으면 통과', () => {
  const r = checkPhase4(stepsApp(OK_FILES));
  assert.deepEqual(r.errors, []);
  assert.equal(r.stepCount, 2);
});

test('phase4: 단계 이름이 workflow.md 와 다르면 실패', () => {
  const r = checkPhase4(stepsApp({ ...OK_FILES, '02-판정.ts': stepFile(2, '검증', 'llm') }));
  assert.ok(r.errors.some(e => e.includes('단계 2') && e.includes('판정') && e.includes('검증')), r.errors.join('\n'));
});

test('phase4: 실행 주체가 workflow.md 와 다르면 실패', () => {
  const r = checkPhase4(stepsApp({ ...OK_FILES, '02-판정.ts': stepFile(2, '판정', 'code') }));
  assert.ok(r.errors.some(e => e.includes('단계 2') && e.includes('LLM') && e.includes('code')), r.errors.join('\n'));
});

test('phase4: workflow.md 의 단계가 steps/ 에 없으면 실패', () => {
  const r = checkPhase4(stepsApp({ '01-추출.ts': OK_FILES['01-추출.ts'] }));
  assert.ok(r.errors.some(e => e.includes('단계 2') && e.includes('없다')), r.errors.join('\n'));
});

test('phase4: steps/ 에만 있는 단계 번호는 실패', () => {
  const r = checkPhase4(stepsApp({ ...OK_FILES, '03-발송.ts': stepFile(3, '발송', 'code') }));
  assert.ok(r.errors.some(e => e.includes('03-발송.ts') && e.includes('workflow.md')), r.errors.join('\n'));
});

test('phase4: n·name·actor 가 없는 보조 파일은 대조에서 뺀다', () => {
  const r = checkPhase4(stepsApp({ ...OK_FILES, 'common.ts': 'export const round = (x: number) => Math.round(x);\n' }));
  assert.deepEqual(r.errors, []);
});

test('phase4: LLM 단계 파일의 도구 이름(name:)을 단계 이름으로 오인하지 않는다', () => {
  const tool = "const TOOL = {\n  name: 'record_specs',\n  description: 'x',\n  input_schema: {},\n};\n";
  const r = checkPhase4(stepsApp({ ...OK_FILES, '02-판정.ts': tool + stepFile(2, '판정', 'llm') }));
  assert.deepEqual(r.errors, []);
});

test('phase4: 단계 파일에 n 은 있는데 name·actor 가 없으면 실패', () => {
  const broken = 'export const step2 = {\n  n: 2,\n  run(i) { return i; },\n};\n';
  const r = checkPhase4(stepsApp({ ...OK_FILES, '02-판정.ts': broken }));
  assert.ok(r.errors.some(e => e.includes('02-판정.ts') && e.includes('actor')), r.errors.join('\n'));
});

test('phase4: workflow.md 가 없으면 실패', () => {
  const d = stepsApp(OK_FILES);
  rmSync(join(d, 'workflow.md'));
  assert.ok(checkPhase4(d).errors.some(e => e.includes('workflow.md')));
});

// 실행 증거: 러너가 입력마다 남기는 verify/out/<입력>/summary.json 을 게이트가 읽는다. 보고서 글만으로는 통과하지 않는다.
const SUMMARY = { input: '1-easy', status: 'done', attention: null, model: 'claude-sonnet-5', from: 1, total_ms: 41000, timings: [], usage: [], human_notes: [], control: [] };
function withRun(d, name = '1-easy', summary = SUMMARY) {
  write(d, `runs/inputs/${name}/a.pdf`, 'pdf');
  if (summary !== null) write(d, `verify/out/${name}/summary.json`, typeof summary === 'string' ? summary : JSON.stringify(summary));
  return d;
}

test('phase4: 입력 폴더가 있는데 verify/out/<입력>/summary.json 이 없으면 실패', () => {
  const r = checkPhase4(withRun(verifyApp(), '1-easy', null));
  assert.ok(r.errors.some(e => e.includes('out/1-easy/summary.json')), r.errors.join('\n'));
});

test('phase4: summary.json 이 있고 done 이면 통과, needs_attention 이면 경고', () => {
  assert.deepEqual(checkPhase4(withRun(verifyApp())).errors, []);
  const r = checkPhase4(withRun(verifyApp(), '1-easy', { ...SUMMARY, status: 'needs_attention', attention: '[단계 3] 단가 없음' }));
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some(w => w.includes('1-easy') && w.includes('needs_attention')), r.warnings.join('\n'));
});

test('phase4: summary.json 이 JSON 이 아니면 실패', () => {
  const r = checkPhase4(withRun(verifyApp(), '1-easy', '{broken'));
  assert.ok(r.errors.some(e => e.includes('summary.json') && e.includes('JSON')), r.errors.join('\n'));
});

test('phase4: summary 의 model 이 STATUS 의 model 과 다르면 경고', () => {
  const same = checkPhase4(withRun(verifyApp()), { model: 'sonnet' });
  assert.ok(!same.warnings.some(w => w.includes('model')), same.warnings.join('\n'));
  const r = checkPhase4(withRun(verifyApp(), '1-easy', { ...SUMMARY, model: 'claude-haiku-4-5-20251001' }), { model: 'sonnet' });
  assert.ok(r.warnings.some(w => w.includes('claude-haiku-4-5-20251001') && w.includes('claude-sonnet-5')), r.warnings.join('\n'));
});

test('phase4: --from 으로 이어 돌린 summary 는 시간이 부분이라고 경고', () => {
  const r = checkPhase4(withRun(verifyApp(), '1-easy', { ...SUMMARY, from: 3 }));
  assert.ok(r.warnings.some(w => w.includes('--from 3') && w.includes('시간')), r.warnings.join('\n'));
});

test('phase4: report 의 모델 절이 summary 의 model 과 다르면 경고', () => {
  const r = checkPhase4(withRun(verifyApp(REPORT.replace('claude-sonnet-5', 'claude-opus-5'))));
  assert.ok(r.warnings.some(w => w.includes('모델') && w.includes('claude-sonnet-5')), r.warnings.join('\n'));
});
