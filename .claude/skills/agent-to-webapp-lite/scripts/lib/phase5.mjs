// 5단계 전환 게이트. 브리프의 3층 구조·논의점·일곱 절과 모드별 고정 문자열, 다음 세션용 prompt.md.
// dashboard 의 교차 검사: 계약의 제외 열 이름이 화면·필터 절에 나타나면 실패한다. 이 모드의 진짜 사고다.
// 틀을 복사만 한 브리프를 막는다: 틀의 <…> 자리 표시가 그대로 남아 있으면 실패. 키워드 검사는 자리 표시 안의
// 낱말로도 채워지기 때문이다.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, sectionBody, isBlank } from './md.mjs';
import { excludedColumns, resolveSkillVerdict, UNKNOWN_VERDICT, CONTRACT_FILE, CONTRACT_TABLE, CONTRACT_KEY } from './phase3.mjs';
import { sampleDir } from './phase1.mjs';
import { DEFAULT_SAMPLES } from './status.mjs';

export const BRIEF_FILE = 'brief.md';
export const PROMPT_FILE = 'prompt.md';
export const TIERS_HEADING = '## 3층 구조';
export const TIERS = ['화면(프리젠테이션)', '처리(비즈니스)', '데이터(저장·바깥)'];
export const ISSUES_HEADING = '## 논의점';
export const DECISION = '결정:';
export const DASHBOARD_BRIEF_HEADINGS = ['## 1. 데이터 계약 요약', '## 2. 화면 목록', '## 3. 필터·정렬·집계', '## 4. 갱신 표시', '## 5. 적재 경로', '## 6. 인증', '## 7. 배포 후 검증'];
export const SKILL_BRIEF_HEADINGS = ['## 1. 서버 쪽 호출', '## 2. 실행 시간 분할', '## 3. 상태 저장', '## 4. 사람 확인 지점', '## 5. 외부 서비스로 뺄 단계', '## 6. 인증', '## 7. 배포 후 검증'];
export const FRESHNESS = '마지막 갱신 시각';
export const PROTECTION = '배포 보호';
export const DURATION_KEYWORD = 'maxDuration';
export const STATE_KEYWORDS = ['Supabase', 'DB 없음'];
export const HUMAN_CHECK = '확인·수정 화면';
export const SIZE_KEYWORD = '파일 크기';
export const BODY_LIMIT_MB = 4.5;
export const SIZE_NEAR_BYTES = 3 * 1024 * 1024;
// 'shadcn': 스택 고정(Next.js + Tailwind CSS + shadcn/ui). 정식 PROMPT_MUST 와 같은 이유(2026-09-23).
export const DASHBOARD_PROMPT_MUST = ['docs/agent-to-webapp-lite/brief.md', 'docs/agent-to-webapp-lite/contract.md', 'create-next-app', 'shadcn', 'Supabase', '3층 구조', 'src/lib/data/'];
export const SKILL_PROMPT_MUST = ['docs/agent-to-webapp-lite/brief.md', 'docs/agent-to-webapp-lite/skill-spec.md', 'create-next-app', 'shadcn', 'src/lib/workflow/', '3층 구조', 'maxDuration'];

export const REFERENCES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'references');
export const templateFile = (mode) => join(REFERENCES_DIR, `brief-template-${mode}.md`);
// 이 절은 선택이라 자리 표시를 남겨도 된다(비우면 기본 테마)
export const OPTIONAL_HEADING = '## 스타일';
const PLACEHOLDER = /<[^<>]+>/g;

// 틀의 자리 표시 목록(선택 절 제외). 틀이 없으면 null.
export function templatePlaceholders(mode) {
  const p = templateFile(mode);
  if (!existsSync(p)) return null;
  const text = normalize(readFileSync(p, 'utf8'));
  const cut = text.indexOf(`\n${OPTIONAL_HEADING}`);
  return [...new Set((cut === -1 ? text : text.slice(0, cut)).match(PLACEHOLDER) ?? [])];
}

// 첫 줄(빈 줄 제외). 목록 기호를 뗀다.
function firstLine(body) {
  const l = (body ?? '').split('\n').map(x => x.trim()).find(Boolean) ?? '';
  return l.replace(/^[-*]\s+/, '');
}

