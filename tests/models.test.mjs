import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_ALIASES, DEFAULT_MODEL, resolveModelId } from '../.claude/skills/agent-to-webapp/scripts/lib/models.mjs';

test('모델 별칭: sonnet·opus·haiku 를 API 모델 ID 로, 전체 ID 는 그대로, 모르면 null', () => {
  assert.equal(DEFAULT_MODEL, 'sonnet');
  assert.deepEqual(Object.keys(MODEL_ALIASES).sort(), ['haiku', 'opus', 'sonnet']);
  assert.equal(resolveModelId('sonnet'), 'claude-sonnet-5-5');
  assert.equal(resolveModelId('opus'), 'claude-opus-5-5');
  assert.equal(resolveModelId('haiku'), 'claude-haiku-4-5-20251001');
  assert.equal(resolveModelId('claude-sonnet-4-5'), 'claude-sonnet-4-5');
  assert.equal(resolveModelId('gpt-5'), null);
  assert.equal(resolveModelId(''), null);
});
