// STATUS.md 읽기·쓰기. 이 파일을 쓰는 것은 check_phase.mjs 뿐이다. 모델은 쓰지 않는다.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const A2W_DIR = join('docs', 'agent-to-webapp');
export const STATUS_FILE = 'STATUS.md';
export const RUNTIMES = ['claude-code', 'codex'];

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function statusPath(appDir) {
  return join(appDir, A2W_DIR, STATUS_FILE);
}

// 관찰 횟수와 모델. 3회 미만이면 2단계 판정은 조건부까지만. 모델은 관찰과 4단계 재검증이 같이 쓴다.
export const DEFAULT_RUNS = 3;
export const DEFAULT_MODEL = 'sonnet';

export function emptyStatus(target, runtime, { runs = DEFAULT_RUNS, model = DEFAULT_MODEL } = {}) {
  return { target, runtime, created: today(), runs, model, phases: {}, terminated: null, log: [] };
}

export function parseStatus(text) {
  const st = { target: null, runtime: null, created: null, runs: DEFAULT_RUNS, model: DEFAULT_MODEL, phases: {}, terminated: null, log: [] };
  let inLog = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '## log') { inLog = true; continue; }
    if (inLog) { if (line.startsWith('- ')) st.log.push(line.slice(2)); continue; }
    const m = line.match(/^([a-z][a-z0-9-]*):\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key.startsWith('phase-')) {
      const pm = value.match(/^passed (\d{4}-\d{2}-\d{2})( approved)?$/);
      if (pm) st.phases[Number(key.slice(6))] = { passed: pm[1], approved: Boolean(pm[2]) };
    } else if (key === 'terminated') {
      st.terminated = value || null;
    } else if (key === 'target' || key === 'runtime' || key === 'created' || key === 'model') {
      st[key] = value;
    } else if (key === 'runs') {
      const n = Number(value);
      if (Number.isInteger(n) && n >= 1) st.runs = n;
    }
  }
  return st;
}

export function formatStatus(st) {
  const lines = [
    '# agent-to-webapp STATUS', '',
    `target: ${st.target}`, `runtime: ${st.runtime}`, `created: ${st.created}`,
    `runs: ${st.runs ?? DEFAULT_RUNS}`, `model: ${st.model ?? DEFAULT_MODEL}`,
  ];
  for (const n of [1, 2, 3, 4, 5]) {
    const p = st.phases[n];
    lines.push(p ? `phase-${n}: passed ${p.passed}${p.approved ? ' approved' : ''}` : `phase-${n}:`);
  }
  if (st.terminated) lines.push(`terminated: ${st.terminated}`);
  lines.push('', '## log');
  for (const l of st.log) lines.push(`- ${l}`);
  return lines.join('\n') + '\n';
}

export function readStatus(appDir) {
  const p = statusPath(appDir);
  return existsSync(p) ? parseStatus(readFileSync(p, 'utf8')) : null;
}

export function writeStatus(appDir, st) {
  const p = statusPath(appDir);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, formatStatus(st), 'utf8');
}
