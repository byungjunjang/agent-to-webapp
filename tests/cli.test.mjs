import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { makeApp, write, A2W } from './helpers.mjs';
import { RUN_HEADINGS } from '../.claude/skills/agent-to-webapp/scripts/lib/phase1.mjs';

const SCRIPT = resolve('.claude/skills/agent-to-webapp/scripts/check_phase.mjs');

function cli(cwd, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function status(app) {
  return readFileSync(join(app, A2W, 'STATUS.md'), 'utf8');
}

// 대상 폴더(형제)와 작업 폴더를 만들고 init 까지 한 상태를 돌려준다.
function initedApp(runtime = 'claude-code') {
  const app = makeApp();
  const target = join(app, '..', 'target-' + Date.now() + Math.random().toString(36).slice(2, 6));
  mkdirSync(target, { recursive: true });
  const r = cli(app, 'init', '--target', target, '--runtime', runtime);
  assert.equal(r.code, 0, r.err);
  return { app, target };
}

const RUN = `# run\n${RUN_HEADINGS[0]}\n1. 읽기\n${RUN_HEADINGS[1]}\n- 판단\n${RUN_HEADINGS[2]}\n- 없음\n`;
function passPhase1(app) {
  for (const n of [1, 2, 3]) write(app, `${A2W}/runs/run-${n}.md`, RUN);
  write(app, `${A2W}/runs/inputs/README.md`, 'r');
  for (const f of ['a', 'b', 'c']) write(app, `${A2W}/runs/inputs/${f}`, 'x');
  const r = cli(app, '1');
  assert.equal(r.code, 0, r.err);
}
const VERDICT_OK = '| 단계 | 칸 | 근거 |\n|---|---|---|\n| 1 | 단위 작업 × 결정론 | 규칙 |\n\n판정: 고정 가능\n';
const VERDICT_NO = '| 단계 | 칸 | 근거 |\n|---|---|---|\n| 1 | 워크플로우 × 확률론 | 매번 다름 |\n\n판정: 고정 불가\n';

test('init: STATUS 와 폴더를 만들고, 인자 없으면 2', () => {
  const { app, target } = initedApp('codex');
  assert.ok(status(app).includes(`target: ${target}`));
  assert.ok(status(app).includes('runtime: codex'));
  assert.ok(existsSync(join(app, A2W, 'runs/inputs')));
  assert.ok(existsSync(join(app, A2W, 'runs/tools')));
  assert.equal(cli(makeApp(), 'init').code, 2);
  assert.equal(cli(makeApp(), 'init', '--target', 'nope-dir', '--runtime', 'codex').code, 2);
});

test('순서: STATUS 없으면 2, 1단계 전에 2단계는 1', () => {
  assert.equal(cli(makeApp(), '1').code, 2);
  const { app } = initedApp();
  const r = cli(app, '2');
  assert.equal(r.code, 1);
  assert.ok(r.err.includes('1단계'));
});

test('1단계 통과 → STATUS 에 기록', () => {
  const { app } = initedApp();
  passPhase1(app);
  assert.match(status(app), /phase-1: passed \d{4}-\d{2}-\d{2}\n/);
});

test('2단계: --approve 없으면 기록 안 함, 있으면 approved', () => {
  const { app } = initedApp();
  passPhase1(app);
  write(app, `${A2W}/verdict.md`, VERDICT_OK);
  const r1 = cli(app, '2');
  assert.equal(r1.code, 1);
  assert.ok(r1.err.includes('--approve'));
  assert.ok(status(app).includes('phase-2:\n'));
  const r2 = cli(app, '2', '--approve');
  assert.equal(r2.code, 0, r2.err);
  assert.match(status(app), /phase-2: passed \d{4}-\d{2}-\d{2} approved\n/);
});

test('2단계: --batch 는 승인 없이 기록하고 log 에 남긴다', () => {
  const { app } = initedApp();
  passPhase1(app);
  write(app, `${A2W}/verdict.md`, VERDICT_OK);
  assert.equal(cli(app, '2', '--batch').code, 0);
  assert.match(status(app), /phase-2: passed \d{4}-\d{2}-\d{2}\n/);
  assert.ok(status(app).includes('batch'));
});

test('2단계 고정 불가 → 종료 기록, 라우팅 안내, 이후 단계 거부, rollback 으로 해제', () => {
  const { app } = initedApp();
  passPhase1(app);
  write(app, `${A2W}/verdict.md`, VERDICT_NO);
  const r = cli(app, '2', '--approve');
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.includes('Agent SDK'));
  assert.match(status(app), /terminated: 고정 불가 \d{4}-\d{2}-\d{2}\n/);
  const r3 = cli(app, '3');
  assert.equal(r3.code, 1);
  assert.ok(r3.err.includes('종료'));
  assert.equal(cli(app, 'rollback', '2').code, 0);
  assert.ok(!/^terminated:/m.test(status(app)));
  assert.ok(status(app).includes('phase-2:\n'));
  assert.match(status(app), /phase-1: passed/);
});

test('2단계 --override: 조건부로 통과하고 사유를 log 에', () => {
  const { app } = initedApp();
  passPhase1(app);
  write(app, `${A2W}/verdict.md`, VERDICT_NO);
  const r = cli(app, '2', '--approve', '--override', '사이트 3개뿐');
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.includes('조건부'));
  assert.ok(status(app).includes('override: 사이트 3개뿐'));
  assert.ok(!/^terminated:/m.test(status(app)));
});

test('3단계 rejudge → 실패 + rollback 안내', () => {
  const { app } = initedApp();
  passPhase1(app);
  write(app, `${A2W}/verdict.md`, VERDICT_OK);
  assert.equal(cli(app, '2', '--approve').code, 0);
  write(app, `${A2W}/workflow.md`, `## 단계\n### 단계 1: a\n- 실행 주체: 코드\n- 입력 스키마:\n\`\`\`json\n{}\n\`\`\`\n- 출력 스키마:\n\`\`\`json\n{}\n\`\`\`\n- 실패 처리: 중단\n## 규칙화 불가\n- 순서가 바뀜 → 재판정: 흔들림\n`);
  const r = cli(app, '3', '--approve');
  assert.equal(r.code, 1);
  assert.ok(r.err.includes('rollback 2'));
});

test('status 와 잘못된 명령', () => {
  const { app } = initedApp();
  const r = cli(app, 'status');
  assert.equal(r.code, 0);
  assert.ok(r.out.includes('# agent-to-webapp STATUS'));
  assert.equal(cli(app, 'nope').code, 2);
  assert.equal(cli(app, 'rollback', '9').code, 2);
});
