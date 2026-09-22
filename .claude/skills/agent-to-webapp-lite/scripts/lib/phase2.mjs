// 2단계 판정 게이트. 마지막 '판정:' 줄과 모드별 필수 절.
// 증거 규칙: dashboard 는 관찰 1회 위에서 '고정 가능' 을 거부하고, skill 은 샘플 출력 키가
// 서로 다르면 '코드로 고정' 을 거부한다. 주장과 관찰이 어긋나는 것을 게이트가 직접 본다.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalize, sectionBody, isBlank } from './md.mjs';
import { readJson, topKeys, sameKeySets } from './schema.mjs';
import { sampleDir, SAMPLE_OUTPUT } from './phase1.mjs';
import { DEFAULT_SAMPLES } from './status.mjs';

export const VERDICT_FILE = 'verdict.md';
export const VERDICT_PREFIX = '판정:';
export const DASHBOARD_VERDICTS = ['고정 가능', '조건부 고정 가능', '고정 불가'];
export const SKILL_VERDICTS = ['코드로 고정', 'Claude 호출 유지', '고정 불가'];
export const DASHBOARD_SECTIONS = ['## 근거', '## 민감 열'];
export const SKILL_SECTIONS = ['## 근거', '## 출력 구조', '## 사람 확인'];
export const TERMINAL_VERDICT = '고정 불가';
// 사람이 판정을 뒤집을 때 남는 값. 가장 센 판정으로 올리지 않는다.
export const OVERRIDE_VERDICT = { dashboard: '조건부 고정 가능', skill: 'Claude 호출 유지' };
export const ROUTING = {
  dashboard: [
    '출력 스키마를 고정할 수 없다. 대시보드가 읽을 데이터 계약을 만들 수 없다.',
    '먼저 에이전트가 출력 형식을 고정하도록 고친 뒤 다시 오거나, 웹은 파일 내려받기만 두는 쪽으로 간다.',
  ].join('\n'),
  skill: [
    '이 스킬은 서버 함수로 옮길 대상이 아니다. 시각·OCR 이 필요하거나 실행이 길면 서버리스 함수 밖이다.',
    '별도 트랙: Agent SDK 를 Vercel 밖 컨테이너에 두거나 Managed Agents. 로컬 에이전트로 남기는 것도 답이다.',
  ].join('\n'),
};

// 긴 판정을 먼저 본다('조건부 고정 가능' 이 '고정 가능' 을 포함한다).
export function parseVerdict(text, verdicts) {
  const lines = normalize(text).split('\n').map(l => l.trim()).filter(Boolean);
  const last = [...lines].reverse().find(l => l.startsWith(VERDICT_PREFIX));
  if (!last) return null;
  const body = last.slice(VERDICT_PREFIX.length).trim();
  for (const v of [...verdicts].sort((a, b) => b.length - a.length)) {
    if (body.startsWith(v)) return v;
  }
  return null;
}

// 샘플 출력 JSON 의 최상위 키 집합들. 읽히지 않는 샘플은 건너뛴다(1단계가 이미 막았다).
export function sampleKeySets(liteDir, samples) {
  const sets = [];
  for (let k = 1; k <= samples; k++) {
    const r = readJson(join(liteDir, sampleDir(k), SAMPLE_OUTPUT));
    if (r.ok) sets.push(topKeys(r.value));
  }
  return sets;
}

export function checkPhase2(liteDir, { mode, samples = DEFAULT_SAMPLES, override = null } = {}) {
  const warnings = [];
  const p = join(liteDir, VERDICT_FILE);
  if (!existsSync(p)) return { ok: false, errors: [`${VERDICT_FILE} 없음`], warnings, verdict: null };
  const text = readFileSync(p, 'utf8');
  const verdicts = mode === 'dashboard' ? DASHBOARD_VERDICTS : SKILL_VERDICTS;
  const verdict = parseVerdict(text, verdicts);

  if (override) {
    warnings.push(`override: ${override} (파일의 판정 '${verdict ?? '없음'}' 대신 '${OVERRIDE_VERDICT[mode]}' 로 진행)`);
    return { ok: true, errors: [], warnings, verdict: OVERRIDE_VERDICT[mode] };
  }

  const errors = [];
  if (!verdict) errors.push(`마지막 '${VERDICT_PREFIX}' 줄이 ${verdicts.join(' / ')} 중 하나로 시작하지 않는다`);
  for (const h of mode === 'dashboard' ? DASHBOARD_SECTIONS : SKILL_SECTIONS) {
    const body = sectionBody(text, h);
    if (body === null) errors.push(`${VERDICT_FILE}: '${h}' 절이 없다`);
    else if (isBlank(body)) errors.push(`${VERDICT_FILE}: '${h}' 절이 비었다`);
  }

  if (mode === 'dashboard' && verdict === '고정 가능') {
    errors.push("관찰 1회로는 '고정 가능' 을 낼 수 없다. 실행 간 차이는 4단계가 본다. '조건부 고정 가능(관찰 1회)' 로 고쳐라");
  }
  if (mode === 'skill' && verdict === '코드로 고정') {
    const sets = sampleKeySets(liteDir, samples);
    if (!sameKeySets(sets)) {
      errors.push(`샘플 출력의 키 집합이 서로 다르다: ${sets.map((s, i) => `sample-${i + 1}(${s.join(',') || '없음'})`).join(' / ')}. '코드로 고정' 대신 'Claude 호출 유지' 로 고쳐라`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, verdict };
}
