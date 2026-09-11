import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
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
  if (steps) write(a, `${v}/steps/step1.ts`, 'export const step1 = () => {};');
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

test('phase4: verify 폴더 없으면 실패', () => {
  assert.equal(checkPhase4(join(makeApp(), A2W)).ok, false);
});
