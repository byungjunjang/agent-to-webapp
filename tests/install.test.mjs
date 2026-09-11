import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { write } from './helpers.mjs';
import { install } from '../.claude/skills/agent-to-webapp/scripts/install.mjs';

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
