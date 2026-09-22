import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeApp, write, LITE } from './helpers.mjs';
import { run, parseArgs } from '../.claude/skills/agent-to-webapp-lite/scripts/check_lite.mjs';

// out/err 를 모아 두고 종료코드와 같이 돌려준다.
function call(app, argv) {
  const out = [];
  const err = [];
  const code = run(argv, app, (m) => out.push(String(m)), (m) => err.push(String(m)));
  return { code, out: out.join('\n'), err: err.join('\n') };
}

function newApp() {
  const app = makeApp('a2wl-cli-');
  mkdirSync(join(app, 'target'), { recursive: true });
  return app;
}

test('parseArgs: 불리언 플래그와 값 플래그', () => {
  const a = parseArgs(['2', '--approve', '--override', '사유', '--batch']);
  assert.equal(a.cmd, '2');
  assert.equal(a.flags.approve, true);
  assert.equal(a.flags.override, '사유');
  assert.equal(a.flags.batch, true);
});

test('init: dashboard 는 --output 이 필요하다', () => {
  const app = newApp();
  assert.equal(call(app, ['init', '--target', 'target', '--mode', 'dashboard']).code, 2);
  const r = call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'target/out.csv']);
  assert.equal(r.code, 0);
  assert.ok(readFileSync(join(app, LITE, 'STATUS.md'), 'utf8').includes('mode: dashboard'));
});

test('init: skill 은 --skill 이 필요하고 --samples 기본 5', () => {
  const app = newApp();
  assert.equal(call(app, ['init', '--target', 'target', '--mode', 'skill']).code, 2);
  const r = call(app, ['init', '--target', 'target', '--mode', 'skill', '--skill', 'invoice-parser']);
  assert.equal(r.code, 0);
  assert.ok(readFileSync(join(app, LITE, 'STATUS.md'), 'utf8').includes('samples: 5'));
});

test('init: 모드가 틀리거나 대상이 없으면 2', () => {
  const app = newApp();
  assert.equal(call(app, ['init', '--target', 'target', '--mode', 'hybrid']).code, 2);
  assert.equal(call(app, ['init', '--target', 'nope', '--mode', 'dashboard', '--output', 'x']).code, 2);
});

test('init: 두 번째는 기존 STATUS 를 보여주고 0', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  const r = call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  assert.equal(r.code, 0);
  assert.ok(r.out.includes('agent-to-webapp-lite STATUS'));
});

test('status: STATUS 가 없으면 2', () => {
  assert.equal(call(newApp(), ['status']).code, 2);
});

test('게이트: 앞 단계를 건너뛰면 1', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  const r = call(app, ['2']);
  assert.equal(r.code, 1);
  assert.ok(r.err.includes('1단계'));
});

function schemaDoc() {
  return ['## 출처', 'o.csv', '', '## 열', '', '| 열 | 타입 | 예시값 | 빈 값 비율 |', '|---|---|---|---|',
    '| channel | 문자열 | A | 0% |', '', '## 행 수', '10', '', '## 유일 키 후보', 'channel', '',
    '## 갱신 시각 열', 'checked_at', '', '## LLM 문장 열', '- 없음', '', '## 민감 열 후보', '- 없음', ''].join('\n');
}

test('2단계: --approve 없이는 기록하지 않는다', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  assert.equal(call(app, ['1']).code, 0);
  write(app, `${LITE}/verdict.md`, '## 근거\n- 키 있음\n\n## 민감 열\n- 없음\n\n판정: 조건부 고정 가능\n');
  const noApprove = call(app, ['2']);
  assert.equal(noApprove.code, 1);
  assert.ok(noApprove.err.includes('verdict.md'));
  assert.ok(!readFileSync(join(app, LITE, 'STATUS.md'), 'utf8').includes('phase-2: passed'));
  assert.equal(call(app, ['2', '--approve']).code, 0);
  assert.ok(readFileSync(join(app, LITE, 'STATUS.md'), 'utf8').includes('phase-2: passed'));
});

test('2단계: --batch 는 승인 없이 넘어가고 로그에 남는다', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  call(app, ['1']);
  write(app, `${LITE}/verdict.md`, '## 근거\n- 키 있음\n\n## 민감 열\n- 없음\n\n판정: 조건부 고정 가능\n');
  assert.equal(call(app, ['2', '--batch']).code, 0);
  assert.ok(readFileSync(join(app, LITE, 'STATUS.md'), 'utf8').includes('batch'));
});

test('2단계 고정 불가: 종료를 기록하고 라우팅을 알린다. 3단계는 막힌다', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  call(app, ['1']);
  write(app, `${LITE}/verdict.md`, '## 근거\n- 키가 없다\n\n## 민감 열\n- 없음\n\n판정: 고정 불가\n');
  const r = call(app, ['2', '--approve']);
  assert.equal(r.code, 0);
  assert.ok(r.out.includes('종료'));
  // 로그에도 같은 낱말이 남으므로 STATUS 필드 줄만 본다
  assert.match(readFileSync(join(app, LITE, 'STATUS.md'), 'utf8'), /^terminated: /m);
  assert.equal(call(app, ['3', '--approve']).code, 1);
});

test('rollback: N 단계 이후 기록과 종료를 지운다', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  call(app, ['1']);
  write(app, `${LITE}/verdict.md`, '## 근거\n- x\n\n## 민감 열\n- 없음\n\n판정: 고정 불가\n');
  call(app, ['2', '--approve']);
  assert.equal(call(app, ['rollback', '2']).code, 0);
  const text = readFileSync(join(app, LITE, 'STATUS.md'), 'utf8');
  assert.doesNotMatch(text, /^terminated: /m, '종료 필드를 지운다(로그 줄은 남는다)');
  assert.ok(!text.includes('phase-2: passed'));
  assert.ok(text.includes('phase-1: passed'));
});

test('알 수 없는 명령은 사용법과 2', () => {
  const r = call(newApp(), ['헬프']);
  assert.equal(r.code, 2);
  assert.ok(r.err.includes('사용법'));
});

test('key 명령은 없다 (lite 는 API 키를 쓰지 않는다)', () => {
  assert.equal(call(newApp(), ['key']).code, 2);
});
