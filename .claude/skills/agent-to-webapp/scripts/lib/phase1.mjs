// 1단계 관찰 게이트: run 3개 + 헤딩, 입력 3개 + README, 훅 기록 짝짓기, 도구 호출 색인.
import { readdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { hasHeading } from './md.mjs';

export const RUN_HEADINGS = ['## 수행한 단계', '## 판단이 필요했던 지점', '## 예상과 달라서 방식을 바꾼 지점'];
export const MIN_RUNS = 3;
// 색인: 2단계가 jsonl 대신 읽는다. 대상 칸은 이 키 순서로 하나만, 한 줄 80자.
export const TARGET_KEYS = ['file_path', 'notebook_path', 'path', 'command', 'skill', 'pattern', 'url', 'description'];
export const TARGET_WIDTH = 80;
export const GAP_MIN_MS = 5 * 60 * 1000;

function runNumber(f) { return Number(f.match(/\d+/)[0]); }

export function checkPhase1(a2wDir) {
  const errors = [];
  const warnings = [];
  const notes = [];
  const runsDir = join(a2wDir, 'runs');
  if (!existsSync(runsDir)) return { ok: false, errors: ['runs/ 폴더가 없다'], warnings, notes };

  const runFiles = readdirSync(runsDir)
    .filter(f => /^run-\d+\.md$/.test(f))
    .sort((a, b) => runNumber(a) - runNumber(b));
  if (runFiles.length < MIN_RUNS) errors.push(`run 파일이 ${runFiles.length}개. ${MIN_RUNS}개 이상 필요`);
  for (const f of runFiles) {
    const text = readFileSync(join(runsDir, f), 'utf8');
    for (const h of RUN_HEADINGS) {
      if (!hasHeading(text, h)) errors.push(`${f}: '${h}' 헤딩 없음`);
    }
  }

  const inputsDir = join(runsDir, 'inputs');
  if (!existsSync(inputsDir)) {
    errors.push('runs/inputs/ 폴더가 없다');
  } else {
    const entries = readdirSync(inputsDir);
    if (!entries.includes('README.md')) errors.push('runs/inputs/README.md 없음 (왜 이 셋인지)');
    const inputs = entries.filter(e => e !== 'README.md');
    if (inputs.length < MIN_RUNS) errors.push(`입력이 ${inputs.length}개. ${MIN_RUNS}개 이상 필요`);
  }

  warnings.push(...pairToolLogs(runsDir, runFiles));
  notes.push(...writeToolIndexes(runsDir, runFiles));
  return { ok: errors.length === 0, errors, warnings, notes };
}

// jsonl 한 줄의 input(JSON 문자열, 잘렸을 수 있다)에서 대상 하나를 뽑는다.
function pickTarget(rec) {
  const s = rec.input ?? rec.raw ?? '';
  let obj = null;
  try { obj = JSON.parse(s); } catch { obj = null; }
  if (obj && typeof obj === 'object') {
    for (const k of TARGET_KEYS) {
      if (typeof obj[k] === 'string' && obj[k]) return k === 'skill' && obj.args ? `${obj[k]} ${obj.args}` : obj[k];
    }
    return s;
  }
  // 옛 형식: 내용이 붙어 2000자에서 잘려 JSON 이 아니다. 키만 정규식으로 뽑는다
  for (const k of TARGET_KEYS) {
    const m = String(s).match(new RegExp(`"${k}":"((?:[^"\\\\]|\\\\.)*)"`));
    if (m) { try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; } }
  }
  return String(s);
}

function oneLine(s) {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > TARGET_WIDTH ? `${t.slice(0, TARGET_WIDTH)}…` : t;
}

const slash = (s) => String(s).replace(/\\/g, '/');
const isAbsolute = (s) => /^([A-Za-z]:\/|\/)/.test(s);

// 절대 경로 대상들의 공통 뿌리(폴더 두 단계 이상). 없으면 null.
export function commonRoot(targets) {
  const paths = targets.map(slash).filter(isAbsolute).map(p => p.split('/'));
  if (paths.length === 0) return null;
  let common = paths[0].slice(0, -1);
  for (const p of paths.slice(1)) {
    let i = 0;
    while (i < common.length && i < p.length - 1 && common[i] === p[i]) i++;
    common = common.slice(0, i);
  }
  return common.length >= 2 ? common.join('/') : null;
}

