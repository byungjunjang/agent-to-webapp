import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeApp, write, LITE } from './helpers.mjs';
import {
  checkPhase5, DASHBOARD_BRIEF_HEADINGS, SKILL_BRIEF_HEADINGS,
  DASHBOARD_PROMPT_MUST, SKILL_PROMPT_MUST, TIERS,
} from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase5.mjs';

const lite = (app) => join(app, LITE);

const TIER_TABLE = ['## 3층 구조', '', '| 층 | 이 앱에서 | 코드 위치 |', '|---|---|---|',
  `| ${TIERS[0]} | 표 한 화면 | \`src/app/\` |`,
  `| ${TIERS[1]} | 조회·집계 | \`src/lib/query/\` |`,
  `| ${TIERS[2]} | Supabase channel_sales | \`src/lib/data/\` |`, ''].join('\n');

const ISSUES = ['## 논의점', '- 민감 열을 뺄까요 · 기본값: 뺀다 · 결정: 뺀다 (기본값)', ''].join('\n');

function contractDoc(excluded = '- memo', key = '- channel + sold_on') {
  return ['## 테이블', 'channel_sales', '', '## 열', '', '| 열 | 타입 | 필수 | 설명 |', '|---|---|---|---|',
    '| channel | 문자열 | 예 | 채널 |', '', '## 유일 키', key, '', '## 갱신 시각', 'checked_at', '',
    '## upsert 규칙', '덮어쓴다', '', '## 갱신 주체', '마지막 단계', '', '## 제외 열', excluded, '',
    '## 파생 집계', '- 없음', '', '## 에이전트에 추가할 마지막 단계', 'upsert', ''].join('\n');
}

function dashBrief({ key = 'channel + sold_on', screens = '- 채널별 매출 표 한 화면', auth = '범위 밖. Vercel 배포 보호를 켠다.', fresh = '마지막 갱신 시각을 머리에 띄운다. 24시간 넘으면 회색으로.' } = {}) {
  return [TIER_TABLE, ISSUES,
    '## 1. 데이터 계약 요약', '- 테이블: `channel_sales`', `- 유일 키: ${key}`, '- 열: channel, sold_on, revenue', '- 대시보드에서 빼는 열: memo', '',
    '## 2. 화면 목록', screens, '',
    '## 3. 필터·정렬·집계', '- 기간 필터, 채널 필터', '',
    '## 4. 갱신 표시', fresh, '',
    '## 5. 적재 경로', '에이전트 마지막 단계가 Supabase 로 upsert 한다', '',
    '## 6. 인증', auth, '',
    '## 7. 배포 후 검증', '- [ ] 환경변수', '- [ ] 배포 보호', '- [ ] 제외 열이 화면에 없다', '- [ ] 마지막 갱신 시각', '- [ ] 중복 행 없음', ''].join('\n');
}

function promptDoc(must) {
  return ['# 다음 세션 프롬프트', '', '```', ...must, '```', ''].join('\n');
}

function dashFixture(app, opts = {}) {
  write(app, `${LITE}/contract.md`, contractDoc(opts.excluded, opts.contractKey));
  write(app, `${LITE}/brief.md`, dashBrief(opts));
  write(app, `${LITE}/prompt.md`, promptDoc(DASHBOARD_PROMPT_MUST));
}

test('dashboard 5단계: 아홉 절과 고정 문자열이 차 있으면 통과', () => {
  const app = makeApp('a2wl-p5-');
  dashFixture(app);
  const r = checkPhase5(lite(app), { mode: 'dashboard' });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('dashboard 5단계: 제외 열 이름이 화면 목록에 있으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  dashFixture(app, { screens: '- 채널별 매출과 memo 를 같이 보여준다' });
  const r = checkPhase5(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('memo')));
});

test('dashboard 5단계: 배포 보호가 없으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  dashFixture(app, { auth: '범위 밖이다.' });
  const r = checkPhase5(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('배포 보호')));
});

