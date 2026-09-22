import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, LITE } from './helpers.mjs';
import { checkPhase2, parseVerdict, DASHBOARD_VERDICTS, SKILL_VERDICTS, OVERRIDE_VERDICT } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase2.mjs';

const lite = (app) => join(app, LITE);

test('parseVerdict: 마지막 판정 줄, 조건부가 고정 가능보다 먼저', () => {
  assert.equal(parseVerdict('판정: 고정 가능\n판정: 조건부 고정 가능(관찰 1회)\n', DASHBOARD_VERDICTS), '조건부 고정 가능');
  assert.equal(parseVerdict('판정: 고정 불가\n', DASHBOARD_VERDICTS), '고정 불가');
  assert.equal(parseVerdict('판정 없음\n', DASHBOARD_VERDICTS), null);
  assert.equal(parseVerdict('판정: Claude 호출 유지\n', SKILL_VERDICTS), 'Claude 호출 유지');
});

function dashVerdict(v) {
  return ['## 근거', '- 유일 키 후보 channel + sold_on 가 있다', '- 갱신 시각 열 checked_at 이 있다', '- 412행', '',
    '## 민감 열', '- 없음', '', `판정: ${v}`, ''].join('\n');
}

test('dashboard 2단계: 조건부면 통과', () => {
  const app = makeApp('a2wl-p2-');
  write(app, `${LITE}/verdict.md`, dashVerdict('조건부 고정 가능(관찰 1회)'));
  const r = checkPhase2(lite(app), { mode: 'dashboard' });
  assert.ok(r.ok, r.errors.join(' / '));
  assert.equal(r.verdict, '조건부 고정 가능');
});

test('dashboard 2단계: 관찰 1회 위에서 고정 가능은 거부한다', () => {
  const app = makeApp('a2wl-p2-');
  write(app, `${LITE}/verdict.md`, dashVerdict('고정 가능'));
  const r = checkPhase2(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('조건부')));
});

test('dashboard 2단계: 민감 열 절이 없으면 실패', () => {
  const app = makeApp('a2wl-p2-');
  write(app, `${LITE}/verdict.md`, '## 근거\n- 키 있음\n\n판정: 조건부 고정 가능\n');
  const r = checkPhase2(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('## 민감 열')));
});

test('2단계: 고정 불가는 통과하고 verdict 로 알린다 (CLI 가 종료를 기록한다)', () => {
  const app = makeApp('a2wl-p2-');
  write(app, `${LITE}/verdict.md`, dashVerdict('고정 불가'));
  const r = checkPhase2(lite(app), { mode: 'dashboard' });
  assert.ok(r.ok);
  assert.equal(r.verdict, '고정 불가');
});

test('2단계: override 는 모드별 중간 판정으로 진행한다', () => {
  const app = makeApp('a2wl-p2-');
  write(app, `${LITE}/verdict.md`, dashVerdict('고정 불가'));
  const r = checkPhase2(lite(app), { mode: 'dashboard', override: '사람이 뒤집었다' });
  assert.ok(r.ok);
  assert.equal(r.verdict, OVERRIDE_VERDICT.dashboard);
  assert.ok(r.warnings.some(w => w.includes('override')));
});

function skillVerdict(v) {
  return ['## 근거', '- 제어권: 코드가 순서를 정한다', '- 도구: 도메인 도구만', '- 환경: 몇 초', '',
    '## 출력 구조', '- 샘플 3건 모두 같은 키', '', '## 사람 확인', '- 금액은 사람이 확인한다', '', `판정: ${v}`, ''].join('\n');
}

function makeSamples(app, outputs) {
  outputs.forEach((o, i) => write(app, `${LITE}/runs/sample-${i + 1}/output.json`, o));
}

test('skill 2단계: 키가 같으면 코드로 고정 통과', () => {
  const app = makeApp('a2wl-p2-');
  makeSamples(app, ['{"a":1,"b":2}', '{"b":3,"a":4}']);
  write(app, `${LITE}/verdict.md`, skillVerdict('코드로 고정'));
  const r = checkPhase2(lite(app), { mode: 'skill', samples: 2 });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('skill 2단계: 샘플 키가 다르면 코드로 고정을 거부한다', () => {
  const app = makeApp('a2wl-p2-');
  makeSamples(app, ['{"a":1,"b":2}', '{"a":1}']);
  write(app, `${LITE}/verdict.md`, skillVerdict('코드로 고정'));
  const r = checkPhase2(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('키 집합')));
});

test('skill 2단계: 키가 달라도 Claude 호출 유지는 통과', () => {
  const app = makeApp('a2wl-p2-');
  makeSamples(app, ['{"a":1,"b":2}', '{"a":1}']);
  write(app, `${LITE}/verdict.md`, skillVerdict('Claude 호출 유지'));
  const r = checkPhase2(lite(app), { mode: 'skill', samples: 2 });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('2단계: verdict.md 가 없으면 실패', () => {
  const app = makeApp('a2wl-p2-');
  const r = checkPhase2(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('verdict.md')));
});