// 뿌리를 뗀다. 'root/x' → 'x', 명령 안의 'root' 홀로는 '.'
function stripRoot(s, root) {
  if (!root) return s;
  const t = slash(s);
  if (!t.includes(root)) return s;
  return t.split(`${root}/`).join('').split(root).join('.');
}

function gapText(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms - m * 60000) / 1000);
  return `공백 ${m}분 ${s}초`;
}

// run-N.tools.jsonl 의 레코드 배열 → 마크다운 색인. 순번은 jsonl 의 줄 번호와 같다.
export function buildToolIndex(runName, records) {
  const counts = new Map();
  for (const r of records) counts.set(r.tool ?? '?', (counts.get(r.tool ?? '?') ?? 0) + 1);
  const session = records[0]?.session ?? '?';
  const first = records[0]?.ts ?? '';
  const last = records[records.length - 1]?.ts ?? '';
  const targets = records.map(pickTarget);
  const root = commonRoot(targets);
  const lines = [
    `# ${runName} 도구 호출 색인`, '',
    `세션 ${session} · ${first} ~ ${last} · 호출 ${records.length}회 · ${[...counts].map(([t, n]) => `${t} ${n}`).join(' · ')}`,
    `게이트가 ${runName}.tools.jsonl 에서 만든다. 손으로 고치지 않는다. 시각은 UTC. 성공한 호출만 있다. 자세한 입력·응답은 jsonl 의 같은 순번 줄.${root ? ` 경로는 ${root} 기준.` : ''}`, '',
    '| # | 시각 | 도구 | 대상 | 비고 |', '|---|---|---|---|---|',
  ];
  let prev = null;
  records.forEach((r, i) => {
    const t = Date.parse(r.ts);
    const note = prev !== null && Number.isFinite(t) && t - prev >= GAP_MIN_MS ? gapText(t - prev) : '';
    if (Number.isFinite(t)) prev = t;
    lines.push(`| ${i + 1} | ${String(r.ts ?? '').slice(11, 19)} | ${r.tool ?? '?'} | ${oneLine(stripRoot(targets[i], root)).replace(/\|/g, '\\|')} | ${note} |`);
  });
  return lines.join('\n') + '\n';
}

// 짝지어진 run-N.tools.jsonl 마다 run-N.tools.md 를 (다시) 쓴다. 파생 파일이라 매번 덮는다.
export function writeToolIndexes(runsDir, runFiles) {
  const notes = [];
  for (const run of runFiles) {
    const runName = run.replace(/\.md$/, '');
    const src = join(runsDir, `${runName}.tools.jsonl`);
    if (!existsSync(src)) continue;
    const records = [];
    for (const line of readFileSync(src, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { records.push(JSON.parse(line)); } catch { records.push({ ts: '', tool: '?', raw: line }); }
    }
    writeFileSync(join(runsDir, `${runName}.tools.md`), buildToolIndex(runName, records), 'utf8');
    notes.push(`색인 작성: runs/${runName}.tools.md (호출 ${records.length}회)`);
  }
  return notes;
}

function firstTs(p) {
  const first = readFileSync(p, 'utf8').split('\n').find(l => l.trim());
  try { return String(JSON.parse(first).ts ?? ''); } catch { return ''; }
}

// runs/tools/<session>.jsonl 을 첫 줄 ts 순서로 run-N.tools.jsonl 에 옮긴다. 이미 있으면 건너뛴다.
export function pairToolLogs(runsDir, runFiles) {
  const warnings = [];
  const toolsDir = join(runsDir, 'tools');
  if (!existsSync(toolsDir)) return warnings;
  const logs = readdirSync(toolsDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ f, ts: firstTs(join(toolsDir, f)) }))
    .sort((a, b) => a.ts.localeCompare(b.ts));
  if (logs.length === 0) return warnings;
  if (logs.length !== runFiles.length) {
    warnings.push(`훅 기록 ${logs.length}개, run 파일 ${runFiles.length}개. 순서로 짝지었으니 판정 때 대조를 확인하라`);
  }
  logs.forEach((log, i) => {
    const run = runFiles[i];
    if (!run) return;
    const dest = join(runsDir, run.replace(/\.md$/, '.tools.jsonl'));
    if (!existsSync(dest)) renameSync(join(toolsDir, log.f), dest);
  });
  return warnings;
}
