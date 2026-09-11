// 1단계 관찰 게이트: run 3개 + 헤딩, 입력 3개 + README, 훅 기록 짝짓기.
import { readdirSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { hasHeading } from './md.mjs';

export const RUN_HEADINGS = ['## 수행한 단계', '## 판단이 필요했던 지점', '## 예상과 달라서 방식을 바꾼 지점'];
export const MIN_RUNS = 3;

function runNumber(f) { return Number(f.match(/\d+/)[0]); }

export function checkPhase1(a2wDir) {
  const errors = [];
  const warnings = [];
  const runsDir = join(a2wDir, 'runs');
  if (!existsSync(runsDir)) return { ok: false, errors: ['runs/ 폴더가 없다'], warnings };

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
  return { ok: errors.length === 0, errors, warnings };
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