test('dashboard 5단계: 마지막 갱신 시각이 없으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  dashFixture(app, { fresh: '언제 갱신됐는지 보여준다' });
  const r = checkPhase5(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('마지막 갱신 시각')));
});

test('dashboard 5단계: prompt.md 코드 블록에 계약 경로가 없으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  dashFixture(app);
  write(app, `${LITE}/prompt.md`, promptDoc(DASHBOARD_PROMPT_MUST.filter(m => !m.includes('contract.md'))));
  const r = checkPhase5(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('contract.md')));
});

test('dashboard 5단계: 논의점 항목에 결정이 없으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  dashFixture(app);
  write(app, `${LITE}/brief.md`, dashBrief().replace(' · 결정: 뺀다 (기본값)', ''));
  const r = checkPhase5(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('결정:')));
});

// skill 모드
function skillBrief({ human = '- 확인·수정 화면에서 사람이 금액을 고친다', state = 'Supabase', dur = '`maxDuration = 60`' } = {}) {
  return [TIER_TABLE, ISSUES,
    '## 1. 서버 쪽 호출', 'Route Handler 에만 키를 둔다', '',
    '## 2. 실행 시간 분할', `단계 시간 20초. ${dur}`, '',
    '## 3. 상태 저장', state, '- 파싱 결과와 확인 상태를 남긴다', '',
    '## 4. 사람 확인 지점', human, '',
    '## 5. 외부 서비스로 뺄 단계', '- 없음', '',
    '## 6. 인증', '범위 밖. Vercel 배포 보호를 켠다.', '',
    '## 7. 배포 후 검증', '- [ ] 환경변수', '- [ ] 배포 보호', '- [ ] 확인 화면', '- [ ] maxDuration', '- [ ] 샘플 5건', ''].join('\n');
}

function skillFixture(app, opts = {}) {
  write(app, `${LITE}/verdict.md`, '## 근거\n- x\n\n## 출력 구조\n- x\n\n## 사람 확인\n- x\n\n판정: Claude 호출 유지\n');
  write(app, `${LITE}/runs/sample-1/inv-1.pdf`, 'PDF');
  write(app, `${LITE}/brief.md`, skillBrief(opts));
  write(app, `${LITE}/prompt.md`, promptDoc(SKILL_PROMPT_MUST));
}

test('skill 5단계: 아홉 절과 고정 문자열이 차 있으면 통과', () => {
  const app = makeApp('a2wl-p5-');
  skillFixture(app);
  const r = checkPhase5(lite(app), { mode: 'skill', samples: 1 });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('skill 5단계: Claude 호출 유지인데 확인·수정 화면이 없으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  skillFixture(app, { human: '- 없음' });
  const r = checkPhase5(lite(app), { mode: 'skill', samples: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('확인·수정 화면')));
});

test('skill 5단계: maxDuration 이 없으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  skillFixture(app, { dur: '충분히 잡는다' });
  const r = checkPhase5(lite(app), { mode: 'skill', samples: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('maxDuration')));
});

test('skill 5단계: 3절에 Supabase 도 DB 없음도 없으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  skillFixture(app, { state: '적당히 저장' });
  const r = checkPhase5(lite(app), { mode: 'skill', samples: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Supabase')));
});

test('skill 5단계: 큰 샘플 파일이면 파일 크기 안내를 요구한다', () => {
  const app = makeApp('a2wl-p5-');
  skillFixture(app);
  write(app, `${LITE}/runs/sample-1/big.pdf`, 'x'.repeat(3 * 1024 * 1024 + 1));
  const r = checkPhase5(lite(app), { mode: 'skill', samples: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('파일 크기')));
  assert.ok(r.notes.some(n => n.includes('MB')));
});

test('상수: 브리프 절 일곱씩, PROMPT_MUST 일곱씩', () => {
  assert.equal(DASHBOARD_BRIEF_HEADINGS.length, 7);
  assert.equal(SKILL_BRIEF_HEADINGS.length, 7);
  assert.equal(DASHBOARD_PROMPT_MUST.length, 7);
  assert.equal(SKILL_PROMPT_MUST.length, 7);
});

// 틀을 그대로 복사한 브리프. 키워드는 자리 표시 안에 다 들어 있지만 채운 것이 아니다
const TEMPLATE = (mode) => readFileSync(`.claude/skills/agent-to-webapp-lite/references/brief-template-${mode}.md`, 'utf8');

test('dashboard 5단계: 틀을 그대로 두면 남은 자리 표시를 알리며 실패', () => {
  const app = makeApp('a2wl-p5-');
  dashFixture(app);
  write(app, `${LITE}/brief.md`, TEMPLATE('dashboard'));
  const r = checkPhase5(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('자리 표시') && e.includes('<계약의 유일 키>')), r.errors.join(' / '));
});

