import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { makeApp, write, A2W } from './helpers.mjs';
import { checkPhase5, BRIEF_HEADINGS, PROMPT_FILE, PROMPT_MUST } from '../.claude/skills/agent-to-webapp/scripts/lib/phase5.mjs';

// 3층 구조·논의점·배포 보호는 2026-09-22 에 더했다. 헤딩과 층 이름은 phase5.mjs 상수와 같다.
const BRIEF = `# port brief
## 3층 구조
| 층 | 이 앱에서 | 코드 위치 |
|---|---|---|
| 화면(프리젠테이션) | PDF 2개 업로드, 진행 표시, 결과 화면 | src/app/ |
| 처리(비즈니스) | 단계 1~8, LLM 3회 | src/lib/workflow/ |
| 데이터(저장·바깥) | DB 없음. 밖으로 나가는 것 없음 | 없음 |
## 논의점
- 없음
${BRIEF_HEADINGS[0]}
Route Handler 에서만 Anthropic SDK 호출. 키는 환경변수
${BRIEF_HEADINGS[1]}
단계 3 원가 계산이 40초. 단계마다 함수 하나
maxDuration = 60
${BRIEF_HEADINGS[2]}
DB 없음. 사람 확인 지점 없고 합계 55초
${BRIEF_HEADINGS[3]}
없음
${BRIEF_HEADINGS[4]}
- 없음
${BRIEF_HEADINGS[5]}
범위 밖. 단일 사용자 데모. Vercel 배포 보호를 켠다
${BRIEF_HEADINGS[6]}
배포 후 runs/inputs/ 3건을 넣어 verify/report.md 와 비교
`;

const PROMPT = `# 다음 세션 프롬프트: demo

\`\`\`
${PROMPT_MUST.join(' 를 읽고\n- ')}
\`\`\`
`;

function app(text, prompt = PROMPT) {
  const a = makeApp();
  write(a, `${A2W}/port-brief.md`, text);
  if (prompt !== null) write(a, `${A2W}/${PROMPT_FILE}`, prompt);
  return join(a, A2W);
}

