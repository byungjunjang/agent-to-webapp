// 3단계 고정 게이트.
//   dashboard: contract.md 아홉 절. 유일 키·제외 열·갱신 주체는 필수, 유일 키에 '없음' 불가.
//              계약의 열이 1단계에서 관찰한 열 안에 있어야 한다.
//   skill:     skill-spec.md. 입출력 json 블록, 판정별 필수 절, 출력 스키마가 공통 샘플 키를 덮는가.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sectionBody, isBlank } from './md.mjs';
import { parseColumnTable, jsonBlockAfter, topKeys, intersectKeys } from './schema.mjs';
import { schemaFile, COLUMN_HEADING } from './phase1.mjs';
import { parseVerdict, sampleKeySets, VERDICT_FILE, SKILL_VERDICTS } from './phase2.mjs';
import { DEFAULT_SAMPLES } from './status.mjs';

export const CONTRACT_FILE = 'contract.md';
export const SPEC_FILE = 'skill-spec.md';
export const CONTRACT_HEADINGS = ['## 테이블', '## 열', '## 유일 키', '## 갱신 시각', '## upsert 규칙', '## 갱신 주체', '## 제외 열', '## 파생 집계', '## 에이전트에 추가할 마지막 단계'];
export const CONTRACT_REQUIRED = ['## 유일 키', '## 제외 열', '## 갱신 주체'];
export const CONTRACT_KEY = '## 유일 키';
export const CONTRACT_EXCLUDED = '## 제외 열';
export const CONTRACT_TABLE = '## 테이블';
export const NONE = '없음';
export const SPEC_HEADINGS = ['## 입력 스키마', '## 출력 스키마', '## 사람 확인', '## 실패 처리'];
export const SPEC_SCHEMA_HEADINGS = ['## 입력 스키마', '## 출력 스키마'];
export const SPEC_RULES = '## 규칙';
export const SPEC_PROMPT = '## 프롬프트';
export const SPEC_FIELDS = ['- 모델:', '- 최대 토큰:', '- 타임아웃:'];

// '## 제외 열' 목록의 이름들. '- 없음' 은 뺀다.
// 한 줄에 하나: '- 열 이름' 또는 '- 열 이름 — 사유'. 백틱이 있으면 백틱 안이 이름이다.
// 이름 안의 띄어쓰기·하이픈(상담 원문, e-mail)은 자르지 않는다. 사유 구분자는 괄호, 앞뒤를 띄운 —·-··, 콜론.
export function excludedName(item) {
  const tick = item.match(/`([^`]+)`/);
  if (tick) return tick[1].trim();
  return item.split(/\s*[(（]|\s+[—–-]\s+|\s+·\s+|\s*:\s/)[0].replace(/[`*]/g, '').trim();
}

export function excludedColumns(text) {
  const body = sectionBody(text, CONTRACT_EXCLUDED) ?? '';
  return body.split('\n').map(l => l.trim())
    .filter(l => l.startsWith('- '))
    .map(l => excludedName(l.slice(2)))
    .filter(n => n && n !== NONE);
}

// 3·5단계가 쓰는 skill 판정. STATUS 의 verdict(2단계 통과 때 --override 까지 반영해 남긴 값)가 우선이고,
// 그 줄이 없는 옛 STATUS 면 verdict.md 를 읽는다. 둘 다 안 되면 null — 호출한 쪽이 실패로 처리한다.
export const SKILL_FIXED = ['코드로 고정', 'Claude 호출 유지'];
export function resolveSkillVerdict(liteDir, verdict) {
  let v = verdict ?? null;
  if (!v) {
    const vp = join(liteDir, VERDICT_FILE);
    v = existsSync(vp) ? parseVerdict(readFileSync(vp, 'utf8'), SKILL_VERDICTS) : null;
  }
  return SKILL_FIXED.includes(v) ? v : null;
}
export const UNKNOWN_VERDICT = `판정을 알 수 없다: STATUS 의 verdict 도, ${VERDICT_FILE} 의 마지막 '판정:' 줄도 ${SKILL_FIXED.join(' / ')} 가 아니다. 판정별 검사를 건너뛰지 않는다. node check_lite.mjs rollback 2 로 판정부터 다시`;

