# agent-to-webapp 스킬 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 에이전트(Claude Code·Codex)를 웹 앱으로 옮기기 전에 관찰→판정→고정→재검증→전환 다섯 단계를 게이트로 밟게 하는 Claude Code 스킬 `agent-to-webapp` 을 만들고, 데모 둘로 두 경로(고정 가능·고정 불가)를 끝까지 검증한다.

**Architecture:** 스킬은 `SKILL.md`(절차) + `references/`(단계별 세부·프롬프트 실행판·표) + `scripts/`(Node 게이트와 훅) + `assets/`(훅 등록 예시)로 구성한다. 게이트 스크립트 `check_phase.mjs` 가 작업 폴더 `<이름>-app/docs/agent-to-webapp/` 의 산출물을 검사하고 통과 시 `STATUS.md` 를 직접 쓴다. 모델은 STATUS 를 쓰지 못한다. 단계 검사 로직은 `scripts/lib/phaseN.mjs` 로 나누고 `tests/` 에서 `node --test` 로 검증한다.

**Tech Stack:** Node 24 (ESM `.mjs`, 표준 라이브러리만, `node:test`), Markdown, JSON. 외부 npm 의존 없음.

**Spec:** `docs/superpowers/specs/2026-09-11-agent-to-webapp-design.md` — 결정은 §2, 단계는 §4, 폴더는 §5·§6, 프롬프트는 §7, 검증은 §10.

## Global Constraints

- 런타임은 Node 24 하나. 스크립트는 `.mjs`, 표준 라이브러리만(§2-7, §6). npm 의존 금지
- 파일 쓰기는 LF·UTF-8. `.gitattributes` 가 `* -text` 라 자동 변환이 없다. `writeFileSync(p, text, 'utf8')` 에 LF 문자열을 넘긴다(§6)
- `SKILL.md` 는 150줄 안쪽(§6). 단계 세부는 `references/phase-N.md`
- 산출물 폴더 상수: `docs/agent-to-webapp/` (작업 폴더 기준). 산출물 이름은 §5 그대로: `STATUS.md`, `runs/inputs/README.md`, `runs/run-N.md`, `runs/run-N.tools.jsonl`, `verdict.md`, `workflow.md`, `verify/{package.json,.gitignore,run.ts,steps/,report.md}`, `port-brief.md`
- STATUS 는 게이트 스크립트만 쓴다(§2-7). 2·3단계는 `--approve`(또는 `--batch`) 없이는 통과 기록을 남기지 않는다
- 2단계 규칙: 배정표에 `워크플로우 × 확률론` 항목이 있으면 `고정 가능` 거부(§2-7)
- 4단계 기본 모델 `claude-sonnet-5`, 환경변수 `A2W_MODEL`(§2-10)
- 대상 런타임 표식: `CLAUDE.md`·`.claude/skills/` → `claude-code`, `AGENTS.md`·`.agents/skills/` → `codex`(§2-15)
- 대상 프로젝트의 git 추적 파일은 건드리지 않는다. 로컬 전용 파일만: `CLAUDE.local.md`/`AGENTS.override.md`, `.claude/settings.local.json`/`.codex/hooks.json`(§2-6, §4-1)
- 예제(`examples/`)는 `.demo-projects` 의 사본, `.git` 없음. `examples/<이름>-app/` 은 `docs/` 만 두고 `.git` 없음(§10)
- 커밋 메시지는 한국어 `type: 요약` 형식(기존 이력 `docs: …`, `chore: …` 와 같게). 끝에 세션 attribution 두 줄을 붙인다
- 테스트 실행은 항상 repo 루트에서 `node --test "tests/*.test.mjs"`

## File Structure

```
agent-to-webapp/
  .gitignore                                   node_modules, examples 산출물의 무거운 것
  tests/
    helpers.mjs                                임시 작업 폴더 생성, 파일 쓰기 헬퍼
    status.test.mjs
    phase1.test.mjs  phase2.test.mjs  phase3.test.mjs  phase4.test.mjs  phase5.test.mjs
    cli.test.mjs                               check_phase.mjs 를 자식 프로세스로 실행
    log_tool_use.test.mjs
    skill_md.test.mjs                          SKILL.md 150줄·frontmatter 검사
  .claude/skills/agent-to-webapp/
    SKILL.md
    references/
      prompts.md  decision-axes.md  phase-1.md … phase-5.md  port-brief-template.md  deploy-checklist.md
    scripts/
      check_phase.mjs                          CLI: init / status / 1~5 / rollback
      log_tool_use.mjs                         PostToolUse 훅
      lib/
        status.mjs                             STATUS.md 파싱·직렬화·읽기·쓰기
        md.mjs                                 마크다운 헬퍼: 줄바꿈 정규화, 절 본문, 헤딩 존재
        phase1.mjs … phase5.mjs                단계별 검사. 각각 checkPhaseN(a2wDir, opts) → {ok, errors, warnings, ...}
    assets/
      hooks.claude.example.json  hooks.codex.example.json
  examples/
    rfq-quote-generator/                       .demo-projects 사본 (고정 가능 경로)
    rfq-quote-generator-app/docs/agent-to-webapp/
    competitor-review-crawler/                 .demo-projects 사본 (고정 불가 경로)
    competitor-review-crawler-app/docs/agent-to-webapp/
```

책임 경계: `status.mjs` 는 STATUS 형식만 안다. `phaseN.mjs` 는 자기 단계의 산출물 형식만 알고 STATUS 를 모른다. `check_phase.mjs` 만 둘을 잇고 순서·승인·종료를 판단한다. 참조 문서는 형식을 사람과 모델에게 설명하고, 스크립트는 같은 형식을 기계로 검사한다. 형식 문자열(헤딩 이름)은 `phaseN.mjs` 의 export 상수가 정본이고 문서가 그것을 옮겨 적는다.

---

### Task 1: STATUS.md 읽기·쓰기 (`status.mjs`)

**Files:**
- Create: `.claude/skills/agent-to-webapp/scripts/lib/status.mjs`
- Create: `tests/helpers.mjs`
- Test: `tests/status.test.mjs`

**Interfaces:**
- Produces:
  - `A2W_DIR = 'docs/agent-to-webapp'` (string, 작업 폴더 기준 상대 경로)
  - `RUNTIMES = ['claude-code', 'codex']`
  - `today(): string` — `YYYY-MM-DD`
  - `emptyStatus(target: string, runtime: 'claude-code'|'codex'): Status`
  - `parseStatus(text: string): Status`
  - `formatStatus(st: Status): string`
  - `readStatus(appDir: string): Status | null`
  - `writeStatus(appDir: string, st: Status): void`
  - `Status = { target, runtime, created, phases: {[n:number]: {passed: string, approved: boolean}}, terminated: string|null, log: string[] }`
- STATUS.md 형식(정본):

```
# agent-to-webapp STATUS

target: ../rfq-quote-generator
runtime: claude-code
created: 2026-09-12
phase-1: passed 2026-09-12
phase-2: passed 2026-09-13 approved
phase-3:
phase-4:
phase-5:
terminated: 고정 불가 2026-09-13        (종료 때만 있는 줄)

## log
- 2026-09-13 phase-2 override: 사유
```

- [x] **Step 1: 테스트 헬퍼 작성**

`tests/helpers.mjs`:

```js
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

// 임시 작업 폴더(<이름>-app 역할)를 만들고 경로를 돌려준다.
export function makeApp(prefix = 'a2w-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

// appDir 기준 상대 경로에 파일을 쓴다. 중간 폴더는 만든다. LF·UTF-8.
export function write(appDir, rel, text) {
  const p = join(appDir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text, 'utf8');
  return p;
}

export const A2W = 'docs/agent-to-webapp';
```

- [x] **Step 2: 실패하는 테스트 작성**

`tests/status.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeApp } from './helpers.mjs';
import {
  A2W_DIR, emptyStatus, parseStatus, formatStatus, readStatus, writeStatus,
} from '../.claude/skills/agent-to-webapp/scripts/lib/status.mjs';

test('emptyStatus: 기본 필드', () => {
  const st = emptyStatus('../x', 'claude-code');
  assert.equal(st.target, '../x');
  assert.equal(st.runtime, 'claude-code');
  assert.match(st.created, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(st.phases, {});
  assert.equal(st.terminated, null);
  assert.deepEqual(st.log, []);
});

test('formatStatus → parseStatus 왕복', () => {
  const st = emptyStatus('../x', 'codex');
  st.phases[1] = { passed: '2026-09-12', approved: false };
  st.phases[2] = { passed: '2026-09-13', approved: true };
  st.terminated = '고정 불가 2026-09-13';
  st.log.push('2026-09-13 phase-2 override: 사유');
  const text = formatStatus(st);
  assert.ok(text.startsWith('# agent-to-webapp STATUS\n'));
  assert.ok(text.includes('phase-2: passed 2026-09-13 approved\n'));
  assert.ok(text.includes('phase-3:\n'));
  assert.ok(!text.includes('\r'));
  assert.deepEqual(parseStatus(text), st);
});

test('parseStatus: CRLF 와 빈 phase 줄을 견딘다', () => {
  const st = parseStatus('target: ../a\r\nruntime: claude-code\r\ncreated: 2026-01-01\r\nphase-1:\r\nphase-2: passed 2026-01-02\r\n');
  assert.equal(st.target, '../a');
  assert.deepEqual(st.phases, { 2: { passed: '2026-01-02', approved: false } });
});

test('readStatus/writeStatus: 파일 위치와 없을 때 null', () => {
  const app = makeApp();
  assert.equal(readStatus(app), null);
  writeStatus(app, emptyStatus('../t', 'claude-code'));
  const p = join(app, A2W_DIR, 'STATUS.md');
  assert.ok(existsSync(p));
  assert.ok(readFileSync(p, 'utf8').includes('target: ../t'));
  assert.equal(readStatus(app).runtime, 'claude-code');
});
```

- [x] **Step 3: 실패 확인**

Run: `node --test "tests/*.test.mjs"status.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/lib/status.mjs'`

- [x] **Step 4: 구현**

`.claude/skills/agent-to-webapp/scripts/lib/status.mjs`:

```js
// STATUS.md 읽기·쓰기. 이 파일을 쓰는 것은 check_phase.mjs 뿐이다. 모델은 쓰지 않는다.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const A2W_DIR = join('docs', 'agent-to-webapp');
export const STATUS_FILE = 'STATUS.md';
export const RUNTIMES = ['claude-code', 'codex'];

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function statusPath(appDir) {
  return join(appDir, A2W_DIR, STATUS_FILE);
}

export function emptyStatus(target, runtime) {
  return { target, runtime, created: today(), phases: {}, terminated: null, log: [] };
}

export function parseStatus(text) {
  const st = { target: null, runtime: null, created: null, phases: {}, terminated: null, log: [] };
  let inLog = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '## log') { inLog = true; continue; }
    if (inLog) { if (line.startsWith('- ')) st.log.push(line.slice(2)); continue; }
    const m = line.match(/^([a-z][a-z0-9-]*):\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key.startsWith('phase-')) {
      const pm = value.match(/^passed (\d{4}-\d{2}-\d{2})( approved)?$/);
      if (pm) st.phases[Number(key.slice(6))] = { passed: pm[1], approved: Boolean(pm[2]) };
    } else if (key === 'terminated') {
      st.terminated = value || null;
    } else if (key === 'target' || key === 'runtime' || key === 'created') {
      st[key] = value;
    }
  }
  return st;
}

export function formatStatus(st) {
  const lines = [
    '# agent-to-webapp STATUS', '',
    `target: ${st.target}`, `runtime: ${st.runtime}`, `created: ${st.created}`,
  ];
  for (const n of [1, 2, 3, 4, 5]) {
    const p = st.phases[n];
    lines.push(p ? `phase-${n}: passed ${p.passed}${p.approved ? ' approved' : ''}` : `phase-${n}:`);
  }
  if (st.terminated) lines.push(`terminated: ${st.terminated}`);
  lines.push('', '## log');
  for (const l of st.log) lines.push(`- ${l}`);
  return lines.join('\n') + '\n';
}

export function readStatus(appDir) {
  const p = statusPath(appDir);
  return existsSync(p) ? parseStatus(readFileSync(p, 'utf8')) : null;
}

export function writeStatus(appDir, st) {
  const p = statusPath(appDir);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, formatStatus(st), 'utf8');
}
```

- [x] **Step 5: 통과 확인**

Run: `node --test "tests/*.test.mjs"status.test.mjs`
Expected: PASS 4 tests

- [x] **Step 6: 커밋**

```bash
git add tests/helpers.mjs tests/status.test.mjs .claude/skills/agent-to-webapp/scripts/lib/status.mjs
git commit -m "feat: STATUS.md 읽기·쓰기 모듈 — 게이트 스크립트만 쓰는 상태 파일"
```

---

### Task 2: 마크다운 헬퍼와 1단계 검사 (`md.mjs`, `phase1.mjs`)

**Files:**
- Create: `.claude/skills/agent-to-webapp/scripts/lib/md.mjs`
- Create: `.claude/skills/agent-to-webapp/scripts/lib/phase1.mjs`
- Test: `tests/phase1.test.mjs`

**Interfaces:**
- Produces (`md.mjs`):
  - `normalize(text: string): string` — CRLF→LF
  - `isBlank(s: string): boolean`
  - `hasHeading(text, heading: string): boolean` — 줄 전체가 `heading` 으로 시작하는 줄이 있는가
  - `sectionBody(text, heading: string): string | null` — 그 헤딩 줄 다음부터 다음 `## ` 줄 전까지. 헤딩 없으면 null
- Produces (`phase1.mjs`):
  - `RUN_HEADINGS = ['## 수행한 단계', '## 판단이 필요했던 지점', '## 예상과 달라서 방식을 바꾼 지점']`
  - `MIN_RUNS = 3`
  - `checkPhase1(a2wDir: string): { ok, errors: string[], warnings: string[] }`
  - `pairToolLogs(runsDir: string, runFiles: string[]): string[]` — `runs/tools/<session>.jsonl` 을 첫 줄 `ts` 순서로 `runs/run-N.tools.jsonl` 로 옮긴다. 경고 배열 반환
- 1단계 게이트 규칙(§4-1): `runs/run-N.md` 3개 이상, 각 파일에 `RUN_HEADINGS` 셋 다 존재, `runs/inputs/` 에 README.md 와 그 외 항목 3개 이상

- [x] **Step 1: 실패하는 테스트 작성**

`tests/phase1.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeApp, write, A2W } from './helpers.mjs';
import { normalize, hasHeading, sectionBody } from '../.claude/skills/agent-to-webapp/scripts/lib/md.mjs';
import { checkPhase1, RUN_HEADINGS } from '../.claude/skills/agent-to-webapp/scripts/lib/phase1.mjs';

const RUN = `# run\n${RUN_HEADINGS[0]}\n1. 읽기\n${RUN_HEADINGS[1]}\n- 도면이 흐려서 재독취\n${RUN_HEADINGS[2]}\n- 없음\n`;

function goodApp() {
  const app = makeApp();
  for (const n of [1, 2, 3]) write(app, `${A2W}/runs/run-${n}.md`, RUN);
  write(app, `${A2W}/runs/inputs/README.md`, '# 왜 이 셋인가\n');
  for (const f of ['easy.md', 'normal.md', 'edge.md']) write(app, `${A2W}/runs/inputs/${f}`, 'x');
  return app;
}

test('md: normalize/hasHeading/sectionBody', () => {
  const t = normalize('# T\r\n## A\r\nbody a\r\n## B\r\n\r\n## C\r\n');
  assert.ok(!t.includes('\r'));
  assert.ok(hasHeading(t, '## A'));
  assert.ok(!hasHeading(t, '## Z'));
  assert.equal(sectionBody(t, '## A'), 'body a');
  assert.equal(sectionBody(t, '## B').trim(), '');
  assert.equal(sectionBody(t, '## Z'), null);
});

test('phase1: 정상 통과', () => {
  const r = checkPhase1(join(goodApp(), A2W));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('phase1: run 2개면 실패, 헤딩 빠지면 실패', () => {
  const app = makeApp();
  write(app, `${A2W}/runs/run-1.md`, RUN);
  write(app, `${A2W}/runs/run-2.md`, '# run\n## 수행한 단계\n');
  write(app, `${A2W}/runs/inputs/README.md`, 'r');
  for (const f of ['a', 'b', 'c']) write(app, `${A2W}/runs/inputs/${f}`, 'x');
  const r = checkPhase1(join(app, A2W));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('3개 이상')));
  assert.ok(r.errors.some(e => e.includes('run-2.md') && e.includes(RUN_HEADINGS[1])));
});

test('phase1: inputs README 없거나 입력 2개면 실패', () => {
  const app = makeApp();
  for (const n of [1, 2, 3]) write(app, `${A2W}/runs/run-${n}.md`, RUN);
  write(app, `${A2W}/runs/inputs/a`, 'x');
  write(app, `${A2W}/runs/inputs/b`, 'x');
  const r = checkPhase1(join(app, A2W));
  assert.ok(r.errors.some(e => e.includes('README.md')));
  assert.ok(r.errors.some(e => e.includes('입력이 2개')));
});

test('phase1: runs/tools/*.jsonl 을 ts 순서로 run-N.tools.jsonl 에 짝짓는다', () => {
  const app = goodApp();
  write(app, `${A2W}/runs/tools/s-b.jsonl`, '{"ts":"2026-09-12T02:00:00Z","tool":"Read"}\n');
  write(app, `${A2W}/runs/tools/s-a.jsonl`, '{"ts":"2026-09-12T01:00:00Z","tool":"Bash"}\n');
  const r = checkPhase1(join(app, A2W));
  assert.equal(r.ok, true);
  const run1 = readFileSync(join(app, A2W, 'runs/run-1.tools.jsonl'), 'utf8');
  assert.ok(run1.includes('"Bash"'));
  assert.ok(existsSync(join(app, A2W, 'runs/run-2.tools.jsonl')));
  assert.ok(!existsSync(join(app, A2W, 'runs/run-3.tools.jsonl')));
  assert.ok(r.warnings.some(w => w.includes('훅 기록 2개') && w.includes('run 파일 3개')));
});
```

- [x] **Step 2: 실패 확인**

Run: `node --test "tests/*.test.mjs"phase1.test.mjs`
Expected: FAIL — `Cannot find module '.../lib/md.mjs'`

- [x] **Step 3: `md.mjs` 구현**

```js
// 마크다운 산출물을 검사할 때 공통으로 쓰는 헬퍼. 파서가 아니라 줄 단위 검사다.
export function normalize(text) {
  return text.replace(/\r\n/g, '\n');
}

