import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeApp, LITE } from './helpers.mjs';
import {
  LITE_DIR, MODES, DEFAULT_SAMPLES,
  emptyStatus, parseStatus, formatStatus, readStatus, writeStatus, isSafeValue,
} from '../.claude/skills/agent-to-webapp-lite/scripts/lib/status.mjs';

test('LITE_DIR 은 정식 폴더와 다르다', () => {
  assert.equal(LITE_DIR.split(/[\\/]/).join('/'), LITE);
  assert.deepEqual(MODES, ['dashboard', 'skill']);
  assert.equal(DEFAULT_SAMPLES, 5);
});

test('emptyStatus: dashboard 는 output 을, skill 은 skill·samples 를 든다', () => {
  const d = emptyStatus('../x', 'dashboard', { output: '../x/out/sales.csv' });
  assert.equal(d.mode, 'dashboard');
  assert.equal(d.output, '../x/out/sales.csv');
  assert.equal(d.skill, null);
  assert.equal(d.samples, DEFAULT_SAMPLES);
  assert.match(d.created, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(d.phases, {});
  assert.equal(d.terminated, null);
  assert.deepEqual(d.log, []);
  const s = emptyStatus('../y', 'skill', { skill: 'invoice-parser', samples: 3 });
  assert.equal(s.skill, 'invoice-parser');
  assert.equal(s.samples, 3);
  assert.equal(s.output, null);
});

test('formatStatus → parseStatus 왕복 (dashboard)', () => {
  const st = emptyStatus('../x', 'dashboard', { output: '../x/out.csv' });
  st.phases[1] = { passed: '2026-09-22', approved: false };
  st.phases[2] = { passed: '2026-09-22', approved: true };
  st.terminated = '고정 불가 2026-09-22';
  st.log.push('2026-09-22 init');
  const text = formatStatus(st);
  assert.ok(text.startsWith('# agent-to-webapp-lite STATUS\n'));
  assert.ok(text.includes('\nmode: dashboard\n'));
  assert.ok(text.includes('\noutput: ../x/out.csv\n'));
  assert.ok(!text.includes('\nskill:'), 'dashboard 는 skill 줄을 쓰지 않는다');
  assert.ok(text.includes('phase-2: passed 2026-09-22 approved\n'));
  assert.ok(text.includes('phase-3:\n'));
  assert.ok(!text.includes('\r'));
  assert.deepEqual(parseStatus(text), st);
});

test('formatStatus → parseStatus 왕복 (skill)', () => {
  const st = emptyStatus('../y', 'skill', { skill: 'invoice-parser', samples: 3 });
  const text = formatStatus(st);
  assert.ok(text.includes('\nskill: invoice-parser\n'));
  assert.ok(text.includes('\nsamples: 3\n'));
  assert.ok(!text.includes('\noutput:'), 'skill 은 output 줄을 쓰지 않는다');
  assert.deepEqual(parseStatus(text), st);
});

test('parseStatus: CRLF 와 없는 줄을 견딘다', () => {
  const st = parseStatus('target: ../a\r\nmode: skill\r\ncreated: 2026-01-01\r\nphase-1:\r\nphase-2: passed 2026-01-02\r\n');
  assert.equal(st.target, '../a');
  assert.equal(st.mode, 'skill');
  assert.equal(st.samples, DEFAULT_SAMPLES, '없는 samples 줄은 기본값');
  assert.equal(st.output, null);
  assert.deepEqual(st.phases, { 2: { passed: '2026-01-02', approved: false } });
});

test('readStatus/writeStatus: 파일 위치와 없을 때 null', () => {
  const app = makeApp('a2wl-');
  assert.equal(readStatus(app), null);
  writeStatus(app, emptyStatus('../t', 'dashboard', { output: '../t/o.csv' }));
  assert.ok(existsSync(join(app, LITE_DIR, 'STATUS.md')));
  assert.ok(readFileSync(join(app, LITE_DIR, 'STATUS.md'), 'utf8').includes('target: ../t'));
  assert.equal(readStatus(app).mode, 'dashboard');
});

test('verdict: 2단계 판정을 STATUS 에 남기고 왕복한다. 없는 줄은 null', () => {
  const st = emptyStatus('../y', 'skill', { skill: 'invoice-parser' });
  assert.equal(st.verdict, null);
  assert.ok(!formatStatus(st).includes('verdict:'), '판정 전에는 줄을 쓰지 않는다');
  st.verdict = 'Claude 호출 유지';
  const text = formatStatus(st);
  assert.ok(text.includes('\nverdict: Claude 호출 유지\n'));
  assert.deepEqual(parseStatus(text), st);
  assert.equal(parseStatus('target: ../a\nmode: skill\n').verdict, null, '옛 STATUS 도 읽힌다');
});

test('isSafeValue: 줄바꿈·제어 문자가 든 값은 STATUS 에 쓰지 않는다', () => {
  assert.equal(isSafeValue('../x/out.csv'), true);
  assert.equal(isSafeValue('../x\nphase-5: passed 2026-01-01'), false);
  assert.equal(isSafeValue('a\rb'), false);
  assert.equal(isSafeValue('a\u0000b'), false);
  assert.throws(() => formatStatus(emptyStatus('../x\nphase-1: passed 2026-01-01', 'dashboard', { output: 'o' })));
});
