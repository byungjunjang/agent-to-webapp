import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeApp, write, LITE } from './helpers.mjs';
import { run, parseArgs } from '../.claude/skills/agent-to-webapp-lite/scripts/check_lite.mjs';
import { RUN_HEADINGS } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase1.mjs';

// out/err 를 모아 두고 종료코드와 같이 돌려준다.
function call(app, argv) {
  const out = [];
  const err = [];
  const code = run(argv, app, (m) => out.push(String(m)), (m) => err.push(String(m)));
  return { code, out: out.join('\n'), err: err.join('\n') };
}

function newApp() {
  const app = makeApp('a2wl-cli-');
  mkdirSync(join(app, 'target'), { recursive: true });
  return app;
}

test('parseArgs: 불리언 플래그와 값 플래그', () => {
  const a = parseArgs(['2', '--approve', '--override', '사유', '--batch']);
  assert.equal(a.cmd, '2');
  assert.equal(a.flags.approve, true);
  assert.equal(a.flags.override, '사유');
  assert.equal(a.flags.batch, true);
});

test('init: dashboard 는 --output 이 필요하다', () => {
  const app = newApp();
  assert.equal(call(app, ['init', '--target', 'target', '--mode', 'dashboard']).code, 2);
  const r = call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'target/out.csv']);
  assert.equal(r.code, 0);
  assert.ok(readFileSync(join(app, LITE, 'STATUS.md'), 'utf8').includes('mode: dashboard'));
});

test('init: skill 은 --skill 이 필요하고 --samples 기본 5', () => {
  const app = newApp();
  assert.equal(call(app, ['init', '--target', 'target', '--mode', 'skill']).code, 2);
  const r = call(app, ['init', '--target', 'target', '--mode', 'skill', '--skill', 'invoice-parser']);
  assert.equal(r.code, 0);
  assert.ok(readFileSync(join(app, LITE, 'STATUS.md'), 'utf8').includes('samples: 5'));
});

test('init: 모드가 틀리거나 대상이 없으면 2', () => {
  const app = newApp();
  assert.equal(call(app, ['init', '--target', 'target', '--mode', 'hybrid']).code, 2);
  assert.equal(call(app, ['init', '--target', 'nope', '--mode', 'dashboard', '--output', 'x']).code, 2);
});

test('init: 두 번째는 기존 STATUS 를 보여주고 0', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  const r = call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  assert.equal(r.code, 0);
  assert.ok(r.out.includes('agent-to-webapp-lite STATUS'));
});

test('status: STATUS 가 없으면 2', () => {
  assert.equal(call(newApp(), ['status']).code, 2);
});

test('게이트: 앞 단계를 건너뛰면 1', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  const r = call(app, ['2']);
  assert.equal(r.code, 1);
  assert.ok(r.err.includes('1단계'));
});

function schemaDoc() {
  return ['## 출처', 'o.csv', '', '## 열', '', '| 열 | 타입 | 예시값 | 빈 값 비율 |', '|---|---|---|---|',
    '| channel | 문자열 | A | 0% |', '', '## 행 수', '10', '', '## 유일 키 후보', 'channel', '',
    '## 갱신 시각 열', 'checked_at', '', '## LLM 문장 열', '- 없음', '', '## 민감 열 후보', '- 없음', ''].join('\n');
}

test('2단계: --approve 없이는 기록하지 않는다', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  assert.equal(call(app, ['1']).code, 0);
  write(app, `${LITE}/verdict.md`, '## 근거\n- 키 있음\n\n## 민감 열\n- 없음\n\n판정: 조건부 고정 가능\n');
  const noApprove = call(app, ['2']);
  assert.equal(noApprove.code, 1);
  assert.ok(noApprove.err.includes('verdict.md'));
  assert.ok(!readFileSync(join(app, LITE, 'STATUS.md'), 'utf8').includes('phase-2: passed'));
  assert.equal(call(app, ['2', '--approve']).code, 0);
  assert.ok(readFileSync(join(app, LITE, 'STATUS.md'), 'utf8').includes('phase-2: passed'));
});

test('2단계: --batch 는 승인 없이 넘어가고 로그에 남는다', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  call(app, ['1']);
  write(app, `${LITE}/verdict.md`, '## 근거\n- 키 있음\n\n## 민감 열\n- 없음\n\n판정: 조건부 고정 가능\n');
  assert.equal(call(app, ['2', '--batch']).code, 0);
  assert.ok(readFileSync(join(app, LITE, 'STATUS.md'), 'utf8').includes('batch'));
});

