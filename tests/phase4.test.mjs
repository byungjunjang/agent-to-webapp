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

function verifyApp(report = REPORT, { steps = true } = {}) {
  const a = makeApp();
  const v = `${A2W}/verify`;
  write(a, `${v}/run.ts`, 'export {};');
  write(a, `${v}/package.json`, '{"name":"verify","type":"module"}');
  write(a, `${v}/.gitignore`, 'node_modules\n.env\n');
  if (steps) { write(a, `${v}/steps/index.ts`, 'export const steps = [];'); write(a, `${v}/steps/step1.ts`, 'export const step1 = () => {};'); }
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
