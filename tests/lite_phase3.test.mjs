import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, LITE } from './helpers.mjs';
import { checkPhase3, excludedColumns, CONTRACT_HEADINGS, SPEC_HEADINGS } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase3.mjs';

const lite = (app) => join(app, LITE);

function schemaDoc() {
  return ['## 출처', 'out/sales.csv', '', '## 열', '',
    '| 열 | 타입 | 예시값 | 빈 값 비율 |', '|---|---|---|---|',
    '| channel | 문자열 | 스마트스토어 | 0% |',
    '| sold_on | 날짜 | 2026-09-20 | 0% |',
    '| revenue | 정수 | 1250000 | 0% |',
    '| checked_at | 날짜 | 2026-09-21 | 0% |',
    '| memo | 문자열 | 개인 메모 | 10% |', '',
    '## 행 수', '412', '', '## 유일 키 후보', 'channel + sold_on', '',
    '## 갱신 시각 열', 'checked_at', '', '## LLM 문장 열', '- 없음', '', '## 민감 열 후보', '- memo', ''].join('\n');
}

function contract({ key = 'channel + sold_on', excluded = '- memo', owner = '에이전트 마지막 단계', cols } = {}) {
  return ['## 테이블', 'channel_sales', '', '## 열', '',
    '| 열 | 타입 | 필수 | 설명 |', '|---|---|---|---|',
    ...(cols ?? ['| channel | 문자열 | 예 | 판매 채널 |', '| sold_on | 날짜 | 예 | 판매일 |', '| revenue | 정수 | 예 | 매출 |', '| checked_at | 날짜 | 예 | 점검 시각 |']),
    '', '## 유일 키', key, '', '## 갱신 시각', 'checked_at', '',
    '## upsert 규칙', '같은 키면 덮어쓴다', '', '## 갱신 주체', owner, '',
    '## 제외 열', excluded, '', '## 파생 집계', '- 없음', '',
    '## 에이전트에 추가할 마지막 단계', 'CSV 를 읽어 Supabase 에 upsert 한다', ''].join('\n');
}

test('dashboard 3단계: 아홉 절이 차 있고 계약 열이 관찰 열 안이면 통과', () => {
  const app = makeApp('a2wl-p3-');
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  write(app, `${LITE}/contract.md`, contract());
  const r = checkPhase3(lite(app), { mode: 'dashboard' });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('dashboard 3단계: 유일 키가 없음이면 실패', () => {
  const app = makeApp('a2wl-p3-');
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  write(app, `${LITE}/contract.md`, contract({ key: '없음' }));
  const r = checkPhase3(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('유일 키')));
});

test('dashboard 3단계: 관찰에 없는 열을 계약에 넣으면 실패', () => {
  const app = makeApp('a2wl-p3-');
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  write(app, `${LITE}/contract.md`, contract({ cols: ['| channel | 문자열 | 예 | 채널 |', '| margin | 정수 | 예 | 관찰에 없는 열 |'] }));
  const r = checkPhase3(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('margin')));
});

test('dashboard 3단계: 갱신 주체가 비면 실패', () => {
  const app = makeApp('a2wl-p3-');
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  write(app, `${LITE}/contract.md`, contract({ owner: '' }));
  const r = checkPhase3(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('## 갱신 주체')));
});

test('dashboard 3단계: run-1.schema.md 가 없으면 대조할 수 없다고 실패', () => {
  const app = makeApp('a2wl-p3-');
  write(app, `${LITE}/contract.md`, contract());
  const r = checkPhase3(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('run-1.schema.md')));
});

test('excludedColumns: 목록에서 이름만, 없음은 뺀다', () => {
  assert.deepEqual(excludedColumns(contract({ excluded: '- memo\n- account_no' })), ['memo', 'account_no']);
  assert.deepEqual(excludedColumns(contract({ excluded: '- 없음' })), []);
});

test('excludedColumns: 띄어쓰기·하이픈이 든 이름을 자르지 않는다', () => {
  assert.deepEqual(excludedColumns(contract({ excluded: '- 상담 원문\n- e-mail' })), ['상담 원문', 'e-mail']);
  // 뒤에 붙는 사유는 뗀다: 괄호, ' — ', ' - ', ' · ', ':'
  assert.deepEqual(
    excludedColumns(contract({ excluded: '- memo (개인 메모)\n- account_no — 계좌\n- 상담 원문 - 원문\n- salary · 급여\n- 개인 이름: 실명' })),
    ['memo', 'account_no', '상담 원문', 'salary', '개인 이름']);
  // 백틱이 있으면 백틱 안이 이름이다
  assert.deepEqual(excludedColumns(contract({ excluded: '- `상담 원문` 은 뺀다\n- **e-mail**' })), ['상담 원문', 'e-mail']);
});