test('phase5: 정상 통과', () => {
  const r = checkPhase5(app(BRIEF));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('phase5: 절이 빠지거나 비면 실패', () => {
  const missing = BRIEF.replace(`${BRIEF_HEADINGS[5]}\n범위 밖. 단일 사용자 데모. Vercel 배포 보호를 켠다\n`, '');
  assert.ok(checkPhase5(app(missing)).errors.some(e => e.includes('6. 인증')));
  const empty = BRIEF.replace('없음\n' + BRIEF_HEADINGS[4], BRIEF_HEADINGS[4]);
  assert.ok(checkPhase5(app(empty)).errors.some(e => e.includes('4. 사람 확인 지점') && e.includes('비었다')));
});

test('phase5: 상태 저장 절에 Supabase 또는 DB 없음 명시', () => {
  const vague = BRIEF.replace('DB 없음. 사람 확인 지점 없고 합계 55초', '적당히 저장');
  const r = checkPhase5(app(vague));
  assert.ok(r.errors.some(e => e.includes('Supabase') && e.includes('DB 없음')));
  assert.equal(checkPhase5(app(BRIEF.replace('DB 없음.', 'Supabase.'))).ok, true);
});

test('phase5: 파일 없으면 실패', () => {
  assert.equal(checkPhase5(join(makeApp(), A2W)).ok, false);
});

test('phase5: prompt.md 가 없으면 실패', () => {
  const r = checkPhase5(app(BRIEF, null));
  assert.ok(r.errors.some(e => e.includes(PROMPT_FILE) && e.includes('없음')));
});

test('phase5: prompt.md 에 코드 블록이 없거나 프롬프트 5 문자열이 빠지면 실패', () => {
  const noBlock = checkPhase5(app(BRIEF, `# 다음 세션\n${PROMPT_MUST.join('\n')}\n`));
  assert.ok(noBlock.errors.some(e => e.includes('코드 블록이 없다')));
  const partial = checkPhase5(app(BRIEF, PROMPT.replace('create-next-app', 'next')));
  assert.ok(partial.errors.some(e => e.includes('create-next-app')));
  assert.equal(partial.errors.length, 1);
});

// 3층 구조(화면·처리·데이터)와 논의점, 배포 보호, 입력 파일 크기. 다음 세션이 웹 앱을 만들기 전에 정해져 있어야 하는 것들이다.
test('phase5: 3층 구조 절이 없거나 세 층 이름이 빠지면 실패', () => {
  const noSection = BRIEF.replace(/## 3층 구조[\s\S]*?(?=## 논의점)/, '');
  assert.ok(checkPhase5(app(noSection)).errors.some(e => e.includes('3층 구조')));
  const noData = BRIEF.replace('| 데이터(저장·바깥) | DB 없음. 밖으로 나가는 것 없음 | 없음 |\n', '');
  const r = checkPhase5(app(noData));
  assert.ok(r.errors.some(e => e.includes('3층 구조') && e.includes('데이터(저장·바깥)')), r.errors.join('\n'));
});

test('phase5: 논의점 항목마다 결정이 있어야 한다', () => {
  const undecided = BRIEF.replace('## 논의점\n- 없음\n', '## 논의점\n- 회신 이메일을 진짜 보낼까요 · 기본값: 흉내\n');
  const r = checkPhase5(app(undecided));
  assert.ok(r.errors.some(e => e.includes('논의점') && e.includes('결정:')), r.errors.join('\n'));
  const decided = BRIEF.replace('## 논의점\n- 없음\n', '## 논의점\n- 회신 이메일을 진짜 보낼까요 · 기본값: 흉내 · 결정: 흉내 (기본값)\n');
  assert.deepEqual(checkPhase5(app(decided)).errors, []);
  const missing = BRIEF.replace('## 논의점\n- 없음\n', '');
  assert.ok(checkPhase5(app(missing)).errors.some(e => e.includes('논의점')));
});

test('phase5: 6절에 배포 보호가 없으면 실패', () => {
  const r = checkPhase5(app(BRIEF.replace('. Vercel 배포 보호를 켠다', '')));
  assert.ok(r.errors.some(e => e.includes('6. 인증') && e.includes('배포 보호')), r.errors.join('\n'));
});

test('phase5: 입력 파일이 Vercel 요청 본문 상한 근처면 브리프에 파일 크기 안내가 있어야 한다', () => {
  const big = Buffer.alloc(Math.round(4.2 * 1024 * 1024));
  const d = app(BRIEF);
  write(d, 'runs/inputs/1-easy/big.pdf', big);
  const r = checkPhase5(d);
  assert.ok(r.errors.some(e => e.includes('big.pdf') && e.includes('파일 크기')), r.errors.join('\n'));
  const d2 = app(BRIEF.replace('DB 없음. 밖으로 나가는 것 없음', 'DB 없음. 파일 크기 상한 4MB 안내'));
  write(d2, 'runs/inputs/1-easy/big.pdf', big);
  assert.deepEqual(checkPhase5(d2).errors, []);
  const d3 = app(BRIEF);
  write(d3, 'runs/inputs/1-easy/small.pdf', Buffer.alloc(1024));
  assert.deepEqual(checkPhase5(d3).errors, []);
});

// Vercel 함수의 기본 실행 시간 제한은 최대치보다 짧다. 브리프 2절이 maxDuration 값을 정해야 다음 세션이 Route Handler 에 넣는다.
test('phase5: 2절에 maxDuration 이 없으면 실패', () => {
  const r = checkPhase5(app(BRIEF.replace('\nmaxDuration = 60', '')));
  assert.ok(r.errors.some(e => e.includes('2. 실행 시간 분할') && e.includes('maxDuration')), r.errors.join('\n'));
});

// 틀을 그대로 복사하면 자리표시자 안에 게이트가 찾는 낱말(maxDuration, 배포 보호 등)이 들어 있어 통과했다(2026-09-28 리뷰).
test('phase5: port-brief-template.md 를 그대로 복사하면 남은 자리표시자로 실패한다', () => {
  const tpl = readFileSync(resolve('.claude/skills/agent-to-webapp/references/port-brief-template.md'), 'utf8');
  const r = checkPhase5(app(tpl));
  assert.equal(r.ok, false);
  const e = r.errors.find(x => x.includes('자리표시자'));
  assert.ok(e, r.errors.join('\n'));
  assert.ok(e.includes('<이름>'), e);
  const one = BRIEF.replace('Route Handler 에서만', '<workflow.md 의 LLM 단계 번호와 이름> Route Handler 에서만');
  assert.ok(checkPhase5(app(one)).errors.some(x => x.includes('자리표시자')));
});

test('phase5: 판정이 조건부면 7절에 workflow.md ## 조건 확인 항목이 있어야 한다', () => {
  const r = checkPhase5(app(BRIEF), { verdict: '조건부 고정 가능' });
  assert.ok(r.errors.some(e => e.includes('7. 배포 후 검증') && e.includes('## 조건')), r.errors.join('\n'));
  const ok = BRIEF.replace('verify/report.md 와 비교\n', 'verify/report.md 와 비교\n- [ ] workflow.md 의 `## 조건` 항목을 배포된 앱에서 확인했다\n');
  assert.deepEqual(checkPhase5(app(ok), { verdict: '조건부 고정 가능' }).errors, []);
  assert.deepEqual(checkPhase5(app(BRIEF), { verdict: '고정 가능' }).errors, []);
});