export function isBlank(s) {
  return !s || s.trim() === '';
}

export function hasHeading(text, heading) {
  return normalize(text).split('\n').some(l => l.trim().startsWith(heading));
}

// heading 줄 다음부터 다음 '## ' 줄 전까지. 헤딩이 없으면 null. 끝의 빈 줄은 뗀다.
export function sectionBody(text, heading) {
  const lines = normalize(text).split('\n');
  const start = lines.findIndex(l => l.trim().startsWith(heading));
  if (start === -1) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) break;
    out.push(lines[i]);
  }
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out.join('\n');
}
```

- [x] **Step 4: `phase1.mjs` 구현**

```js
// 1단계 관찰 게이트: run 3개 + 헤딩, 입력 3개 + README, 훅 기록 짝짓기.
import { readdirSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { hasHeading } from './md.mjs';

export const RUN_HEADINGS = ['## 수행한 단계', '## 판단이 필요했던 지점', '## 예상과 달라서 방식을 바꾼 지점'];
export const MIN_RUNS = 3;

function runNumber(f) { return Number(f.match(/\d+/)[0]); }

export function checkPhase1(a2wDir) {
  const errors = [];
  const warnings = [];
  const runsDir = join(a2wDir, 'runs');
  if (!existsSync(runsDir)) return { ok: false, errors: ['runs/ 폴더가 없다'], warnings };

  const runFiles = readdirSync(runsDir)
    .filter(f => /^run-\d+\.md$/.test(f))
    .sort((a, b) => runNumber(a) - runNumber(b));
  if (runFiles.length < MIN_RUNS) errors.push(`run 파일이 ${runFiles.length}개. ${MIN_RUNS}개 이상 필요`);
  for (const f of runFiles) {
    const text = readFileSync(join(runsDir, f), 'utf8');
    for (const h of RUN_HEADINGS) {
      if (!hasHeading(text, h)) errors.push(`${f}: '${h}' 헤딩 없음`);
    }
  }

  const inputsDir = join(runsDir, 'inputs');
  if (!existsSync(inputsDir)) {
    errors.push('runs/inputs/ 폴더가 없다');
  } else {
    const entries = readdirSync(inputsDir);
    if (!entries.includes('README.md')) errors.push('runs/inputs/README.md 없음 (왜 이 셋인지)');
    const inputs = entries.filter(e => e !== 'README.md');
    if (inputs.length < MIN_RUNS) errors.push(`입력이 ${inputs.length}개. ${MIN_RUNS}개 이상 필요`);
  }

  warnings.push(...pairToolLogs(runsDir, runFiles));
  return { ok: errors.length === 0, errors, warnings };
}

function firstTs(p) {
  const first = readFileSync(p, 'utf8').split('\n').find(l => l.trim());
  try { return String(JSON.parse(first).ts ?? ''); } catch { return ''; }
}

// runs/tools/<session>.jsonl 을 첫 줄 ts 순서로 run-N.tools.jsonl 에 옮긴다. 이미 있으면 건너뛴다.
export function pairToolLogs(runsDir, runFiles) {
  const warnings = [];
  const toolsDir = join(runsDir, 'tools');
  if (!existsSync(toolsDir)) return warnings;
  const logs = readdirSync(toolsDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ f, ts: firstTs(join(toolsDir, f)) }))
    .sort((a, b) => a.ts.localeCompare(b.ts));
  if (logs.length === 0) return warnings;
  if (logs.length !== runFiles.length) {
    warnings.push(`훅 기록 ${logs.length}개, run 파일 ${runFiles.length}개. 순서로 짝지었으니 판정 때 대조를 확인하라`);
  }
  logs.forEach((log, i) => {
    const run = runFiles[i];
    if (!run) return;
    const dest = join(runsDir, run.replace(/\.md$/, '.tools.jsonl'));
    if (!existsSync(dest)) renameSync(join(toolsDir, log.f), dest);
  });
  return warnings;
}
```

- [x] **Step 5: 통과 확인**

Run: `node --test "tests/*.test.mjs"phase1.test.mjs`
Expected: PASS 5 tests

- [x] **Step 6: 커밋**

```bash
git add tests/phase1.test.mjs .claude/skills/agent-to-webapp/scripts/lib/md.mjs .claude/skills/agent-to-webapp/scripts/lib/phase1.mjs
git commit -m "feat: 1단계 관찰 게이트 — run 3개·헤딩·입력 3개·훅 기록 짝짓기"
```

---
### Task 3: 2단계 판정 검사 (`phase2.mjs`)

**Files:**
- Create: `.claude/skills/agent-to-webapp/scripts/lib/phase2.mjs`
- Test: `tests/phase2.test.mjs`

**Interfaces:**
- Consumes: `normalize` from `md.mjs`
- Produces:
  - `VERDICTS = ['고정 가능', '조건부 고정 가능', '고정 불가']`, `VERDICT_PREFIX = '판정:'`
  - `QUADRANTS = ['단위 작업 × 결정론', '단위 작업 × 확률론', '워크플로우 × 결정론', '워크플로우 × 확률론']`, `AGENT_QUADRANT = QUADRANTS[3]`
  - `parseVerdict(text): '고정 가능'|'조건부 고정 가능'|'고정 불가'|null` — 마지막 `판정:` 줄
  - `agentQuadrantRows(text): string[]` — `| 단계 | 칸 | 근거 |` 표에서 둘째 열이 4번째 칸인 행의 첫째 열
  - `checkPhase2(a2wDir, { override?: string }): { ok, errors, warnings, verdict, agentRows }`
- verdict.md 형식(정본, 프롬프트 7-2 가 지시): 배정표는 `| 단계 | 칸 | 근거 |` 세 열, 칸은 `QUADRANTS` 문자열 그대로. 마지막에 `판정: 고정 가능` / `판정: 조건부 고정 가능(조건 …)` / `판정: 고정 불가` 한 줄
- 규칙(§2-7): 4번째 칸 행이 있으면 `고정 가능` 거부. `override` 가 주어지면 파일 내용과 무관하게 `조건부 고정 가능` 으로 통과시키고 경고에 사유를 남긴다

- [x] **Step 1: 실패하는 테스트 작성**

`tests/phase2.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, A2W } from './helpers.mjs';
import {
  checkPhase2, parseVerdict, agentQuadrantRows, AGENT_QUADRANT,
} from '../.claude/skills/agent-to-webapp/scripts/lib/phase2.mjs';

const TABLE_OK = `| 단계 | 칸 | 근거 |\n|---|---|---|\n| 1 스펙 추출 | 단위 작업 × 확률론 | 매번 PDF 해석 |\n| 2 루트 판정 | 단위 작업 × 결정론 | 스크립트 |\n`;
const TABLE_AGENT = TABLE_OK + `| 3 재수집 | ${AGENT_QUADRANT} | 실패 시 순서를 다시 짬 |\n`;

function app(verdictText) {
  const a = makeApp();
  write(a, `${A2W}/verdict.md`, verdictText);
  return join(a, A2W);
}

test('parseVerdict: 마지막 판정 줄, 조건부 우선', () => {
  assert.equal(parseVerdict('판정: 고정 가능\n'), '고정 가능');
  assert.equal(parseVerdict('판정: 조건부 고정 가능(조건: 도면은 PDF 만)\n'), '조건부 고정 가능');
  assert.equal(parseVerdict('본문\n판정: 고정 불가\n\n'), '고정 불가');
  assert.equal(parseVerdict('판정: 아마도\n'), null);
  assert.equal(parseVerdict('판정 없음\n'), null);
});

test('agentQuadrantRows: ×, x, X 를 같은 기호로 본다', () => {
  assert.deepEqual(agentQuadrantRows(TABLE_OK), []);
  assert.deepEqual(agentQuadrantRows(TABLE_AGENT), ['3 재수집']);
  assert.deepEqual(agentQuadrantRows('| a | 워크플로우 x 확률론 | b |\n'), ['a']);
  assert.deepEqual(agentQuadrantRows('| a | **워크플로우 X 확률론** | b |\n'), ['a']);
});

test('phase2: 고정 가능 + 4번째 칸 없음 → 통과', () => {
  const r = checkPhase2(app(`# 판정\n${TABLE_OK}\n판정: 고정 가능\n`));
  assert.equal(r.ok, true);
  assert.equal(r.verdict, '고정 가능');
});

test('phase2: 고정 가능 + 4번째 칸 있음 → 거부', () => {
  const r = checkPhase2(app(`${TABLE_AGENT}\n판정: 고정 가능\n`));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('4번째 칸') && e.includes('3 재수집')));
});

test('phase2: 조건부 + 4번째 칸 있음 → 통과, 경고', () => {
  const r = checkPhase2(app(`${TABLE_AGENT}\n판정: 조건부 고정 가능(조건: 재수집은 사람 확인)\n`));
  assert.equal(r.ok, true);
  assert.equal(r.verdict, '조건부 고정 가능');
  assert.ok(r.warnings.some(w => w.includes('3 재수집')));
});

test('phase2: 고정 불가 → 통과하되 verdict 가 불가', () => {
  const r = checkPhase2(app(`${TABLE_AGENT}\n판정: 고정 불가\n`));
  assert.equal(r.ok, true);
  assert.equal(r.verdict, '고정 불가');
});

test('phase2: 판정 줄 없음 → 실패, 파일 없음 → 실패', () => {
  assert.equal(checkPhase2(app(TABLE_OK)).ok, false);
  assert.equal(checkPhase2(join(makeApp(), A2W)).ok, false);
});

test('phase2: override 는 조건부로 통과시키고 사유를 경고에 남긴다', () => {
  const r = checkPhase2(app(`${TABLE_AGENT}\n판정: 고정 불가\n`), { override: '재수집은 우리 사이트 3개뿐' });
  assert.equal(r.ok, true);
  assert.equal(r.verdict, '조건부 고정 가능');
  assert.ok(r.warnings.some(w => w.includes('override') && w.includes('사이트 3개')));
});
```

- [x] **Step 2: 실패 확인**

Run: `node --test "tests/*.test.mjs"phase2.test.mjs`
Expected: FAIL — `Cannot find module '.../lib/phase2.mjs'`

- [x] **Step 3: 구현**

`.claude/skills/agent-to-webapp/scripts/lib/phase2.mjs`:

```js
// 2단계 판정 게이트: 마지막 '판정:' 줄, 4번째 칸 규칙, override.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalize } from './md.mjs';

export const VERDICTS = ['고정 가능', '조건부 고정 가능', '고정 불가'];
export const VERDICT_PREFIX = '판정:';
export const QUADRANTS = ['단위 작업 × 결정론', '단위 작업 × 확률론', '워크플로우 × 결정론', '워크플로우 × 확률론'];
export const AGENT_QUADRANT = QUADRANTS[3];

// 마지막 '판정:' 줄을 읽는다. '조건부 고정 가능' 이 '고정 가능' 을 포함하므로 조건부를 먼저 본다.
export function parseVerdict(text) {
  const lines = normalize(text).split('\n').map(l => l.trim()).filter(Boolean);
  const last = [...lines].reverse().find(l => l.startsWith(VERDICT_PREFIX));
  if (!last) return null;
  const body = last.slice(VERDICT_PREFIX.length).trim();
  if (body.startsWith('조건부 고정 가능')) return '조건부 고정 가능';
  if (body.startsWith('고정 가능')) return '고정 가능';
  if (body.startsWith('고정 불가')) return '고정 불가';
  return null;
}

// 모델이 × 대신 x/X 를 쓰거나 굵게 표시해도 같은 칸으로 본다.
function quadrantKey(cell) {
  return cell.replace(/\*/g, '').replace(/\s+/g, ' ').replace(/[xX✕]/g, '×').trim();
}

// | 단계 | 칸 | 근거 | 표에서 둘째 열이 4번째 칸인 행의 첫째 열을 모은다.
export function agentQuadrantRows(text) {
  const rows = [];
  for (const raw of normalize(text).split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const inner = line.endsWith('|') ? line.slice(1, -1) : line.slice(1);
    const cells = inner.split('|').map(c => c.trim());
    if (cells.length >= 2 && quadrantKey(cells[1]).includes(AGENT_QUADRANT)) rows.push(cells[0].replace(/\*/g, ''));
  }
  return rows;
}

export function checkPhase2(a2wDir, { override = null } = {}) {
  const warnings = [];
  const p = join(a2wDir, 'verdict.md');
  if (!existsSync(p)) return { ok: false, errors: ['verdict.md 없음'], warnings, verdict: null, agentRows: [] };
  const text = readFileSync(p, 'utf8');
  const verdict = parseVerdict(text);
  const agentRows = agentQuadrantRows(text);

  if (override) {
    warnings.push(`override: ${override} (파일의 판정 '${verdict ?? '없음'}' 대신 '조건부 고정 가능' 으로 진행)`);
    return { ok: true, errors: [], warnings, verdict: '조건부 고정 가능', agentRows };
  }

  const errors = [];
  if (!verdict) errors.push(`마지막 '${VERDICT_PREFIX}' 줄이 ${VERDICTS.join(' / ')} 중 하나로 시작하지 않는다`);
  if (verdict === '고정 가능' && agentRows.length > 0) {
    errors.push(`4번째 칸(${AGENT_QUADRANT}) 항목이 있는데 판정이 '고정 가능': ${agentRows.join(', ')}. 조건부 또는 불가로 고쳐라`);
  } else if (agentRows.length > 0) {
    warnings.push(`4번째 칸 항목: ${agentRows.join(', ')}`);
  }
  return { ok: errors.length === 0, errors, warnings, verdict, agentRows };
}
```

- [x] **Step 4: 통과 확인**

Run: `node --test "tests/*.test.mjs"phase2.test.mjs`
Expected: PASS 8 tests

- [x] **Step 5: 커밋**

```bash
git add tests/phase2.test.mjs .claude/skills/agent-to-webapp/scripts/lib/phase2.mjs
git commit -m "feat: 2단계 판정 게이트 — 판정 줄·4번째 칸 규칙·override"
```

---

### Task 4: 3단계 고정 검사 (`phase3.mjs`)

**Files:**
- Create: `.claude/skills/agent-to-webapp/scripts/lib/phase3.mjs`
- Test: `tests/phase3.test.mjs`

**Interfaces:**
- Consumes: `normalize` from `md.mjs`
- Produces:
  - `STEP_HEADING = '### 단계 '`, `ACTORS = ['코드', 'LLM', '사람']`
  - `FIELD_ACTOR = '- 실행 주체:'`, `FIELD_IN = '- 입력 스키마:'`, `FIELD_OUT = '- 출력 스키마:'`, `FIELD_FAIL = '- 실패 처리:'`
  - `UNRULED_HEADING = '## 규칙화 불가'`, `UNRULED_TARGETS = ['LLM 단계', '사람 확인']`, `UNRULED_REJUDGE = '재판정'`
  - `parseWorkflow(text): { steps: {n, name, actor, hasInputSchema, hasOutputSchema, failure}[], unruled: string[], hasUnruledSection }`
  - `checkPhase3(a2wDir): { ok, errors, warnings, rejudge: boolean, stepCount }`
- workflow.md 형식(정본, 프롬프트 7-3 이 지시):

````
# workflow: <이름>
## 조건                       (조건부 판정일 때만. 첫머리)
## 단계
### 단계 1: 스펙 추출
- 실행 주체: LLM               (코드 | LLM | 사람)
- 입력 스키마:
```json
{ "rfq_pdf": "string", "drawing_pdf": "string" }
```
- 출력 스키마:
```json
{ "specs": { "material": "string", "qty": "number" } }
```
- 프롬프트 초안: …             (LLM 단계) / - 규칙: … (코드 단계) / - 확인할 것: … (사람 단계)
- 실패 처리: PDF 재독취 2회, 그래도 실패면 사람 확인 지점 2
## 규칙화 불가
- 도면 해상도가 낮을 때 재독취 여부 → LLM 단계 1
- 고객이 납기를 안 쓴 경우 → 사람 확인 지점 2
- 없음                          (항목이 없을 때 이 한 줄)
````

- 규칙(§4-3): 단계마다 네 필드 필수, 스키마는 json 블록 필수. `규칙화 불가` 항목은 `→ LLM 단계 N` 또는 `→ 사람 확인 지점 N` 으로 재배치돼야 통과. `→ 재판정: 이유` 가 있으면 `rejudge: true` 로 실패시킨다(CLI 가 2단계 되돌림을 안내)

- [x] **Step 1: 실패하는 테스트 작성**

`tests/phase3.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, A2W } from './helpers.mjs';
import { checkPhase3, parseWorkflow } from '../.claude/skills/agent-to-webapp/scripts/lib/phase3.mjs';

const STEP = (n, name, actor = 'LLM') => `### 단계 ${n}: ${name}
- 실행 주체: ${actor}
- 입력 스키마:
\`\`\`json
{ "a": "string" }
\`\`\`
- 출력 스키마:
\`\`\`json
{ "b": "string" }
\`\`\`
- 프롬프트 초안: 읽고 뽑아라
- 실패 처리: 2회 재시도 후 사람 확인
`;

const GOOD = `# workflow: rfq\n## 단계\n${STEP(1, '스펙 추출')}${STEP(2, '루트 판정', '코드')}## 규칙화 불가\n- 없음\n`;

function app(text) {
  const a = makeApp();
  write(a, `${A2W}/workflow.md`, text);
  return join(a, A2W);
}

test('parseWorkflow: 단계·필드·규칙화 불가 항목', () => {
  const w = parseWorkflow(GOOD);
  assert.equal(w.steps.length, 2);
  assert.deepEqual(w.steps[0], { n: 1, name: '스펙 추출', actor: 'LLM', hasInputSchema: true, hasOutputSchema: true, failure: '2회 재시도 후 사람 확인' });
  assert.equal(w.steps[1].actor, '코드');
  assert.deepEqual(w.unruled, ['없음']);
  assert.equal(w.hasUnruledSection, true);
});

test('phase3: 정상 통과', () => {
  const r = checkPhase3(app(GOOD));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  assert.equal(r.rejudge, false);
  assert.equal(r.stepCount, 2);
});

test('phase3: json 블록·실패 처리·실행 주체 빠지면 각각 실패', () => {
  const broken = `## 단계\n### 단계 1: x\n- 실행 주체: 로봇\n- 입력 스키마: {"a":1}\n- 출력 스키마:\n\`\`\`json\n{}\n\`\`\`\n## 규칙화 불가\n- 없음\n`;
  const r = checkPhase3(app(broken));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('실행 주체')));
  assert.ok(r.errors.some(e => e.includes('입력 스키마') && e.includes('json')));
  assert.ok(r.errors.some(e => e.includes('실패 처리')));
});

