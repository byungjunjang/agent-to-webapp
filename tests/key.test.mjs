import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { makeApp, write, A2W } from './helpers.mjs';
import { fileHasKey, findKey } from '../.claude/skills/agent-to-webapp/scripts/lib/key.mjs';

const SCRIPT = resolve('.claude/skills/agent-to-webapp/scripts/check_phase.mjs');
const FAKE = 'sk-ant-test-0000';

function skillDir() {
  return mkdtempSync(join(tmpdir(), 'a2w-skill-'));
}

// 테스트 자식 프로세스에는 부모의 ANTHROPIC_API_KEY 를 넘기지 않는다. env 인자로 준 것만 쓴다.
function cli(cwd, env, ...args) {
  const childEnv = { ...process.env };
  delete childEnv.ANTHROPIC_API_KEY;
  Object.assign(childEnv, env);
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', env: childEnv });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('fileHasKey: 없는 파일·주석·빈 값은 false, export·따옴표·CRLF 는 true', () => {
  const d = skillDir();
  assert.equal(fileHasKey(join(d, 'none.env')), false);
  write(d, 'a.env', '# ANTHROPIC_API_KEY=sk-ant-x\nANTHROPIC_API_KEY=\n');
  assert.equal(fileHasKey(join(d, 'a.env')), false);
  write(d, 'b.env', 'export ANTHROPIC_API_KEY="' + FAKE + '"\r\n');
  assert.equal(fileHasKey(join(d, 'b.env')), true);
});

// Node --env-file 과 같이 읽는다. 따옴표 없는 값의 ' #…' 는 주석이라 키가 아니다(2026-09-28 리뷰).
test('fileHasKey: 따옴표 없는 값의 인라인 주석은 떼고, 따옴표 안은 그대로 본다', () => {
  const d = skillDir();
  write(d, 'c.env', 'ANTHROPIC_API_KEY= # 여기에 키\n');
  assert.equal(fileHasKey(join(d, 'c.env')), false);
  write(d, 'd.env', 'ANTHROPIC_API_KEY=#memo\n');
  assert.equal(fileHasKey(join(d, 'd.env')), false);
  write(d, 'e.env', 'ANTHROPIC_API_KEY=' + FAKE + ' # 개인 키\n');
  assert.equal(fileHasKey(join(d, 'e.env')), true);
  write(d, 'f.env', 'ANTHROPIC_API_KEY="" # 비어 있음\n');
  assert.equal(fileHasKey(join(d, 'f.env')), false);
  write(d, 'g.env', "ANTHROPIC_API_KEY='#not-comment'\n");
  assert.equal(fileHasKey(join(d, 'g.env')), true);
});

test('findKey: 우선순위는 셸 환경변수 > 프로젝트 verify/.env > 스킬 .env', () => {
  const s = skillDir();
  const app = makeApp();
  assert.equal(findKey({ skillDir: s, appDir: app, env: {} }).active, null);
  write(s, '.env', 'ANTHROPIC_API_KEY=' + FAKE + '\n');
  assert.equal(findKey({ skillDir: s, appDir: app, env: {} }).active, 'skill');
  write(app, `${A2W}/verify/.env`, 'ANTHROPIC_API_KEY=' + FAKE + '\n');
  assert.deepEqual(findKey({ skillDir: s, appDir: app, env: {} }).sources, ['project', 'skill']);
  assert.equal(findKey({ skillDir: s, appDir: app, env: { ANTHROPIC_API_KEY: FAKE } }).active, 'env');
});

test('CLI key: 없으면 1 과 .env.example 안내, 있으면 0 과 실행 명령. 값은 출력하지 않는다', () => {
  const s = skillDir();
  const app = makeApp();
  const r1 = cli(app, {}, 'key', '--skill-dir', s);
  assert.equal(r1.code, 1);
  assert.ok(r1.err.includes('.env.example'));
  write(s, '.env', 'ANTHROPIC_API_KEY=' + FAKE + '\n');
  const r2 = cli(app, {}, 'key', '--skill-dir', s);
  assert.equal(r2.code, 0, r2.err);
  assert.ok(r2.out.includes('스킬 .env'));
  assert.ok(r2.out.includes('--env-file-if-exists'));
  assert.ok(!(r2.out + r2.err).includes(FAKE));
});

test('CLI key: 셸 환경변수가 있으면 Claude Code 과금 경고를 낸다', () => {
  const r = cli(makeApp(), { ANTHROPIC_API_KEY: FAKE }, 'key', '--skill-dir', skillDir());
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.includes('과금'));
  assert.ok(!(r.out + r.err).includes(FAKE));
});

test('CLI key: STATUS 의 model 을 A2W_MODEL 로 실행 명령에 붙인다', () => {
  const s = skillDir();
  write(s, '.env', 'ANTHROPIC_API_KEY=' + FAKE + '\n');
  const app = makeApp();
  const target = mkdtempSync(join(tmpdir(), 'a2w-target-'));
  assert.equal(cli(app, {}, 'init', '--target', target, '--runtime', 'claude-code', '--model', 'haiku').code, 0);
  const r = cli(app, {}, 'key', '--skill-dir', s);
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.includes('A2W_MODEL=claude-haiku-4-5-20251001 node'), r.out);
  const noStatus = cli(makeApp(), {}, 'key', '--skill-dir', s);
  assert.ok(noStatus.out.includes('A2W_MODEL=claude-sonnet-5 node'), noStatus.out);
});
