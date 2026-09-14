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

// 관찰 횟수와 모델은 STATUS 가 들고 다닌다. 게이트 1·2·4 와 key 가 읽는다.
test('emptyStatus: runs·model 기본값은 3·sonnet, 인자로 바꾼다', () => {
  const d = emptyStatus('../x', 'claude-code');
  assert.equal(d.runs, 3);
  assert.equal(d.model, 'sonnet');
  const s = emptyStatus('../x', 'claude-code', { runs: 1, model: 'haiku' });
  assert.equal(s.runs, 1);
  assert.equal(s.model, 'haiku');
});

test('formatStatus/parseStatus: runs·model 줄을 쓰고 읽는다. 없는 옛 파일은 기본값', () => {
  const st = emptyStatus('../x', 'claude-code', { runs: 1, model: 'opus' });
  const text = formatStatus(st);
  assert.ok(text.includes('\nruns: 1\n'));
  assert.ok(text.includes('\nmodel: opus\n'));
  assert.deepEqual(parseStatus(text), st);
  const old = parseStatus('target: ../a\nruntime: claude-code\ncreated: 2026-01-01\nphase-1:\n');
  assert.equal(old.runs, 3);
  assert.equal(old.model, 'sonnet');
});