test('phase3: 규칙화 불가 항목은 재배치돼야 통과', () => {
  const ok = GOOD.replace('- 없음', '- 도면 해상도 판단 → LLM 단계 1\n- 납기 누락 -> 사람 확인 지점 2');
  assert.equal(checkPhase3(app(ok)).ok, true);
  const bad = GOOD.replace('- 없음', '- 도면 해상도 판단 (그냥 어려움)');
  const r = checkPhase3(app(bad));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('LLM 단계') && e.includes('사람 확인')));
});

test('phase3: 재판정 항목이 있으면 rejudge', () => {
  const r = checkPhase3(app(GOOD.replace('- 없음', '- 실패 시 수집 순서 자체가 바뀜 → 재판정: 순서가 흔들린다')));
  assert.equal(r.ok, false);
  assert.equal(r.rejudge, true);
});

test('phase3: 규칙화 불가 절이 없으면 경고, 단계가 없으면 실패', () => {
  const r = checkPhase3(app(`## 단계\n${STEP(1, 'a')}`));
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some(w => w.includes('규칙화 불가')));
  assert.equal(checkPhase3(app('# 빈 문서\n')).ok, false);
});
```

- [x] **Step 2: 실패 확인**

Run: `node --test "tests/*.test.mjs"phase3.test.mjs`
Expected: FAIL — `Cannot find module '.../lib/phase3.mjs'`

- [x] **Step 3: 구현**

`.claude/skills/agent-to-webapp/scripts/lib/phase3.mjs`:

```js
// 3단계 고정 게이트: 단계별 네 필드 + json 스키마, 규칙화 불가 항목의 재배치.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalize } from './md.mjs';

export const STEP_HEADING = '### 단계 ';
export const ACTORS = ['코드', 'LLM', '사람'];
export const FIELD_ACTOR = '- 실행 주체:';
export const FIELD_IN = '- 입력 스키마:';
export const FIELD_OUT = '- 출력 스키마:';
export const FIELD_FAIL = '- 실패 처리:';
export const UNRULED_HEADING = '## 규칙화 불가';
export const UNRULED_TARGETS = ['LLM 단계', '사람 확인'];
export const UNRULED_REJUDGE = '재판정';

// '### 단계 N: 이름' 으로 나누고, 각 조각을 다음 '## ' 전까지로 자른다.
function stepSections(t) {
  return t.split(/^### 단계 /m).slice(1).map(part => {
    const nl = part.indexOf('\n');
    const head = nl === -1 ? part : part.slice(0, nl);
    let body = nl === -1 ? '' : part.slice(nl + 1);
    const next = body.search(/^## /m);
    if (next !== -1) body = body.slice(0, next);
    const m = head.match(/^(\d+)\s*[:：]\s*(.+)$/);
    return { n: m ? Number(m[1]) : null, name: m ? m[2].trim() : head.trim(), body };
  });
}

// '- 입력 스키마:' 줄 바로 다음에 ```json … ``` 블록이 오는가.
function hasJsonAfter(body, field) {
  const i = body.indexOf(field);
  if (i === -1) return false;
  const after = body.slice(i + field.length);
  return /^[^\n]*\n\s*```json[^\n]*\n[\s\S]*?\n\s*```/.test(after);
}

