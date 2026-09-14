// 2단계 판정 게이트: 마지막 '판정:' 줄, 4번째 칸 규칙, override.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalize } from './md.mjs';

export const VERDICTS = ['고정 가능', '조건부 고정 가능', '고정 불가'];
export const VERDICT_PREFIX = '판정:';
export const QUADRANTS = ['단위 작업 × 결정론', '단위 작업 × 확률론', '워크플로우 × 결정론', '워크플로우 × 확률론'];
export const AGENT_QUADRANT = QUADRANTS[3];

// 마지막 '판정:' 줄을 읽는다. '조건부 고정 가능' 이 '고정 가능' 을 포함하므로 조건부를 먼저 본다.
export function parseVerdict(text) {
  const lines = normalize(text).split('\n').map(l => l.trim()).filter(Boolean);
  const last = [...lines].reverse().find(l => l.startsWith(VERDICT_PREFIX));
  if (!last) return null;
  const body = last.slice(VERDICT_PREFIX.length).trim();
  if (body.startsWith('조건부 고정 가능')) return '조건부 고정 가능';
  if (body.startsWith('고정 가능')) return '고정 가능';
  if (body.startsWith('고정 불가')) return '고정 불가';
  return null;
}

// 모델이 × 대신 x/X 를 쓰거나 굵게 표시해도 같은 칸으로 본다.
function quadrantKey(cell) {
  return cell.replace(/\*/g, '').replace(/\s+/g, ' ').replace(/[xX✕]/g, '×').trim();
}

// | 단계 | 칸 | 근거 | 표에서 둘째 열이 4번째 칸인 행의 첫째 열을 모은다.
export function agentQuadrantRows(text) {
  const rows = [];
  for (const raw of normalize(text).split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const inner = line.endsWith('|') ? line.slice(1, -1) : line.slice(1);
    const cells = inner.split('|').map(c => c.trim());
    if (cells.length >= 2 && quadrantKey(cells[1]).includes(AGENT_QUADRANT)) rows.push(cells[0].replace(/\*/g, ''));
  }
  return rows;
}

// 확정 판정에 필요한 관찰 횟수. 실행 간 차이를 보려면 셋은 있어야 한다.
export const FULL_RUNS = 3;

export function checkPhase2(a2wDir, { override = null, runs = FULL_RUNS } = {}) {
  const warnings = [];
  const p = join(a2wDir, 'verdict.md');
  if (!existsSync(p)) return { ok: false, errors: ['verdict.md 없음'], warnings, verdict: null, agentRows: [] };
  const text = readFileSync(p, 'utf8');
  const verdict = parseVerdict(text);
  const agentRows = agentQuadrantRows(text);

  if (override) {
    warnings.push(`override: ${override} (파일의 판정 '${verdict ?? '없음'}' 대신 '조건부 고정 가능' 으로 진행)`);
    return { ok: true, errors: [], warnings, verdict: '조건부 고정 가능', agentRows };
  }

  const errors = [];
  if (!verdict) errors.push(`마지막 '${VERDICT_PREFIX}' 줄이 ${VERDICTS.join(' / ')} 중 하나로 시작하지 않는다`);
  if (verdict === '고정 가능' && agentRows.length > 0) {
    errors.push(`4번째 칸(${AGENT_QUADRANT}) 항목이 있는데 판정이 '고정 가능': ${agentRows.join(', ')}. 조건부 또는 불가로 고쳐라`);
  } else if (agentRows.length > 0) {
    warnings.push(`4번째 칸 항목: ${agentRows.join(', ')}`);
  }
  if (verdict === '고정 가능' && runs < FULL_RUNS) {
    errors.push(`관찰 ${runs}회로는 '고정 가능' 을 낼 수 없다. 실행 간 차이를 못 봤다. '조건부 고정 가능(관찰 ${runs}회)' 또는 '고정 불가' 로 고쳐라`);
  }
  return { ok: errors.length === 0, errors, warnings, verdict, agentRows };
}
