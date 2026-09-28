// 5단계 전환 게이트: port-brief.md 의 3층 구조·논의점·일곱 절, 입력 파일 크기, 다음 세션에 붙여넣을 prompt.md.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, sectionBody, isBlank } from './md.mjs';
import { finalVerdict, isConditional } from './phase2.mjs';
import { CONDITION_HEADING } from './phase3.mjs';

export const BRIEF_HEADINGS = [
  '## 1. 서버 쪽 호출',
  '## 2. 실행 시간 분할',
  '## 3. 상태 저장',
  '## 4. 사람 확인 지점',
  '## 5. 외부 서비스로 뺄 단계',
  '## 6. 인증',
  '## 7. 배포 후 검증',
];
export const STATE_KEYWORDS = ['Supabase', 'DB 없음'];
// 다음 세션에 붙여넣을 프롬프트 5 를 파일로 남긴다. 터미널 출력은 스크롤에 묻히고 다른 기기에서 안 보인다(2026-09-14).
export const PROMPT_FILE = 'prompt.md';
// prompt.md 의 코드 블록이 프롬프트 5 인지 가르는 문자열. references/phase-5.md 의 프롬프트 5 에도 들어 있어야 한다.
export const PROMPT_MUST = [
  'docs/agent-to-webapp/port-brief.md',
  'docs/agent-to-webapp/workflow.md',
  'create-next-app',
  'shadcn', // 스택 고정: Next.js + Tailwind CSS + shadcn/ui. 스타일(색·모드)은 브리프 선택 절에 둔다(2026-09-23)
  'src/lib/workflow/',
  '3층 구조',
  'maxDuration',
];
// Vercel 함수의 기본 실행 시간 제한은 최대치보다 짧다. 브리프 2절이 값을 정하고 다음 세션이 Route Handler 에 넣는다(2026-09-22).
export const DURATION_KEYWORD = 'maxDuration';
// 3층 구조: 다음 세션이 웹 앱을 만들기 전에 화면·처리·데이터가 무엇인지 표 하나로 정해 둔다(2026-09-22).
export const BRIEF_TIERS = '## 3층 구조';
export const TIERS = ['화면(프리젠테이션)', '처리(비즈니스)', '데이터(저장·바깥)'];
// 스킬이 학습자에게 물은 것과 답. 항목마다 '결정:' 이 있어야 한다. 물은 것이 없으면 '- 없음'.
export const BRIEF_ISSUES = '## 논의점';
export const DECISION = '결정:';
// URL 을 아는 누구나 학습자의 API 키로 앱을 돌릴 수 있다. 인증은 범위 밖이지만 배포 보호는 켠다.
export const PROTECTION = '배포 보호';
// Vercel 함수의 요청 본문 상한. 관찰 입력이 그 근처면 브리프에 파일 크기 안내가 있어야 한다.
// multipart 면 원본 크기가 가지만 JSON 에 base64 로 담으면 1.33배라 3MB 부터 근처로 본다.
export const BODY_LIMIT_MB = 4.5;
export const SIZE_NEAR_BYTES = 3 * 1024 * 1024;
export const SIZE_KEYWORD = '파일 크기';
// 틀의 자리표시자(<…>) 안에 게이트가 찾는 낱말이 들어 있어 틀을 그대로 복사해도 통과했다. 틀에 있는 자리표시자가
// 브리프에 글자 그대로 남아 있으면 실패다. 틀은 실행 때 읽는다(2026-09-28).
export const TEMPLATE_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'references', 'port-brief-template.md');
export const PLACEHOLDER = /<[^<>\n]+>/g;

export function templatePlaceholders(file = TEMPLATE_FILE) {
  return existsSync(file) ? [...new Set(normalize(readFileSync(file, 'utf8')).match(PLACEHOLDER) ?? [])] : [];
}

// runs/inputs/ 아래에서 가장 큰 파일. 폴더가 없으면 null.
export function largestInput(dir) {
  if (!existsSync(dir)) return null;
  let best = null;
  const walk = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(d, e.name), r);
      else if (e.isFile()) {
        const size = statSync(join(d, e.name)).size;
        if (!best || size > best.size) best = { rel: r, size };
      }
    }
  };
  walk(dir, '');
  return best;
}

