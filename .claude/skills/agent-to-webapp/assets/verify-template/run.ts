#!/usr/bin/env node
// agent-to-webapp 4단계 재검증 러너. steps/index.ts 의 단계를 workflow.md 순서대로 부른다.
// 스킬 자산(assets/verify-template)에서 복사된다. 고치지 않는다. 고칠 일이 생기면 report 의 '## 재검증 중 고친 것' 에 적는다.
//   node --env-file-if-exists=<SKILL_DIR>/.env --env-file-if-exists=.env run.ts <입력 폴더> [--out <폴더>] [--from N]
//   --from N: out/<입력>/ 에 저장된 앞 단계 출력을 읽어 단계 N 부터 돈다. 코드를 고친 뒤 처음부터 다시 돌리지 않기 위해서다.
// 종료코드: 0 done / 1 needs_attention / 2 사용법
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Goto, MAX_ATTEMPTS, MODEL, NeedsAttention, Skip, pretty, usageLog } from './lib/step.ts';
import type { InitialInput, InputFile, Step, StepContext } from './lib/step.ts';
import { steps } from './steps/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

const MEDIA: Record<string, string> = {
  '.pdf': 'application/pdf', '.md': 'text/markdown', '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
};

function log(msg: string): void {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

/** 입력 폴더의 파일 전부. 이름 순. 역할은 단계 1 이 정한다. */
export function loadInputFolder(dir: string): InputFile[] {
  const files: InputFile[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (!statSync(p).isFile()) continue;
    files.push({ name, media_type: MEDIA[extname(name).toLowerCase()] ?? 'application/octet-stream', data_base64: readFileSync(p).toString('base64') });
  }
  return files;
}

function fileFor(s: Step): string {
  return `${String(s.n).padStart(2, '0')}-${s.name.replace(/[\\/:*?"<>|\s]+/g, '-')}.json`;
}

interface Timing { step: number; name: string; attempt: number; ms: number }

async function runPipeline(inputDir: string, outDir: string, from: number): Promise<number> {
  mkdirSync(outDir, { recursive: true });
  const inputName = basename(inputDir);
  const outputs = new Map<number, unknown>();
  const timings: Timing[] = [];
  const humanNotes: string[] = [];
  const control: string[] = [];
  const attempts = new Map<number, number>();
  const save = (name: string, data: unknown): void => writeFileSync(join(outDir, name), pretty(data), 'utf8');
  const initial: InitialInput = { input_name: inputName, files: loadInputFolder(inputDir), received_at: new Date().toISOString() };
  const started = Date.now();

  let i = 0;
  let prev: unknown = initial;
  if (from > 1) {
    i = steps.findIndex((s) => s.n >= from);
    if (i < 0) { console.error(`--from ${from}: 그 번호 이상의 단계가 없다`); return 2; }
    for (const s of steps.slice(0, i)) {
      const p = join(outDir, fileFor(s));
      if (!existsSync(p)) { console.error(`--from ${from}: 저장된 출력 ${p} 가 없다. 처음부터 돌려라`); return 2; }
      const o = JSON.parse(readFileSync(p, 'utf8')) as unknown;
      outputs.set(s.n, o);
      prev = o;
    }
    log(`--from ${from}: 단계 ${steps.slice(0, i).map((s) => s.n).join(',')} 출력을 out/ 에서 읽었다`);
  }

  let status: 'done' | 'needs_attention' = 'done';
  let attention: string | null = null;
  let payload: unknown;
  // Goto 의 사유는 되돌아간 단계부터 되돌린 단계까지 다시 도는 동안 ctx.feedback 으로 보인다. 그 뒤로는 null.
  let feedback: Goto | null = null;
  let feedbackUntil = -1;
  try {
    while (i < steps.length) {
      const s = steps[i];
      const attempt = (attempts.get(s.n) ?? 0) + 1;
      attempts.set(s.n, attempt);
      const ctx: StepContext = {
        inputName, inputDir, outDir, outputs, attempt, feedback, log,
        note: (m) => humanNotes.push(`단계 ${s.n} ${s.name}: ${m}`),
      };
      log(`단계 ${s.n} ${s.name} (${s.actor})${attempt > 1 ? ` #${attempt}` : ''}`);
      const t = Date.now();
      const result = await s.run(prev, ctx);
      timings.push({ step: s.n, name: s.name, attempt, ms: Date.now() - t });

      if (result instanceof Goto) {
        const j = steps.findIndex((x) => x.n === result.step);
        if (j < 0) throw new NeedsAttention(s.n, `되돌아갈 단계 ${result.step} 가 없다`);
        if ((attempts.get(result.step) ?? 0) >= MAX_ATTEMPTS) {
          throw new NeedsAttention(s.n, `단계 ${result.step} 를 ${MAX_ATTEMPTS}번 돌았다: ${result.reason}`, result.payload);
        }
        control.push(`단계 ${s.n} → 단계 ${result.step}: ${result.reason}`);
        log(`  → 단계 ${result.step} 로 되돌아간다: ${result.reason}`);
        feedback = result;
        feedbackUntil = i;
        prev = j === 0 ? initial : outputs.get(steps[j - 1].n);
        i = j;
        continue;
      }

      let out: unknown = result;
      if (result instanceof Skip) {
        control.push(`단계 ${s.n} 건너뜀: ${result.reason}`);
        log(`  건너뜀: ${result.reason}. 입력을 그대로 넘긴다`);
        out = prev;
      }
      if (s.actor === 'human') humanNotes.push(`단계 ${s.n} ${s.name}: 자동 승인`);
      outputs.set(s.n, out);
      save(fileFor(s), out);
      prev = out;
      if (i === feedbackUntil) { feedback = null; feedbackUntil = -1; }
      i += 1;
    }
  } catch (e) {
    const err = e as Error;
    status = 'needs_attention';
    attention = err.message;
    if (e instanceof NeedsAttention) payload = e.payload;
    else console.error(err.stack);
  }

  const totalMs = Date.now() - started;
  save('summary.json', {
    input: inputName, status, attention, payload, model: MODEL, from,
    total_ms: totalMs, timings, usage: usageLog, human_notes: humanNotes, control,
  });
  for (const t of timings) log(`  단계 ${t.step} ${t.name}${t.attempt > 1 ? ` #${t.attempt}` : ''}: ${(t.ms / 1000).toFixed(1)}s`);
  const inTok = usageLog.reduce((a, u) => a + u.input_tokens, 0);
  const outTok = usageLog.reduce((a, u) => a + u.output_tokens, 0);
  log(`LLM 호출 ${usageLog.length}회, 입력 토큰 ${inTok}, 출력 토큰 ${outTok}, 총 ${(totalMs / 1000).toFixed(1)}s`);
  log(`완료: ${status}${attention ? ` — ${attention}` : ''}`);
  return status === 'done' ? 0 : 1;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const positional = args.filter((a, k) => !a.startsWith('--') && !(k > 0 && ['--out', '--from'].includes(args[k - 1])));
  const flag = (name: string): string | null => {
    const k = args.indexOf(name);
    return k >= 0 && args[k + 1] ? args[k + 1] : null;
  };
  if (positional.length !== 1) {
    console.error('사용법: node run.ts <입력 폴더> [--out <폴더>] [--from N]');
    return 2;
  }
  const inputDir = resolve(positional[0]);
  if (!existsSync(inputDir) || !statSync(inputDir).isDirectory()) { console.error(`입력 폴더가 없다: ${inputDir}`); return 2; }
  const outDir = flag('--out') ? resolve(flag('--out') as string) : join(HERE, 'out', basename(inputDir));
  const from = flag('--from') ? Number(flag('--from')) : 1;
  if (!Number.isInteger(from) || from < 1) { console.error('--from 은 1 이상의 정수다'); return 2; }
  log(`모델 ${MODEL}, 입력 ${inputDir}, 출력 ${outDir}, 단계 ${steps.length}개${from > 1 ? `, --from ${from}` : ''}`);
  return runPipeline(inputDir, outDir, from);
}

process.exitCode = await main();
