import { test } from 'node:test';
import assert from 'node:assert/strict';
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

function contractDoc(excluded = '- memo') {
  return ['## 테이블', 'channel_sales', '', '## 열', '', '| 열 | 타입 | 필수 | 설명 |', '|---|---|---|---|',
    '| channel | 문자열 | 예 | 채널 |', '', '## 유일 키', 'channel + sold_on', '', '## 갱신 시각', 'checked_at', '',
    '## upsert 규칙', '덮어쓴다', '', '## 갱신 주체', '마지막 단계', '', '## 제외 열', excluded, '',
    '## 파생 집계', '- 없음', '', '## 에이전트에 추가할 마지막 단계', 'upsert', ''].join('\n');
}

function dashBrief({ screens = '- 채널별 매출 표 한 화면', auth = '범위 밖. Vercel 배포 보호를 켠다.', fresh = '마지막 갱신 시각을 머리에 띄운다. 24시간 넘으면 회색으로.' } = {}) {
  return [TIER_TABLE, ISSUES,
    '## 1. 데이터 계약 요약', '테이블 `channel_sales`, 유일 키 channel + sold_on', '',
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
  write(app, `${LITE}/contract.md`, contractDoc(opts.excluded));
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