test('skill 5단계: 틀을 그대로 두면 남은 자리 표시를 알리며 실패', () => {
  const app = makeApp('a2wl-p5-');
  skillFixture(app);
  write(app, `${LITE}/brief.md`, TEMPLATE('skill'));
  const r = checkPhase5(lite(app), { mode: 'skill', samples: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('자리 표시') && e.includes('<초>')), r.errors.join(' / '));
});

test('5단계: 자리 표시 하나만 남아도 실패하고, 틀에 없는 <…> 는 문제 삼지 않는다', () => {
  const app = makeApp('a2wl-p5-');
  skillFixture(app, { dur: '`maxDuration = <초>`' });
  const r = checkPhase5(lite(app), { mode: 'skill', samples: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('<초>')));
  const ok = makeApp('a2wl-p5-');
  skillFixture(ok, { human: '- 확인·수정 화면을 `<ReviewTable>` 컴포넌트로 만든다' });
  const r2 = checkPhase5(lite(ok), { mode: 'skill', samples: 1 });
  assert.ok(r2.ok, r2.errors.join(' / '));
});

test('dashboard 5단계: 목록형 계약(- 키)과 틀 형식 브리프(- 유일 키: 키)는 통과, 백틱도 견딘다', () => {
  const app = makeApp('a2wl-p5-');
  dashFixture(app, { contractKey: '- `channel` + `sold_on`', key: '`channel` + `sold_on`' });
  const r = checkPhase5(lite(app), { mode: 'dashboard' });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('dashboard 5단계: 브리프의 유일 키가 계약과 다르면 실패', () => {
  for (const key of ['channel', 'channel + sold_on + sku', 'channel + sold_at']) {
    const app = makeApp('a2wl-p5-');
    dashFixture(app, { key });
    const r = checkPhase5(lite(app), { mode: 'dashboard' });
    assert.equal(r.ok, false, key);
    assert.ok(r.errors.some(e => e.includes('유일 키')), key);
  }
});

test('skill 5단계: 3절 첫 줄이 아니라 설명 줄에만 Supabase 가 있으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  skillFixture(app, { state: '적당히 저장\n- 판단 근거: 확인 화면이 있으면 `Supabase`' });
  const r = checkPhase5(lite(app), { mode: 'skill', samples: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('첫 줄')), r.errors.join(' / '));
});

test('skill 5단계: 판정은 opts.verdict(STATUS)를 따르고, 알 수 없으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  skillFixture(app, { human: '- 없음' });
  write(app, `${LITE}/verdict.md`, '## 근거\n- x\n\n판정: 코드로 고정\n');
  const r = checkPhase5(lite(app), { mode: 'skill', samples: 1, verdict: 'Claude 호출 유지' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('확인·수정 화면')));
  write(app, `${LITE}/verdict.md`, '## 근거\n- x\n');
  const none = checkPhase5(lite(app), { mode: 'skill', samples: 1 });
  assert.equal(none.ok, false);
  assert.ok(none.errors.some(e => e.includes('판정')), none.errors.join(' / '));
});