// skill 모드
function spec({ verdict = 'Claude 호출 유지', out = '{ "barcode": "문자열", "items": "배열" }', extra } = {}) {
  const head = ['## 입력 스키마', '', '```json', '{ "file": "PDF 한 건" }', '```', '',
    '## 출력 스키마', '', '```json', out, '```', ''];
  const branch = verdict === '코드로 고정'
    ? ['## 규칙', '- 바코드는 첫 줄의 숫자 13자리', '']
    : ['## 프롬프트', '', '```', '인보이스에서 바코드와 품목을 뽑아 JSON 으로 답하라', '```', '',
      '- 모델: claude-sonnet-5-5', '- 최대 토큰: 4096', '- 타임아웃: 60초', ''];
  return [...head, ...branch, ...(extra ?? []),
    '## 사람 확인', '- 확신도가 낮으면 사람이 고친다', '', '## 실패 처리', '- 멈추고 원인을 보여준다', ''].join('\n');
}

function skillFixture(app, { verdict = 'Claude 호출 유지', outputs = ['{"barcode":"1","items":[]}', '{"barcode":"2","items":[]}'] } = {}) {
  outputs.forEach((o, i) => write(app, `${LITE}/runs/sample-${i + 1}/output.json`, o));
  write(app, `${LITE}/verdict.md`, `## 근거\n- x\n\n## 출력 구조\n- x\n\n## 사람 확인\n- x\n\n판정: ${verdict}\n`);
}

test('skill 3단계: 스키마 블록과 프롬프트 필드가 있으면 통과', () => {
  const app = makeApp('a2wl-p3-');
  skillFixture(app);
  write(app, `${LITE}/skill-spec.md`, spec());
  const r = checkPhase3(lite(app), { mode: 'skill', samples: 2 });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('skill 3단계: 출력 스키마가 공통 샘플 키를 빠뜨리면 실패', () => {
  const app = makeApp('a2wl-p3-');
  skillFixture(app);
  write(app, `${LITE}/skill-spec.md`, spec({ out: '{ "barcode": "문자열" }' }));
  const r = checkPhase3(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('items')));
});

test('skill 3단계: Claude 호출 유지인데 모델·토큰·타임아웃이 없으면 실패', () => {
  const app = makeApp('a2wl-p3-');
  skillFixture(app);
  write(app, `${LITE}/skill-spec.md`, spec().replace('- 최대 토큰: 4096\n', ''));
  const r = checkPhase3(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('최대 토큰')));
});

test('skill 3단계: 코드로 고정인데 규칙 절이 없으면 실패', () => {
  const app = makeApp('a2wl-p3-');
  skillFixture(app, { verdict: '코드로 고정' });
  write(app, `${LITE}/skill-spec.md`, spec({ verdict: 'Claude 호출 유지' }));
  const r = checkPhase3(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('## 규칙')));
});

test('skill 3단계: 입력 스키마 json 블록이 없으면 실패', () => {
  const app = makeApp('a2wl-p3-');
  skillFixture(app);
  write(app, `${LITE}/skill-spec.md`, spec().replace('```json\n{ "file": "PDF 한 건" }\n```', '설명만 적었다'));
  const r = checkPhase3(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('## 입력 스키마')));
});

test('skill 3단계: 판정은 opts.verdict(STATUS)가 verdict.md 보다 우선한다', () => {
  const app = makeApp('a2wl-p3-');
  skillFixture(app, { verdict: '고정 불가' });
  write(app, `${LITE}/skill-spec.md`, spec({ verdict: '코드로 고정' }));
  const r = checkPhase3(lite(app), { mode: 'skill', samples: 2, verdict: 'Claude 호출 유지' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('## 프롬프트')), r.errors.join(' / '));
  assert.equal(r.verdict, 'Claude 호출 유지');
});

test('skill 3단계: 판정을 알 수 없으면 건너뛰지 않고 실패한다', () => {
  const app = makeApp('a2wl-p3-');
  skillFixture(app, { verdict: '고정 불가' });
  write(app, `${LITE}/skill-spec.md`, spec());
  const r = checkPhase3(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('판정')), r.errors.join(' / '));
  write(app, `${LITE}/verdict.md`, '## 근거\n- x\n');
  assert.equal(checkPhase3(lite(app), { mode: 'skill', samples: 2 }).ok, false);
});

test('상수: 계약 아홉 절, 스펙 네 절', () => {
  assert.equal(CONTRACT_HEADINGS.length, 9);
  assert.equal(SPEC_HEADINGS.length, 4);
});
