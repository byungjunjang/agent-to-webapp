import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, LITE } from './helpers.mjs';
import { checkPhase4, DASHBOARD_REPORT_HEADINGS, SKILL_REPORT_HEADINGS } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase4.mjs';

const lite = (app) => join(app, LITE);

function schemaDoc(rows) {
  return ['## 출처', 'out/sales.csv', '', '## 열', '',
    '| 열 | 타입 | 예시값 | 빈 값 비율 |', '|---|---|---|---|', ...rows, '',
    '## 행 수', '412', '', '## 유일 키 후보', 'channel + sold_on', '',
    '## 갱신 시각 열', 'checked_at', '', '## LLM 문장 열', '- 없음', '', '## 민감 열 후보', '- 없음', ''].join('\n');
}

const BASE = ['| channel | 문자열 | 스마트스토어 | 0% |', '| sold_on | 날짜 | 2026-09-20 | 0% |', '| revenue | 정수 | 1250000 | 0% |'];

function contractDoc() {
  return ['## 테이블', 'channel_sales', '', '## 열', '',
    '| 열 | 타입 | 필수 | 설명 |', '|---|---|---|---|',
    '| channel | 문자열 | 예 | 채널 |', '| sold_on | 날짜 | 예 | 판매일 |', '| revenue | 정수 | 예 | 매출 |', '',
    '## 유일 키', 'channel + sold_on', '', '## 갱신 시각', 'checked_at', '',
    '## upsert 규칙', '덮어쓴다', '', '## 갱신 주체', '마지막 단계', '', '## 제외 열', '- 없음', '',
    '## 파생 집계', '- 없음', '', '## 에이전트에 추가할 마지막 단계', 'upsert', ''].join('\n');
}

function report({ dup = '없음', body = '차이 없음' } = {}) {
  return ['## 스키마 diff', body, '', '## 키 중복', dup, '', '## 판정', '계약 그대로 간다', ''].join('\n');
}

function dashFixture(app, { run2 = BASE, rep = report() } = {}) {
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc(BASE));
  write(app, `${LITE}/runs/run-2.schema.md`, schemaDoc(run2));
  write(app, `${LITE}/contract.md`, contractDoc());
  write(app, `${LITE}/verify/report.md`, rep);
}

test('dashboard 4단계: 두 관찰이 같으면 통과', () => {
  const app = makeApp('a2wl-p4-');
  dashFixture(app);
  const r = checkPhase4(lite(app), { mode: 'dashboard' });
  assert.ok(r.ok, r.errors.join(' / '));
  assert.deepEqual(r.breaking, []);
});

test('dashboard 4단계: 통과하면 조건부 판정을 고정 가능으로 확정해 돌려준다. 실패면 확정하지 않는다', () => {
  const app = makeApp('a2wl-p4-');
  dashFixture(app);
  assert.equal(checkPhase4(lite(app), { mode: 'dashboard', verdict: '조건부 고정 가능' }).verdict, '고정 가능');
  assert.equal(checkPhase4(lite(app), { mode: 'dashboard' }).verdict, null);
  const bad = makeApp('a2wl-p4-');
  dashFixture(bad, { rep: report({ dup: '3건' }) });
  assert.equal(checkPhase4(lite(bad), { mode: 'dashboard', verdict: '조건부 고정 가능' }).verdict, null);
});

test('dashboard 4단계: 계약 열이 사라지면 실패', () => {
  const app = makeApp('a2wl-p4-');
  dashFixture(app, { run2: BASE.slice(0, 2), rep: report({ body: 'revenue 열이 사라졌다' }) });
  const r = checkPhase4(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('revenue')));
  assert.ok(r.errors.some(e => e.includes('rollback 3')));
});