// '유일 키' 값 → 열 이름 집합. 백틱·굵게·괄호 설명을 떼고 + 또는 , 로 나눈다.
export function keyColumns(value) {
  return value.replace(/[`*]/g, '').replace(/\([^)]*\)/g, '')
    .split(/[+,]/).map(x => x.trim().replace(/[.。]$/, '')).filter(Boolean).sort();
}
const sameKey = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// dir 아래에서 가장 큰 파일. 없으면 null.
export function largestFile(dir) {
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

function checkCommon(text, headings, errors) {
  for (const h of headings) {
    const body = sectionBody(text, h);
    if (body === null) errors.push(`${BRIEF_FILE}: '${h}' 절이 없다`);
    else if (isBlank(body)) errors.push(`${BRIEF_FILE}: '${h}' 절이 비었다`);
  }
  const tiers = sectionBody(text, TIERS_HEADING);
  if (tiers === null || isBlank(tiers)) errors.push(`${BRIEF_FILE}: '${TIERS_HEADING}' 절이 ${tiers === null ? '없다' : '비었다'}. ${TIERS.join('·')} 세 줄의 표를 적는다`);
  else for (const t of TIERS) if (!tiers.includes(t)) errors.push(`${BRIEF_FILE}: '${TIERS_HEADING}' 표에 '${t}' 줄이 없다`);

  const issues = sectionBody(text, ISSUES_HEADING);
  if (issues === null || isBlank(issues)) errors.push(`${BRIEF_FILE}: '${ISSUES_HEADING}' 절이 ${issues === null ? '없다' : '비었다'}. 물은 것이 없으면 '- 없음'`);
  else for (const line of issues.split('\n')) {
    const l = line.trim();
    if (!l.startsWith('- ') || l === '- 없음') continue;
    if (!l.includes(DECISION)) errors.push(`${BRIEF_FILE}: '${ISSUES_HEADING}' 항목에 '${DECISION}' 이 없다: ${l.slice(2, 60)}`);
  }

  const auth = sectionBody(text, headings[5]);
  if (auth !== null && !auth.includes(PROTECTION)) {
    errors.push(`${BRIEF_FILE}: '${headings[5]}' 절에 'Vercel ${PROTECTION}를 켠다' 가 없다. URL 을 아는 누구나 열 수 있다`);
  }
  const deploy = sectionBody(text, headings[6]) ?? '';
  const boxes = deploy.match(/^- \[ \] /gm) ?? [];
  if (boxes.length < 5) errors.push(`${BRIEF_FILE}: '${headings[6]}' 절의 체크박스가 ${boxes.length}개다. 다섯 개 이상 적는다`);
}

function checkPrompt(liteDir, must, errors) {
  const p = join(liteDir, PROMPT_FILE);
  if (!existsSync(p)) { errors.push(`${PROMPT_FILE} 없음. 단계 문서의 프롬프트 5 를 코드 블록으로 담아 둔다`); return; }
  const block = normalize(readFileSync(p, 'utf8')).match(/```[^\n]*\n([\s\S]*?)\n```/);
  if (!block) { errors.push(`${PROMPT_FILE}: 붙여넣을 프롬프트 코드 블록이 없다`); return; }
  for (const m of must) if (!block[1].includes(m)) errors.push(`${PROMPT_FILE}: 코드 블록에 '${m}' 가 없다 (프롬프트 5 원문을 그대로 넣는다)`);
}

function checkPlaceholders(text, mode, errors, warnings) {
  const tokens = templatePlaceholders(mode);
  if (tokens === null) { warnings.push(`브리프 틀(${templateFile(mode)})이 없어 자리 표시 검사를 건너뛰었다`); return; }
  const flat = normalize(text);
  const cut = flat.indexOf(`\n${OPTIONAL_HEADING}`);
  const body = cut === -1 ? flat : flat.slice(0, cut);
  const left = tokens.filter(t => body.includes(t));
  if (left.length) {
    const show = left.map(t => (t.length > 32 ? `${t.slice(0, 30).replace(/\n/g, ' ')}…>` : t));
    errors.push(`${BRIEF_FILE}: 틀의 자리 표시가 그대로 남았다(${left.length}개): ${show.join(', ')}. 이 앱의 값으로 채운다`);
  }
}

export function checkPhase5(liteDir, { mode, samples = DEFAULT_SAMPLES, verdict: given = null } = {}) {
  const errors = [];
  const warnings = [];
  const notes = [];
  const p = join(liteDir, BRIEF_FILE);
  if (!existsSync(p)) return { ok: false, errors: [`${BRIEF_FILE} 없음`], warnings, notes };
  const text = readFileSync(p, 'utf8');
  const headings = mode === 'dashboard' ? DASHBOARD_BRIEF_HEADINGS : SKILL_BRIEF_HEADINGS;
  checkPlaceholders(text, mode, errors, warnings);
  checkCommon(text, headings, errors);

  if (mode === 'dashboard') {
    const fresh = sectionBody(text, headings[3]) ?? '';
    if (!fresh.includes(FRESHNESS)) errors.push(`${BRIEF_FILE}: '${headings[3]}' 절에 '${FRESHNESS}' 가 없다. 갱신이 멈춘 화면이 최신처럼 보이면 안 된다`);

    const cp = join(liteDir, CONTRACT_FILE);
    if (existsSync(cp)) {
      const contract = readFileSync(cp, 'utf8');
      // 계약은 '- channel + sold_on' 처럼 목록으로, 브리프는 '- 유일 키: channel + sold_on' 로 적는다.
      // 절 전체 문자열이 아니라 값(테이블 이름·키 열 집합)을 비교한다
      const table = firstLine(sectionBody(contract, CONTRACT_TABLE)).replace(/[`*]/g, '').trim();
      const key = keyColumns(firstLine(sectionBody(contract, CONTRACT_KEY)).replace(/^유일 키\s*:?\s*/, ''));
      const summary = sectionBody(text, headings[0]) ?? '';
      if (table && !summary.includes(table)) errors.push(`${BRIEF_FILE}: '${headings[0]}' 에 계약의 테이블 이름 '${table}' 이 없다`);
      if (key.length) {
        const line = summary.split('\n').find(l => l.includes('유일 키'));
        const got = line ? keyColumns(line.slice(line.indexOf('유일 키') + '유일 키'.length).replace(/^\s*:?\s*/, '')) : [];
        if (!line) errors.push(`${BRIEF_FILE}: '${headings[0]}' 에 '유일 키' 줄이 없다. 계약의 유일 키 '${key.join(' + ')}' 를 그대로 적는다`);
        else if (!sameKey(got, key)) errors.push(`${BRIEF_FILE}: '${headings[0]}' 의 유일 키(${got.join(' + ') || '비었음'})가 계약의 유일 키(${key.join(' + ')})와 다르다`);
      }
      // 제외 열이 화면·필터로 새어 나가는지 본다
      const exposed = [sectionBody(text, headings[1]) ?? '', sectionBody(text, headings[2]) ?? ''].join('\n');
      for (const name of excludedColumns(contract)) {
        if (exposed.includes(name)) errors.push(`${BRIEF_FILE}: 계약의 제외 열 '${name}' 이 '${headings[1]}' 또는 '${headings[2]}' 에 있다. 민감 열은 대시보드에 싣지 않는다`);
      }
    } else warnings.push(`${CONTRACT_FILE} 이 없어 제외 열 교차 검사를 건너뛰었다`);
    checkPrompt(liteDir, DASHBOARD_PROMPT_MUST, errors);
  } else {
    const split = sectionBody(text, headings[1]) ?? '';
    if (!split.includes(DURATION_KEYWORD)) errors.push(`${BRIEF_FILE}: '${headings[1]}' 절에 '${DURATION_KEYWORD} = <초>' 가 없다. 기본 제한은 최대치보다 짧다`);
    // 첫 줄만 본다. 틀의 설명 줄(판단 근거)에도 'Supabase' 가 있어 절 전체로 보면 늘 통과한다
    const state = firstLine(sectionBody(text, headings[2]));
    if (!STATE_KEYWORDS.some(k => state.includes(k))) errors.push(`${BRIEF_FILE}: '${headings[2]}' 절 첫 줄에 '${STATE_KEYWORDS.join("' 또는 '")}' 이 명시돼야 한다`);

    const verdict = resolveSkillVerdict(liteDir, given);
    if (!verdict) errors.push(UNKNOWN_VERDICT);
    const human = sectionBody(text, headings[3]) ?? '';
    if (verdict === 'Claude 호출 유지' && !human.includes(HUMAN_CHECK)) {
      errors.push(`${BRIEF_FILE}: 판정이 'Claude 호출 유지' 면 '${headings[3]}' 절에 '${HUMAN_CHECK}' 이 있어야 한다. LLM 결과를 확인 없이 확정하지 않는다`);
    }

    let biggest = null;
    for (let k = 1; k <= samples; k++) {
      const f = largestFile(join(liteDir, sampleDir(k)));
      if (f && (!biggest || f.size > biggest.size)) biggest = { rel: `sample-${k}/${f.rel}`, size: f.size };
    }
    if (biggest) {
      const mb = (biggest.size / 1048576).toFixed(1);
      notes.push(`샘플 입력 최대: runs/${biggest.rel} ${mb}MB (Vercel 함수 요청 본문 상한 ${BODY_LIMIT_MB}MB)`);
      if (biggest.size >= SIZE_NEAR_BYTES && !text.includes(SIZE_KEYWORD)) {
        errors.push(`runs/${biggest.rel} 이 ${mb}MB 로 상한(${BODY_LIMIT_MB}MB) 근처다(JSON base64 면 1.33배). 브리프에 '${SIZE_KEYWORD}' 안내를 적어라`);
      }
    }
    checkPrompt(liteDir, SKILL_PROMPT_MUST, errors);
  }
  return { ok: errors.length === 0, errors, warnings, notes };
}
