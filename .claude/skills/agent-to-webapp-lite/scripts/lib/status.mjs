// lite STATUS.md 읽기·쓰기. 이 파일을 쓰는 것은 check_lite.mjs 뿐이다. 모델은 쓰지 않는다.
// 정식 스킬의 status.mjs 와 필드가 다르다(mode·output·skill·samples). 그래서 공유하지 않고 따로 둔다.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const LITE_DIR = join('docs', 'agent-to-webapp-lite');
export const STATUS_FILE = 'STATUS.md';
export const MODES = ['dashboard', 'skill'];
// skill 모드에서 관찰할 샘플 수. 워크숍 기본값.
export const DEFAULT_SAMPLES = 5;

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function statusPath(appDir) {
  return join(appDir, LITE_DIR, STATUS_FILE);
}

// STATUS 는 줄 단위로 읽는다. 값에 줄바꿈·제어 문자가 들면 다른 줄(phase-N: passed …)을 지어낼 수 있다.
export function isSafeValue(v) {
  return typeof v === 'string' && !/[\u0000-\u001f\u007f]/.test(v);
}

// verdict: 2단계가 확정한 판정(--override 반영). 3·5단계가 verdict.md 를 다시 읽지 않고 이것을 쓴다.
export function emptyStatus(target, mode, { output = null, skill = null, samples = DEFAULT_SAMPLES } = {}) {
  return { target, mode, created: today(), output, skill, samples, verdict: null, phases: {}, terminated: null, log: [] };
}

export function parseStatus(text) {
  const st = { target: null, mode: null, created: null, output: null, skill: null, samples: DEFAULT_SAMPLES, verdict: null, phases: {}, terminated: null, log: [] };
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
    } else if (key === 'target' || key === 'mode' || key === 'created' || key === 'output' || key === 'skill' || key === 'verdict') {
      st[key] = value || null;
    } else if (key === 'samples') {
      const n = Number(value);
      if (Number.isInteger(n) && n >= 1) st.samples = n;
    }
  }
  return st;
}

export function formatStatus(st) {
  for (const k of ['target', 'mode', 'output', 'skill', 'verdict', 'terminated']) {
    if (st[k] != null && !isSafeValue(String(st[k]))) throw new Error(`STATUS 의 ${k} 값에 줄바꿈·제어 문자가 있다`);
  }
  for (const l of st.log) if (!isSafeValue(l)) throw new Error('STATUS 로그 줄에 줄바꿈·제어 문자가 있다');
  const lines = ['# agent-to-webapp-lite STATUS', '', `target: ${st.target}`, `mode: ${st.mode}`];
  // 모드에 해당하는 줄만 쓴다. 파서는 없는 줄을 기본값으로 읽는다.
  if (st.mode === 'dashboard') lines.push(`output: ${st.output ?? ''}`);
  if (st.mode === 'skill') lines.push(`skill: ${st.skill ?? ''}`, `samples: ${st.samples ?? DEFAULT_SAMPLES}`);
  lines.push(`created: ${st.created}`);
  if (st.verdict) lines.push(`verdict: ${st.verdict}`);
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