test('dashboard 4단계: 타입이 바뀌면 실패', () => {
  const app = makeApp('a2wl-p4-');
  const run2 = ['| channel | 문자열 | 스마트스토어 | 0% |', '| sold_on | 날짜 | 2026-09-20 | 0% |', '| revenue | 문자열 | 1,250,000 | 0% |'];
  dashFixture(app, { run2, rep: report({ body: 'revenue 타입이 정수 → 문자열' }) });
  const r = checkPhase4(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('타입')));
});

test('dashboard 4단계: 깨지는 변경을 보고서가 안 적으면 실패', () => {
  const app = makeApp('a2wl-p4-');
  dashFixture(app, { run2: BASE.slice(0, 2), rep: report({ body: '차이 없음' }) });
  const r = checkPhase4(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('보고서')));
});

test('dashboard 4단계: 키 중복이 없음이 아니면 실패', () => {
  const app = makeApp('a2wl-p4-');
  dashFixture(app, { rep: report({ dup: '3건' }) });
  const r = checkPhase4(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('키 중복')));
});

test('dashboard 4단계: 새 열은 경고로만 알린다', () => {
  const app = makeApp('a2wl-p4-');
  dashFixture(app, { run2: [...BASE, '| orders | 정수 | 12 | 0% |'] });
  const r = checkPhase4(lite(app), { mode: 'dashboard' });
  assert.ok(r.ok, r.errors.join(' / '));
  assert.ok(r.warnings.some(w => w.includes('orders')));
});

// skill 모드
function specDoc() {
  return ['## 입력 스키마', '', '```json', '{ "file": "PDF" }', '```', '',
    '## 출력 스키마', '', '```json', '{ "barcode": "문자열", "items": "배열" }', '```', '',
    '## 사람 확인', '- 확인한다', '', '## 실패 처리', '- 멈춘다', ''].join('\n');
}

function skillReport() {
  return ['## 스키마 일치율', '2/2', '', '## 샘플별 차이', '- 1번 단가가 다르다', '', '## 사람 개입', '- 줄었다', ''].join('\n');
}

function skillFixture(app, { verify = ['{"barcode":"1","items":[]}', '{"barcode":"2","items":[]}'], rep = skillReport() } = {}) {
  write(app, `${LITE}/skill-spec.md`, specDoc());
  verify.forEach((v, i) => {
    write(app, `${LITE}/runs/sample-${i + 1}/output.json`, '{"barcode":"x","items":[]}');
    write(app, `${LITE}/verify/sample-${i + 1}.json`, v);
  });
  write(app, `${LITE}/verify/report.md`, rep);
}

test('skill 4단계: 샘플 N건이 스펙 키를 채우면 통과', () => {
  const app = makeApp('a2wl-p4-');
  skillFixture(app);
  const r = checkPhase4(lite(app), { mode: 'skill', samples: 2 });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('skill 4단계: 재검증 결과가 없으면 실패', () => {
  const app = makeApp('a2wl-p4-');
  skillFixture(app, { verify: ['{"barcode":"1","items":[]}'] });
  const r = checkPhase4(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('verify/sample-2.json')));
});

test('skill 4단계: 스펙 키가 빠진 샘플이 있으면 실패하고 rollback 3 을 안내한다', () => {
  const app = makeApp('a2wl-p4-');
  skillFixture(app, { verify: ['{"barcode":"1","items":[]}', '{"barcode":"2"}'] });
  const r = checkPhase4(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('sample-2') && e.includes('items')));
  assert.ok(r.errors.some(e => e.includes('rollback 3')));
});

test('skill 4단계: 보고서 절이 없으면 실패', () => {
  const app = makeApp('a2wl-p4-');
  skillFixture(app, { rep: '## 사람 개입\n- 줄었다\n' });
  const r = checkPhase4(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('## 스키마 일치율')));
});

test('상수: 모드별 보고서 절 셋씩', () => {
  assert.equal(DASHBOARD_REPORT_HEADINGS.length, 3);
  assert.equal(SKILL_REPORT_HEADINGS.length, 3);
});
