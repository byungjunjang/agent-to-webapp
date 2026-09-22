import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = '.claude/skills/agent-to-webapp-lite';
const P = join(DIR, 'SKILL.md');

test('SKILL.md: 150줄 이하, LF, frontmatter 에 name·description', () => {
  const text = readFileSync(P, 'utf8');
  assert.ok(!text.includes('\r'));
  const lines = text.split('\n');
  assert.ok(lines.length <= 150, `${lines.length}줄`);
  assert.equal(lines[0], '---');
  const end = lines.indexOf('---', 1);
  const fm = lines.slice(1, end).join('\n');
  assert.match(fm, /^name: agent-to-webapp-lite$/m);
  assert.match(fm, /^description: .{80,}/m);
});

test('SKILL.md: 트리거 문구와 모드 인자가 있다', () => {
  const text = readFileSync(P, 'utf8');
  for (const s of ['--mode', 'dashboard', 'skill', '--batch', '출력을 대시보드로', '이 스킬만 서버로', 'agent to webapp lite']) {
    assert.ok(text.includes(s), s);
  }
});

test('SKILL.md: 참조하는 references/ 문서와 scripts 가 실제로 있다', () => {
  const text = readFileSync(P, 'utf8');
  const refs = new Set([...text.matchAll(/references\/[a-z0-9-]+(?:\/[a-z0-9-]+)?\.md/g)].map(m => m[0]));
  assert.ok(refs.size >= 3, [...refs].join(', '));
  for (const r of refs) assert.ok(existsSync(join(DIR, r)), r);
  assert.ok(text.includes('scripts/check_lite.mjs'));
  assert.ok(existsSync(join(DIR, 'scripts/check_lite.mjs')));
});

test('SKILL.md: API 키를 요구하지 않는다', () => {
  const text = readFileSync(P, 'utf8');
  assert.ok(!text.includes('ANTHROPIC_API_KEY'), 'lite 는 키를 쓰지 않는다');
  assert.ok(!text.includes('check_lite.mjs key'), 'key 명령은 없다');
});

test('lite 스킬 폴더에 정식 스킬의 자산이 섞여 있지 않다', () => {
  for (const p of ['assets/verify-template', 'scripts/lib/key.mjs', 'scripts/lib/models.mjs', 'scripts/log_tool_use.mjs', '.env.example']) {
    assert.equal(existsSync(join(DIR, p)), false, `${p} 는 가져오지 않는다`);
  }
});