function checkDashboard(liteDir, errors, warnings) {
  const p = join(liteDir, CONTRACT_FILE);
  if (!existsSync(p)) { errors.push(`${CONTRACT_FILE} 없음`); return; }
  const text = readFileSync(p, 'utf8');
  for (const h of CONTRACT_HEADINGS) {
    const body = sectionBody(text, h);
    if (body === null) errors.push(`${CONTRACT_FILE}: '${h}' 절이 없다`);
    else if (isBlank(body) && CONTRACT_REQUIRED.includes(h)) errors.push(`${CONTRACT_FILE}: '${h}' 절이 비었다. 없으면 '- 없음'`);
    else if (isBlank(body)) errors.push(`${CONTRACT_FILE}: '${h}' 절이 비었다`);
  }
  const key = (sectionBody(text, CONTRACT_KEY) ?? '').trim();
  if (key === NONE || key === `- ${NONE}`) {
    errors.push(`${CONTRACT_FILE}: '${CONTRACT_KEY}' 가 '${NONE}' 이다. 키가 없으면 upsert 가 없고 실행마다 중복 적재된다. 에이전트 출력에 키를 먼저 만들어라`);
  }
  const sp = join(liteDir, schemaFile(1));
  if (!existsSync(sp)) { errors.push('run-1.schema.md 이 없어 계약의 열을 관찰과 대조할 수 없다. 1단계로 돌아가라'); return; }
  const observed = parseColumnTable(readFileSync(sp, 'utf8'), COLUMN_HEADING).map(c => c.name);
  for (const c of parseColumnTable(text, COLUMN_HEADING)) {
    if (!observed.includes(c.name)) errors.push(`${CONTRACT_FILE}: 계약의 열 '${c.name}' 이 관찰(run-1.schema.md)에 없다`);
  }
}

function checkSkill(liteDir, samples, given, errors, warnings) {
  const p = join(liteDir, SPEC_FILE);
  if (!existsSync(p)) { errors.push(`${SPEC_FILE} 없음`); return null; }
  const text = readFileSync(p, 'utf8');
  for (const h of SPEC_HEADINGS) {
    const body = sectionBody(text, h);
    if (body === null) errors.push(`${SPEC_FILE}: '${h}' 절이 없다`);
    else if (isBlank(body)) errors.push(`${SPEC_FILE}: '${h}' 절이 비었다`);
  }
  for (const h of SPEC_SCHEMA_HEADINGS) {
    if (jsonBlockAfter(text, h) === null) errors.push(`${SPEC_FILE}: '${h}' 절에 json 코드 블록이 없거나 JSON 이 깨졌다 (최상위 키가 필드 이름인 객체)`);
  }

  const verdict = resolveSkillVerdict(liteDir, given);
  if (!verdict) errors.push(UNKNOWN_VERDICT);
  else if (verdict === '코드로 고정') {
    const body = sectionBody(text, SPEC_RULES);
    const items = (body ?? '').split('\n').filter(l => l.trim().startsWith('- '));
    if (body === null || items.length === 0) errors.push(`${SPEC_FILE}: 판정이 '코드로 고정' 이면 '${SPEC_RULES}' 절에 규칙을 하나 이상 적는다`);
  } else if (verdict === 'Claude 호출 유지') {
    const body = sectionBody(text, SPEC_PROMPT);
    if (body === null || !/```[\s\S]*?```/.test(body)) errors.push(`${SPEC_FILE}: 판정이 'Claude 호출 유지' 면 '${SPEC_PROMPT}' 절에 프롬프트 원문을 코드 블록으로 담는다`);
    for (const f of SPEC_FIELDS) if (!text.includes(f)) errors.push(`${SPEC_FILE}: '${f}' 가 없다. 웹 앱이 같은 값으로 불러야 한다`);
  }

  const declared = topKeys(jsonBlockAfter(text, '## 출력 스키마') ?? {});
  const common = intersectKeys(sampleKeySets(liteDir, samples));
  const missing = common.filter(k => !declared.includes(k));
  if (missing.length) errors.push(`${SPEC_FILE}: 모든 샘플에 있는 키를 출력 스키마가 빠뜨렸다: ${missing.join(', ')}`);
  return verdict;
}

export function checkPhase3(liteDir, { mode, samples = DEFAULT_SAMPLES, verdict: given = null } = {}) {
  const errors = [];
  const warnings = [];
  let verdict = null;
  if (mode === 'dashboard') checkDashboard(liteDir, errors, warnings);
  else verdict = checkSkill(liteDir, samples, given, errors, warnings);
  return { ok: errors.length === 0, errors, warnings, verdict };
}
