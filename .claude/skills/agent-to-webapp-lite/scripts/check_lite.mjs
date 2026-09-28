#!/usr/bin/env node
// agent-to-webapp-lite 게이트 CLI. 작업 폴더(<이름>-app/)에서 실행한다.
//   node check_lite.mjs init --target <경로> --mode dashboard|skill [--output <경로>] [--skill <이름>] [--samples N]
//   node check_lite.mjs status
//   node check_lite.mjs <1-5> [--approve] [--batch]
//   node check_lite.mjs 2 --override "<사유>"      사람이 판정을 뒤집을 때만. 다른 단계는 거부
//   node check_lite.mjs rollback <N>
// 종료코드: 0 통과 / 1 실패 / 2 사용법 오류. STATUS.md 는 이 스크립트만 쓴다. API 키는 쓰지 않는다.
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LITE_DIR, MODES, DEFAULT_SAMPLES, emptyStatus, readStatus, writeStatus, formatStatus, today, isSafeValue } from './lib/status.mjs';
import { checkPhase1 } from './lib/phase1.mjs';
import { checkPhase2, TERMINAL_VERDICT, ROUTING } from './lib/phase2.mjs';
import { checkPhase3, CONTRACT_FILE, SPEC_FILE } from './lib/phase3.mjs';
import { checkPhase4, CONFIRMED_VERDICT, PROVISIONAL_VERDICT } from './lib/phase4.mjs';
import { checkPhase5, PROMPT_FILE } from './lib/phase5.mjs';

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const NEEDS_APPROVAL = [2, 3];
export const PHASES = [1, 2, 3, 4, 5];
const USAGE = [
  '사용법 (작업 폴더에서):',
  `  node check_lite.mjs init --target <경로> --mode ${MODES.join('|')} [--output <경로>] [--skill <이름>] [--samples N]`,
  '  node check_lite.mjs status',
  '  node check_lite.mjs <1-5> [--approve] [--batch]',
  '  node check_lite.mjs 2 [--approve] --override "<사유>"',
  '  node check_lite.mjs rollback <N>',
].join('\n');
const BOOL_FLAGS = new Set(['approve', 'batch']);
const CHECKS = {
  1: (d, o) => checkPhase1(d, o),
  2: (d, o) => checkPhase2(d, o),
  3: (d, o) => checkPhase3(d, o),
  4: (d, o) => checkPhase4(d, o),
  5: (d, o) => checkPhase5(d, o),
};

export function parseArgs(argv) {
  const args = { cmd: argv[0], flags: {}, rest: [] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args.rest.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (BOOL_FLAGS.has(key) || next === undefined || next.startsWith('--')) args.flags[key] = true;
    else { args.flags[key] = next; i++; }
  }
  return args;
}

function init(cwd, flags, out, err) {
  const existing = readStatus(cwd);
  if (existing) {
    out(formatStatus(existing));
    // 같은 모드면 멱등. 다른 모드면 조용히 넘어가지 않는다(학습자는 새 모드로 시작한 줄 안다)
    if (typeof flags.mode === 'string' && flags.mode !== existing.mode) {
      err(`경고: 이 작업 폴더는 이미 mode=${existing.mode} 로 시작했다. --mode ${flags.mode} 는 적용하지 않았다. 다른 모드는 다른 작업 폴더에서 init 한다`);
      return 2;
    }
    return 0;
  }
  const { target, mode } = flags;
  for (const k of ['target', 'output', 'skill']) {
    if (typeof flags[k] === 'string' && !isSafeValue(flags[k])) { err(`--${k} 값에 줄바꿈·제어 문자가 있다`); return 2; }
  }
  if (typeof target !== 'string' || !MODES.includes(mode)) {
    err(`init 은 --target <경로> --mode ${MODES.join('|')} 가 필요하다`); return 2;
  }
  if (!existsSync(resolve(cwd, target))) { err(`대상 폴더가 없다: ${target}`); return 2; }

  const opts = {};
  if (mode === 'dashboard') {
    if (typeof flags.output !== 'string') {
      err('dashboard 모드는 --output <경로> 가 필요하다 (에이전트가 남기는 출력 산출물. 구글 시트면 CSV 로 내보낸 파일)'); return 2;
    }
    opts.output = flags.output;
  } else {
    if (typeof flags.skill !== 'string') { err('skill 모드는 --skill <이름> 이 필요하다 (옮길 스킬 하나)'); return 2; }
    const samples = flags.samples === undefined ? DEFAULT_SAMPLES : Number(flags.samples);
    if (!Number.isInteger(samples) || samples < 1) { err(`--samples 는 1 이상의 정수다 (기본 ${DEFAULT_SAMPLES})`); return 2; }
    opts.skill = flags.skill;
    opts.samples = samples;
  }
  mkdirSync(join(cwd, LITE_DIR, 'runs'), { recursive: true });
  mkdirSync(join(cwd, LITE_DIR, 'verify'), { recursive: true });
  const st = emptyStatus(target, mode, opts);
  st.log.push(`${today()} init`);
  writeStatus(cwd, st);
  out(`STATUS 생성: target=${target} mode=${mode}${mode === 'dashboard' ? ` output=${opts.output}` : ` skill=${opts.skill} samples=${opts.samples}`}`);
  return 0;
}

