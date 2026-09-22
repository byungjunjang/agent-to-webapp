import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { write } from './helpers.mjs';
import { install, installAll } from '../.claude/skills/agent-to-webapp/scripts/install.mjs';

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
