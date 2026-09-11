import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeApp } from './helpers.mjs';
import {
  A2W_DIR, emptyStatus, parseStatus, formatStatus, readStatus, writeStatus,
} from '../.claude/skills/agent-to-webapp/scripts/lib/status.mjs';

test('emptyStatus: 기본 필드', () => {
  const st = emptyStatus('../x', 'claude-code');
  assert.equal(st.target, '../x');
  assert.equal(st.runtime, 'claude-code');
  assert.match(st.created, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(st.phases, {});
  assert.equal(st.terminated, null);
  assert.deepEqual(st.log, []);
});

test('formatStatus → parseStatus 왕복', () => {
  const st = emptyStatus('../x', 'codex');
  st.phases[1] = { passed: '2026-09-12', approved: false };
  st.phases[2] = { passed: '2026-09-13', approved: true };
  st.terminated = '고정 불가 2026-09-13';
  st.log.push('2026-09-13 phase-2 override: 사유');
  const text = formatStatus(st);
  assert.ok(text.startsWith('# agent-to-webapp STATUS\n'));
  assert.ok(text.includes('phase-2: passed 2026-09-13 approved\n'));
  assert.ok(text.includes('phase-3:\n'));
  assert.ok(!text.includes('\r'));
  assert.deepEqual(parseStatus(text), st);
});

test('parseStatus: CRLF 와 빈 phase 줄을 견딘다', () => {
  const st = parseStatus('target: ../a\r\nruntime: claude-code\r\ncreated: 2026-01-01\r\nphase-1:\r\nphase-2: passed 2026-01-02\r\n');
  assert.equal(st.target, '../a');
  assert.deepEqual(st.phases, { 2: { passed: '2026-01-02', approved: false } });
});

test('readStatus/writeStatus: 파일 위치와 없을 때 null', () => {
  const app = makeApp();
  assert.equal(readStatus(app), null);
  writeStatus(app, emptyStatus('../t', 'claude-code'));
  const p = join(app, A2W_DIR, 'STATUS.md');
  assert.ok(existsSync(p));
  assert.ok(readFileSync(p, 'utf8').includes('target: ../t'));
  assert.equal(readStatus(app).runtime, 'claude-code');
});