function status(cwd, out, err) {
  const st = readStatus(cwd);
  if (!st) { err('STATUS.md 가 없다. 먼저 init'); return 2; }
  out(formatStatus(st));
  return 0;
}

function rollback(cwd, n, out, err) {
  if (!PHASES.includes(n)) { err('rollback <1-5>'); return 2; }
  const st = readStatus(cwd);
  if (!st) { err('STATUS.md 가 없다. 먼저 init'); return 2; }
  for (const k of Object.keys(st.phases)) if (Number(k) >= n) delete st.phases[k];
  st.terminated = null;
  // 판정은 2단계가, 확정(고정 가능)은 dashboard 4단계가 남긴다. 지운 단계의 몫을 되돌린다
  if (n <= 2) st.verdict = null;
  else if (n <= 4 && st.mode === 'dashboard' && st.verdict === CONFIRMED_VERDICT) st.verdict = PROVISIONAL_VERDICT;
  st.log.push(`${today()} rollback ${n}`);
  writeStatus(cwd, st);
  out(`${n}단계부터 다시. ${n}단계 이후 통과 기록과 종료를 지웠다`);
  return 0;
}

function gate(cwd, n, flags, out, err) {
  const st = readStatus(cwd);
  if (!st) { err('STATUS.md 가 없다. 먼저 init'); return 2; }
  if (st.terminated) { err(`종료됨: ${st.terminated}. 다시 하려면 node check_lite.mjs rollback 2`); return 1; }
  // --override 는 판정을 뒤집는 것이라 2단계에만 뜻이 있다. 다른 단계에서 받으면 로그만 남고 아무 일도 안 한다
  if (flags.override !== undefined) {
    if (n !== 2) { err('--override 는 2단계(판정)에서만 쓴다. 다른 단계를 되돌리려면 rollback'); return 2; }
    if (typeof flags.override !== 'string') { err('--override 는 사유가 필요하다: --override "<사유>"'); return 2; }
    if (!isSafeValue(flags.override)) { err('--override 사유에 줄바꿈·제어 문자가 있다. 한 줄로 적는다'); return 2; }
  }
  if (n > 1 && !st.phases[n - 1]) { err(`${n - 1}단계를 먼저 통과해야 한다`); return 1; }

  const liteDir = join(cwd, LITE_DIR);
  const override = typeof flags.override === 'string' ? flags.override : null;
  const r = CHECKS[n](liteDir, { mode: st.mode, samples: st.samples, override, verdict: st.verdict });
  for (const w of r.warnings ?? []) out(`경고: ${w}`);
  for (const m of r.notes ?? []) out(m);
  if (!r.ok) {
    for (const e of r.errors) err(`실패: ${e}`);
    return 1;
  }

  const wantsApproval = NEEDS_APPROVAL.includes(n) && !flags.batch;
  if (wantsApproval && !flags.approve) {
    const doc = n === 2 ? 'verdict.md' : (st.mode === 'dashboard' ? CONTRACT_FILE : SPEC_FILE);
    err(`${n}단계 검사는 통과. 학습자가 ${doc} 를 읽고 동의하면 --approve 로 다시 실행하라. 통과 기록은 아직 안 남겼다`);
    return 1;
  }

  st.phases[n] = { passed: today(), approved: NEEDS_APPROVAL.includes(n) && Boolean(flags.approve) };
  if (override) st.log.push(`${today()} phase-${n} override: ${override}`);
  if (flags.batch && NEEDS_APPROVAL.includes(n)) st.log.push(`${today()} phase-${n} batch (승인 생략)`);
  // 2단계 판정(override 반영)을 STATUS 에 남긴다. dashboard 4단계는 조건부를 고정 가능으로 확정한다
  if (n === 2) st.verdict = r.verdict;
  if (n === 4 && r.verdict && r.verdict !== st.verdict) {
    st.log.push(`${today()} phase-4 판정 확정: ${st.verdict} → ${r.verdict}`);
    out(`판정 확정: ${st.verdict} → ${r.verdict} (두 번째 관찰이 계약과 맞다)`);
    st.verdict = r.verdict;
  }

  if (n === 2 && r.verdict === TERMINAL_VERDICT) {
    st.terminated = `${TERMINAL_VERDICT} ${today()}`;
    st.log.push(`${today()} terminated: ${TERMINAL_VERDICT}`);
    writeStatus(cwd, st);
    out(`2단계 통과. 판정: ${TERMINAL_VERDICT} → 여기서 종료.\n${ROUTING[st.mode]}`);
    return 0;
  }
  writeStatus(cwd, st);
  out(`${n}단계 통과${r.verdict ? ` (판정: ${r.verdict})` : ''}`);
  if (n === 5) out(`다음 세션: 이 폴더에서 새 세션을 열고 ${LITE_DIR.split(/[\\/]/).join('/')}/${PROMPT_FILE} 의 코드 블록을 붙여넣는다`);
  return 0;
}

export function run(argv, cwd, out = console.log, err = console.error) {
  const { cmd, flags, rest } = parseArgs(argv);
  if (cmd === 'init') return init(cwd, flags, out, err);
  if (cmd === 'status') return status(cwd, out, err);
  if (cmd === 'rollback') return rollback(cwd, Number(rest[0]), out, err);
  const n = Number(cmd);
  if (PHASES.includes(n)) return gate(cwd, n, flags, out, err);
  err(USAGE);
  return 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exit(run(process.argv.slice(2), process.cwd()));
}
