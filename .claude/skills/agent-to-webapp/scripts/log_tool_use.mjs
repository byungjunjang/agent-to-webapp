#!/usr/bin/env node
// PostToolUse 훅. stdin 의 JSON 한 건을 <logDir>/<session>.jsonl 에 한 줄로 덧붙인다.
//   node log_tool_use.mjs <logDir>
// 어떤 실패에도 종료코드 0 — 훅이 에이전트를 멈추게 하면 안 된다. 인자가 없을 때만 2.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_FIELD = 2000;
// 기록은 작업 폴더 repo 와 examples/ 로 커밋된다. API 키 모양 문자열은 남기지 않는다.
export const KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]+/g;

export function redact(s) {
  return typeof s === 'string' ? s.replace(KEY_PATTERN, 'sk-ant-***') : s;
}

export function truncate(v, max = MAX_FIELD) {
  if (v === undefined || v === null) return undefined;
  const s = redact(typeof v === 'string' ? v : JSON.stringify(v));
  return s.length > max ? `${s.slice(0, max)}…(+${s.length - max})` : s;
}

// Claude Code: session_id, hook_event_name, tool_name, tool_input, tool_response.
// 다른 런타임(Codex)이 필드를 다르게 주면 아는 것만 뽑고 나머지는 raw 로 남긴다.
export function toRecord(payload, now = new Date()) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const tool = p.tool_name ?? p.tool ?? p.name ?? null;
  const rec = {
    ts: now.toISOString(),
    session: String(p.session_id ?? p.session ?? p.thread_id ?? 'unknown'),
    event: p.hook_event_name ?? p.event ?? 'PostToolUse',
    tool,
    input: truncate(p.tool_input ?? p.input),
    response: truncate(p.tool_response ?? p.output),
  };
  if (!tool) rec.raw = truncate(p);
  return rec;
}

function safeName(s) {
  return s.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function appendRecord(logDir, rec) {
  mkdirSync(logDir, { recursive: true });
  appendFileSync(join(logDir, `${safeName(rec.session)}.jsonl`), JSON.stringify(rec) + '\n', 'utf8');
}

export async function main(argv = process.argv.slice(2), stdin = process.stdin) {
  const logDir = argv[0];
  if (!logDir) { process.stderr.write('usage: node log_tool_use.mjs <logDir>\n'); return 2; }
  let raw = '';
  for await (const chunk of stdin) raw += chunk;
  let payload;
  try { payload = JSON.parse(raw); } catch { payload = { parse_error: true, raw: raw.slice(0, MAX_FIELD) }; }
  appendRecord(logDir, toRecord(payload));
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().then(code => process.exit(code)).catch(() => process.exit(0));
}
