import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, LITE } from './helpers.mjs';
import { checkPhase1, SCHEMA_HEADINGS, RUN_HEADINGS } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase1.mjs';

const lite = (app) => join(app, LITE);

// 통과하는 dashboard 스키마 문서 한 벌
function goodSchema() {
  return [
    '## 출처', 'out/sales.csv (시트 "채널매출" 내보내기)', '',
    '## 열', '',
    '| 열 | 타입 | 예시값 | 빈 값 비율 |',
    '|---|---|---|---|',
    '| channel | 문자열 | 스마트스토어 | 0% |',
    '| sold_on | 날짜 | 2026-09-20 | 0% |',
    '| revenue | 정수 | 1250000 | 0% |',
    '| checked_at | 날짜 | 2026-09-21 09:00 | 0% |',
    '| note | 문자열 | 재고 확인 필요 | 40% |', '',
    '## 행 수', '412', '',
    '## 유일 키 후보', 'channel + sold_on', '',
    '## 갱신 시각 열', 'checked_at', '',
    '## LLM 문장 열', '- note', '',
    '## 민감 열 후보', '- 없음', '',
  ].join('\n');
}

test('dashboard 1단계: 일곱 절과 열 한 개 이상이면 통과', () => {
  const app = makeApp('a2wl-p1-');
  write(app, `${LITE}/runs/run-1.schema.md`, goodSchema());
  const r = checkPhase1(lite(app), { mode: 'dashboard' });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('dashboard 1단계: 스키마 파일이 없으면 실패', () => {
  const app = makeApp('a2wl-p1-');
  const r = checkPhase1(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('run-1.schema.md')));
});

test('dashboard 1단계: 절이 빠지거나 비면 실패', () => {
  const app = makeApp('a2wl-p1-');
  write(app, `${LITE}/runs/run-1.schema.md`, goodSchema().replace('## 유일 키 후보\nchannel + sold_on', '## 유일 키 후보\n'));
  const r = checkPhase1(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('## 유일 키 후보')));
});

test('dashboard 1단계: 열 표가 머리글뿐이면 실패', () => {
  const app = makeApp('a2wl-p1-');
  const text = goodSchema().replace(/\| channel[\s\S]*?\| note[^\n]*\n/, '');
  write(app, `${LITE}/runs/run-1.schema.md`, text);
  const r = checkPhase1(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('열이 하나도')));
});

// skill 모드
function goodRun1() {
  return [
    '## 수행한 단계', '1. PDF 를 읽는다', '2. 품목 표를 뽑는다', '',
    '## 판단이 필요했던 지점', '- FOC 표기가 샘플마다 다르다', '',
    '## 예상과 달라서 방식을 바꾼 지점', '- 3번은 표가 두 장으로 갈려 있었다', '',
    '## 샘플별 기록', '',
    '| 샘플 | 입력 파일 | 사람 개입 |',
    '|---|---|---|',
    '| 1 | inv-1.pdf | 없음 |',
    '| 2 | inv-2.pdf | 단가 확인 |', '',
  ].join('\n');
}

function makeSamples(app, n, { output = '{"barcode":"8801","items":[]}' } = {}) {
  for (let k = 1; k <= n; k++) {
    write(app, `${LITE}/runs/sample-${k}/inv-${k}.pdf`, 'PDF');
    write(app, `${LITE}/runs/sample-${k}/output.json`, output);
  }
}

test('skill 1단계: 샘플 N건과 네 절이면 통과', () => {
  const app = makeApp('a2wl-p1-');
  write(app, `${LITE}/runs/run-1.md`, goodRun1());
  makeSamples(app, 3);
  const r = checkPhase1(lite(app), { mode: 'skill', samples: 3 });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('skill 1단계: 샘플이 모자라면 실패', () => {
  const app = makeApp('a2wl-p1-');
  write(app, `${LITE}/runs/run-1.md`, goodRun1());
  makeSamples(app, 2);
  const r = checkPhase1(lite(app), { mode: 'skill', samples: 3 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('sample-3')));
});

test('skill 1단계: output.json 이 깨지면 실패', () => {
  const app = makeApp('a2wl-p1-');
  write(app, `${LITE}/runs/run-1.md`, goodRun1());
  makeSamples(app, 1);
  write(app, `${LITE}/runs/sample-1/output.json`, '{ 깨진');
  const r = checkPhase1(lite(app), { mode: 'skill', samples: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('JSON')));
});

test('skill 1단계: 입력 파일이 없으면 실패', () => {
  const app = makeApp('a2wl-p1-');
  write(app, `${LITE}/runs/run-1.md`, goodRun1());
  write(app, `${LITE}/runs/sample-1/output.json`, '{"a":1}');
  const r = checkPhase1(lite(app), { mode: 'skill', samples: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('입력 파일')));
});

test('상수: 스키마 일곱 절, run 네 절', () => {
  assert.equal(SCHEMA_HEADINGS.length, 7);
  assert.equal(RUN_HEADINGS.length, 4);
});
