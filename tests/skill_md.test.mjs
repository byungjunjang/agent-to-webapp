import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = '.claude/skills/agent-to-webapp';
const P = join(DIR, 'SKILL.md');

test('SKILL.md: 150줄 이하, LF, frontmatter 에 name·description', () => {
  const text = readFileSync(P, 'utf8');
  assert.ok(!text.includes('\r'));
  const lines = text.split('\n');
  assert.ok(lines.length <= 150, `${lines.length}줄`);
  assert.equal(lines[0], '---');
  const end = lines.indexOf('---', 1);
  const fm = lines.slice(1, end).join('\n');
  assert.match(fm, /^name: agent-to-webapp$/m);
  assert.match(fm, /^description: .{80,}/m);
});

test('SKILL.md: 참조하는 references/ 문서와 scripts 가 실제로 있다', () => {
  const text = readFileSync(P, 'utf8');
  const refs = new Set([...text.matchAll(/references\/[a-z0-9-]+\.md/g)].map(m => m[0]));
  assert.ok(refs.size >= 7, [...refs].join(', '));
  for (const r of refs) assert.ok(existsSync(join(DIR, r)), r);
  assert.ok(text.includes('scripts/check_phase.mjs'));
  assert.ok(existsSync(join(DIR, 'scripts/check_phase.mjs')));
});
