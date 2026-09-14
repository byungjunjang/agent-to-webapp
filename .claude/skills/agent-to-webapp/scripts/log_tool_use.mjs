#!/usr/bin/env node
// PostToolUse 훅. stdin 의 JSON 한 건을 <logDir>/<session>.jsonl 에 한 줄로 덧붙인다. 경로·명령과 짧은 응답만 남긴다.
//   node log_tool_use.mjs <logDir>
// 어떤 실패에도 종료코드 0 — 훅이 에이전트를 멈추게 하면 안 된다. 인자가 없을 때만 2.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_FIELD = 2000;
// 판정(2단계)이 쓰는 것은 "무엇을 어디에 했는가" 다. 명령은 1000자, 응답은 첫 200자만 남긴다.
// dogfood 에서 응답이 기록의 3분의 2를 차지했지만 판정에 쓰이지 않았다.
export const MAX_INPUT = 1000;
export const MAX_RESPONSE = 200;
// 파일 도구의 내용(content·old_string·new_string)과 Agent 의 prompt 는 버리고 이 키만 남긴다.
export const INPUT_KEYS = ['file_path', 'notebook_path', 'path', 'pattern', 'glob', 'command', 'skill', 'args', 'description', 'subagent_type', 'url'];
// 기록은 작업 폴더 repo 로 커밋된다. API 키 모양 문자열은 남기지 않는다.
export const KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]+/g;

export function redact(s) {
  return typeof s === 'string' ? s.replace(KEY_PATTERN, 'sk-ant-***') : s;
}

export function truncate(v, max = MAX_FIELD) {
  if (v === undefined || v === null) return undefined;
  const s = redact(typeof v === 'string' ? v : JSON.stringify(v));
  return s.length > max ? `${s.slice(0, max)}…(+${s.length - max})` : s;
}

// 도구 input 에서 INPUT_KEYS 만 남긴다. 아는 키가 하나도 없으면(낯선 도구) 그대로 둔다.
export function compactInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const kept = {};
  for (const k of INPUT_KEYS) if (k in input) kept[k] = input[k];
  return Object.keys(kept).length ? kept : input;
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
    input: truncate(compactInput(p.tool_input ?? p.input), MAX_INPUT),
    response: truncate(p.tool_response ?? p.output, MAX_RESPONSE),
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
