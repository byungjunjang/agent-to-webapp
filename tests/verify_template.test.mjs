import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeApp, write } from './helpers.mjs';

// 4단계 러너는 스킬 자산이다. LLM 은 steps/ 만 쓴다. 여기서는 API 없이 스텁 단계로 러너 자체를 돌려 본다.
const TEMPLATE = resolve('.claude/skills/agent-to-webapp/assets/verify-template');

test('verify-template: 러너·라이브러리·package.json·.gitignore 가 있고 steps/ 는 비어 있다', () => {
  for (const f of ['run.ts', 'lib/step.ts', 'lib/llm.ts', 'package.json', '.gitignore']) assert.ok(existsSync(join(TEMPLATE, f)), f);
  const pkg = JSON.parse(readFileSync(join(TEMPLATE, 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'module');
  assert.ok(pkg.dependencies['@anthropic-ai/sdk']);
  const gi = readFileSync(join(TEMPLATE, '.gitignore'), 'utf8').split(/\r?\n/);
  assert.ok(gi.includes('node_modules') && gi.includes('.env'));
  assert.ok(!existsSync(join(TEMPLATE, 'steps', 'index.ts')), 'steps/index.ts 는 LLM 이 쓴다');
});

const STUB_STEPS = `import { Goto, Skip, NeedsAttention } from '../lib/step.ts';
import type { Step } from '../lib/step.ts';
export const steps: Step[] = [
  { n: 1, name: 'intake', actor: 'code', run: (input: any) => ({ names: input.files.map((f: any) => f.name), types: input.files.map((f: any) => f.media_type) }) },
  { n: 2, name: 'judge', actor: 'llm', run: (input: any, ctx) => ctx.attempt < 2 ? new Goto(1, 'again', { hint: 'x' }) : ({ ...input, judged: true, attempt: ctx.attempt, feedback: ctx.feedback?.payload ?? null }) },
  { n: 3, name: 'approve', actor: 'human', run: (input: any, ctx) => { ctx.note('값을 채웠다'); return { ...input, approved: true }; } },
  { n: 4, name: 'external', actor: 'code', run: () => new Skip('외부 서비스') },
];
`;

function stage(stepsSource = STUB_STEPS) {
  const dir = makeApp('a2w-verify-');
  cpSync(TEMPLATE, dir, { recursive: true });
  write(dir, 'steps/index.ts', stepsSource);
  const input = join(dir, 'inputs', '1-easy');
  write(input, 'note.md', '# hi');
  write(input, 'data.txt', 'x');
  return { dir, input, out: join(dir, 'out', '1-easy') };
}

function runner(dir, ...args) {
  const r = spawnSync(process.execPath, ['run.ts', ...args], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('run.ts: 스텁 단계를 순서대로 돌리고 단계별 JSON·summary.json 을 쓴다', () => {
  const { dir, input, out } = stage();
  const r = runner(dir, input);
  assert.equal(r.code, 0, r.err + r.out);
  assert.deepEqual(readdirSync(out).sort(), ['01-intake.json', '02-judge.json', '03-approve.json', '04-external.json', 'summary.json']);
  const judge = JSON.parse(readFileSync(join(out, '02-judge.json'), 'utf8'));
  assert.equal(judge.attempt, 2);
  assert.deepEqual(judge.names, ['data.txt', 'note.md']);
  assert.deepEqual(judge.types, ['text/plain', 'text/markdown']);
  assert.deepEqual(judge.feedback, { hint: 'x' });
  // 건너뛴 단계는 입력을 그대로 통과시킨다
  assert.deepEqual(JSON.parse(readFileSync(join(out, '04-external.json'), 'utf8')), JSON.parse(readFileSync(join(out, '03-approve.json'), 'utf8')));
  const s = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
  assert.equal(s.status, 'done');
  assert.equal(s.model, 'claude-sonnet-5');
  assert.deepEqual(s.timings.map(t => `${t.step}#${t.attempt}`), ['1#1', '2#1', '1#2', '2#2', '3#1', '4#1']);
  assert.ok(s.control.some(c => c.includes('단계 2') && c.includes('단계 1') && c.includes('again')));
  assert.ok(s.control.some(c => c.includes('단계 4') && c.includes('외부 서비스')));
  assert.ok(s.human_notes.includes('단계 3 approve: 자동 승인'));
  assert.ok(s.human_notes.includes('단계 3 approve: 값을 채웠다'));
  assert.deepEqual(s.usage, []);
});

test('run.ts: --from N 은 저장된 앞 단계 출력을 읽어 N 부터 돈다', () => {
  const { dir, input, out } = stage();
  assert.equal(runner(dir, input).code, 0);
  const r = runner(dir, input, '--from', '3');
  assert.equal(r.code, 0, r.err);
  const s = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
  assert.equal(s.from, 3);
  assert.deepEqual(s.timings.map(t => t.step), [3, 4]);
  const approve = JSON.parse(readFileSync(join(out, '03-approve.json'), 'utf8'));
  assert.equal(approve.judged, true);
  // 저장된 출력이 없으면 2
  const fresh = stage();
  assert.equal(runner(fresh.dir, fresh.input, '--from', '3').code, 2);
});

test('run.ts: NeedsAttention 이면 1 로 끝나고 summary 에 사유를 남긴다', () => {
  const { dir, input, out } = stage(`import { NeedsAttention } from '../lib/step.ts';
import type { Step } from '../lib/step.ts';
export const steps: Step[] = [
  { n: 1, name: 'a', actor: 'code', run: () => ({ ok: true }) },
  { n: 2, name: 'b', actor: 'code', run: () => { throw new NeedsAttention(2, '필수 값이 없다', { field: 'lot_size' }); } },
];
`);
  const r = runner(dir, input);
  assert.equal(r.code, 1);
  const s = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
  assert.equal(s.status, 'needs_attention');
  assert.ok(s.attention.includes('필수 값이 없다'));
  assert.deepEqual(s.payload, { field: 'lot_size' });
  assert.ok(existsSync(join(out, '01-a.json')));
  assert.ok(!existsSync(join(out, '02-b.json')));
});

test('run.ts: 되돌아가기가 한도를 넘으면 needs_attention', () => {
  const { dir, input, out } = stage(`import { Goto } from '../lib/step.ts';
import type { Step } from '../lib/step.ts';
export const steps: Step[] = [
  { n: 1, name: 'a', actor: 'code', run: () => ({}) },
  { n: 2, name: 'b', actor: 'code', run: () => new Goto(1, '계속 틀림') },
];
`);
  assert.equal(runner(dir, input).code, 1);
  const s = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
  assert.ok(s.attention.includes('계속 틀림'));
  assert.ok(s.attention.includes('3'));
});

test('run.ts: 인자가 없거나 입력 폴더가 없으면 2', () => {
  const { dir } = stage();
  assert.equal(runner(dir).code, 2);
  assert.equal(runner(dir, 'nope-dir').code, 2);
});

test('lib/llm.ts: SDK 없이 불러지고 unwrapStringified·fileBlocks 가 순수 함수다', async () => {
  const { unwrapStringified, fileBlocks } = await import(pathToFileURL(join(TEMPLATE, 'lib', 'llm.ts')).href);
  assert.deepEqual(unwrapStringified({ a: 1 }, ['a']), { value: { a: 1 }, unwrapped: false });
  assert.deepEqual(unwrapStringified({ x: '{"a":1,"b":2}' }, ['a', 'b']), { value: { a: 1, b: 2 }, unwrapped: true });
  assert.deepEqual(unwrapStringified({ x: 'not json' }, ['a']), { value: { x: 'not json' }, unwrapped: false });
  const b64 = (s) => Buffer.from(s).toString('base64');
  const blocks = fileBlocks([
    { name: 'a.pdf', media_type: 'application/pdf', data_base64: b64('%PDF') },
    { name: 'b.md', media_type: 'text/markdown', data_base64: b64('# t') },
    { name: 'c.png', media_type: 'image/png', data_base64: b64('png') },
  ]);
  assert.equal(blocks.filter(b => b.type === 'document').length, 1);
  assert.equal(blocks.filter(b => b.type === 'image').length, 1);
  assert.ok(blocks.some(b => b.type === 'text' && b.text.includes('b.md') && b.text.includes('# t')));
});

test('lib/llm.ts: 요청은 도구 호출을 강제하지 않는다(Opus 5.5·Fable 5.1 은 tool_choice tool·any 에 400)', async () => {
  const { buildRequest } = await import(pathToFileURL(join(TEMPLATE, 'lib', 'llm.ts')).href);
  const tool = { name: 'emit', description: 'd', input_schema: { type: 'object', properties: {}, required: [] } };
  const req = buildRequest({ step: '1', system: 'S', content: 'x', tool }, [{ type: 'text', text: 'x' }], 'claude-opus-5-5', 16000);
  assert.deepEqual(req.tool_choice, { type: 'auto', disable_parallel_tool_use: true });
  assert.ok(req.system.startsWith('S') && req.system.includes('emit'), '시스템 프롬프트가 도구 이름을 짚어 호출을 지시한다');
  assert.deepEqual(req.tools, [tool]);
  assert.equal(req.model, 'claude-opus-5-5');
  assert.ok(!('thinking' in req) && !('temperature' in req), '최신 모델이 400 을 내는 thinking·temperature 는 보내지 않는다');
});
