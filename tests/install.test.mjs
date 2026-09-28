import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { write } from './helpers.mjs';
import { install, installAll, resolveTargetArg } from '../.claude/skills/agent-to-webapp/scripts/install.mjs';

const tmp = (prefix) => mkdtempSync(join(tmpdir(), prefix));

test('install: 파일을 복사하고 대상의 .env 는 그대로 둔다', () => {
  const src = tmp('a2w-src-');
  const dest = tmp('a2w-dest-');
  write(src, 'SKILL.md', 'new');
  write(src, 'scripts/x.mjs', 'x');
  write(dest, 'SKILL.md', 'old');
  write(dest, '.env', 'ANTHROPIC_API_KEY=keep');
  const r = install(src, dest);
  assert.equal(readFileSync(join(dest, 'SKILL.md'), 'utf8'), 'new');
  assert.ok(existsSync(join(dest, 'scripts', 'x.mjs')));
  assert.equal(readFileSync(join(dest, '.env'), 'utf8'), 'ANTHROPIC_API_KEY=keep');
  assert.equal(r.keptEnv, true);
});

test('install: 원본의 .env 는 복사하지 않는다', () => {
  const src = tmp('a2w-src-');
  const dest = tmp('a2w-dest-');
  write(src, 'SKILL.md', 's');
  write(src, '.env', 'ANTHROPIC_API_KEY=dev-only');
  const r = install(src, dest);
  assert.equal(existsSync(join(dest, '.env')), false);
  assert.equal(r.keptEnv, false);
});

test('install: 원본에 없는 옛 파일은 지우되 .env 는 남긴다', () => {
  const src = tmp('a2w-src-');
  const dest = tmp('a2w-dest-');
  write(src, 'SKILL.md', 's');
  write(dest, 'references/old.md', 'stale');
  write(dest, '.env', 'k');
  const r = install(src, dest);
  assert.equal(existsSync(join(dest, 'references', 'old.md')), false);
  assert.ok(r.removed.some(f => f.includes('old.md')));
  assert.ok(existsSync(join(dest, '.env')));
});

test('install: 원본과 대상이 같으면 거부한다', () => {
  const src = tmp('a2w-src-');
  assert.throws(() => install(src, src), /같다/);
});

// 스킬이 둘이 되면서 설치를 한 번에 한다. install(src,dest) 는 그대로 두고 installAll 을 얹었다.
test('installAll: .claude/skills 아래 스킬을 각각 제 이름의 폴더로 설치한다', () => {
  const root = tmp('a2w-root-');
  const dest = tmp('a2w-destroot-');
  write(root, 'agent-to-webapp/SKILL.md', 'a');
  write(root, 'agent-to-webapp/scripts/x.mjs', 'x');
  write(root, 'agent-to-webapp-lite/SKILL.md', 'b');
  const r = installAll(root, dest);
  assert.deepEqual(r.map(x => x.name).sort(), ['agent-to-webapp', 'agent-to-webapp-lite']);
  assert.equal(readFileSync(join(dest, 'agent-to-webapp', 'SKILL.md'), 'utf8'), 'a');
  assert.equal(readFileSync(join(dest, 'agent-to-webapp-lite', 'SKILL.md'), 'utf8'), 'b');
  assert.ok(existsSync(join(dest, 'agent-to-webapp', 'scripts', 'x.mjs')));
});

test('installAll: 설치된 쪽 .env 는 스킬마다 그대로 둔다', () => {
  const root = tmp('a2w-root-');
  const dest = tmp('a2w-destroot-');
  write(root, 'agent-to-webapp/SKILL.md', 'a');
  write(dest, 'agent-to-webapp/.env', 'ANTHROPIC_API_KEY=keep');
  const r = installAll(root, dest);
  assert.equal(readFileSync(join(dest, 'agent-to-webapp', '.env'), 'utf8'), 'ANTHROPIC_API_KEY=keep');
  assert.equal(r.find(x => x.name === 'agent-to-webapp').keptEnv, true);
});

test('installAll: 파일은 건너뛰고 폴더만 스킬로 본다', () => {
  const root = tmp('a2w-root-');
  const dest = tmp('a2w-destroot-');
  write(root, 'README.md', 'not a skill');
  write(root, 'agent-to-webapp/SKILL.md', 'a');
  assert.deepEqual(installAll(root, dest).map(x => x.name), ['agent-to-webapp']);
});

// 대상 폴더 인자는 원본에 없는 파일을 지운다. 엉뚱한 폴더를 비우지 않게 막는다(2026-09-28 리뷰).
test('install: 대상이 원본의 조상이거나 자손이면 거부한다', () => {
  const root = tmp('a2w-nest-');
  write(root, 'skill/SKILL.md', 's');
  write(root, 'keep.txt', 'k');
  assert.throws(() => install(join(root, 'skill'), root), /조상|자손/);
  assert.throws(() => install(join(root, 'skill'), join(root, 'skill', 'sub')), /조상|자손/);
  assert.ok(existsSync(join(root, 'keep.txt')));
});

test('install: .env·.env.* 는 어느 깊이든 대상에서 남기고 원본에서 복사하지 않는다. .env.example 은 복사한다', () => {
  const src = tmp('a2w-src-');
  const dest = tmp('a2w-dest-');
  write(src, 'SKILL.md', 's');
  write(src, '.env.example', 'ANTHROPIC_API_KEY=');
  write(src, '.env.local', 'dev');
  write(src, 'assets/verify-template/.env', 'dev');
  write(dest, '.env.local', 'keep');
  write(dest, 'assets/verify-template/.env.production', 'keep');
  write(dest, '.env.example', 'old');
  install(src, dest);
  assert.equal(readFileSync(join(dest, '.env.example'), 'utf8'), 'ANTHROPIC_API_KEY=');
  assert.equal(readFileSync(join(dest, '.env.local'), 'utf8'), 'keep');
  assert.equal(readFileSync(join(dest, 'assets/verify-template/.env.production'), 'utf8'), 'keep');
  assert.equal(existsSync(join(dest, 'assets/verify-template/.env')), false);
});

test('install: 복사가 실패하면 옛 파일을 지우지 않는다 (복사 먼저, 지우기 나중)', () => {
  const src = tmp('a2w-src-');
  const dest = tmp('a2w-dest-');
  write(src, 'SKILL.md', 's');
  write(dest, 'old.md', 'stale');
  // 대상에 SKILL.md 이름의 폴더가 있으면 복사가 실패한다
  write(dest, 'SKILL.md/x', 'blocker');
  assert.throws(() => install(src, dest));
  assert.ok(existsSync(join(dest, 'old.md')));
});

test('resolveTargetArg: - 로 시작하거나 스킬 이름과 다른 폴더는 거부한다', () => {
  assert.throws(() => resolveTargetArg('--help'), /옵션/);
  assert.throws(() => resolveTargetArg(tmpdir()), /agent-to-webapp/);
  const ok = join(tmpdir(), 'x', 'agent-to-webapp');
  assert.equal(resolveTargetArg(ok), ok);
});