export function parseWorkflow(text) {
  const t = normalize(text).replace(/->/g, '→');
  const steps = stepSections(t).map(s => ({
    n: s.n,
    name: s.name,
    actor: (s.body.match(/^- 실행 주체:\s*(\S+)/m) || [])[1] ?? null,
    hasInputSchema: hasJsonAfter(s.body, FIELD_IN),
    hasOutputSchema: hasJsonAfter(s.body, FIELD_OUT),
    failure: ((s.body.match(/^- 실패 처리:\s*(.*)$/m) || [])[1] ?? '').trim(),
  }));
  const idx = t.indexOf(UNRULED_HEADING);
  const unruled = [];
  if (idx !== -1) {
    let sec = t.slice(idx + UNRULED_HEADING.length);
    const end = sec.search(/\n## /);
    if (end !== -1) sec = sec.slice(0, end);
    for (const line of sec.split('\n')) {
      const l = line.trim();
      if (l.startsWith('- ')) unruled.push(l.slice(2).trim());
    }
  }
  return { steps, unruled, hasUnruledSection: idx !== -1 };
}

export function checkPhase3(a2wDir) {
  const errors = [];
  const warnings = [];
  const p = join(a2wDir, 'workflow.md');
  if (!existsSync(p)) return { ok: false, errors: ['workflow.md 없음'], warnings, rejudge: false, stepCount: 0 };
  const { steps, unruled, hasUnruledSection } = parseWorkflow(readFileSync(p, 'utf8'));

  if (steps.length === 0) errors.push(`'${STEP_HEADING}N: 이름' 헤딩이 하나도 없다`);
  for (const s of steps) {
    const tag = `단계 ${s.n ?? '?'}(${s.name})`;
    if (!s.actor || !ACTORS.includes(s.actor)) errors.push(`${tag}: '${FIELD_ACTOR} ${ACTORS.join('|')}' 없음`);
    if (!s.hasInputSchema) errors.push(`${tag}: '${FIELD_IN}' 다음 줄에 json 블록 없음`);
    if (!s.hasOutputSchema) errors.push(`${tag}: '${FIELD_OUT}' 다음 줄에 json 블록 없음`);
    if (!s.failure) errors.push(`${tag}: '${FIELD_FAIL}' 없음`);
  }

  let rejudge = false;
  if (!hasUnruledSection) warnings.push(`'${UNRULED_HEADING}' 절이 없다. 항목이 없으면 '- 없음' 한 줄로 적어라`);
  for (const item of unruled) {
    if (item === '없음') continue;
    if (item.includes(UNRULED_REJUDGE)) { rejudge = true; errors.push(`재판정 필요: ${item}`); continue; }
    if (!UNRULED_TARGETS.some(tg => item.includes(`→ ${tg}`))) {
      errors.push(`규칙화 불가 항목에 '→ LLM 단계 N' 또는 '→ 사람 확인 지점 N' 없음: ${item}`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, rejudge, stepCount: steps.length };
}
```

- [x] **Step 4: 통과 확인**

Run: `node --test "tests/*.test.mjs"phase3.test.mjs`
Expected: PASS 6 tests

- [x] **Step 5: 커밋**

```bash
git add tests/phase3.test.mjs .claude/skills/agent-to-webapp/scripts/lib/phase3.mjs
git commit -m "feat: 3단계 고정 게이트 — 단계 필드·JSON 스키마·규칙화 불가 재배치"
```

---
### Task 5: 4단계 재검증 검사 (`phase4.mjs`)

**Files:**
- Create: `.claude/skills/agent-to-webapp/scripts/lib/phase4.mjs`
- Test: `tests/phase4.test.mjs`

**Interfaces:**
- Consumes: `sectionBody`, `isBlank`, `hasHeading` from `md.mjs`
- Produces:
  - `REQUIRED_FILES = ['run.ts', 'package.json', '.gitignore', 'report.md']`
  - `REPORT_MODEL = '## 모델'`, `REPORT_INPUT = '## 입력 '`, `REPORT_HUMAN = '## 사람이 봤어야 할 것'`, `REPORT_EXTERNAL = '## 외부 서비스로 뺄 단계'`
  - `checkPhase4(a2wDir): { ok, errors, warnings, stepCount }`
- report.md 형식(정본, 프롬프트 7-4 가 지시):

```
# 재검증 report
## 모델
claude-sonnet-5
## 입력 1: NovaDrive (쉬움)
로컬 결과: … / 스크립트 결과: … / 차이: …
## 입력 2: …
## 입력 3: …
## 사람이 봤어야 할 것
- 단계 5 견적 확인: 자동 승인으로 지나감
## 외부 서비스로 뺄 단계
- 없음
```

- 규칙(§4-4): `verify/` 에 네 파일과 `steps/*.ts` 1개 이상. report 에 모델명, 입력 1~3 절(비어 있지 않음), 외부 서비스 절(있어야 함, `- 없음` 허용). 사람 절이 없으면 경고

- [x] **Step 1: 실패하는 테스트 작성**

`tests/phase4.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, A2W } from './helpers.mjs';
import { checkPhase4 } from '../.claude/skills/agent-to-webapp/scripts/lib/phase4.mjs';

const REPORT = `# 재검증 report
## 모델
claude-sonnet-5
## 입력 1: easy
차이 없음
## 입력 2: normal
수량 표기 차이
## 입력 3: edge
에스컬레이션 동일
## 사람이 봤어야 할 것
- 없음
## 외부 서비스로 뺄 단계
- 없음
`;

function verifyApp(report = REPORT, { steps = true } = {}) {
  const a = makeApp();
  const v = `${A2W}/verify`;
  write(a, `${v}/run.ts`, 'export {};');
  write(a, `${v}/package.json`, '{"name":"verify","type":"module"}');
  write(a, `${v}/.gitignore`, 'node_modules\n');
  if (steps) write(a, `${v}/steps/step1.ts`, 'export const step1 = () => {};');
  write(a, `${v}/report.md`, report);
  return join(a, A2W);
}

test('phase4: 정상 통과', () => {
  const r = checkPhase4(verifyApp());
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  assert.equal(r.stepCount, 1);
});

test('phase4: steps 없으면 실패', () => {
  const r = checkPhase4(verifyApp(REPORT, { steps: false }));
  assert.ok(r.errors.some(e => e.includes('steps/')));
});

test('phase4: 모델·입력 3·외부 서비스 절 검사', () => {
  const noModel = REPORT.replace('claude-sonnet-5\n', '');
  assert.ok(checkPhase4(verifyApp(noModel)).errors.some(e => e.includes('모델')));
  const twoInputs = REPORT.replace('## 입력 3: edge\n에스컬레이션 동일\n', '');
  assert.ok(checkPhase4(verifyApp(twoInputs)).errors.some(e => e.includes('입력 3')));
  const noExternal = REPORT.replace('## 외부 서비스로 뺄 단계\n- 없음\n', '');
  assert.ok(checkPhase4(verifyApp(noExternal)).errors.some(e => e.includes('외부 서비스')));
});

test('phase4: 사람 절이 없으면 경고만', () => {
  const r = checkPhase4(verifyApp(REPORT.replace('## 사람이 봤어야 할 것\n- 없음\n', '')));
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some(w => w.includes('사람이 봤어야')));
});

test('phase4: verify 폴더 없으면 실패', () => {
  assert.equal(checkPhase4(join(makeApp(), A2W)).ok, false);
});
```

- [x] **Step 2: 실패 확인**

Run: `node --test "tests/*.test.mjs"phase4.test.mjs`
Expected: FAIL — `Cannot find module '.../lib/phase4.mjs'`

- [x] **Step 3: 구현**

`.claude/skills/agent-to-webapp/scripts/lib/phase4.mjs`:

```js
// 4단계 재검증 게이트: verify/ 파일 구성과 report.md 절.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sectionBody, isBlank, hasHeading } from './md.mjs';

export const REQUIRED_FILES = ['run.ts', 'package.json', '.gitignore', 'report.md'];
export const REPORT_MODEL = '## 모델';
export const REPORT_INPUT = '## 입력 ';
export const REPORT_HUMAN = '## 사람이 봤어야 할 것';
export const REPORT_EXTERNAL = '## 외부 서비스로 뺄 단계';

export function checkPhase4(a2wDir) {
  const errors = [];
  const warnings = [];
  const vdir = join(a2wDir, 'verify');
  if (!existsSync(vdir)) return { ok: false, errors: ['verify/ 폴더가 없다'], warnings, stepCount: 0 };

  for (const f of REQUIRED_FILES) if (!existsSync(join(vdir, f))) errors.push(`verify/${f} 없음`);
  const stepsDir = join(vdir, 'steps');
  const stepFiles = existsSync(stepsDir) ? readdirSync(stepsDir).filter(f => f.endsWith('.ts')) : [];
  if (stepFiles.length === 0) errors.push('verify/steps/ 에 .ts 파일이 없다 (단계당 함수 하나)');

  const rp = join(vdir, 'report.md');
  if (existsSync(rp)) {
    const text = readFileSync(rp, 'utf8');
    if (isBlank(sectionBody(text, REPORT_MODEL))) errors.push(`report.md: '${REPORT_MODEL}' 절에 모델명이 없다`);
    for (const n of [1, 2, 3]) {
      if (isBlank(sectionBody(text, `${REPORT_INPUT}${n}`))) errors.push(`report.md: '${REPORT_INPUT}${n}' 절이 없거나 비었다`);
    }
    if (sectionBody(text, REPORT_EXTERNAL) === null) errors.push(`report.md: '${REPORT_EXTERNAL}' 절이 없다 (없으면 '- 없음')`);
    if (!hasHeading(text, REPORT_HUMAN)) warnings.push(`report.md: '${REPORT_HUMAN}' 절이 없다. 사람 확인 지점이 있었다면 적어라`);
  }
  return { ok: errors.length === 0, errors, warnings, stepCount: stepFiles.length };
}
```

- [x] **Step 4: 통과 확인**

Run: `node --test "tests/*.test.mjs"phase4.test.mjs`
Expected: PASS 5 tests

- [x] **Step 5: 커밋**

```bash
git add tests/phase4.test.mjs .claude/skills/agent-to-webapp/scripts/lib/phase4.mjs
git commit -m "feat: 4단계 재검증 게이트 — verify 구성·report 절"
```

---

### Task 6: 5단계 전환 검사 (`phase5.mjs`)

**Files:**
- Create: `.claude/skills/agent-to-webapp/scripts/lib/phase5.mjs`
- Test: `tests/phase5.test.mjs`

**Interfaces:**
- Consumes: `sectionBody`, `isBlank` from `md.mjs`
- Produces:
  - `BRIEF_HEADINGS = ['## 1. 서버 쪽 호출', '## 2. 실행 시간 분할', '## 3. 상태 저장', '## 4. 사람 확인 지점', '## 5. 외부 서비스로 뺄 단계', '## 6. 인증', '## 7. 배포 후 검증']`
  - `STATE_KEYWORDS = ['Supabase', 'DB 없음']`
  - `checkPhase5(a2wDir): { ok, errors, warnings }`
- 규칙(§4-5): 일곱 절이 모두 있고 비어 있지 않다. `## 3. 상태 저장` 에 `Supabase` 또는 `DB 없음` 이 명시돼 있다. 헤딩 문자열은 Task 11 의 `port-brief-template.md` 와 같아야 한다

- [x] **Step 1: 실패하는 테스트 작성**

`tests/phase5.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, A2W } from './helpers.mjs';
import { checkPhase5, BRIEF_HEADINGS } from '../.claude/skills/agent-to-webapp/scripts/lib/phase5.mjs';

const BRIEF = `# port brief
${BRIEF_HEADINGS[0]}
Route Handler 에서만 Anthropic SDK 호출. 키는 환경변수
${BRIEF_HEADINGS[1]}
단계 3 원가 계산이 40초. 단계마다 함수 하나
${BRIEF_HEADINGS[2]}
DB 없음. 사람 확인 지점 없고 합계 55초
${BRIEF_HEADINGS[3]}
없음
${BRIEF_HEADINGS[4]}
- 없음
${BRIEF_HEADINGS[5]}
범위 밖. 단일 사용자 데모
${BRIEF_HEADINGS[6]}
배포 후 runs/inputs/ 3건을 넣어 verify/report.md 와 비교
`;

function app(text) {
  const a = makeApp();
  write(a, `${A2W}/port-brief.md`, text);
  return join(a, A2W);
}

test('phase5: 정상 통과', () => {
  const r = checkPhase5(app(BRIEF));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('phase5: 절이 빠지거나 비면 실패', () => {
  const missing = BRIEF.replace(`${BRIEF_HEADINGS[5]}\n범위 밖. 단일 사용자 데모\n`, '');
  assert.ok(checkPhase5(app(missing)).errors.some(e => e.includes('6. 인증')));
  const empty = BRIEF.replace('없음\n' + BRIEF_HEADINGS[4], BRIEF_HEADINGS[4]);
  assert.ok(checkPhase5(app(empty)).errors.some(e => e.includes('4. 사람 확인 지점') && e.includes('비었다')));
});

test('phase5: 상태 저장 절에 Supabase 또는 DB 없음 명시', () => {
  const vague = BRIEF.replace('DB 없음. 사람 확인 지점 없고 합계 55초', '적당히 저장');
  const r = checkPhase5(app(vague));
  assert.ok(r.errors.some(e => e.includes('Supabase') && e.includes('DB 없음')));
  assert.equal(checkPhase5(app(BRIEF.replace('DB 없음.', 'Supabase.'))).ok, true);
});

test('phase5: 파일 없으면 실패', () => {
  assert.equal(checkPhase5(join(makeApp(), A2W)).ok, false);
});
```

- [x] **Step 2: 실패 확인**

Run: `node --test "tests/*.test.mjs"phase5.test.mjs`
Expected: FAIL — `Cannot find module '.../lib/phase5.mjs'`

- [x] **Step 3: 구현**

`.claude/skills/agent-to-webapp/scripts/lib/phase5.mjs`:

```js
// 5단계 전환 게이트: port-brief.md 의 일곱 절.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sectionBody, isBlank } from './md.mjs';

export const BRIEF_HEADINGS = [
  '## 1. 서버 쪽 호출',
  '## 2. 실행 시간 분할',
  '## 3. 상태 저장',
  '## 4. 사람 확인 지점',
  '## 5. 외부 서비스로 뺄 단계',
  '## 6. 인증',
  '## 7. 배포 후 검증',
];
export const STATE_KEYWORDS = ['Supabase', 'DB 없음'];

export function checkPhase5(a2wDir) {
  const errors = [];
  const warnings = [];
  const p = join(a2wDir, 'port-brief.md');
  if (!existsSync(p)) return { ok: false, errors: ['port-brief.md 없음'], warnings };
  const text = readFileSync(p, 'utf8');

  for (const h of BRIEF_HEADINGS) {
    const body = sectionBody(text, h);
    if (body === null) errors.push(`port-brief.md: '${h}' 절이 없다`);
    else if (isBlank(body)) errors.push(`port-brief.md: '${h}' 절이 비었다`);
  }
  const state = sectionBody(text, BRIEF_HEADINGS[2]) ?? '';
  if (!STATE_KEYWORDS.some(k => state.includes(k))) {
    errors.push(`port-brief.md: '${BRIEF_HEADINGS[2]}' 절에 '${STATE_KEYWORDS.join("' 또는 '")}' 이 명시돼야 한다`);
  }
  return { ok: errors.length === 0, errors, warnings };
}
```

- [x] **Step 4: 통과 확인**

Run: `node --test "tests/*.test.mjs"phase5.test.mjs`
Expected: PASS 4 tests

- [x] **Step 5: 커밋**

```bash
git add tests/phase5.test.mjs .claude/skills/agent-to-webapp/scripts/lib/phase5.mjs
git commit -m "feat: 5단계 전환 게이트 — 브리프 일곱 절"
```

---
### Task 7: 게이트 CLI (`check_phase.mjs`)

**Files:**
- Create: `.claude/skills/agent-to-webapp/scripts/check_phase.mjs`
- Test: `tests/cli.test.mjs`

**Interfaces:**
- Consumes: Task 1~6 의 `status.mjs`, `checkPhase1..5`
- Produces (CLI, 작업 폴더에서 실행):
  - `node check_phase.mjs init --target <경로> --runtime <claude-code|codex>` — STATUS 생성, `runs/inputs/`·`runs/tools/` 생성. 이미 있으면 STATUS 출력만
  - `node check_phase.mjs status` — STATUS 출력
  - `node check_phase.mjs <1-5> [--approve] [--batch] [--override "<사유>"]` — 검사 후 통과면 STATUS 에 기록
  - `node check_phase.mjs rollback <N>` — N단계 이후 통과 기록과 종료를 지운다
  - 종료코드 0 통과 / 1 실패 / 2 사용법 오류
  - export: `run(argv, cwd, out, err): number`, `parseArgs`, `ROUTING_HINT`, `NEEDS_APPROVAL = [2, 3]`
- 순서 규칙: N>1 은 N-1 통과 필요. 종료(terminated)면 어떤 단계도 거부하고 `rollback 2` 를 안내
- 승인 규칙: 2·3단계는 `--approve` 가 없으면 검사만 하고 기록하지 않는다(종료코드 1, 안내 출력). `--batch` 면 승인 없이 기록하고 log 에 남긴다
- 2단계 `고정 불가` 통과 시: `terminated: 고정 불가 <날짜>` 기록, `ROUTING_HINT` 출력, 종료코드 0
- 3단계 `rejudge` 시: 실패 + `rollback 2` 안내

- [x] **Step 1: 실패하는 테스트 작성**

`tests/cli.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { makeApp, write, A2W } from './helpers.mjs';
import { RUN_HEADINGS } from '../.claude/skills/agent-to-webapp/scripts/lib/phase1.mjs';

const SCRIPT = resolve('.claude/skills/agent-to-webapp/scripts/check_phase.mjs');

function cli(cwd, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function status(app) {
  return readFileSync(join(app, A2W, 'STATUS.md'), 'utf8');
}

// 대상 폴더(형제)와 작업 폴더를 만들고 init 까지 한 상태를 돌려준다.
function initedApp(runtime = 'claude-code') {
  const app = makeApp();
  const target = join(app, '..', 'target-' + Date.now() + Math.random().toString(36).slice(2, 6));
  mkdirSync(target, { recursive: true });
  const r = cli(app, 'init', '--target', target, '--runtime', runtime);
  assert.equal(r.code, 0, r.err);
  return { app, target };
}

const RUN = `# run\n${RUN_HEADINGS[0]}\n1. 읽기\n${RUN_HEADINGS[1]}\n- 판단\n${RUN_HEADINGS[2]}\n- 없음\n`;
function passPhase1(app) {
  for (const n of [1, 2, 3]) write(app, `${A2W}/runs/run-${n}.md`, RUN);
  write(app, `${A2W}/runs/inputs/README.md`, 'r');
  for (const f of ['a', 'b', 'c']) write(app, `${A2W}/runs/inputs/${f}`, 'x');
  const r = cli(app, '1');
  assert.equal(r.code, 0, r.err);
}
const VERDICT_OK = '| 단계 | 칸 | 근거 |\n|---|---|---|\n| 1 | 단위 작업 × 결정론 | 규칙 |\n\n판정: 고정 가능\n';
const VERDICT_NO = '| 단계 | 칸 | 근거 |\n|---|---|---|\n| 1 | 워크플로우 × 확률론 | 매번 다름 |\n\n판정: 고정 불가\n';

test('init: STATUS 와 폴더를 만들고, 인자 없으면 2', () => {
  const { app, target } = initedApp('codex');
  assert.ok(status(app).includes(`target: ${target}`));
  assert.ok(status(app).includes('runtime: codex'));
  assert.ok(existsSync(join(app, A2W, 'runs/inputs')));
  assert.ok(existsSync(join(app, A2W, 'runs/tools')));
  assert.equal(cli(makeApp(), 'init').code, 2);
  assert.equal(cli(makeApp(), 'init', '--target', 'nope-dir', '--runtime', 'codex').code, 2);
});

test('순서: STATUS 없으면 2, 1단계 전에 2단계는 1', () => {
  assert.equal(cli(makeApp(), '1').code, 2);
  const { app } = initedApp();
  const r = cli(app, '2');
  assert.equal(r.code, 1);
  assert.ok(r.err.includes('1단계'));
});

test('1단계 통과 → STATUS 에 기록', () => {
  const { app } = initedApp();
  passPhase1(app);
  assert.match(status(app), /phase-1: passed \d{4}-\d{2}-\d{2}\n/);
});

test('2단계: --approve 없으면 기록 안 함, 있으면 approved', () => {
  const { app } = initedApp();
  passPhase1(app);
  write(app, `${A2W}/verdict.md`, VERDICT_OK);
  const r1 = cli(app, '2');
  assert.equal(r1.code, 1);
  assert.ok(r1.err.includes('--approve'));
  assert.ok(status(app).includes('phase-2:\n'));
  const r2 = cli(app, '2', '--approve');
  assert.equal(r2.code, 0, r2.err);
  assert.match(status(app), /phase-2: passed \d{4}-\d{2}-\d{2} approved\n/);
});

test('2단계: --batch 는 승인 없이 기록하고 log 에 남긴다', () => {
  const { app } = initedApp();
  passPhase1(app);
  write(app, `${A2W}/verdict.md`, VERDICT_OK);
  assert.equal(cli(app, '2', '--batch').code, 0);
  assert.match(status(app), /phase-2: passed \d{4}-\d{2}-\d{2}\n/);
  assert.ok(status(app).includes('batch'));
});

test('2단계 고정 불가 → 종료 기록, 라우팅 안내, 이후 단계 거부, rollback 으로 해제', () => {
  const { app } = initedApp();
  passPhase1(app);
  write(app, `${A2W}/verdict.md`, VERDICT_NO);
  const r = cli(app, '2', '--approve');
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.includes('Agent SDK'));
  assert.match(status(app), /terminated: 고정 불가 \d{4}-\d{2}-\d{2}\n/);
  const r3 = cli(app, '3');
  assert.equal(r3.code, 1);
  assert.ok(r3.err.includes('종료'));
  assert.equal(cli(app, 'rollback', '2').code, 0);
  assert.ok(!/^terminated:/m.test(status(app)));
  assert.ok(status(app).includes('phase-2:\n'));
  assert.match(status(app), /phase-1: passed/);
});

test('2단계 --override: 조건부로 통과하고 사유를 log 에', () => {
  const { app } = initedApp();
  passPhase1(app);
  write(app, `${A2W}/verdict.md`, VERDICT_NO);
  const r = cli(app, '2', '--approve', '--override', '사이트 3개뿐');
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.includes('조건부'));
  assert.ok(status(app).includes('override: 사이트 3개뿐'));
  assert.ok(!/^terminated:/m.test(status(app)));
});

test('3단계 rejudge → 실패 + rollback 안내', () => {
  const { app } = initedApp();
  passPhase1(app);
  write(app, `${A2W}/verdict.md`, VERDICT_OK);
  assert.equal(cli(app, '2', '--approve').code, 0);
  write(app, `${A2W}/workflow.md`, `## 단계\n### 단계 1: a\n- 실행 주체: 코드\n- 입력 스키마:\n\`\`\`json\n{}\n\`\`\`\n- 출력 스키마:\n\`\`\`json\n{}\n\`\`\`\n- 실패 처리: 중단\n## 규칙화 불가\n- 순서가 바뀜 → 재판정: 흔들림\n`);
  const r = cli(app, '3', '--approve');
  assert.equal(r.code, 1);
  assert.ok(r.err.includes('rollback 2'));
});

test('status 와 잘못된 명령', () => {
  const { app } = initedApp();
  const r = cli(app, 'status');
  assert.equal(r.code, 0);
  assert.ok(r.out.includes('# agent-to-webapp STATUS'));
  assert.equal(cli(app, 'nope').code, 2);
  assert.equal(cli(app, 'rollback', '9').code, 2);
});
```

- [x] **Step 2: 실패 확인**

Run: `node --test "tests/*.test.mjs"cli.test.mjs`
Expected: FAIL — 모든 테스트가 `code` 불일치 (스크립트가 없어 node 가 종료코드 1)

- [x] **Step 3: 구현**

`.claude/skills/agent-to-webapp/scripts/check_phase.mjs`:

```js
#!/usr/bin/env node
// agent-to-webapp 게이트 CLI. 작업 폴더(<이름>-app/)에서 실행한다.
//   node check_phase.mjs init --target <경로> --runtime <claude-code|codex>
//   node check_phase.mjs status
//   node check_phase.mjs <1-5> [--approve] [--batch] [--override "<사유>"]
//   node check_phase.mjs rollback <N>
// 종료코드: 0 통과 / 1 실패 / 2 사용법 오류. STATUS.md 는 이 스크립트만 쓴다.
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { A2W_DIR, RUNTIMES, emptyStatus, readStatus, writeStatus, formatStatus, today } from './lib/status.mjs';
import { checkPhase1 } from './lib/phase1.mjs';
import { checkPhase2 } from './lib/phase2.mjs';
import { checkPhase3 } from './lib/phase3.mjs';
import { checkPhase4 } from './lib/phase4.mjs';
import { checkPhase5 } from './lib/phase5.mjs';

export const NEEDS_APPROVAL = [2, 3];
export const PHASES = [1, 2, 3, 4, 5];
export const ROUTING_HINT = [
  '이 과제는 웹 앱 전환 대상이 아니다. 우하단 칸(워크플로우 × 확률론)이 남는다.',
  '별도 트랙: Agent SDK 를 Vercel 밖 컨테이너에 두거나 Managed Agents. 선례 workos/litigation-writer-app.',
  'Agent SDK 는 settingSources 를 생략하면 CLAUDE.md·skills 를 CLI 처럼 다 읽는다. 배포 앱은 settingSources: [] 로 격리하고 필요한 것만 명시한다.',
].join('\n');
const USAGE = [
  '사용법 (작업 폴더에서):',
  '  node check_phase.mjs init --target <경로> --runtime <claude-code|codex>',
  '  node check_phase.mjs status',
  '  node check_phase.mjs <1-5> [--approve] [--batch] [--override "<사유>"]',
  '  node check_phase.mjs rollback <N>',
].join('\n');
const BOOL_FLAGS = new Set(['approve', 'batch']);
const CHECKS = {
  1: (d) => checkPhase1(d),
  2: (d, o) => checkPhase2(d, o),
  3: (d) => checkPhase3(d),
  4: (d) => checkPhase4(d),
  5: (d) => checkPhase5(d),
};

export function parseArgs(argv) {
  const args = { cmd: argv[0], flags: {}, rest: [] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args.rest.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (BOOL_FLAGS.has(key) || next === undefined || next.startsWith('--')) args.flags[key] = true;
    else { args.flags[key] = next; i++; }
  }
  return args;
}

function init(cwd, flags, out, err) {
  const existing = readStatus(cwd);
  if (existing) { out(formatStatus(existing)); return 0; }
  const { target, runtime } = flags;
  if (typeof target !== 'string' || !RUNTIMES.includes(runtime)) {
    err(`init 은 --target <경로> --runtime ${RUNTIMES.join('|')} 가 필요하다`); return 2;
  }
  if (!existsSync(resolve(cwd, target))) { err(`대상 폴더가 없다: ${target}`); return 2; }
  for (const d of ['runs/inputs', 'runs/tools']) mkdirSync(join(cwd, A2W_DIR, d), { recursive: true });
  const st = emptyStatus(target, runtime);
  st.log.push(`${today()} init`);
  writeStatus(cwd, st);
  out(`STATUS 생성: target=${target} runtime=${runtime}`);
  return 0;
}

function status(cwd, out, err) {
  const st = readStatus(cwd);
  if (!st) { err('STATUS.md 가 없다. 먼저 init'); return 2; }
  out(formatStatus(st));
  return 0;
}

function rollback(cwd, n, out, err) {
  if (!PHASES.includes(n)) { err('rollback <1-5>'); return 2; }
  const st = readStatus(cwd);
  if (!st) { err('STATUS.md 가 없다. 먼저 init'); return 2; }
  for (const k of Object.keys(st.phases)) if (Number(k) >= n) delete st.phases[k];
  st.terminated = null;
  st.log.push(`${today()} rollback ${n}`);
  writeStatus(cwd, st);
  out(`${n}단계부터 다시. ${n}단계 이후 통과 기록과 종료를 지웠다`);
  return 0;
}

function gate(cwd, n, flags, out, err) {
  const st = readStatus(cwd);
  if (!st) { err('STATUS.md 가 없다. 먼저 init'); return 2; }
  if (st.terminated) { err(`종료됨: ${st.terminated}. 다시 하려면 node check_phase.mjs rollback 2`); return 1; }
  if (n > 1 && !st.phases[n - 1]) { err(`${n - 1}단계를 먼저 통과해야 한다`); return 1; }

  const a2wDir = join(cwd, A2W_DIR);
  const override = typeof flags.override === 'string' ? flags.override : null;
  const r = CHECKS[n](a2wDir, { override });
  for (const w of r.warnings) out(`경고: ${w}`);
  if (!r.ok) {
    for (const e of r.errors) err(`실패: ${e}`);
    if (n === 3 && r.rejudge) err('규칙화 불가 항목이 순서를 흔든다. 2단계로 돌아가라: node check_phase.mjs rollback 2');
    return 1;
  }

  const wantsApproval = NEEDS_APPROVAL.includes(n) && !flags.batch;
  if (wantsApproval && !flags.approve) {
    const doc = n === 2 ? 'verdict.md' : 'workflow.md';
    err(`${n}단계 검사는 통과. 학습자가 ${doc} 를 읽고 동의하면 --approve 로 다시 실행하라. 통과 기록은 아직 안 남겼다`);
    return 1;
  }

  st.phases[n] = { passed: today(), approved: NEEDS_APPROVAL.includes(n) && Boolean(flags.approve) };
  if (override) st.log.push(`${today()} phase-${n} override: ${override}`);
  if (flags.batch && NEEDS_APPROVAL.includes(n)) st.log.push(`${today()} phase-${n} batch (승인 생략)`);

  if (n === 2 && r.verdict === '고정 불가') {
    st.terminated = `고정 불가 ${today()}`;
    st.log.push(`${today()} terminated: 고정 불가`);
    writeStatus(cwd, st);
    out(`2단계 통과. 판정: 고정 불가 → 여기서 종료.\n${ROUTING_HINT}`);
    return 0;
  }
  writeStatus(cwd, st);
  out(`${n}단계 통과${r.verdict ? ` (판정: ${r.verdict})` : ''}`);
  return 0;
}

export function run(argv, cwd, out = console.log, err = console.error) {
  const { cmd, flags, rest } = parseArgs(argv);
  if (cmd === 'init') return init(cwd, flags, out, err);
  if (cmd === 'status') return status(cwd, out, err);
  if (cmd === 'rollback') return rollback(cwd, Number(rest[0]), out, err);
  const n = Number(cmd);
  if (PHASES.includes(n)) return gate(cwd, n, flags, out, err);
  err(USAGE);
  return 2;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exit(run(process.argv.slice(2), process.cwd()));
}
```

- [x] **Step 4: 통과 확인**

Run: `node --test "tests/*.test.mjs"cli.test.mjs`
Expected: PASS 9 tests

- [x] **Step 5: 전체 테스트**

Run: `node --test "tests/*.test.mjs"`
Expected: 모두 PASS (Task 1~7 합계 41 tests)

- [x] **Step 6: 커밋**

```bash
git add tests/cli.test.mjs .claude/skills/agent-to-webapp/scripts/check_phase.mjs
git commit -m "feat: 게이트 CLI — init/status/1~5/rollback, 승인·종료·override"
```

---

### Task 8: PostToolUse 훅 (`log_tool_use.mjs`)

**Files:**
- Create: `.claude/skills/agent-to-webapp/scripts/log_tool_use.mjs`
- Test: `tests/log_tool_use.test.mjs`

**Interfaces:**
- Produces:
  - CLI: `node log_tool_use.mjs <logDir>` — stdin 의 JSON 한 건을 `<logDir>/<session>.jsonl` 에 한 줄 덧붙인다. 항상 종료코드 0(인자 없으면 2). 훅이 에이전트를 멈추게 하면 안 된다
  - export `toRecord(payload, now?): { ts, session, event, tool, input?, response?, raw? }`, `truncate(v, max?)`, `appendRecord(logDir, rec)`, `MAX_FIELD = 2000`
  - 레코드의 `ts` 는 Task 2 의 `pairToolLogs` 가 정렬에 쓴다
- Claude Code 페이로드 필드(확인됨): `session_id`, `hook_event_name`, `tool_name`, `tool_input`, `tool_response`, `cwd`, `tool_use_id`. Codex 는 "같은 이벤트 스키마" 라고만 문서에 있어 필드가 다르면 아는 것만 뽑고 `raw` 를 남긴다(§2-11 후퇴 분기)

- [x] **Step 1: 실패하는 테스트 작성**

`tests/log_tool_use.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { makeApp } from './helpers.mjs';
import { toRecord, truncate, appendRecord, MAX_FIELD } from '../.claude/skills/agent-to-webapp/scripts/log_tool_use.mjs';

const SCRIPT = resolve('.claude/skills/agent-to-webapp/scripts/log_tool_use.mjs');
const CLAUDE_PAYLOAD = {
  session_id: 'abc-123', hook_event_name: 'PostToolUse', cwd: 'C:/x', tool_use_id: 't1',
  tool_name: 'Bash', tool_input: { command: 'ls' }, tool_response: { stdout: 'a\nb', exit_code: 0 },
};

test('toRecord: Claude Code 페이로드', () => {
  const rec = toRecord(CLAUDE_PAYLOAD, new Date('2026-09-12T01:02:03Z'));
  assert.equal(rec.ts, '2026-09-12T01:02:03.000Z');
  assert.equal(rec.session, 'abc-123');
  assert.equal(rec.event, 'PostToolUse');
  assert.equal(rec.tool, 'Bash');
  assert.equal(rec.input, '{"command":"ls"}');
  assert.ok(rec.response.includes('"exit_code":0'));
  assert.equal(rec.raw, undefined);
});

test('toRecord: 필드가 다르면 raw 를 남긴다', () => {
  const rec = toRecord({ thread_id: 'z', kind: 'shell', argv: ['ls'] });
  assert.equal(rec.session, 'z');
  assert.equal(rec.tool, null);
  assert.ok(rec.raw.includes('"argv"'));
});

test('truncate: 긴 값은 자르고 길이를 남긴다', () => {
  const long = 'x'.repeat(MAX_FIELD + 10);
  assert.ok(truncate(long).startsWith('x'.repeat(MAX_FIELD)));
  assert.ok(truncate(long).endsWith('(+10)'));
  assert.equal(truncate(undefined), undefined);
  assert.equal(truncate({ a: 1 }), '{"a":1}');
});

test('appendRecord: 세션별 jsonl 에 한 줄씩', () => {
  const dir = join(makeApp(), 'tools');
  appendRecord(dir, toRecord(CLAUDE_PAYLOAD));
  appendRecord(dir, toRecord({ ...CLAUDE_PAYLOAD, tool_name: 'Read' }));
  const lines = readFileSync(join(dir, 'abc-123.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).tool, 'Read');
});

test('CLI: stdin JSON → 파일, 깨진 JSON 도 0, 인자 없으면 2', () => {
  const dir = join(makeApp(), 'tools');
  const ok = spawnSync(process.execPath, [SCRIPT, dir], { input: JSON.stringify(CLAUDE_PAYLOAD), encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(readdirSync(dir), ['abc-123.jsonl']);
  const bad = spawnSync(process.execPath, [SCRIPT, dir], { input: '{not json', encoding: 'utf8' });
  assert.equal(bad.status, 0);
  assert.ok(readFileSync(join(dir, 'unknown.jsonl'), 'utf8').includes('parse_error'));
  assert.equal(spawnSync(process.execPath, [SCRIPT], { input: '{}', encoding: 'utf8' }).status, 2);
});
```

- [x] **Step 2: 실패 확인**

Run: `node --test "tests/*.test.mjs"log_tool_use.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/log_tool_use.mjs'`

- [x] **Step 3: 구현**

`.claude/skills/agent-to-webapp/scripts/log_tool_use.mjs`:

```js
#!/usr/bin/env node
// PostToolUse 훅. stdin 의 JSON 한 건을 <logDir>/<session>.jsonl 에 한 줄로 덧붙인다.
//   node log_tool_use.mjs <logDir>
// 어떤 실패에도 종료코드 0 — 훅이 에이전트를 멈추게 하면 안 된다. 인자가 없을 때만 2.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_FIELD = 2000;

export function truncate(v, max = MAX_FIELD) {
  if (v === undefined || v === null) return undefined;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max)}…(+${s.length - max})` : s;
}

// Claude Code: session_id, hook_event_name, tool_name, tool_input, tool_response.
// 다른 런타임(Codex)이 필드를 다르게 주면 아는 것만 뽑고 나머지는 raw 로 남긴다.
export function toRecord(payload, now = new Date()) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const tool = p.tool_name ?? p.tool ?? p.name ?? null;
  const rec = {
    ts: now.toISOString(),
    session: String(p.session_id ?? p.session ?? p.thread_id ?? 'unknown'),
    event: p.hook_event_name ?? p.event ?? 'PostToolUse',
    tool,
    input: truncate(p.tool_input ?? p.input),
    response: truncate(p.tool_response ?? p.output),
  };
  if (!tool) rec.raw = truncate(p);
  return rec;
}

function safeName(s) {
  return s.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function appendRecord(logDir, rec) {
  mkdirSync(logDir, { recursive: true });
  appendFileSync(join(logDir, `${safeName(rec.session)}.jsonl`), JSON.stringify(rec) + '\n', 'utf8');
}

export async function main(argv = process.argv.slice(2), stdin = process.stdin) {
  const logDir = argv[0];
  if (!logDir) { process.stderr.write('usage: node log_tool_use.mjs <logDir>\n'); return 2; }
  let raw = '';
  for await (const chunk of stdin) raw += chunk;
  let payload;
  try { payload = JSON.parse(raw); } catch { payload = { parse_error: true, raw: raw.slice(0, MAX_FIELD) }; }
  appendRecord(logDir, toRecord(payload));
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().then(code => process.exit(code)).catch(() => process.exit(0));
}
```

- [x] **Step 4: 통과 확인**

Run: `node --test "tests/*.test.mjs"log_tool_use.test.mjs`
Expected: PASS 5 tests

- [x] **Step 5: 커밋**

```bash
git add tests/log_tool_use.test.mjs .claude/skills/agent-to-webapp/scripts/log_tool_use.mjs
git commit -m "feat: PostToolUse 훅 — 세션별 jsonl 기록, 낯선 페이로드는 raw 로 후퇴"
```

---
### Task 9: 프롬프트 실행판과 결정 축 표 (`prompts.md`, `decision-axes.md`)

**Files:**
- Create: `.claude/skills/agent-to-webapp/references/prompts.md`
- Create: `.claude/skills/agent-to-webapp/references/decision-axes.md`

**Interfaces:**
- Consumes: 형식 문자열은 Task 2~6 의 상수와 글자 하나까지 같아야 한다 — `RUN_HEADINGS`, `QUADRANTS`, `VERDICT_PREFIX`, `STEP_HEADING`·`FIELD_*`·`UNRULED_HEADING`, `REPORT_*`, `BRIEF_HEADINGS`
- Produces: 다섯 프롬프트의 실행판(§2-17 정본). `phase-N.md`(Task 10)와 `SKILL.md`(Task 13)가 "프롬프트 N 을 쓴다" 로 가리킨다
- 검증은 사람 눈: 각 프롬프트를 스펙 §7 과 대조하고, 형식 줄이 스크립트 상수와 같은지 `grep` 으로 확인한다

- [x] **Step 1: `prompts.md` 작성**

````markdown
# 프롬프트 실행판

원문은 LLM-Wiki `wiki/vibe-coding/local-agent-to-web-app.md`. 원출처는 2026-09-07 claude.ai 대화.
여기가 실행판 정본이다. 원문과 다른 점은 각 프롬프트 끝에 적었다. 형식 문자열(헤딩·필드·판정 줄)은
`scripts/lib/phaseN.mjs` 의 상수와 같아야 하며 게이트가 그 문자열을 그대로 찾는다.

`<APP>` 은 작업 폴더(`<이름>-app/`)의 경로, `<A2W>` 는 `<APP>/docs/agent-to-webapp` 이다.

## 프롬프트 1 — 매 실행마다 기록 남기기

대상의 `CLAUDE.local.md`(Codex 면 `AGENTS.override.md`)에 마커와 함께 넣는다. 5단계 뒤 마커째 지운다.

```
<!-- agent-to-webapp:start -->
작업을 마친 뒤 <A2W>/runs/run-N.md 파일에 실행 기록을 남겨줘. N 은 순번이고 이미 있는 run 파일 다음 번호다.
아래 헤딩 세 개를 그대로 써줘.
## 수행한 단계
- 순서대로 번호 매겨 적을 것. 각 단계에서 사용한 도구, 스크립트, 스킬
- 각 단계의 입력과 출력이 무엇이었는지
## 판단이 필요했던 지점
- 무엇을 보고 무엇을 결정했는지, 왜 그렇게 했는지
## 예상과 달라서 방식을 바꾼 지점
- 없으면 "없음"
<!-- agent-to-webapp:end -->
```

원문과 다른 점: 경로가 작업 폴더를 가리킨다. 헤딩 셋 고정(`RUN_HEADINGS`). 마커.

## 프롬프트 2 — 고정 가능 여부 판정

세 번 이상 돌린 뒤. 서브에이전트에게 준다. `<TARGET>` 은 대상 폴더.

```
<A2W>/runs/ 의 실행 기록을 모두 읽고 워크플로우가 고정 가능한지 판정해줘.
<TARGET>/CLAUDE.md(또는 AGENTS.md)와 <TARGET>/.claude/skills/(또는 .agents/skills/)는 "하기로 한 것" 이고,
<A2W>/runs/run-N.md 는 "실제로 한 것" 이다. run-N.tools.jsonl 이 있으면 run-N.md 의 자기 보고와
대조해서 다른 점을 먼저 적어줘. 결과는 <A2W>/verdict.md 에 써줘.

1. 모든 실행에서 순서와 방식이 같았던 단계를 나열
2. 실행마다 달랐던 단계를 나열. 각각에 대해 무엇이 달랐는지(순서가 바뀜 / 단계가 추가·생략됨 / 같은 단계인데 방법이 다름)와 왜 달랐는지
3. 각 단계를 아래 표에 배정. 표는 `| 단계 | 칸 | 근거 |` 세 열이고, 칸 열에는 아래 넷 중 하나를 글자 그대로 쓴다
   - 단위 작업 × 결정론: 정해진 규칙으로 고정 출력
   - 단위 작업 × 확률론: 매번 LLM 판단이 필요
   - 워크플로우 × 결정론: 순서가 고정
   - 워크플로우 × 확률론: 순서나 방식 자체가 상황에 따라 재구성됨
4. 4번째 칸에 해당하는 것이 있으면 명시하고, 규칙으로 바꿀 수 있는지 없는지 의견을 낼 것

파일의 마지막 줄은 "판정: 고정 가능" / "판정: 조건부 고정 가능(조건 명시)" / "판정: 고정 불가" 중 하나여야 한다.
4번째 칸 항목이 하나라도 남아 있으면 "고정 가능" 이라고 하지 말 것.
억지로 고정 가능하다고 하지 말 것. 고정하면 품질이 떨어질 단계가 있으면 그렇다고 말해줘.
```

원문과 다른 점: 설계 의도와 실제의 역할 표시, 훅 기록 대조, 배정표 열과 칸 이름 고정(`QUADRANTS`), 판정 줄 형식(`VERDICT_PREFIX`), 4번째 칸 규칙. 마지막 두 줄은 삭제 금지.

## 프롬프트 3 — 워크플로우 고정

판정이 고정 가능 또는 조건부일 때. 스킬 세션이 직접 한다.

```
<A2W>/verdict.md 를 바탕으로 <A2W>/workflow.md 에 고정된 워크플로우 명세를 작성해줘.
조건부 판정이면 "## 조건" 절을 문서 첫머리에 두고 조건을 적어줘.

"## 단계" 아래 각 단계를 "### 단계 N: 이름" 헤딩으로 쓰고, 단계마다 아래 줄을 이 순서로 넣어줘.
- 실행 주체: 코드 | LLM | 사람 (셋 중 하나)
- 입력 스키마: (바로 다음 줄에 ```json 블록. 다음 단계가 이 스키마를 그대로 쓴다)
- 출력 스키마: (바로 다음 줄에 ```json 블록)
- 프롬프트 초안: (LLM 단계) / - 규칙: (코드 단계) / - 확인할 것: (사람 단계)
- 실패 처리: 한 줄

실행마다 판단이 달랐던 부분은 규칙으로 바꾸는 것을 먼저 시도하고, 바꿀 수 없으면 문서 끝의
"## 규칙화 불가" 절에 항목으로 적어줘. 항목마다 어디로 보낼지 화살표로 적는다.
- <내용> → LLM 단계 N        (매번 LLM 판단이 필요하지만 순서는 고정)
- <내용> → 사람 확인 지점 N   (사람이 봐야 한다)
- <내용> → 재판정: <이유>     (순서 자체가 흔들린다. 이건 이 단계가 아니라 판정으로 돌아갈 일이다)
항목이 없으면 "- 없음" 한 줄.
사람이 확인해야 하는 지점이 있으면 실행 주체가 "사람" 인 단계로 넣어줘.
```

원문과 다른 점: 조건 첫머리, 헤딩·필드 고정(`STEP_HEADING`, `FIELD_*`), JSON 필수, 규칙화 불가 항목의 재배치(`UNRULED_HEADING`, `UNRULED_TARGETS`, `UNRULED_REJUDGE`).

## 프롬프트 4 — 재검증 스크립트

```
<A2W>/workflow.md 의 순서대로 각 단계를 함수 하나로 구현한 TypeScript 스크립트를 <A2W>/verify/ 에 작성해줘.
- Node 24 에서 `node run.ts` 로 바로 실행되는 단독 스크립트로. tsx 나 빌드 단계 없이. 웹 앱 뼈대는 만들지 말 것
- 구성: package.json, .gitignore(node_modules), run.ts, steps/<단계>.ts (단계당 함수 하나)
- 의존은 @anthropic-ai/sdk 와 그 단계에 꼭 필요한 순수 JS 패키지만(예: xlsx 생성). Vercel 서버리스에서 안 도는 것(네이티브 바이너리, 브라우저 자동화, Python)은 금지
- LLM 단계는 Anthropic SDK 로 호출. 모델은 환경변수 A2W_MODEL, 없으면 claude-sonnet-5
- 단계 사이에 넘기는 데이터는 workflow.md 의 JSON 스키마를 그대로 쓸 것
- 실행 주체가 "사람" 인 단계는 자동 승인으로 지나가되 report.md 의 "## 사람이 봤어야 할 것" 절에 남길 것
- child_process 로 Python 이나 다른 런타임을 부르지 말 것. TS 로 안 되는 단계는 "## 외부 서비스로 뺄 단계" 절에 적을 것
- 작성 후 <A2W>/runs/inputs/ 의 입력 3개로 실행하고, 로컬 에이전트 결과(<A2W>/runs/run-N.md)와 비교해서
  <A2W>/verify/report.md 에 아래 절로 보고해줘
  ## 모델            (실제로 쓴 모델명 한 줄)
  ## 입력 1: <이름>   (로컬 결과 / 스크립트 결과 / 차이)
  ## 입력 2: <이름>
  ## 입력 3: <이름>
  ## 사람이 봤어야 할 것   (없으면 - 없음)
  ## 외부 서비스로 뺄 단계  (없으면 - 없음)
```

원문과 다른 점: Node 24 직접 실행, 구성 고정, 모델 지정, 사람 단계 처리, child_process 금지, report 절 고정(`REPORT_*`).

## 프롬프트 5 — 웹 앱 전환 (초안)

작업 폴더의 다음 세션에서 사람이 붙여넣는다. 위키에 원문이 없다.

```
docs/agent-to-webapp/port-brief.md 와 docs/agent-to-webapp/workflow.md 를 읽고 이 워크플로우를 Next.js 웹 앱으로 만들어줘.
- 이 폴더에서 create-next-app 을 먼저 돌릴 것. docs/ 와 .git 은 그대로 둔다
- docs/agent-to-webapp/verify/steps/ 를 src/lib/workflow/ 로 복사해서 그대로 쓸 것. 로직을 다시 짜지 말 것
- Claude 를 부르는 코드와 API 키는 서버 쪽(Route Handler 또는 Server Action)에만 둘 것
- 상태 저장은 브리프의 "3. 상태 저장" 이 정한 대로. Supabase 면 단계별 상태를 저장하고 오래 걸리는 단계는 나눌 것
- workflow.md 의 사람 단계는 UI 승인 단계로 만들고 승인 상태를 남길 것
- 인증은 만들지 말 것. 단일 사용자 데모다
- 화면은 입력 → 진행 상태 → 결과 셋이면 충분
```

스타일 지정은 여기 두지 않는다. `port-brief-template.md` 의 선택 절에서 브리프에 넣는다.
````

- [x] **Step 2: `decision-axes.md` 작성**

스펙 §8 의 표 넷을 그대로 옮긴다. 출처 줄을 맨 위에 둔다.

```markdown
# 결정 축과 매핑표

출처: LLM-Wiki `wiki/vibe-coding/local-agent-to-web-app.md`. 2단계 판정과 5단계 브리프가 참조한다.

## 세 결정 축

`동적이면 Agent SDK, 고정이면 API` 는 축을 잘못 잡은 것이다. 에이전트 루프는 Messages API 의 기본
기능이고 반복문 하나면 된다. 진짜 결정 축은 모델에게 어떤 도구가 필요한가이고, 여기에 실행 환경이
붙어 셋이 된다.

| 축 | 한쪽 | 다른 쪽 |
|---|---|---|
| 제어권 | 코드가 순서를 정한다 (워크플로우) | 모델이 정한다 (에이전트) |
| 도구 | 도메인 도구만 — DB 조회, 외부 API, 내 앱의 함수 | 파일시스템, 쉘, 런타임에 코드를 새로 써서 실행 |
| 환경 | 서버리스 함수 안에서 몇 초~몇 분에 끝난다 | 오래 돌아간다, 샌드박스가 필요하다 |

## 조합이 정하는 구현 수단

| 제어권 | 도구 | 수단 |
|---|---|---|
| 코드가 정함 | 도메인 도구 | Messages API. Next.js 안에서 끝난다 |
| 모델이 정함 | 도메인 도구 | API tool-use 루프를 직접 작성. 또는 Agent SDK 에 커스텀 도구만 |
| 모델이 정함 | 파일·쉘·코드 실행 | Agent SDK 를 Vercel 밖 컨테이너에. 또는 Managed Agents |

이 스킬이 다루는 것은 첫 행이다. 2단계 판정이 고정 가능이면 첫 행에 들어온 것이다. 셋째 행은
2단계에서 걸러져 나간다.

## 2×2 표

| | 결정론 | 확률론 |
|---|---|---|
| 단위 작업 | 정해진 규칙으로 고정 출력 | 매번 LLM 판단이 필요 |
| 워크플로우 | 순서가 고정 | 순서나 방식 자체가 상황에 따라 재구성됨 |

우하단(워크플로우 × 확률론)만 에이전트다. 나머지 셋은 워크플로우다. LLM 판단이 들어 있어도 순서가
고정이면 워크플로우다.

## 하네스 5요소의 웹 앱 매핑

| 로컬 하네스 | 웹 앱 — API 경로 | 웹 앱 — Agent SDK 경로 |
|---|---|---|
| CLAUDE.md | system prompt | 그대로 (설정 소스 로딩) |
| Skill | tool 정의 + 서버 함수 | .claude/skills 그대로 |
| Subagent | 별도 API 호출·병렬 실행 | SDK 서브에이전트 |
| Hooks | 미들웨어·검증 코드 | SDK hooks |
| MCP | 직접 함수 호출로 대체 가능 | 그대로 |
| 사람 승인 | UI 승인 단계 + DB 상태 | permission 콜백 |

Skill 하나가 웹 앱에서는 코드가 호출하는 서버 함수 하나와, 그 안에서 특정 시점에 부르는 Claude API
호출 하나로 분해된다.

## 실행 환경 차이

| | 로컬 | Vercel |
|---|---|---|
| 파일과 쉘 | 있다 | 영구 파일시스템 없음 |
| 시간 | 제한 없음 | 서버리스 함수의 실행 시간 제한 |
| 사용자 | 나 혼자 | 멀티테넌트 |
| 승인 | 사람이 그 자리에서 | UI 승인 단계와 DB 상태로 |
| 상태 | 폴더 | Supabase |
```

- [x] **Step 3: 형식 문자열 대조**

Run (repo 루트, Git Bash):

```bash
cd .claude/skills/agent-to-webapp
for s in "## 수행한 단계" "## 판단이 필요했던 지점" "## 예상과 달라서 방식을 바꾼 지점" "워크플로우 × 확률론" "판정:" "### 단계 " "- 실행 주체:" "- 입력 스키마:" "- 출력 스키마:" "- 실패 처리:" "## 규칙화 불가" "## 모델" "## 입력 " "## 사람이 봤어야 할 것" "## 외부 서비스로 뺄 단계"; do
  grep -q -- "$s" references/prompts.md && grep -rq -- "$s" scripts/lib/ && echo "OK  $s" || echo "MISSING  $s"
done
```

Expected: 15줄 모두 `OK`

- [x] **Step 4: 커밋**

```bash
git add .claude/skills/agent-to-webapp/references/prompts.md .claude/skills/agent-to-webapp/references/decision-axes.md
git commit -m "docs: 프롬프트 실행판 다섯 개와 결정 축 표"
```

---

### Task 10: 단계별 절차 문서 (`phase-1.md` ~ `phase-5.md`)

**Files:**
- Create: `.claude/skills/agent-to-webapp/references/phase-1.md`, `phase-2.md`, `phase-3.md`, `phase-4.md`, `phase-5.md`

**Interfaces:**
- Consumes: Task 7 CLI 명령, Task 8 훅 경로, Task 9 프롬프트 번호
- Produces: SKILL.md(Task 13)가 "N단계에서는 `references/phase-N.md` 를 읽는다" 로 가리키는 문서. 각 문서는 "언제 읽나 / 할 일 / 게이트 / 멈출 곳" 네 절. 문서 안의 `$SKILL_DIR` 은 스킬이 로드될 때 Claude Code 가 알려주는 이 스킬의 기본 경로, `$APP` 은 작업 폴더 절대 경로, `$TARGET` 은 STATUS 의 target 을 절대 경로로 푼 것, `$A2W` 는 `$APP/docs/agent-to-webapp`

- [x] **Step 1: `phase-1.md` 작성**

````markdown
# 1단계 관찰

언제 읽나: STATUS 에 phase-1 통과 기록이 없을 때.

## 1. 입력 3종 제안

`$TARGET` 의 CLAUDE.md(AGENTS.md)와 skills 를 읽고 이 에이전트가 받는 입력이 무엇인지 파악한다.
아래 표를 채워 학습자에게 보인다. `--batch` 면 묻지 않고 그대로 쓴다.

| 종류 | 입력 | 왜 이것인가 |
|---|---|---|
| 쉬움 | 에이전트가 가장 자주 받는 전형적 입력 | 기준선 |
| 보통 | 필드가 하나쯤 다르거나 양이 많은 입력 | 순서가 유지되는지 |
| 예외 | 필수 정보가 빠졌거나 형식이 어긋난 입력 | 모델이 무엇을 알아서 처리하는지 드러낸다 |

학습자가 승인하거나 바꾸면 `$A2W/runs/inputs/` 에 입력 파일을 두고(폴더 하나에 하나씩. 이름은
`1-easy-<slug>/`, `2-normal-<slug>/`, `3-edge-<slug>/`) 위 표를 `$A2W/runs/inputs/README.md` 에 쓴다.
대상 프로젝트 안에 이미 있는 샘플 입력은 복사한다. 없으면 만든다.

## 2. 대상에 로컬 전용 파일 설치

대상의 git 추적 파일은 건드리지 않는다. 아래만 만든다. 이미 있으면 마커 블록만 덧붙인다.

### runtime: claude-code

`$TARGET/CLAUDE.local.md` 에 프롬프트 1(`references/prompts.md`)을 마커째 덧붙인다. `<A2W>` 를 `$A2W` 절대 경로로 바꾼다.

`$TARGET/.claude/settings.local.json` 에 `assets/hooks.claude.example.json` 의 내용을 합친다. 이미 있는 키는
보존하고 `hooks.PostToolUse` 배열과 `permissions.additionalDirectories` 배열에 항목을 추가한다.
`<SKILL_DIR>` 과 `<APP>` 은 절대 경로(슬래시 `/`)로 바꾼다.

`CLAUDE.local.md` 가 대상의 `.gitignore` 에 없으면 학습자에게 "untracked 로 보이지만 커밋되지 않는다. 원하면
.gitignore 에 추가하라" 고 알린다. 스킬이 `.gitignore` 를 고치지는 않는다.

### runtime: codex

`$TARGET/AGENTS.override.md` 에 프롬프트 1 을 마커째 덧붙인다.

`$TARGET/.codex/hooks.json` 에 `assets/hooks.codex.example.json` 을 합친다. Codex 훅의 stdin 페이로드가
Claude Code 와 같은지는 확인되지 않았다. 훅 스크립트는 낯선 필드를 raw 로 남기므로 그대로 둔다.

`~/.codex/config.toml` 에 아래를 추가하라고 학습자에게 안내한다(프로젝트 `.codex/config.toml` 을 지원하는
버전이면 거기).

```toml
[sandbox_workspace_write]
writable_roots = ["<APP 절대 경로>"]
```

## 3. 여기서 멈춘다

학습자에게 아래를 그대로 보여주고 스킬을 끝낸다. 스킬 세션에서 에이전트를 돌리지 않는다 — 스킬 컨텍스트가
있으면 에이전트 행동이 바뀐다.

```
이제 대상 폴더에서 새 세션을 3개 열어 한 번에 입력 하나씩 돌리세요.
  1. $TARGET 에서 claude (또는 codex) 를 새로 연다
  2. $A2W/runs/inputs/1-easy-…/ 의 입력으로 평소처럼 일을 시킨다
  3. 끝나면 세션을 닫고 2, 3 번 입력으로 반복한다
  세 번이 끝나면 $APP 에서 /agent-to-webapp 를 다시 부르세요.
```

## 4. 돌아왔을 때: 게이트

```
node $SKILL_DIR/scripts/check_phase.mjs 1
```

통과하면 STATUS 에 phase-1 이 기록된다. 경고에 "훅 기록 N개, run 파일 M개" 가 나오면 세션 하나가 중간에
끊겼거나 run 파일 번호가 어긋난 것이다. 짝이 맞는지 `runs/run-N.tools.jsonl` 의 첫 줄 시각과 run-N.md 의 내용을
대조하고, 틀리면 파일 이름을 바꿔 맞춘다. 실패하면 부족한 것을 학습자에게 알리고 멈춘다.
````

- [x] **Step 2: `phase-2.md` 작성**

````markdown
# 2단계 판정

언제 읽나: phase-1 통과, phase-2 미통과.

## 1. 서브에이전트에게 판정을 맡긴다

같은 세션이 자기 실행을 판정하면 관대해진다. Agent 도구(general-purpose)로 새 컨텍스트를 열고 프롬프트 2
(`references/prompts.md`)를 준다. `<A2W>` 와 `<TARGET>` 을 절대 경로로 바꾼다. 서브에이전트가 파일을 직접
읽고 `$A2W/verdict.md` 를 쓴다. 이 세션은 결과를 요약만 한다.

`references/decision-axes.md` 의 경로를 함께 주어 2×2 표의 뜻을 참조하게 한다.

## 2. 게이트

```
node $SKILL_DIR/scripts/check_phase.mjs 2
```

- 실패 "판정 줄" → verdict.md 마지막 줄을 `판정: …` 형식으로 고치라고 서브에이전트에 다시 시킨다
- 실패 "4번째 칸 항목이 있는데 고정 가능" → 서브에이전트에 조건부 또는 불가로 재판정시킨다. 사람이 판정을
  뒤집고 싶으면 아래 override
- 검사 통과 + "--approve 로 다시 실행" → 학습자에게 verdict.md 의 배정표와 판정 줄을 보여주고 동의를 묻는다.
  동의하면 `node $SKILL_DIR/scripts/check_phase.mjs 2 --approve`. `--batch` 면 묻지 않고 `--batch` 로 실행

## 3. 판정별 갈림

- 고정 가능 / 조건부 → 3단계로
- 고정 불가 → 게이트가 STATUS 에 종료를 적고 라우팅 안내를 출력한다. 그 안내를 학습자에게 그대로 전하고
  멈춘다. 3단계 이후 파일을 만들지 않는다

## 4. 사람이 판정을 뒤집을 때

학습자가 사유를 대면 `node $SKILL_DIR/scripts/check_phase.mjs 2 --approve --override "<사유>"`. 판정은
조건부 고정 가능으로 기록되고 사유가 STATUS log 에 남는다. 3단계 workflow.md 의 `## 조건` 에 그 사유를 적는다.
````

- [x] **Step 3: `phase-3.md` 작성**

````markdown
# 3단계 고정

언제 읽나: phase-2 통과(판정 고정 가능 또는 조건부), phase-3 미통과.

## 1. workflow.md 작성

이 세션이 직접 프롬프트 3(`references/prompts.md`)을 수행해 `$A2W/workflow.md` 를 쓴다. 조건부 판정이나
override 였으면 `## 조건` 을 첫머리에 둔다. 단계 간 데이터는 JSON 스키마 필수 — 4단계 스크립트가 이 스키마를
그대로 쓴다.

verdict.md 에서 "달랐던 단계" 로 분류된 것은 규칙으로 바꾸는 것을 먼저 시도한다. 안 되는 것은 `## 규칙화 불가`
에 적되 반드시 `→ LLM 단계 N` / `→ 사람 확인 지점 N` / `→ 재판정: 이유` 중 하나를 붙인다.

## 2. 게이트

```
node $SKILL_DIR/scripts/check_phase.mjs 3
```

- 실패 "재판정 필요" → 순서 자체가 흔들리는 항목이 있다. `node $SKILL_DIR/scripts/check_phase.mjs rollback 2`
  로 되돌리고 2단계를 다시 한다. 이번에는 서브에이전트에게 그 항목을 명시해서 준다
- 그 외 실패 → 빠진 필드를 채운다
- 검사 통과 + "--approve" 안내 → 학습자에게 단계 목록(번호·이름·실행 주체)과 규칙화 불가 항목을 보여주고 동의를
  묻는다. 동의하면 `--approve`. `--batch` 면 `--batch`

## 3. 멈출 곳

3단계 통과 후 4단계는 API 호출과 비용이 든다. `--batch` 가 아니면 "4단계는 Anthropic API 키와 Node 24 가
필요하고 입력 3개 × 단계 수만큼 호출한다" 고 알리고 계속할지 묻는다.
````

- [x] **Step 4: `phase-4.md` 작성**

````markdown
# 4단계 재검증

언제 읽나: phase-3 통과, phase-4 미통과.

## 1. 전제 확인

- `node --version` 이 24 이상. 아니면 멈추고 알린다(`.ts` 직접 실행이 안 된다)
- `ANTHROPIC_API_KEY` 가 환경에 있다. 없으면 멈추고 알린다. 키를 파일에 쓰지 않는다
- 모델은 `A2W_MODEL`, 기본 `claude-sonnet-5`. 로컬 에이전트가 다른 모델이었으면 차이의 원인이 모델일 수
  있으니 report 에 남긴다

## 2. verify/ 작성

프롬프트 4(`references/prompts.md`)를 이 세션이 수행한다. 구성은 고정이다.

```
$A2W/verify/
  package.json      {"name":"verify","private":true,"type":"module","dependencies":{"@anthropic-ai/sdk":"latest"}} + 단계에 꼭 필요한 순수 JS 패키지
  .gitignore        node_modules
  run.ts            입력 경로를 받아 steps 를 workflow.md 순서로 부르고 결과를 출력
  steps/<n>-<이름>.ts   단계당 export 함수 하나. 입출력 타입은 workflow.md 의 JSON 스키마
  report.md         실행 후 작성
```

`cd $A2W/verify && npm install` 뒤 `node run.ts <입력 폴더>` 로 입력 3개를 차례로 돌린다. 웹 앱 뼈대(Next.js,
app/, pages/)를 만들지 않는다. `child_process` 로 Python 을 부르지 않는다. TS 로 안 되는 단계는 report 의
`## 외부 서비스로 뺄 단계` 에 적고 그 단계는 입력을 그대로 통과시키는 stub 으로 둔다.

## 3. 게이트

```
node $SKILL_DIR/scripts/check_phase.mjs 4
```

통과는 형식만 본다. 세 입력의 차이가 허용 범위인지는 학습자가 판단한다. report 의 `## 입력 N` 세 절을 보여주고
"이 차이로 웹 앱을 만들어도 되는가" 를 묻는다(`--batch` 면 생략). 아니라고 하면 workflow.md 를 고치고
`rollback 3` 후 3단계부터 다시.
````

- [x] **Step 5: `phase-5.md` 작성**

````markdown
# 5단계 전환

언제 읽나: phase-4 통과, phase-5 미통과.

## 1. port-brief.md 작성

`references/port-brief-template.md` 를 `$A2W/port-brief.md` 로 복사하고 일곱 절을 채운다. 헤딩은 고치지 않는다.

- 3. 상태 저장: workflow.md 에 실행 주체 "사람" 단계가 있거나, report.md 의 실행 시간 합이 함수 제한(기본 60초로
  본다)을 넘으면 `Supabase`. 둘 다 아니면 `DB 없음` 이라고 첫 줄에 쓴다
- 5. 외부 서비스로 뺄 단계: report.md 의 같은 절을 옮기고 각 항목의 임시 처리를 적는다. 없으면 `- 없음`
- 6. 인증: "범위 밖. 단일 사용자 데모" 를 그대로 쓴다
- 스타일(선택) 절은 학습자가 원할 때만 채운다

## 2. 게이트

```
node $SKILL_DIR/scripts/check_phase.mjs 5
```

## 3. 대상 정리 안내

통과하면 학습자에게 아래를 안내한다. 스킬이 직접 지워도 된다(로컬 전용 파일이다).

- `$TARGET/CLAUDE.local.md`(또는 `AGENTS.override.md`)의 `<!-- agent-to-webapp:start -->` ~ `end` 블록 삭제
- `$TARGET/.claude/settings.local.json`(또는 `.codex/hooks.json`)의 훅 항목과 `additionalDirectories` 항목 삭제

## 4. 다음 세션

```
5단계 통과. 이제 $APP 에서 새 세션을 열고 아래를 붙여넣으세요.
(references/prompts.md 의 프롬프트 5 원문)
```

바이브 코딩은 이 스킬의 범위 밖이다. 배포 후에는 `references/deploy-checklist.md` 를 따른다.
````

- [x] **Step 6: 커밋**

```bash
git add .claude/skills/agent-to-webapp/references/phase-*.md
git commit -m "docs: 단계별 절차 문서 phase-1~5"
```

---
### Task 11: 브리프 틀과 배포 체크리스트 (`port-brief-template.md`, `deploy-checklist.md`)

**Files:**
- Create: `.claude/skills/agent-to-webapp/references/port-brief-template.md`
- Create: `.claude/skills/agent-to-webapp/references/deploy-checklist.md`
- Test: `tests/references.test.mjs`

**Interfaces:**
- Consumes: `BRIEF_HEADINGS` (Task 6). 틀의 일곱 헤딩은 이 배열과 글자 하나까지 같다
- Produces: 5단계가 복사해서 채우는 틀. 배포 뒤 학습자가 따르는 체크리스트

- [x] **Step 1: 실패하는 테스트 작성**

`tests/references.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { BRIEF_HEADINGS } from '../.claude/skills/agent-to-webapp/scripts/lib/phase5.mjs';

const REF = '.claude/skills/agent-to-webapp/references';

test('port-brief-template.md 는 BRIEF_HEADINGS 일곱 개를 순서대로 담는다', () => {
  const text = readFileSync(`${REF}/port-brief-template.md`, 'utf8');
  let last = -1;
  for (const h of BRIEF_HEADINGS) {
    const i = text.indexOf(`\n${h}\n`);
    assert.ok(i > last, `없거나 순서가 틀림: ${h}`);
    last = i;
  }
  assert.ok(text.includes('## 스타일 (선택)'));
});

test('deploy-checklist.md 가 있고 체크박스가 5개 이상', () => {
  const p = `${REF}/deploy-checklist.md`;
  assert.ok(existsSync(p));
  const boxes = readFileSync(p, 'utf8').match(/^- \[ \] /gm) ?? [];
  assert.ok(boxes.length >= 5, `${boxes.length}개`);
});
```

- [x] **Step 2: 실패 확인**

Run: `node --test "tests/*.test.mjs"references.test.mjs`
Expected: FAIL — `ENOENT … port-brief-template.md`

- [x] **Step 3: `port-brief-template.md` 작성**

```markdown
# 웹 앱 전환 브리프: <이름>

작성일: <YYYY-MM-DD> · 대상: <대상 경로> · 설계서: docs/agent-to-webapp/workflow.md · 검증: docs/agent-to-webapp/verify/report.md

이 문서는 같은 폴더의 다음 세션이 읽는 지시문이다. 헤딩은 고치지 않는다(게이트가 찾는다).

## 1. 서버 쪽 호출
Claude 를 부르는 코드와 API 키는 Route Handler 또는 Server Action 에만 둔다. 브라우저 번들에 키가 가지 않는다.
- LLM 단계: <workflow.md 의 LLM 단계 번호와 이름>
- 환경변수: ANTHROPIC_API_KEY (Vercel 프로젝트 설정), A2W_MODEL (선택)

## 2. 실행 시간 분할
Vercel 함수는 실행 시간 제한이 있다. report.md 의 단계별 시간을 적고 제한을 넘는 단계는 나눈다.
- 단계별 시간: <단계 N: n초 …>
- 나눌 단계: <없음 / 단계 N → 어떻게>

## 3. 상태 저장
<첫 줄에 `Supabase` 또는 `DB 없음`>
- 판단 근거: 사람 단계 <있음/없음> · 시간 합 <n초, 60초 초과 여부>
- Supabase 면: 테이블 `runs`(입력·상태·결과), `steps`(run_id·단계·상태·입출력 JSON). 단계 함수는 이전 단계의 출력 JSON 을 읽고 자기 출력을 쓴다. 이어 붙이기는 큐 또는 cron
- DB 없음이면: Route Handler 하나가 steps 를 순서대로 부르고 결과를 응답한다

## 4. 사람 확인 지점
<workflow.md 의 실행 주체 "사람" 단계. UI 승인 단계 + DB 상태(pending → approved)로 만든다. 없으면 "없음">

## 5. 외부 서비스로 뺄 단계
<report.md 의 같은 절을 옮기고 항목마다 임시 처리(stub·수동·외부 API)를 적는다. 없으면 `- 없음`>

## 6. 인증
범위 밖. 단일 사용자 데모. 로그인·멀티테넌트를 만들지 않는다.

## 7. 배포 후 검증
배포 뒤 `docs/agent-to-webapp/runs/inputs/` 3건을 웹 앱에 넣어 `verify/report.md` 와 비교한다. 절차는 `references/deploy-checklist.md`.

## 스타일 (선택)
<비워 두면 다음 세션이 기본 스타일로 만든다. 예: 라이트 모드 전용, 악센트 #2563EB, gradient·shadow 금지>
```

- [x] **Step 4: `deploy-checklist.md` 작성**

```markdown
# 배포 확인 체크리스트

5단계 뒤 바이브 코딩과 Vercel 배포가 끝났을 때 작업 폴더에서 따른다. 결과는
`docs/agent-to-webapp/deploy-report.md` 에 `verify/report.md` 와 같은 헤딩(`## 입력 1` ~ `## 입력 3`)으로 적는다.

- [ ] Vercel 환경변수에 `ANTHROPIC_API_KEY` 가 있다. Supabase 면 URL 과 키도
- [ ] 브라우저 번들에 키가 없다: 빌드 뒤 `grep -r "sk-ant" .next/static` 결과가 비어 있다
- [ ] `docs/agent-to-webapp/runs/inputs/` 의 3건을 배포된 앱에 차례로 넣었다
- [ ] 결과를 `deploy-report.md` 에 `verify/report.md` 의 같은 입력과 나란히 적었다
- [ ] 차이가 report.md 의 차이보다 크면 웹 개발 문제다(에이전트 설계 문제는 4단계에서 끝났다). 단계 분할·시간 제한·상태 저장 중 어디인지 좁혀 적었다
- [ ] 사람 단계가 있으면 UI 승인 없이는 다음 단계로 못 간다
- [ ] 외부 서비스로 뺀 단계가 있으면 stub 이 화면에 명시된다
- [ ] 대상 프로젝트의 로컬 전용 파일(`CLAUDE.local.md` 블록, `settings.local.json` 훅·additionalDirectories)을 지웠다
```

- [x] **Step 5: 통과 확인**

Run: `node --test "tests/*.test.mjs"references.test.mjs`
Expected: PASS 2 tests

- [x] **Step 6: 커밋**

```bash
git add tests/references.test.mjs .claude/skills/agent-to-webapp/references/port-brief-template.md .claude/skills/agent-to-webapp/references/deploy-checklist.md
git commit -m "docs: 브리프 틀과 배포 체크리스트"
```

---

### Task 12: 훅 등록 예시 (`assets/`)

**Files:**
- Create: `.claude/skills/agent-to-webapp/assets/hooks.claude.example.json`
- Create: `.claude/skills/agent-to-webapp/assets/hooks.codex.example.json`
- Test: `tests/assets.test.mjs`

**Interfaces:**
- Consumes: Task 8 의 `log_tool_use.mjs <logDir>` 호출 규약. logDir 은 `<APP>/docs/agent-to-webapp/runs/tools` (Task 2 의 `pairToolLogs` 가 읽는 곳)
- Produces: 1단계(phase-1.md)가 대상의 `.claude/settings.local.json` / `.codex/hooks.json` 에 합치는 JSON. `<SKILL_DIR>` 과 `<APP>` 은 스킬이 절대 경로(슬래시)로 치환한다
- Claude Code 훅 JSON 형식(확인됨): `hooks.PostToolUse[].hooks[] = { type: "command", command }`. `matcher` 를 생략하면 모든 도구. `permissions.additionalDirectories` 는 같은 파일에 둔다. Codex 는 "hooks.json 과 같은 이벤트 스키마" 라고만 확인돼 같은 모양으로 둔다(§14 열린 항목)

- [x] **Step 1: 실패하는 테스트 작성**

`tests/assets.test.mjs`:

```js
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
```

- [x] **Step 2: 실패 확인**

Run: `node --test "tests/*.test.mjs"assets.test.mjs`
Expected: FAIL — `ENOENT … hooks.claude.example.json`

- [x] **Step 3: 두 파일 작성**

`hooks.claude.example.json`:

```json
{
  "permissions": {
    "additionalDirectories": ["<APP>"]
  },
  "hooks": {
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"<SKILL_DIR>/scripts/log_tool_use.mjs\" \"<APP>/docs/agent-to-webapp/runs/tools\""
          }
        ]
      }
    ]
  }
}
```

`hooks.codex.example.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"<SKILL_DIR>/scripts/log_tool_use.mjs\" \"<APP>/docs/agent-to-webapp/runs/tools\""
          }
        ]
      }
    ]
  }
}
```

- [x] **Step 4: 통과 확인**

Run: `node --test "tests/*.test.mjs"assets.test.mjs`
Expected: PASS 3 tests

- [x] **Step 5: 커밋**

```bash
git add tests/assets.test.mjs .claude/skills/agent-to-webapp/assets/
git commit -m "feat: 훅 등록 예시 — Claude Code settings.local.json, Codex hooks.json"
```

---

### Task 13: SKILL.md

**Files:**
- Create: `.claude/skills/agent-to-webapp/SKILL.md`
- Test: `tests/skill_md.test.mjs`

**Interfaces:**
- Consumes: Task 7 CLI 명령, Task 10 의 `references/phase-N.md`, Task 9 의 프롬프트 번호
- Produces: Claude Code 가 로드하는 절차. 150줄 안쪽. `$ARGUMENTS` 로 대상 경로와 `--batch` 를 받는다
- 스킬이 로드될 때 Claude Code 는 "Base directory for this skill: <경로>" 를 알려준다. 본문은 그 값을 `$SKILL_DIR` 로 부른다

- [x] **Step 1: 실패하는 테스트 작성**

`tests/skill_md.test.mjs`:

```js
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
```

- [x] **Step 2: 실패 확인**

Run: `node --test "tests/*.test.mjs"skill_md.test.mjs`
Expected: FAIL — `ENOENT … SKILL.md`

- [x] **Step 3: `SKILL.md` 작성**

```markdown
---
name: agent-to-webapp
description: 로컬 에이전트(Claude Code·Codex)를 웹 앱으로 옮기기 전에 관찰→판정→고정→재검증→전환 다섯 단계를 게이트로 밟는다. Use when the user wants to turn a local Claude Code or Codex agent into a Next.js web app, says "웹 앱으로 만들자", "고정 가능한지 보자", "agent to webapp", or runs /agent-to-webapp <대상 경로> [--batch]. Run it from the sibling work folder <이름>-app/, not inside the agent project.
---

# agent-to-webapp

로컬 에이전트는 모델이 순서를 정한다. 웹 앱은 코드가 정한다. 옮기기 전에 그 순서를 고정할 수 있는지
관찰하고 판정하고 고정하고 재검증한 뒤 전환한다. 게이트를 건너뛰지 않는다.

이 파일이 있는 폴더가 `$SKILL_DIR`(로드될 때 "Base directory for this skill" 로 알려진 경로).
게이트는 `node $SKILL_DIR/scripts/check_phase.mjs …` 이고 항상 작업 폴더에서 실행한다.

## 이름

- `$APP`: 지금 열린 폴더. `<이름>-app/`. 나중에 웹 앱 repo 가 된다
- `$A2W`: `$APP/docs/agent-to-webapp`. 산출물은 전부 여기
- `$TARGET`: 전환할 에이전트 폴더. STATUS 의 `target`
- 런타임: `claude-code` 또는 `codex`. STATUS 의 `runtime`

## 원칙

- `$TARGET` 의 git 추적 파일은 건드리지 않는다. 1단계의 로컬 전용 파일만 만든다
- `$A2W/STATUS.md` 는 게이트 스크립트만 쓴다. 통과 선언을 스킬이 하지 않는다
- 게이트를 통과하기 전에 다음 단계 산출물을 만들지 않는다. 컨텍스트가 압축돼도 STATUS 부터 읽는다
- `$ARGUMENTS` 에 `--batch` 가 있으면 질문하지 않고, 승인 게이트도 `--batch` 로 넘긴다

## 시작

1. `node $SKILL_DIR/scripts/check_phase.mjs status`. STATUS 가 있으면 "재개" 로
2. 없으면 대상을 정한다: `$ARGUMENTS` 의 첫 경로 인자. 없으면 "전환할 에이전트 폴더가 어디인가" 를 묻는다
3. 런타임 판별: `CLAUDE.md` 또는 `.claude/skills/` → `claude-code`, `AGENTS.md` 또는 `.agents/skills/` → `codex`.
   둘 다 있으면 묻는다. 둘 다 없으면 로컬 에이전트가 아니라고 알리고 멈춘다
4. 도착지 확인 한 줄: "웹 앱이 도착지인가, 플러그인·cron·Slack 봇이 아닌가". 아니면 이 스킬의 대상이 아니라고 알리고 멈춘다
5. `git rev-parse --is-inside-work-tree` 가 실패할 때만 `$APP` 에서 `git init`
6. `node $SKILL_DIR/scripts/check_phase.mjs init --target <경로> --runtime <런타임>` 뒤 1단계로

## 단계

| 단계 | 읽을 문서 | 산출물 | 게이트 | 멈출 곳 |
|---|---|---|---|---|
| 1 관찰 | references/phase-1.md | runs/inputs/, runs/run-N.md | `check_phase.mjs 1` | 설치 뒤 스킬 종료. 학습자가 새 세션 3개를 돌린다 |
| 2 판정 | references/phase-2.md | verdict.md (서브에이전트가 씀) | `check_phase.mjs 2 --approve` | 학습자 승인. 고정 불가면 종료 |
| 3 고정 | references/phase-3.md | workflow.md | `check_phase.mjs 3 --approve` | 학습자 승인. 재판정이면 `rollback 2` |
| 4 재검증 | references/phase-4.md | verify/, verify/report.md | `check_phase.mjs 4` | 차이 허용 여부는 학습자 |
| 5 전환 | references/phase-5.md | port-brief.md | `check_phase.mjs 5` | 새 세션 안내 뒤 종료 |

각 단계는 그 단계의 `references/phase-N.md` 를 읽고 그대로 한다. 프롬프트 원문은 `references/prompts.md`,
2×2 표와 결정 축은 `references/decision-axes.md`, 브리프 틀은 `references/port-brief-template.md`,
배포 뒤는 `references/deploy-checklist.md`.

## 게이트 규칙

- 종료코드 0 통과, 1 실패, 2 사용법. 실패 메시지의 항목을 고친 뒤 다시 실행한다
- 2·3단계는 `--approve` 없이는 기록되지 않는다. 학습자에게 산출물을 보여주고 동의를 받은 뒤 붙인다
- 2단계 판정이 `고정 불가` 면 게이트가 STATUS 에 종료를 기록하고 라우팅 안내를 출력한다. 그대로 전하고 멈춘다.
  3단계 이후 파일을 만들지 않는다
- 사람이 판정을 뒤집을 때만 `--override "<사유>"`. 조건부 고정 가능으로 기록된다
- `rollback N` 은 N단계 이후 기록을 지운다. 3단계 "재판정", 4단계 차이 불허 때 쓴다

## 재개

STATUS 에 `terminated` 가 있으면 종료된 과제라고 알리고 멈춘다. phase-K 까지 통과면 K+1 단계 문서를 읽고
시작한다. phase-1 미통과인데 `$A2W/runs/` 에 run 파일이 있으면 학습자가 돌리고 돌아온 것이니 바로 1단계
게이트를 실행한다.

## 끝

5단계 통과 후 `$TARGET` 의 로컬 전용 파일 정리를 안내하고, 프롬프트 5 를 보여주고 끝낸다.
바이브 코딩은 다음 세션의 일이다.
```

- [x] **Step 4: 통과 확인**

Run: `node --test "tests/*.test.mjs"skill_md.test.mjs` 그리고 `node --test "tests/*.test.mjs"`
Expected: PASS. 전체 53 tests (Task 1~8: 46, Task 11: 2, Task 12: 3, Task 13: 2)

- [x] **Step 5: 커밋**

```bash
git add tests/skill_md.test.mjs .claude/skills/agent-to-webapp/SKILL.md
git commit -m "feat: SKILL.md — 시작·단계 표·게이트 규칙·재개"
```

---
### Task 14: 예제 준비 (`examples/`, `.gitignore`)

**Files:**
- Create: `.gitignore`
- Create: `examples/rfq-quote-generator/` (사본), `examples/competitor-review-crawler/` (사본)
- Create: `examples/rfq-quote-generator-app/docs/agent-to-webapp/STATUS.md` (init 으로), `examples/competitor-review-crawler-app/docs/agent-to-webapp/STATUS.md` (init 으로)

**Interfaces:**
- Consumes: Task 7 `init`
- Produces: Task 15·16 이 도는 두 쌍의 폴더. 원본 `.demo-projects` 는 그대로 둔다(§10 사본 규칙)
- 조사된 사실(2026-09-11): 두 원본 모두 `.git` 없음. rfq 는 1.7MB, 스킬 4개(`quote-calculator`, `reply-email-writer`, `rfq-spec-extractor`, `route-evaluator`), 샘플 입력 `input/NovaDrive/{customer_rfq_email.pdf, part_drawing_EV_input_shaft.pdf}`, 루트에도 같은 PDF 둘. 크롤러는 11MB 중 대부분이 `output/`

- [x] **Step 1: `.gitignore` 작성**

```
node_modules/
.env
.env.*
CLAUDE.local.md
AGENTS.override.md
.claude/settings.local.json
.codex/hooks.json
examples/*/output/
examples/*/.venv/
examples/*/__pycache__/
```

- [x] **Step 2: 원본 복사 (output 제외)**

Run (Git Bash, repo 루트):

```bash
SRC=/c/Users/byung/WorkOS/.demo-projects
mkdir -p examples
cp -r "$SRC/rfq-quote-generator" examples/rfq-quote-generator
cp -r "$SRC/competitor-review-crawler" examples/competitor-review-crawler
rm -rf examples/*/output examples/*/.venv examples/*/__pycache__ examples/*/node_modules
ls examples/rfq-quote-generator/.claude/skills examples/competitor-review-crawler/.claude/skills
test ! -d examples/rfq-quote-generator/.git && test ! -d examples/competitor-review-crawler/.git && echo NO_NESTED_GIT
du -sh examples/*
```

Expected: 스킬 폴더 4개 + 1개가 보이고 `NO_NESTED_GIT`. 크롤러 사본이 1MB 안쪽(11MB 는 output 이었다). Git Bash 에는 rsync 가 없으므로 cp 를 쓴다

- [x] **Step 3: 작업 폴더 둘을 init**

```bash
mkdir -p examples/rfq-quote-generator-app examples/competitor-review-crawler-app
( cd examples/rfq-quote-generator-app && node ../../.claude/skills/agent-to-webapp/scripts/check_phase.mjs init --target ../rfq-quote-generator --runtime claude-code )
( cd examples/competitor-review-crawler-app && node ../../.claude/skills/agent-to-webapp/scripts/check_phase.mjs init --target ../competitor-review-crawler --runtime claude-code )
cat examples/rfq-quote-generator-app/docs/agent-to-webapp/STATUS.md
```

Expected: 두 STATUS 에 `target: ../…`, `runtime: claude-code`. `examples/*-app/` 에 `.git` 을 만들지 않는다 — 모노레포 안이라 SKILL.md 의 `git rev-parse` 규칙이 건너뛴다

- [x] **Step 4: 커밋**

```bash
git add .gitignore examples/
git commit -m "chore: 예제 두 쌍 — rfq-quote-generator(고정 가능), competitor-review-crawler(고정 불가) 사본과 작업 폴더"
```

---

### Task 15: dogfood — 고정 가능 경로 (`rfq-quote-generator`)

사람이 끼는 태스크다. 서브에이전트가 아니라 **이 repo 를 연 사람과 세션이 함께** 한다. 스펙 §10 의 첫 행이
성공 기준이다. 발견한 문제는 스킬을 고쳐서 해결하고(Task 1~13 의 파일), 시행착오는 Step 8 에 적는다.

**위치(실행 중 변경).** Windows Git Bash 에서 `claude -p "/agent-to-webapp …"` 는 MSYS 경로 변환으로 첫 인자가 바뀐다. `MSYS_NO_PATHCONV=1` 을 붙인다. `examples/` 는 이 저장소 안이라 거기서 에이전트를 돌리면 저장소 CLAUDE.md 와 WorkOS
CLAUDE.md 가 관찰 세션에 섞인다. 저장소 밖(세션 스크래치)에 `.demo-projects` 사본과 `-app` 폴더를 새로 만들어
돌리고, 스킬은 유저 스코프 설치본(Task 17 Step 1 을 앞당김)을 쓴다. 관찰 세션은 `--setting-sources project,local`
로 사용자 전역 플러그인을 뺀다. 끝나면 `-app/docs/agent-to-webapp/` 만 `examples/<이름>-app/` 로 옮긴다. 아래
명령의 `examples/…` 는 그 바깥 폴더로 읽는다. Task 16 도 같다.

**Files:**
- Modify: `examples/rfq-quote-generator-app/docs/agent-to-webapp/**` (스킬이 만든다)
- Modify: `examples/rfq-quote-generator/CLAUDE.local.md`, `examples/rfq-quote-generator/.claude/settings.local.json` (스킬이 만들고 5단계 뒤 지운다. gitignore 됨)
- Create: `C:\Users\byung\LLM-Wiki\raw\practice\<오늘>_agent-to-webapp-dogfood-rfq.md`

**Interfaces:**
- Consumes: Task 13 까지 전부. 프로젝트 스킬은 하위 폴더에서 열어도 로드된다(확인됨)
- Produces: 학습자가 볼 완성 예시(`examples/rfq-quote-generator-app/docs/agent-to-webapp/`). 스킬 수정 커밋

- [x] **Step 1: 시작과 1단계 설치**

터미널에서 `cd examples/rfq-quote-generator-app && claude` 로 새 세션을 열고 `/agent-to-webapp ../rfq-quote-generator` 를 친다.

Expected: STATUS 가 이미 있으니 재개 → 1단계 문서를 읽고 입력 3종을 제안 → 승인 → `runs/inputs/` 세 폴더와
README.md → `../rfq-quote-generator/CLAUDE.local.md` 와 `.claude/settings.local.json` 생성 → "새 세션 3개" 안내
뒤 종료. 입력 3종은 아래로 승인한다(에이전트가 다르게 제안하면 아래로 바꾼다).

- `1-easy-novadrive/`: 원본 `input/NovaDrive/` 의 PDF 둘 복사
- `2-normal-helios/`: `customer_rfq_email.md` 를 새로 쓰고 도면은 `part_drawing_EV_input_shaft.pdf` 를 복사. 이메일 사양은 도면 ND-IS-042 Rev.A 와 맞춘다 — 첫 초안은 ECD·경도·흔들림이 도면과 달라 "보통" 이 두 번째 예외가 됐다(dogfood 1단계에서 스킬이 잡음)

```
From: Maria Keller <procurement@helios-motors.example>, Helios Motors GmbH
To: Sales Engineering Team, Dongwoo Dongam Technology (Wuxi)
Date: 2026-09-01
RFQ No.: HX-RFQ-2609-003
Subject: RFQ - Heat treatment for EV reducer input shaft (our P/N HX-2210, drawing ND-IS-042 Rev.A)

Hello,

Please quote carburizing heat treatment for the attached drawing ND-IS-042 Rev.A (our P/N HX-2210).
- Material: SCM420H, supplied by us after machining
- Quantity: first lot 2,500 pcs, then 5,000 pcs/month (12-month contract)
- Effective case depth: 0.45-0.65 mm @ HV550 on sections C and D, per drawing
- Surface hardness HRC 58-62, core hardness HRC 30-42, per drawing
- Total runout after heat treatment <= 0.03 mm with no grinding correction, per drawing. Press straightening after quench is acceptable
- Packing: returnable plastic trays with rust preventive oil
- PPAP level 3 required with the first shipment
- Target delivery: 6 weeks from PO

Please reply with the recommended process route, unit price, lead time and inspection items.

Best regards,
Maria Keller
```

- `3-edge-orion/`: `customer_rfq_email.md` 를 새로 쓰고 도면은 같은 PDF 복사. 수량·경도·납기가 없어 2단계(누락 스펙)와 에스컬레이션이 드러난다

```
From: buyer@orion-drivetrain.example
Subject: Quotation request - input shaft

Hi, please see the attached drawing and quote heat treatment per drawing.
Material is steel (to be confirmed by our engineering). Let us know what you need from us.
```

- [x] **Step 2: 세 번 돌린다 (사람)**

`cd examples/rfq-quote-generator && claude` 를 세 번, 매번 새 세션. 각 세션에서 한 줄:

```
../rfq-quote-generator-app/docs/agent-to-webapp/runs/inputs/1-easy-novadrive/ 의 RFQ 로 견적을 만들어줘
```

(2, 3 도 같은 형식). 파일 읽기·쓰기 권한 프롬프트가 나오면 허용한다. 각 세션 끝에 에이전트가 `run-N.md` 를 쓰는지
본다. 안 쓰면 "CLAUDE.local.md 의 기록 지시를 따라줘" 라고 한 번 더 시킨다 — 그 사실을 Step 8 에 적는다.

Expected: `examples/rfq-quote-generator-app/docs/agent-to-webapp/runs/` 에 `run-1.md`~`run-3.md` 와 `tools/*.jsonl` 3개

- [x] **Step 3: 1단계 게이트**

`cd examples/rfq-quote-generator-app && claude` → `/agent-to-webapp`.

Expected: 재개 → `check_phase.mjs 1` 통과 → `tools/*.jsonl` 이 `run-N.tools.jsonl` 로 짝지어짐 → 2단계로 이어감

- [x] **Step 4: 2단계**

Expected: 서브에이전트가 `verdict.md` 를 쓴다 → 게이트 → 학습자 승인 질문 → `--approve` → 통과. 판정은
`고정 가능` 또는 `조건부 고정 가능`(예외 입력의 에스컬레이션이 사람 확인으로 가면 조건부가 자연스럽다).
`고정 불가` 가 나오면 배정표를 읽고 근거가 맞는지 본다. 근거가 약하면 프롬프트 2 를 고친다(Task 9 파일).

- [x] **Step 5: 3단계**

Expected: `workflow.md` 에 Step 0~7 이 `### 단계 N:` 으로, 실행 주체는 스펙 추출·회신 초안이 LLM, 루트 판정·원가
계산이 코드(원본이 스크립트로 강제한다), 누락 스펙 에스컬레이션이 사람. 게이트 통과 → 승인.
파이썬 스크립트(`evaluate_routes.py`, `calculate_quote.py`)의 규칙이 `- 규칙:` 에 옮겨 적혀야 4단계에서 TS 로 다시
쓸 수 있다. 안 옮겨졌으면 프롬프트 3 에 "코드 단계의 규칙은 스크립트를 읽고 옮겨 적을 것" 을 더한다.

- [x] **Step 6: 4단계**

`ANTHROPIC_API_KEY` 가 환경에 있어야 한다. `node --version` 24 이상.

Expected: `verify/` 생성, `npm install`, 입력 3개 실행, `report.md`. PDF 는 Messages API 의 document 블록으로
넘긴다. xlsx 생성은 순수 JS 패키지(예: exceljs)로. 게이트 통과 → 차이 허용 질문 → 예.
파이썬 전용 의존이 남는 단계가 있으면 `## 외부 서비스로 뺄 단계` 에 나와야 한다. 이것이 스펙이 말하는
"문제가 아니라 정보" 다.

- [x] **Step 7: 5단계와 성공 기준**

Expected: `port-brief.md` 일곱 절, 게이트 통과, 대상 정리 안내, 프롬프트 5 안내.

성공 기준(§10) 확인:

```bash
cd examples/rfq-quote-generator-app
node ../../.claude/skills/agent-to-webapp/scripts/check_phase.mjs status
ls docs/agent-to-webapp docs/agent-to-webapp/verify docs/agent-to-webapp/runs
grep -c "^## 입력" docs/agent-to-webapp/verify/report.md
test ! -d .git && echo NO_NESTED_GIT
```

Expected: phase-1~5 모두 `passed`, 2·3 은 `approved`. `## 입력` 3개. `NO_NESTED_GIT`. 대상 폴더에
`CLAUDE.local.md` 의 마커 블록이 남아 있으면 지운다.

- [x] **Step 8: 시행착오 기록**

**결과(2026-09-11).** 1~5단계 통과. 파일명은 LLM-Wiki 규칙(`YYYY-MM-DD_Slug.md`, 영문 슬러그)에 맞춰
`raw/practice/2026-09-11_Agent-To-Webapp-Dogfood-RFQ.md` 로 썼다. 아래 틀보다 항목이 많다(결함 9개, 헤드리스 한계).

`C:\Users\byung\LLM-Wiki\raw\practice\<오늘>_agent-to-webapp-dogfood-rfq.md` 에 적는다. 위키에 직접 쓰지 않는다.

```markdown
# agent-to-webapp dogfood — rfq-quote-generator (고정 가능 경로)

날짜: <오늘>
- 판정: <고정 가능 / 조건부(조건)>
- 스킬을 고친 곳: <파일과 이유. 없으면 "없음">
- 게이트가 잡은 것: <실패 메시지와 원인>
- 게이트가 못 잡은 것: <사람이 봐야 했던 것>
- report.md 의 차이: <입력별 한 줄>
- 외부 서비스로 뺀 단계: <없음 / 단계와 이유>
- 학습자에게 어려울 곳: <한 줄씩>
```

- [x] **Step 9: 커밋**

```bash
git add examples/rfq-quote-generator-app/docs .claude/skills/agent-to-webapp tests
git commit -m "feat: dogfood 고정 가능 경로 — rfq-quote-generator 1~5단계 산출물과 스킬 수정"
```

---

### Task 16: dogfood — 고정 불가 경로 (`competitor-review-crawler`)

**건너뜀(2026-09-11, 사용자 결정).** 크롤링할 URL 3개를 정한 뒤 따로 돌린다. 그때까지 고정 불가 경로는 게이트
단위 테스트(2단계 고정 불가 → 종료·라우팅 안내·이후 단계 거부)로만 검증된 상태다. 돌릴 때는 Task 15 의 "위치" 와
`MSYS_NO_PATHCONV=1` 을 따른다.

사람이 끼는 태스크다. 스펙 §10 둘째 행이 성공 기준이다: 2단계에서 멈추고 STATUS 에 종료, 라우팅 안내,
3단계 이후 파일 없음.

**Files:**
- Modify: `examples/competitor-review-crawler-app/docs/agent-to-webapp/**`
- Modify: `examples/competitor-review-crawler/CLAUDE.local.md`, `.claude/settings.local.json` (스킬이 만든다)
- Create: `C:\Users\byung\LLM-Wiki\raw\practice\<오늘>_agent-to-webapp-dogfood-crawler.md`

**Interfaces:**
- Consumes: Task 15 까지
- Produces: 종료 경로의 완성 예시

- [ ] **Step 1: 대상 준비 (사람)**

`examples/competitor-review-crawler/` 의 `pyproject.toml` 대로 Python 의존을 설치한다(`uv sync` 또는 README 의 방법).
크롤러는 실제 사이트를 읽는다. 입력 3종은 URL 이다. `runs/inputs/N-…/url.txt` 에 한 줄씩:

- `1-easy-<도메인>/url.txt`: 로그인 없이 리뷰가 보이는 국내 쇼핑몰 상품 페이지 하나
- `2-normal-<도메인>/url.txt`: 페이지 구조가 다른 해외 쇼핑몰 상품 페이지 하나
- `3-edge-<도메인>/url.txt`: 로그인이나 captcha 가 걸리는 리뷰 페이지 하나(브라우저 핸드오프가 일어나는 것)

URL 은 사람이 고른다. 스킬이 제안한 입력 표를 이 셋으로 바꿔 승인한다.

- [ ] **Step 2: 시작과 1단계**

`cd examples/competitor-review-crawler-app && claude` → `/agent-to-webapp ../competitor-review-crawler`.

Expected: 재개 → 입력 3종 → 로컬 전용 파일 설치 → 종료 안내

- [ ] **Step 3: 세 번 돌린다 (사람)**

`cd examples/competitor-review-crawler && claude` 세 번. 각 세션:

```
../competitor-review-crawler-app/docs/agent-to-webapp/runs/inputs/1-easy-…/url.txt 의 리뷰를 수집해줘
```

3번 입력에서 브라우저 핸드오프가 나오면 지시대로 처리한다. 세션마다 `run-N.md` 가 생기는지 본다.

- [ ] **Step 4: 1·2단계**

`cd examples/competitor-review-crawler-app && claude` → `/agent-to-webapp`.

Expected: 1단계 게이트 통과 → 서브에이전트 판정 → 배정표에 `워크플로우 × 확률론` 행(셀렉터 매핑·sanity check
분기·핸드오프) → `판정: 고정 불가` → 승인 → 게이트가 `terminated` 기록 + 라우팅 안내 → 스킬이 멈춤.

판정이 `조건부` 로 나오면 배정표를 본다. 4번째 칸 행이 있는데 조건부면 게이트는 통과시킨다(규칙은 `고정 가능` 만
거부한다). 그것이 맞는 판정이면 §10 의 성공 기준을 "조건부 → 3단계에서 `→ 재판정` 으로 되돌아옴" 까지 넓혀야
하는지 Step 6 에 적는다. 서브에이전트가 우하단 항목을 못 잡았으면 프롬프트 2 를 고친다.

- [ ] **Step 5: 성공 기준**

```bash
cd examples/competitor-review-crawler-app
node ../../.claude/skills/agent-to-webapp/scripts/check_phase.mjs status
ls docs/agent-to-webapp
node ../../.claude/skills/agent-to-webapp/scripts/check_phase.mjs 3; echo "exit=$?"
```

Expected: STATUS 에 `terminated: 고정 불가 <날짜>`, `phase-2: passed … approved`. 폴더에 `workflow.md`·`verify/`·
`port-brief.md` 없음. 3단계 게이트는 `종료됨` 메시지와 `exit=1`.

- [ ] **Step 6: 시행착오 기록**

`C:\Users\byung\LLM-Wiki\raw\practice\<오늘>_agent-to-webapp-dogfood-crawler.md` 에 적는다. 위키에 직접 쓰지 않는다.

```markdown
# agent-to-webapp dogfood — competitor-review-crawler (고정 불가 경로)

날짜: <오늘>
- 판정: <고정 불가 / 조건부(조건)>
- 배정표의 4번째 칸 항목: <셀렉터 매핑·sanity check 분기·핸드오프 중 잡힌 것>
- 스킬을 고친 곳: <파일과 이유. 없으면 "없음">
- 게이트가 잡은 것: <실패 메시지와 원인>
- 게이트가 못 잡은 것: <사람이 봐야 했던 것>
- 라우팅 안내가 학습자에게 충분한가: <한 줄>
- 학습자에게 어려울 곳: <한 줄씩>
```

- [ ] **Step 7: 커밋**

```bash
git add examples/competitor-review-crawler-app/docs .claude/skills/agent-to-webapp tests
git commit -m "feat: dogfood 고정 불가 경로 — competitor-review-crawler 2단계 종료 산출물과 스킬 수정"
```

---

### Task 17: 유저 스코프 설치와 위키 되먹임

**Files:**
- Create: `~/.claude/skills/agent-to-webapp/` (복사)
- Modify: `C:\Users\byung\LLM-Wiki\wiki\vibe-coding\local-agent-to-web-app.md` (한 줄 추가)
- Modify: `docs/superpowers/specs/2026-09-11-agent-to-webapp-design.md` §14 (닫힌 항목 정리)

**Interfaces:**
- Consumes: Task 15·16 통과
- Produces: 다른 폴더에서 `/agent-to-webapp` 가 불리는 상태. 위키 포인터

- [x] **Step 1: 복사 설치**

**실행 중 변경.** 설치는 `node .claude/skills/agent-to-webapp/scripts/install.mjs` 로 한다. 설치된 쪽의 `.env`(사용자
API 키)를 지우지도 덮지도 않는다. 아래 `rm -rf` 와 `cp -r` 은 쓰지 않는다.

```bash
rm -rf ~/.claude/skills/agent-to-webapp
cp -r .claude/skills/agent-to-webapp ~/.claude/skills/agent-to-webapp
ls ~/.claude/skills/agent-to-webapp ~/.claude/skills/agent-to-webapp/scripts/lib
```

Expected: SKILL.md, references/, scripts/(check_phase.mjs, log_tool_use.mjs, lib/), assets/

- [x] **Step 2: 유저 스코프 호출 확인 (사람)**

repo 밖의 아무 폴더(예: `C:\Users\byung\WorkOS\.lab\a2w-smoke-app`)를 만들어 `claude` 를 열고 `/agent-to-webapp` 만
친다.

Expected: 스킬이 로드되고 "전환할 에이전트 폴더가 어디인가" 를 묻는다. 여기서 종료한다(대상을 주지 않는다).
스킬 목록에 `agent-to-webapp` 가 두 번(프로젝트·유저) 보이는 것은 repo 안에서만이고 정상이다.

- [x] **Step 3: 위키 포인터**

**실행 중 변경.** LLM-Wiki CLAUDE.md 가 위키 직접 편집을 금한다(`raw/practice/` 에 먼저 쓰고 `/wiki-ingest`).
포인터 한 줄은 직접 달지 않고 Task 15 의 `raw/practice/` 노트에 요청으로 넣었다. `raw/` 는 저장 뒤 수정하지 않으므로
노트는 4·5단계가 정리된 뒤 한 번 쓴다. `/wiki-ingest` 는 "왜 들이나" 를 되묻는 사람 단계라 사용자가 돌린다.

`C:\Users\byung\LLM-Wiki\wiki\vibe-coding\local-agent-to-web-app.md` 의 `## 프롬프트 네 개` 절 첫 줄에 한 줄을 넣는다:

```
> 실행판은 agent-to-webapp 스킬(`workos/agent-to-webapp/.claude/skills/agent-to-webapp/references/prompts.md`)이다. 여기 원문은 보존한다.
```

Task 15·16 의 `raw/practice/` 두 파일은 `/wiki-ingest` 로 컴파일한다(LLM-Wiki 폴더에서).

- [x] **Step 4: 스펙 §14 정리**

`docs/superpowers/specs/2026-09-11-agent-to-webapp-design.md` §14 에서 dogfood 로 닫힌 항목(Codex 훅 페이로드는
Codex 대상으로 돌리기 전엔 열려 있음, `additionalDirectories` 실측, create-next-app 허용 목록, 합성 입력)을
확인된 사실로 바꾸거나 지운다. §15 검토 이력에 "dogfood 두 경로 통과 <날짜>" 를 더한다.

- [x] **Step 5: 커밋**

```bash
git add docs/superpowers/specs/2026-09-11-agent-to-webapp-design.md
git commit -m "docs: dogfood 결과로 §14 열린 항목 정리, 유저 스코프 설치 완료"
```

LLM-Wiki 는 자체 repo 라 거기서 따로 커밋한다.

---

## 실행 순서와 병렬 가능성

- Task 1 → 2 → 3 → 4 → 5 → 6 → 7 은 순서대로(7 이 앞 전부를 잇는다). 3·4·5·6 은 서로 독립이라 2 뒤에 병렬 가능
- Task 8 은 Task 2 뒤 언제든
- Task 9 → 10 → 11 → 12 → 13 은 스크립트 상수를 참조하므로 Task 7 뒤. 9·11·12 는 서로 독립
- Task 14 는 Task 7 뒤. Task 15 → 16 → 17 은 순서대로, 사람이 낀다
