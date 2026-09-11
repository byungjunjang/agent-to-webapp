import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { makeApp } from './helpers.mjs';
import { toRecord, truncate, appendRecord, MAX_FIELD } from '../.claude/skills/agent-to-webapp/scripts/log_tool_use.mjs';

const SCRIPT = resolve('.claude/skills/agent-to-webapp/scripts/log_tool_use.mjs');
const CLAUDE_PAYLOAD = {
  session_id: 'abc-123', hook_event_name: 'PostToolUse', cwd: 'C:/x', tool_use_id: 't1',
  tool_name: 'Bash', tool_input: { command: 'ls' }, tool_response: { stdout: 'a\nb', exit_code: 0 },
};

test('toRecord: Claude Code 페이로드', () => {
  const rec = toRecord(CLAUDE_PAYLOAD, new Date('2026-09-12T01:02:03Z'));
  assert.equal(rec.ts, '2026-09-12T01:02:03.000Z');
  assert.equal(rec.session, 'abc-123');
  assert.equal(rec.event, 'PostToolUse');
  assert.equal(rec.tool, 'Bash');
  assert.equal(rec.input, '{"command":"ls"}');
  assert.ok(rec.response.includes('"exit_code":0'));
  assert.equal(rec.raw, undefined);
});

test('toRecord: 필드가 다르면 raw 를 남긴다', () => {
  const rec = toRecord({ thread_id: 'z', kind: 'shell', argv: ['ls'] });
  assert.equal(rec.session, 'z');
  assert.equal(rec.tool, null);
  assert.ok(rec.raw.includes('"argv"'));
});

test('truncate: 긴 값은 자르고 길이를 남긴다', () => {
  const long = 'x'.repeat(MAX_FIELD + 10);
  assert.ok(truncate(long).startsWith('x'.repeat(MAX_FIELD)));
  assert.ok(truncate(long).endsWith('(+10)'));
  assert.equal(truncate(undefined), undefined);
  assert.equal(truncate({ a: 1 }), '{"a":1}');
});

test('appendRecord: 세션별 jsonl 에 한 줄씩', () => {
  const dir = join(makeApp(), 'tools');
  appendRecord(dir, toRecord(CLAUDE_PAYLOAD));
  appendRecord(dir, toRecord({ ...CLAUDE_PAYLOAD, tool_name: 'Read' }));
  const lines = readFileSync(join(dir, 'abc-123.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).tool, 'Read');
});

test('CLI: stdin JSON → 파일, 깨진 JSON 도 0, 인자 없으면 2', () => {
  const dir = join(makeApp(), 'tools');
  const ok = spawnSync(process.execPath, [SCRIPT, dir], { input: JSON.stringify(CLAUDE_PAYLOAD), encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(readdirSync(dir), ['abc-123.jsonl']);
  const bad = spawnSync(process.execPath, [SCRIPT, dir], { input: '{not json', encoding: 'utf8' });
  assert.equal(bad.status, 0);
  assert.ok(readFileSync(join(dir, 'unknown.jsonl'), 'utf8').includes('parse_error'));
  assert.equal(spawnSync(process.execPath, [SCRIPT], { input: '{}', encoding: 'utf8' }).status, 2);
});