test('2단계 고정 불가: 종료를 기록하고 라우팅을 알린다. 3단계는 막힌다', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  call(app, ['1']);
  write(app, `${LITE}/verdict.md`, '## 근거\n- 키가 없다\n\n## 민감 열\n- 없음\n\n판정: 고정 불가\n');
  const r = call(app, ['2', '--approve']);
  assert.equal(r.code, 0);
  assert.ok(r.out.includes('종료'));
  // 로그에도 같은 낱말이 남으므로 STATUS 필드 줄만 본다
  assert.match(readFileSync(join(app, LITE, 'STATUS.md'), 'utf8'), /^terminated: /m);
  assert.equal(call(app, ['3', '--approve']).code, 1);
});

test('rollback: N 단계 이후 기록과 종료를 지운다', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  call(app, ['1']);
  write(app, `${LITE}/verdict.md`, '## 근거\n- x\n\n## 민감 열\n- 없음\n\n판정: 고정 불가\n');
  call(app, ['2', '--approve']);
  assert.equal(call(app, ['rollback', '2']).code, 0);
  const text = readFileSync(join(app, LITE, 'STATUS.md'), 'utf8');
  assert.doesNotMatch(text, /^terminated: /m, '종료 필드를 지운다(로그 줄은 남는다)');
  assert.ok(!text.includes('phase-2: passed'));
  assert.ok(text.includes('phase-1: passed'));
});

test('알 수 없는 명령은 사용법과 2', () => {
  const r = call(newApp(), ['헬프']);
  assert.equal(r.code, 2);
  assert.ok(r.err.includes('사용법'));
});

test('key 명령은 없다 (lite 는 API 키를 쓰지 않는다)', () => {
  assert.equal(call(newApp(), ['key']).code, 2);
});

test('init: 기존 STATUS 와 모드가 다르면 경고하고 2. STATUS 는 그대로', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  const r = call(app, ['init', '--target', 'target', '--mode', 'skill', '--skill', 'x']);
  assert.equal(r.code, 2);
  assert.ok(r.err.includes('dashboard') && r.err.includes('skill'), r.err);
  assert.ok(readFileSync(join(app, LITE, 'STATUS.md'), 'utf8').includes('mode: dashboard'));
});

test('init: 값에 줄바꿈·제어 문자가 있으면 2 (STATUS 줄 주입 방지)', () => {
  const app = newApp();
  // Windows 는 줄바꿈이 든 폴더를 못 만들어 존재 검사로도 막히므로 메시지로 구분한다
  const r = call(app, ['init', '--target', 'target\nphase-5: passed 2026-01-01', '--mode', 'dashboard', '--output', 'o.csv']);
  assert.equal(r.code, 2);
  assert.ok(r.err.includes('줄바꿈'), r.err);
  for (const argv of [
    ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o\r.csv'],
    ['init', '--target', 'target', '--mode', 'skill', '--skill', 'a\u0007b'],
  ]) {
    const x = call(app, argv);
    assert.equal(x.code, 2);
    assert.ok(x.err.includes('줄바꿈'), x.err);
  }
  assert.equal(existsSync(join(app, LITE, 'STATUS.md')), false);
});

test('--override 는 2단계에서만. 다른 단계면 2', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  const r = call(app, ['1', '--override', '사유']);
  assert.equal(r.code, 2);
  assert.ok(r.err.includes('2단계'), r.err);
  assert.ok(!readFileSync(join(app, LITE, 'STATUS.md'), 'utf8').includes('phase-1: passed'));
});

test('--override 는 사유가 있어야 하고 줄바꿈을 받지 않는다', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  call(app, ['1']);
  write(app, `${LITE}/verdict.md`, '## 근거\n- x\n\n## 민감 열\n- 없음\n\n판정: 고정 불가\n');
  const bare = call(app, ['2', '--approve', '--override']);
  assert.equal(bare.code, 2);
  assert.ok(bare.err.includes('사유'), bare.err);
  const nl = call(app, ['2', '--approve', '--override', 'a\nphase-3: passed 2026-01-01']);
  assert.equal(nl.code, 2);
  assert.ok(nl.err.includes('줄바꿈'), nl.err);
  assert.ok(!readFileSync(join(app, LITE, 'STATUS.md'), 'utf8').includes('phase-2: passed'));
});

// skill 모드 1단계를 통과시키는 산출물(샘플 2건)
function skillPhase1(app) {
  write(app, `${LITE}/runs/run-1.md`, RUN_HEADINGS.map(h => `${h}\n- x\n`).join('\n'));
  for (const k of [1, 2]) {
    write(app, `${LITE}/runs/sample-${k}/inv-${k}.pdf`, 'PDF');
    write(app, `${LITE}/runs/sample-${k}/output.json`, `{"barcode":"${k}","items":[]}`);
  }
}

