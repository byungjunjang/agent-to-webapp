import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const DIR = '.claude/skills/agent-to-webapp/assets';

for (const name of ['hooks.claude.example.json', 'hooks.codex.example.json']) {
  test(`${name}: JSON 이고 PostToolUse 훅이 log_tool_use.mjs 를 부른다`, () => {
    const j = JSON.parse(readFileSync(`${DIR}/${name}`, 'utf8'));
    const cmd = j.hooks.PostToolUse[0].hooks[0];
    assert.equal(cmd.type, 'command');
    assert.ok(cmd.command.includes('<SKILL_DIR>/scripts/log_tool_use.mjs'));
    assert.ok(cmd.command.includes('<APP>/docs/agent-to-webapp/runs/tools'));
  });
}

test('hooks.claude.example.json: additionalDirectories 에 <APP>', () => {
  const j = JSON.parse(readFileSync(`${DIR}/hooks.claude.example.json`, 'utf8'));
  assert.deepEqual(j.permissions.additionalDirectories, ['<APP>']);
});

test('hooks.claude.example.json: 관찰 모델 자리 <MODEL>', () => {
  const j = JSON.parse(readFileSync(`${DIR}/hooks.claude.example.json`, 'utf8'));
  assert.equal(j.model, '<MODEL>');
});