// verdict: STATUS 의 최종 판정. 조건부면 7절이 workflow.md 의 '## 조건' 을 배포 뒤에 확인해야 한다.
export function checkPhase5(a2wDir, { verdict = null } = {}) {
  const errors = [];
  const warnings = [];
  const notes = [];
  const p = join(a2wDir, 'port-brief.md');
  if (!existsSync(p)) return { ok: false, errors: ['port-brief.md 없음'], warnings, notes };
  const text = readFileSync(p, 'utf8');

  const leftover = templatePlaceholders().filter(ph => text.includes(ph));
  if (leftover.length) {
    errors.push(`port-brief.md: 틀의 자리표시자가 남아 있다(${leftover.length}개). 실제 값으로 바꾸거나 지운다: ${leftover.map(x => x.length > 40 ? `${x.slice(0, 40)}…>` : x).join(', ')}`);
  }

  for (const h of BRIEF_HEADINGS) {
    const body = sectionBody(text, h);
    if (body === null) errors.push(`port-brief.md: '${h}' 절이 없다`);
    else if (isBlank(body)) errors.push(`port-brief.md: '${h}' 절이 비었다`);
  }
  const state = sectionBody(text, BRIEF_HEADINGS[2]) ?? '';
  if (!STATE_KEYWORDS.some(k => state.includes(k))) {
    errors.push(`port-brief.md: '${BRIEF_HEADINGS[2]}' 절에 '${STATE_KEYWORDS.join("' 또는 '")}' 이 명시돼야 한다`);
  }

  const split = sectionBody(text, BRIEF_HEADINGS[1]);
  if (split !== null && !split.includes(DURATION_KEYWORD)) {
    errors.push(`port-brief.md: '${BRIEF_HEADINGS[1]}' 절에 '${DURATION_KEYWORD} = <초>' 가 없다. 기본 제한은 최대치보다 짧아 값을 정해야 다음 세션이 Route Handler 에 넣는다`);
  }

  const tiers = sectionBody(text, BRIEF_TIERS);
  if (tiers === null || isBlank(tiers)) {
    errors.push(`port-brief.md: '${BRIEF_TIERS}' 절이 ${tiers === null ? '없다' : '비었다'}. ${TIERS.join('·')} 세 줄의 표를 적는다`);
  } else {
    for (const t of TIERS) if (!tiers.includes(t)) errors.push(`port-brief.md: '${BRIEF_TIERS}' 표에 '${t}' 줄이 없다`);
  }

  const issues = sectionBody(text, BRIEF_ISSUES);
  if (issues === null || isBlank(issues)) {
    errors.push(`port-brief.md: '${BRIEF_ISSUES}' 절이 ${issues === null ? '없다' : '비었다'}. 물은 것이 없으면 '- 없음'`);
  } else {
    for (const line of issues.split('\n')) {
      const l = line.trim();
      if (!l.startsWith('- ') || l === '- 없음') continue;
      if (!l.includes(DECISION)) errors.push(`port-brief.md: '${BRIEF_ISSUES}' 항목에 '${DECISION}' 이 없다: ${l.slice(2, 60)}`);
    }
  }

  const auth = sectionBody(text, BRIEF_HEADINGS[5]);
  if (auth !== null && !auth.includes(PROTECTION)) {
    errors.push(`port-brief.md: '${BRIEF_HEADINGS[5]}' 절에 'Vercel ${PROTECTION}를 켠다' 가 없다. URL 을 아는 누구나 API 키로 앱을 돌릴 수 있다`);
  }

  const check = sectionBody(text, BRIEF_HEADINGS[6]);
  if (check !== null && isConditional(finalVerdict(a2wDir, verdict)) && !check.includes(CONDITION_HEADING)) {
    errors.push(`port-brief.md: 판정이 조건부 고정 가능인데 '${BRIEF_HEADINGS[6]}' 절에 workflow.md '${CONDITION_HEADING}' 을 확인하는 항목이 없다. 조건마다 배포된 앱에서 볼 것을 적는다`);
  }

  const biggest = largestInput(join(a2wDir, 'runs', 'inputs'));
  if (biggest) {
    const mb = (biggest.size / 1048576).toFixed(1);
    notes.push(`입력 파일 최대: runs/inputs/${biggest.rel} ${mb}MB (Vercel 함수 요청 본문 상한 ${BODY_LIMIT_MB}MB)`);
    if (biggest.size >= SIZE_NEAR_BYTES && !text.includes(SIZE_KEYWORD)) {
      errors.push(`runs/inputs/${biggest.rel} 이 ${mb}MB. Vercel 함수 요청 본문 상한(${BODY_LIMIT_MB}MB) 근처다(JSON base64 면 1.33배). '${BRIEF_TIERS}' 데이터 줄에 '${SIZE_KEYWORD}' 안내(상한과 넘을 때 처리)를 적어라`);
    }
  }

  const pp = join(a2wDir, PROMPT_FILE);
  if (!existsSync(pp)) errors.push(`${PROMPT_FILE} 없음. references/phase-5.md 의 프롬프트 5 를 코드 블록으로 담아 둔다`);
  else {
    const block = normalize(readFileSync(pp, 'utf8')).match(/```[^\n]*\n([\s\S]*?)\n```/);
    if (!block) errors.push(`${PROMPT_FILE}: 붙여넣을 프롬프트 코드 블록이 없다`);
    else {
      for (const m of PROMPT_MUST) if (!block[1].includes(m)) errors.push(`${PROMPT_FILE}: 코드 블록에 '${m}' 가 없다 (프롬프트 5 원문을 그대로 넣는다)`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, notes };
}
