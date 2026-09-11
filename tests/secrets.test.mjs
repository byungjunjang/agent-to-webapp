import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { toRecord, redact } from '../.claude/skills/agent-to-webapp/scripts/log_tool_use.mjs';

const SKILL = '.claude/skills/agent-to-webapp';

// 파일이 없어도 패턴만으로 판정한다(--no-index).
function ignored(path) {
  return spawnSync('git', ['check-ignore', '--no-index', '-q', path]).status === 0;
}

test('gitignore: 스킬 .env 와 verify/.env 는 가리고 .env.example 은 올린다', () => {
  assert.ok(ignored(`${SKILL}/.env`));
  assert.ok(ignored('examples/x-app/docs/agent-to-webapp/verify/.env'));
  assert.ok(!ignored(`${SKILL}/.env.example`));
});

test('스킬 폴더에도 .gitignore 가 있어 폴더만 복사해 가도 .env 를 가린다', () => {
  const p = `${SKILL}/.gitignore`;
  assert.ok(existsSync(p));
  assert.ok(readFileSync(p, 'utf8').split(/\r?\n/).includes('.env'));
});

test('.env.example 은 키 자리만 있고 값이 없다', () => {
  const t = readFileSync(`${SKILL}/.env.example`, 'utf8');
  assert.match(t, /^ANTHROPIC_API_KEY=$/m);
  assert.ok(!/sk-ant-/.test(t));
});

test('추적 중인 파일에 API 키 모양 문자열이 없다', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const hits = [];
  for (const f of files) {
    let t;
    try { t = readFileSync(f, 'utf8'); } catch { continue; }
    if (/sk-ant-[A-Za-z0-9_-]{20,}/.test(t)) hits.push(f);
  }
  assert.deepEqual(hits, []);
});

test('훅 기록은 키 모양 문자열을 가린다', () => {
  const key = 'sk-ant-api03-' + 'A'.repeat(40);
  assert.equal(redact(`echo ${key}`), 'echo sk-ant-***');
  const rec = toRecord({
    session_id: 's', tool_name: 'Bash',
    tool_input: { command: `cat .env # ${key}` },
    tool_response: { stdout: `ANTHROPIC_API_KEY=${key}` },
  });
  assert.ok(!JSON.stringify(rec).includes(key));
  assert.ok(JSON.stringify(rec).includes('sk-ant-***'));
});
