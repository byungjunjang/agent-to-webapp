#!/usr/bin/env node
// agent-to-webapp 게이트 CLI. 작업 폴더(<이름>-app/)에서 실행한다.
//   node check_phase.mjs init --target <경로> --runtime <claude-code|codex>
//   node check_phase.mjs status
//   node check_phase.mjs <1-5> [--approve] [--batch] [--override "<사유>"]
//   node check_phase.mjs rollback <N>
// 종료코드: 0 통과 / 1 실패 / 2 사용법 오류. STATUS.md 는 이 스크립트만 쓴다.
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { A2W_DIR, RUNTIMES, emptyStatus, readStatus, writeStatus, formatStatus, today } from './lib/status.mjs';
import { checkPhase1 } from './lib/phase1.mjs';
import { checkPhase2 } from './lib/phase2.mjs';
import { checkPhase3 } from './lib/phase3.mjs';
import { checkPhase4 } from './lib/phase4.mjs';
import { checkPhase5 } from './lib/phase5.mjs';

export const NEEDS_APPROVAL = [2, 3];
export const PHASES = [1, 2, 3, 4, 5];
export const ROUTING_HINT = [
  '이 과제는 웹 앱 전환 대상이 아니다. 우하단 칸(워크플로우 × 확률론)이 남는다.',
  '별도 트랙: Agent SDK 를 Vercel 밖 컨테이너에 두거나 Managed Agents. 선례 workos/litigation-writer-app.',
  'Agent SDK 는 settingSources 를 생략하면 CLAUDE.md·skills 를 CLI 처럼 다 읽는다. 배포 앱은 settingSources: [] 로 격리하고 필요한 것만 명시한다.',
].join('\n');
const USAGE = [
  '사용법 (작업 폴더에서):',
  '  node check_phase.mjs init --target <경로> --runtime <claude-code|codex>',
  '  node check_phase.mjs status',
  '  node check_phase.mjs <1-5> [--approve] [--batch] [--override "<사유>"]',
  '  node check_phase.mjs rollback <N>',
].join('\n');
const BOOL_FLAGS = new Set(['approve', 'batch']);
const CHECKS = {
  1: (d) => checkPhase1(d),
  2: (d, o) => checkPhase2(d, o),
  3: (d) => checkPhase3(d),
  4: (d) => checkPhase4(d),
  5: (d) => checkPhase5(d),
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
  if (existing) { out(formatStatus(existing)); return 0; }
  const { target, runtime } = flags;
  if (typeof target !== 'string' || !RUNTIMES.includes(runtime)) {
    err(`init 은 --target <경로> --runtime ${RUNTIMES.join('|')} 가 필요하다`); return 2;
  }
  if (!existsSync(resolve(cwd, target))) { err(`대상 폴더가 없다: ${target}`); return 2; }
  for (const d of ['runs/inputs', 'runs/tools']) mkdirSync(join(cwd, A2W_DIR, d), { recursive: true });
  const st = emptyStatus(target, runtime);
  st.log.push(`${today()} init`);
  writeStatus(cwd, st);
  out(`STATUS 생성: target=${target} runtime=${runtime}`);
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
  st.log.push(`${today()} rollback ${n}`);
  writeStatus(cwd, st);
  out(`${n}단계부터 다시. ${n}단계 이후 통과 기록과 종료를 지웠다`);
  return 0;
}

function gate(cwd, n, flags, out, err) {
  const st = readStatus(cwd);
  if (!st) { err('STATUS.md 가 없다. 먼저 init'); return 2; }
  if (st.terminated) { err(`종료됨: ${st.terminated}. 다시 하려면 node check_phase.mjs rollback 2`); return 1; }
  if (n > 1 && !st.phases[n - 1]) { err(`${n - 1}단계를 먼저 통과해야 한다`); return 1; }

  const a2wDir = join(cwd, A2W_DIR);
  const override = typeof flags.override === 'string' ? flags.override : null;
  const r = CHECKS[n](a2wDir, { override });
  for (const w of r.warnings) out(`경고: ${w}`);
  if (!r.ok) {
    for (const e of r.errors) err(`실패: ${e}`);
    if (n === 3 && r.rejudge) err('규칙화 불가 항목이 순서를 흔든다. 2단계로 돌아가라: node check_phase.mjs rollback 2');
    return 1;
  }

  const wantsApproval = NEEDS_APPROVAL.includes(n) && !flags.batch;
  if (wantsApproval && !flags.approve) {
    const doc = n === 2 ? 'verdict.md' : 'workflow.md';
    err(`${n}단계 검사는 통과. 학습자가 ${doc} 를 읽고 동의하면 --approve 로 다시 실행하라. 통과 기록은 아직 안 남겼다`);
    return 1;
  }

  st.phases[n] = { passed: today(), approved: NEEDS_APPROVAL.includes(n) && Boolean(flags.approve) };
  if (override) st.log.push(`${today()} phase-${n} override: ${override}`);
  if (flags.batch && NEEDS_APPROVAL.includes(n)) st.log.push(`${today()} phase-${n} batch (승인 생략)`);

  if (n === 2 && r.verdict === '고정 불가') {
    st.terminated = `고정 불가 ${today()}`;
    st.log.push(`${today()} terminated: 고정 불가`);
    writeStatus(cwd, st);
    out(`2단계 통과. 판정: 고정 불가 → 여기서 종료.\n${ROUTING_HINT}`);
    return 0;
  }
  writeStatus(cwd, st);
  out(`${n}단계 통과${r.verdict ? ` (판정: ${r.verdict})` : ''}`);
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