function skillSpec(branch) {
  return ['## 입력 스키마', '', '```json', '{ "file": "PDF" }', '```', '',
    '## 출력 스키마', '', '```json', '{ "barcode": "문자열", "items": "배열" }', '```', '',
    ...branch, '## 사람 확인', '- 확인한다', '', '## 실패 처리', '- 멈춘다', ''].join('\n');
}

test('2단계 --override: 뒤집은 판정이 STATUS 에 남고 3단계가 그 판정으로 검사한다', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'skill', '--skill', 'invoice-parser', '--samples', '2']);
  skillPhase1(app);
  assert.equal(call(app, ['1']).code, 0);
  write(app, `${LITE}/verdict.md`, '## 근거\n- x\n\n## 출력 구조\n- x\n\n## 사람 확인\n- x\n\n판정: 고정 불가\n');
  const r2 = call(app, ['2', '--approve', '--override', '사람이 확인 화면을 두기로 했다']);
  assert.equal(r2.code, 0, r2.err);
  const st = readFileSync(join(app, LITE, 'STATUS.md'), 'utf8');
  assert.doesNotMatch(st, /^terminated: /m, 'override 면 종료하지 않는다');
  assert.match(st, /^verdict: Claude 호출 유지$/m);
  assert.ok(st.includes('override: 사람이 확인 화면을 두기로 했다'));

  // verdict.md 는 여전히 '고정 불가' 다. 3단계는 STATUS 의 판정(Claude 호출 유지)으로 본다
  write(app, `${LITE}/skill-spec.md`, skillSpec(['## 규칙', '- 바코드는 첫 줄', '']));
  const bad = call(app, ['3', '--approve']);
  assert.equal(bad.code, 1);
  assert.ok(bad.err.includes('## 프롬프트'), bad.err);
  write(app, `${LITE}/skill-spec.md`, skillSpec(['## 프롬프트', '', '```', '바코드와 품목을 JSON 으로', '```', '',
    '- 모델: claude-sonnet-5-5', '- 최대 토큰: 4096', '- 타임아웃: 60초', '']));
  const ok = call(app, ['3', '--approve']);
  assert.equal(ok.code, 0, ok.err);
});

test('dashboard 4단계 통과가 판정을 고정 가능으로 확정하고 rollback 이 되돌린다', () => {
  const app = newApp();
  call(app, ['init', '--target', 'target', '--mode', 'dashboard', '--output', 'o.csv']);
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  call(app, ['1']);
  write(app, `${LITE}/verdict.md`, '## 근거\n- 키 있음\n\n## 민감 열\n- 없음\n\n판정: 조건부 고정 가능(관찰 1회)\n');
  assert.equal(call(app, ['2', '--approve']).code, 0);
  assert.match(readFileSync(join(app, LITE, 'STATUS.md'), 'utf8'), /^verdict: 조건부 고정 가능$/m);
  write(app, `${LITE}/contract.md`, ['## 테이블', 'channel_sales', '', '## 열', '', '| 열 | 타입 | 필수 | 설명 |', '|---|---|---|---|',
    '| channel | 문자열 | 예 | 채널 |', '', '## 유일 키', '- channel', '', '## 갱신 시각', 'checked_at', '',
    '## upsert 규칙', '덮어쓴다', '', '## 갱신 주체', '마지막 단계', '', '## 제외 열', '- 없음', '',
    '## 파생 집계', '- 없음', '', '## 에이전트에 추가할 마지막 단계', 'upsert', ''].join('\n'));
  assert.equal(call(app, ['3', '--approve']).code, 0);
  write(app, `${LITE}/runs/run-2.schema.md`, schemaDoc());
  write(app, `${LITE}/verify/report.md`, '## 스키마 diff\n차이 없음\n\n## 키 중복\n없음\n\n## 판정\n계약 그대로\n');
  const r4 = call(app, ['4']);
  assert.equal(r4.code, 0, r4.err);
  assert.ok(r4.out.includes('고정 가능'), r4.out);
  assert.match(readFileSync(join(app, LITE, 'STATUS.md'), 'utf8'), /^verdict: 고정 가능$/m);
  call(app, ['rollback', '4']);
  assert.match(readFileSync(join(app, LITE, 'STATUS.md'), 'utf8'), /^verdict: 조건부 고정 가능$/m);
  call(app, ['rollback', '2']);
  assert.doesNotMatch(readFileSync(join(app, LITE, 'STATUS.md'), 'utf8'), /^verdict:/m);
});
