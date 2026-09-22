# agent-to-webapp-lite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정식 `agent-to-webapp` 옆에 형제 스킬 `agent-to-webapp-lite` 를 만든다. 옮겨가는 단위가 에이전트 전체가 아니라 「출력 데이터」(dashboard 모드) 또는 「스킬 하나」(skill 모드)인 경우를 같은 5단계 게이트로 다룬다.

**Architecture:** 스킬 하나에 `--mode dashboard|skill`. 게이트 CLI `check_lite.mjs` 가 STATUS 를 쓰는 유일한 주체이고, 단계 검사는 `lib/phase1.mjs`~`phase5.mjs` 의 `checkPhaseN(liteDir, { mode, … })` 가 모드로 분기한다. 게이트는 문서의 글이 아니라 산출물(열 표·출력 JSON)을 직접 파싱해 판정한다. 정식 스킬 파일은 `install.mjs` 외에 바뀌지 않는다.

**Tech Stack:** Node 24, ESM(`.mjs`), `node:test` + `node:assert/strict`. 의존성 없음. 마크다운 검사는 파서가 아니라 줄 단위 검사.

**Spec:** `docs/superpowers/specs/2026-09-22-agent-to-webapp-lite-design.md`

## Global Constraints

- 산출물 폴더는 `docs/agent-to-webapp-lite` (`LITE_DIR`). 정식의 `docs/agent-to-webapp` 와 다르다
- STATUS.md 는 `check_lite.mjs` 만 쓴다. 모델도 다른 스크립트도 쓰지 않는다
- 종료코드: 0 통과 / 1 실패 / 2 사용법 오류
- 2·3단계는 `--approve` 없이 통과를 기록하지 않는다. `--batch` 면 승인 없이 넘긴다
- 모든 사용자 대면 문자열은 한국어. 파일은 LF, UTF-8
- API 키를 읽거나 요구하지 않는다. `key` 명령이 없고 `.env` 를 만들지 않는다
- 정식 스킬(`.claude/skills/agent-to-webapp/`)의 파일은 `scripts/install.mjs` 외에 수정 금지. 기존 `tests/*.test.mjs` 도 수정 금지
- 각 Task 끝에 `node --test "tests/*.test.mjs"` 전체가 통과해야 한다
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

### Task 1: lite STATUS

**Files:**
- Create: `.claude/skills/agent-to-webapp-lite/scripts/lib/status.mjs`
- Modify: `tests/helpers.mjs` (끝에 상수 한 줄 추가)
- Test: `tests/lite_status.test.mjs`

**Interfaces:**
- Produces: `LITE_DIR`, `STATUS_FILE`, `MODES`, `DEFAULT_SAMPLES`, `today()`, `statusPath(appDir)`, `emptyStatus(target, mode, {output, skill, samples})`, `parseStatus(text)`, `formatStatus(st)`, `readStatus(appDir)`, `writeStatus(appDir, st)`
- STATUS 객체 모양: `{ target, mode, created, output, skill, samples, phases, terminated, log }`. `phases` 는 `{ [1-5]: { passed: 'YYYY-MM-DD', approved: boolean } }`

- [ ] **Step 1: helpers 에 lite 폴더 상수 추가**

`tests/helpers.mjs` 끝에 한 줄 추가한다. 기존 `A2W` 줄은 건드리지 않는다.

```js
export const LITE = 'docs/agent-to-webapp-lite';
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`tests/lite_status.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeApp, LITE } from './helpers.mjs';
import {
  LITE_DIR, MODES, DEFAULT_SAMPLES,
  emptyStatus, parseStatus, formatStatus, readStatus, writeStatus,
} from '../.claude/skills/agent-to-webapp-lite/scripts/lib/status.mjs';

test('LITE_DIR 은 정식 폴더와 다르다', () => {
  assert.equal(LITE_DIR.split(/[\\/]/).join('/'), LITE);
  assert.deepEqual(MODES, ['dashboard', 'skill']);
  assert.equal(DEFAULT_SAMPLES, 5);
});

test('emptyStatus: dashboard 는 output 을, skill 은 skill·samples 를 든다', () => {
  const d = emptyStatus('../x', 'dashboard', { output: '../x/out/sales.csv' });
  assert.equal(d.mode, 'dashboard');
  assert.equal(d.output, '../x/out/sales.csv');
  assert.equal(d.skill, null);
  assert.equal(d.samples, DEFAULT_SAMPLES);
  assert.match(d.created, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(d.phases, {});
  assert.equal(d.terminated, null);
  assert.deepEqual(d.log, []);
  const s = emptyStatus('../y', 'skill', { skill: 'invoice-parser', samples: 3 });
  assert.equal(s.skill, 'invoice-parser');
  assert.equal(s.samples, 3);
  assert.equal(s.output, null);
});

test('formatStatus → parseStatus 왕복 (dashboard)', () => {
  const st = emptyStatus('../x', 'dashboard', { output: '../x/out.csv' });
  st.phases[1] = { passed: '2026-09-22', approved: false };
  st.phases[2] = { passed: '2026-09-22', approved: true };
  st.terminated = '고정 불가 2026-09-22';
  st.log.push('2026-09-22 init');
  const text = formatStatus(st);
  assert.ok(text.startsWith('# agent-to-webapp-lite STATUS\n'));
  assert.ok(text.includes('\nmode: dashboard\n'));
  assert.ok(text.includes('\noutput: ../x/out.csv\n'));
  assert.ok(!text.includes('\nskill:'), 'dashboard 는 skill 줄을 쓰지 않는다');
  assert.ok(text.includes('phase-2: passed 2026-09-22 approved\n'));
  assert.ok(text.includes('phase-3:\n'));
  assert.ok(!text.includes('\r'));
  assert.deepEqual(parseStatus(text), st);
});

test('formatStatus → parseStatus 왕복 (skill)', () => {
  const st = emptyStatus('../y', 'skill', { skill: 'invoice-parser', samples: 3 });
  const text = formatStatus(st);
  assert.ok(text.includes('\nskill: invoice-parser\n'));
  assert.ok(text.includes('\nsamples: 3\n'));
  assert.ok(!text.includes('\noutput:'), 'skill 은 output 줄을 쓰지 않는다');
  assert.deepEqual(parseStatus(text), st);
});

test('parseStatus: CRLF 와 없는 줄을 견딘다', () => {
  const st = parseStatus('target: ../a\r\nmode: skill\r\ncreated: 2026-01-01\r\nphase-1:\r\nphase-2: passed 2026-01-02\r\n');
  assert.equal(st.target, '../a');
  assert.equal(st.mode, 'skill');
  assert.equal(st.samples, DEFAULT_SAMPLES, '없는 samples 줄은 기본값');
  assert.equal(st.output, null);
  assert.deepEqual(st.phases, { 2: { passed: '2026-01-02', approved: false } });
});

test('readStatus/writeStatus: 파일 위치와 없을 때 null', () => {
  const app = makeApp('a2wl-');
  assert.equal(readStatus(app), null);
  writeStatus(app, emptyStatus('../t', 'dashboard', { output: '../t/o.csv' }));
  assert.ok(existsSync(join(app, LITE_DIR, 'STATUS.md')));
  assert.ok(readFileSync(join(app, LITE_DIR, 'STATUS.md'), 'utf8').includes('target: ../t'));
  assert.equal(readStatus(app).mode, 'dashboard');
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `node --test "tests/lite_status.test.mjs"`
Expected: FAIL — `Cannot find module …/agent-to-webapp-lite/scripts/lib/status.mjs`

- [ ] **Step 4: 구현**

`.claude/skills/agent-to-webapp-lite/scripts/lib/status.mjs`:

```js
// lite STATUS.md 읽기·쓰기. 이 파일을 쓰는 것은 check_lite.mjs 뿐이다. 모델은 쓰지 않는다.
// 정식 스킬의 status.mjs 와 필드가 다르다(mode·output·skill·samples). 그래서 공유하지 않고 따로 둔다.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const LITE_DIR = join('docs', 'agent-to-webapp-lite');
export const STATUS_FILE = 'STATUS.md';
export const MODES = ['dashboard', 'skill'];
// skill 모드에서 관찰할 샘플 수. 워크숍 기본값.
export const DEFAULT_SAMPLES = 5;

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function statusPath(appDir) {
  return join(appDir, LITE_DIR, STATUS_FILE);
}

export function emptyStatus(target, mode, { output = null, skill = null, samples = DEFAULT_SAMPLES } = {}) {
  return { target, mode, created: today(), output, skill, samples, phases: {}, terminated: null, log: [] };
}

export function parseStatus(text) {
  const st = { target: null, mode: null, created: null, output: null, skill: null, samples: DEFAULT_SAMPLES, phases: {}, terminated: null, log: [] };
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
    } else if (key === 'target' || key === 'mode' || key === 'created' || key === 'output' || key === 'skill') {
      st[key] = value || null;
    } else if (key === 'samples') {
      const n = Number(value);
      if (Number.isInteger(n) && n >= 1) st.samples = n;
    }
  }
  return st;
}

export function formatStatus(st) {
  const lines = ['# agent-to-webapp-lite STATUS', '', `target: ${st.target}`, `mode: ${st.mode}`];
  // 모드에 해당하는 줄만 쓴다. 파서는 없는 줄을 기본값으로 읽는다.
  if (st.mode === 'dashboard') lines.push(`output: ${st.output ?? ''}`);
  if (st.mode === 'skill') lines.push(`skill: ${st.skill ?? ''}`, `samples: ${st.samples ?? DEFAULT_SAMPLES}`);
  lines.push(`created: ${st.created}`);
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

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — lite_status 6건 포함 전부 통과. 기존 테스트도 그대로 통과한다

- [ ] **Step 6: 커밋**

```bash
git add .claude/skills/agent-to-webapp-lite/scripts/lib/status.mjs tests/lite_status.test.mjs tests/helpers.mjs
git commit -m "feat(lite): STATUS 읽기·쓰기 — mode 로 갈리는 필드, 정식 status.mjs 무변경"
```

---

### Task 2: 정식 스킬에서 복사하는 두 파일

**Files:**
- Create: `.claude/skills/agent-to-webapp-lite/scripts/lib/md.mjs` (정식에서 바이트 그대로 복사)
- Create: `.claude/skills/agent-to-webapp-lite/references/decision-axes.md` (정식에서 바이트 그대로 복사)
- Test: `tests/lite_shared.test.mjs`

**Interfaces:**
- Produces: `normalize(text)`, `isBlank(s)`, `hasHeading(text, heading)`, `sectionBody(text, heading)` — 정식 `md.mjs` 와 같은 함수. 이후 모든 phase 모듈이 여기서 가져다 쓴다

**왜 복사인가:** 학습자가 스킬 하나만 설치할 수 있어 상대 경로 참조가 끊긴다(기획서 §2-6). 드리프트는 이 Task 의 동일성 테스트가 막는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/lite_shared.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// lite 는 설치본이 혼자서도 돌아야 해서 이 둘을 복사해 갖는다. 복사본이 원본에서 어긋나면 여기서 잡는다.
const PAIRS = [
  ['.claude/skills/agent-to-webapp/scripts/lib/md.mjs', '.claude/skills/agent-to-webapp-lite/scripts/lib/md.mjs'],
  ['.claude/skills/agent-to-webapp/references/decision-axes.md', '.claude/skills/agent-to-webapp-lite/references/decision-axes.md'],
];

for (const [src, dst] of PAIRS) {
  test(`복사본이 원본과 바이트 동일: ${dst}`, () => {
    assert.deepEqual(readFileSync(dst), readFileSync(src), `${src} 를 ${dst} 로 다시 복사하라`);
  });
}

test('lite md.mjs 가 정식과 같은 함수를 내보낸다', async () => {
  const lite = await import('../.claude/skills/agent-to-webapp-lite/scripts/lib/md.mjs');
  for (const name of ['normalize', 'isBlank', 'hasHeading', 'sectionBody']) {
    assert.equal(typeof lite[name], 'function', name);
  }
  assert.equal(lite.sectionBody('## a\nx\n## b\ny', '## a'), 'x');
  assert.equal(lite.sectionBody('## a\nx', '## z'), null);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test "tests/lite_shared.test.mjs"`
Expected: FAIL — `ENOENT` (복사본이 아직 없다)

- [ ] **Step 3: 복사한다**

```bash
mkdir -p .claude/skills/agent-to-webapp-lite/scripts/lib .claude/skills/agent-to-webapp-lite/references
cp .claude/skills/agent-to-webapp/scripts/lib/md.mjs .claude/skills/agent-to-webapp-lite/scripts/lib/md.mjs
cp .claude/skills/agent-to-webapp/references/decision-axes.md .claude/skills/agent-to-webapp-lite/references/decision-axes.md
```

손으로 고치지 않는다. 내용을 바꿔야 하면 정식 원본을 고치고 다시 복사한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — lite_shared 3건 포함 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/agent-to-webapp-lite/scripts/lib/md.mjs .claude/skills/agent-to-webapp-lite/references/decision-axes.md tests/lite_shared.test.mjs
git commit -m "feat(lite): md.mjs·decision-axes.md 복사와 동일성 테스트 — 설치본 독립성"
```

---

### Task 3: 증거 파서 (`schema.mjs`)

**Files:**
- Create: `.claude/skills/agent-to-webapp-lite/scripts/lib/schema.mjs`
- Test: `tests/lite_schema.test.mjs`

**Interfaces:**
- Consumes: `./md.mjs` 의 `sectionBody`, `normalize` (Task 2)
- Produces:
  - `parseColumnTable(text, heading)` → `[{ name, type }]` — 표의 첫 줄(머리글)과 구분선은 버린다
  - `diffColumns(a, b)` → `{ added: string[], removed: string[], typeChanged: [{ name, from, to }] }`
  - `jsonBlockAfter(text, heading)` → 파싱된 객체 또는 `null`
  - `topKeys(value)` → 정렬된 최상위 키 배열. 객체가 아니면 `[]`
  - `intersectKeys(keySets)` → 모든 집합에 공통인 키(정렬). 빈 목록이면 `[]`
  - `sameKeySets(keySets)` → 모두 같으면 `true`
  - `readJson(path)` → `{ ok: true, value }` 또는 `{ ok: false, why }`

**이 모듈이 있는 이유:** 게이트가 보고서의 문장이 아니라 산출물 자체를 읽어야 한다(기획서 §2-10). 두 모드의 증거 검사가 전부 여기를 지난다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/lite_schema.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseColumnTable, diffColumns, jsonBlockAfter, topKeys, intersectKeys, sameKeySets, readJson,
} from '../.claude/skills/agent-to-webapp-lite/scripts/lib/schema.mjs';

const TABLE = [
  '## 출처', 'out/sales.csv', '',
  '## 열', '',
  '| 열 | 타입 | 예시값 | 빈 값 비율 |',
  '|---|---|---|---|',
  '| channel | 문자열 | 스마트스토어 | 0% |',
  '| revenue | 정수 | 1250000 | 0% |',
  '| note | 문자열 | 재고 확인 필요 | 40% |',
  '',
  '## 행 수', '412',
].join('\n');

test('parseColumnTable: 머리글과 구분선을 버리고 이름·타입을 뽑는다', () => {
  const cols = parseColumnTable(TABLE, '## 열');
  assert.deepEqual(cols, [
    { name: 'channel', type: '문자열' },
    { name: 'revenue', type: '정수' },
    { name: 'note', type: '문자열' },
  ]);
});

test('parseColumnTable: 절이 없거나 표가 없으면 빈 배열', () => {
  assert.deepEqual(parseColumnTable(TABLE, '## 없는절'), []);
  assert.deepEqual(parseColumnTable('## 열\n표가 없다\n', '## 열'), []);
});

test('diffColumns: 추가·삭제·타입 변경', () => {
  const a = [{ name: 'channel', type: '문자열' }, { name: 'revenue', type: '정수' }, { name: 'note', type: '문자열' }];
  const b = [{ name: 'channel', type: '문자열' }, { name: 'revenue', type: '문자열' }, { name: 'orders', type: '정수' }];
  assert.deepEqual(diffColumns(a, b), {
    added: ['orders'],
    removed: ['note'],
    typeChanged: [{ name: 'revenue', from: '정수', to: '문자열' }],
  });
});

test('jsonBlockAfter: 헤딩 다음 json 블록을 파싱한다', () => {
  const t = '## 출력 스키마\n\n```json\n{ "barcode": "문자열", "items": "배열" }\n```\n\n## 실패 처리\n- 멈춘다\n';
  assert.deepEqual(jsonBlockAfter(t, '## 출력 스키마'), { barcode: '문자열', items: '배열' });
  assert.equal(jsonBlockAfter(t, '## 실패 처리'), null, '블록이 없으면 null');
  assert.equal(jsonBlockAfter('## a\n```json\n{ 깨진\n```\n', '## a'), null, '깨진 JSON 은 null');
});

test('topKeys·intersectKeys·sameKeySets', () => {
  assert.deepEqual(topKeys({ b: 1, a: 2 }), ['a', 'b']);
  assert.deepEqual(topKeys([1, 2]), [], '배열은 최상위 키가 없다');
  assert.deepEqual(topKeys(null), []);
  assert.deepEqual(intersectKeys([['a', 'b', 'c'], ['a', 'c'], ['c', 'a']]), ['a', 'c']);
  assert.deepEqual(intersectKeys([]), []);
  assert.equal(sameKeySets([['a', 'b'], ['b', 'a']]), true);
  assert.equal(sameKeySets([['a', 'b'], ['a']]), false);
});

test('readJson: 없는 파일과 깨진 JSON 을 이유와 함께 돌려준다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'a2wl-json-'));
  assert.equal(readJson(join(dir, 'none.json')).ok, false);
  writeFileSync(join(dir, 'bad.json'), '{ 깨진', 'utf8');
  const bad = readJson(join(dir, 'bad.json'));
  assert.equal(bad.ok, false);
  assert.match(bad.why, /JSON/);
  writeFileSync(join(dir, 'ok.json'), '{"a":1}', 'utf8');
  assert.deepEqual(readJson(join(dir, 'ok.json')), { ok: true, value: { a: 1 } });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test "tests/lite_schema.test.mjs"`
Expected: FAIL — `Cannot find module …/lib/schema.mjs`

- [ ] **Step 3: 구현**

`.claude/skills/agent-to-webapp-lite/scripts/lib/schema.mjs`:

```js
// 게이트가 보고서의 글 대신 산출물 자체를 읽는 곳. 열 표 파싱, 열 diff, 출력 JSON 의 키 집합.
import { existsSync, readFileSync } from 'node:fs';
import { normalize, sectionBody } from './md.mjs';

const isSeparator = (cells) => cells.every(c => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')));

// '| a | b |' → ['a','b']. 표 줄이 아니면 null.
function rowCells(line) {
  const l = line.trim();
  if (!l.startsWith('|')) return null;
  const inner = l.endsWith('|') ? l.slice(1, -1) : l.slice(1);
  return inner.split('|').map(c => c.trim());
}

// heading 절의 표에서 { name, type } 을 뽑는다. 첫 줄은 머리글, 구분선(|---|)은 버린다.
export function parseColumnTable(text, heading) {
  const body = sectionBody(normalize(text), heading);
  if (body === null) return [];
  const rows = [];
  for (const line of body.split('\n')) {
    const cells = rowCells(line);
    if (!cells || cells.length < 2 || isSeparator(cells)) continue;
    rows.push(cells);
  }
  // 머리글 한 줄을 버린다. 표가 머리글뿐이면 열이 없다.
  return rows.slice(1).map(c => ({ name: c[0].replace(/[`*]/g, '').trim(), type: c[1].replace(/[`*]/g, '').trim() }));
}

export function diffColumns(a, b) {
  const byName = (list) => new Map(list.map(c => [c.name, c.type]));
  const A = byName(a);
  const B = byName(b);
  const added = [...B.keys()].filter(n => !A.has(n));
  const removed = [...A.keys()].filter(n => !B.has(n));
  const typeChanged = [];
  for (const [n, from] of A) {
    const to = B.get(n);
    if (to !== undefined && to !== from) typeChanged.push({ name: n, from, to });
  }
  return { added, removed, typeChanged };
}

// heading 절 안의 첫 json 코드 블록. 없거나 깨지면 null.
export function jsonBlockAfter(text, heading) {
  const body = sectionBody(normalize(text), heading);
  if (body === null) return null;
  const m = body.match(/```json[^\n]*\n([\s\S]*?)\n\s*```/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

export function topKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value).sort();
}

export function intersectKeys(keySets) {
  if (keySets.length === 0) return [];
  return keySets.reduce((acc, ks) => acc.filter(k => ks.includes(k))).slice().sort();
}

export function sameKeySets(keySets) {
  if (keySets.length < 2) return true;
  const first = [...keySets[0]].sort().join('\u0000');
  return keySets.every(ks => [...ks].sort().join('\u0000') === first);
}

export function readJson(path) {
  if (!existsSync(path)) return { ok: false, why: '파일이 없다' };
  try { return { ok: true, value: JSON.parse(readFileSync(path, 'utf8')) }; }
  catch (e) { return { ok: false, why: `JSON 으로 읽히지 않는다: ${e.message}` }; }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — lite_schema 6건 포함 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/agent-to-webapp-lite/scripts/lib/schema.mjs tests/lite_schema.test.mjs
git commit -m "feat(lite): 증거 파서 — 열 표·열 diff·출력 JSON 키 집합"
```

---

### Task 4: 1단계 관찰 게이트

**Files:**
- Create: `.claude/skills/agent-to-webapp-lite/scripts/lib/phase1.mjs`
- Test: `tests/lite_phase1.test.mjs`

**Interfaces:**
- Consumes: `./md.mjs` 의 `hasHeading`·`sectionBody`·`isBlank`, `./schema.mjs` 의 `parseColumnTable`·`readJson`, `./status.mjs` 의 `DEFAULT_SAMPLES`
- Produces:
  - `SCHEMA_HEADINGS` = `['## 출처','## 열','## 행 수','## 유일 키 후보','## 갱신 시각 열','## LLM 문장 열','## 민감 열 후보']`
  - `COLUMN_HEADING` = `'## 열'`
  - `RUN_HEADINGS` = `['## 수행한 단계','## 판단이 필요했던 지점','## 예상과 달라서 방식을 바꾼 지점','## 샘플별 기록']`
  - `SAMPLE_OUTPUT` = `'output.json'`
  - `schemaFile(n)` → `'runs/run-<n>.schema.md'`, `sampleDir(k)` → `'runs/sample-<k>'`
  - `checkPhase1(liteDir, { mode, samples })` → `{ ok, errors, warnings, notes }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/lite_phase1.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, LITE } from './helpers.mjs';
import { checkPhase1, SCHEMA_HEADINGS, RUN_HEADINGS } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase1.mjs';

const lite = (app) => join(app, LITE);

// 통과하는 dashboard 스키마 문서 한 벌
export function goodSchema() {
  return [
    '## 출처', 'out/sales.csv (시트 "채널매출" 내보내기)', '',
    '## 열', '',
    '| 열 | 타입 | 예시값 | 빈 값 비율 |',
    '|---|---|---|---|',
    '| channel | 문자열 | 스마트스토어 | 0% |',
    '| sold_on | 날짜 | 2026-09-20 | 0% |',
    '| revenue | 정수 | 1250000 | 0% |',
    '| checked_at | 날짜 | 2026-09-21 09:00 | 0% |',
    '| note | 문자열 | 재고 확인 필요 | 40% |', '',
    '## 행 수', '412', '',
    '## 유일 키 후보', 'channel + sold_on', '',
    '## 갱신 시각 열', 'checked_at', '',
    '## LLM 문장 열', '- note', '',
    '## 민감 열 후보', '- 없음', '',
  ].join('\n');
}

test('dashboard 1단계: 일곱 절과 열 한 개 이상이면 통과', () => {
  const app = makeApp('a2wl-p1-');
  write(app, `${LITE}/runs/run-1.schema.md`, goodSchema());
  const r = checkPhase1(lite(app), { mode: 'dashboard' });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('dashboard 1단계: 스키마 파일이 없으면 실패', () => {
  const app = makeApp('a2wl-p1-');
  const r = checkPhase1(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('run-1.schema.md')));
});

test('dashboard 1단계: 절이 빠지거나 비면 실패', () => {
  const app = makeApp('a2wl-p1-');
  write(app, `${LITE}/runs/run-1.schema.md`, goodSchema().replace('## 유일 키 후보\nchannel + sold_on', '## 유일 키 후보\n'));
  const r = checkPhase1(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('## 유일 키 후보')));
});

test('dashboard 1단계: 열 표가 머리글뿐이면 실패', () => {
  const app = makeApp('a2wl-p1-');
  const text = goodSchema().replace(/\| channel[\s\S]*?\| note[^\n]*\n/, '');
  write(app, `${LITE}/runs/run-1.schema.md`, text);
  const r = checkPhase1(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('열이 하나도')));
});

// skill 모드
function goodRun1() {
  return [
    '## 수행한 단계', '1. PDF 를 읽는다', '2. 품목 표를 뽑는다', '',
    '## 판단이 필요했던 지점', '- FOC 표기가 샘플마다 다르다', '',
    '## 예상과 달라서 방식을 바꾼 지점', '- 3번은 표가 두 장으로 갈려 있었다', '',
    '## 샘플별 기록', '',
    '| 샘플 | 입력 파일 | 사람 개입 |',
    '|---|---|---|',
    '| 1 | inv-1.pdf | 없음 |',
    '| 2 | inv-2.pdf | 단가 확인 |', '',
  ].join('\n');
}

function makeSamples(app, n, { output = '{"barcode":"8801","items":[]}' } = {}) {
  for (let k = 1; k <= n; k++) {
    write(app, `${LITE}/runs/sample-${k}/inv-${k}.pdf`, 'PDF');
    write(app, `${LITE}/runs/sample-${k}/output.json`, output);
  }
}

test('skill 1단계: 샘플 N건과 네 절이면 통과', () => {
  const app = makeApp('a2wl-p1-');
  write(app, `${LITE}/runs/run-1.md`, goodRun1());
  makeSamples(app, 3);
  const r = checkPhase1(lite(app), { mode: 'skill', samples: 3 });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('skill 1단계: 샘플이 모자라면 실패', () => {
  const app = makeApp('a2wl-p1-');
  write(app, `${LITE}/runs/run-1.md`, goodRun1());
  makeSamples(app, 2);
  const r = checkPhase1(lite(app), { mode: 'skill', samples: 3 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('sample-3')));
});

test('skill 1단계: output.json 이 깨지면 실패', () => {
  const app = makeApp('a2wl-p1-');
  write(app, `${LITE}/runs/run-1.md`, goodRun1());
  makeSamples(app, 1);
  write(app, `${LITE}/runs/sample-1/output.json`, '{ 깨진');
  const r = checkPhase1(lite(app), { mode: 'skill', samples: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('JSON')));
});

test('skill 1단계: 입력 파일이 없으면 실패', () => {
  const app = makeApp('a2wl-p1-');
  write(app, `${LITE}/runs/run-1.md`, goodRun1());
  write(app, `${LITE}/runs/sample-1/output.json`, '{"a":1}');
  const r = checkPhase1(lite(app), { mode: 'skill', samples: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('입력 파일')));
});

test('상수: 스키마 일곱 절, run 네 절', () => {
  assert.equal(SCHEMA_HEADINGS.length, 7);
  assert.equal(RUN_HEADINGS.length, 4);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test "tests/lite_phase1.test.mjs"`
Expected: FAIL — `Cannot find module …/lib/phase1.mjs`

- [ ] **Step 3: 구현**

`.claude/skills/agent-to-webapp-lite/scripts/lib/phase1.mjs`:

```js
// 1단계 관찰 게이트.
//   dashboard: runs/run-1.schema.md 의 일곱 절과 열 표
//   skill:     runs/run-1.md 의 네 절 + runs/sample-k/ 의 입력 파일과 output.json
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sectionBody, isBlank } from './md.mjs';
import { parseColumnTable, readJson } from './schema.mjs';
import { DEFAULT_SAMPLES } from './status.mjs';

export const SCHEMA_HEADINGS = ['## 출처', '## 열', '## 행 수', '## 유일 키 후보', '## 갱신 시각 열', '## LLM 문장 열', '## 민감 열 후보'];
export const COLUMN_HEADING = '## 열';
export const RUN_HEADINGS = ['## 수행한 단계', '## 판단이 필요했던 지점', '## 예상과 달라서 방식을 바꾼 지점', '## 샘플별 기록'];
export const SAMPLE_OUTPUT = 'output.json';

export const schemaFile = (n) => join('runs', `run-${n}.schema.md`);
export const sampleDir = (k) => join('runs', `sample-${k}`);

// 스키마 문서 하나를 검사한다. 4단계도 run-2 에 이 함수를 쓴다.
export function checkSchemaDoc(liteDir, n, errors) {
  const rel = schemaFile(n);
  const p = join(liteDir, rel);
  if (!existsSync(p)) { errors.push(`${rel.split(/[\\/]/).join('/')} 없음`); return null; }
  const text = readFileSync(p, 'utf8');
  for (const h of SCHEMA_HEADINGS) {
    const body = sectionBody(text, h);
    if (body === null) errors.push(`run-${n}.schema.md: '${h}' 절이 없다`);
    else if (isBlank(body)) errors.push(`run-${n}.schema.md: '${h}' 절이 비었다. 없으면 '없음' 이라고 적는다`);
  }
  const cols = parseColumnTable(text, COLUMN_HEADING);
  if (cols.length === 0) errors.push(`run-${n}.schema.md: '${COLUMN_HEADING}' 표에 열이 하나도 없다 (머리글 한 줄과 구분선 아래에 열을 적는다)`);
  return { text, cols };
}

function checkSamples(liteDir, samples, errors, notes) {
  for (let k = 1; k <= samples; k++) {
    const rel = sampleDir(k).split(/[\\/]/).join('/');
    const dir = join(liteDir, sampleDir(k));
    if (!existsSync(dir) || !statSync(dir).isDirectory()) { errors.push(`${rel}/ 폴더가 없다`); continue; }
    const entries = readdirSync(dir);
    if (!entries.includes(SAMPLE_OUTPUT)) { errors.push(`${rel}/${SAMPLE_OUTPUT} 없음`); continue; }
    if (entries.filter(e => e !== SAMPLE_OUTPUT).length === 0) errors.push(`${rel}/ 에 입력 파일이 없다 (스킬에 넣은 원본을 같이 둔다)`);
    const r = readJson(join(dir, SAMPLE_OUTPUT));
    if (!r.ok) errors.push(`${rel}/${SAMPLE_OUTPUT}: ${r.why}`);
  }
  notes.push(`샘플 ${samples}건을 봤다`);
}

export function checkPhase1(liteDir, { mode, samples = DEFAULT_SAMPLES } = {}) {
  const errors = [];
  const warnings = [];
  const notes = [];
  if (mode === 'dashboard') {
    checkSchemaDoc(liteDir, 1, errors);
  } else {
    const p = join(liteDir, 'runs', 'run-1.md');
    if (!existsSync(p)) errors.push('runs/run-1.md 없음');
    else {
      const text = readFileSync(p, 'utf8');
      for (const h of RUN_HEADINGS) {
        const body = sectionBody(text, h);
        if (body === null) errors.push(`run-1.md: '${h}' 절이 없다`);
        else if (isBlank(body)) errors.push(`run-1.md: '${h}' 절이 비었다`);
      }
    }
    checkSamples(liteDir, samples, errors, notes);
  }
  return { ok: errors.length === 0, errors, warnings, notes };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — lite_phase1 9건 포함 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/agent-to-webapp-lite/scripts/lib/phase1.mjs tests/lite_phase1.test.mjs
git commit -m "feat(lite): 1단계 관찰 게이트 — 스키마 일곱 절, 샘플 N건의 output.json"
```

---

### Task 5: 2단계 판정 게이트

**Files:**
- Create: `.claude/skills/agent-to-webapp-lite/scripts/lib/phase2.mjs`
- Test: `tests/lite_phase2.test.mjs`

**Interfaces:**
- Consumes: `./md.mjs`, `./schema.mjs` 의 `readJson`·`topKeys`·`sameKeySets`, `./phase1.mjs` 의 `sampleDir`·`SAMPLE_OUTPUT`
- Produces:
  - `VERDICT_PREFIX` = `'판정:'`
  - `DASHBOARD_VERDICTS` = `['고정 가능','조건부 고정 가능','고정 불가']`
  - `SKILL_VERDICTS` = `['코드로 고정','Claude 호출 유지','고정 불가']`
  - `DASHBOARD_SECTIONS` = `['## 근거','## 민감 열']`, `SKILL_SECTIONS` = `['## 근거','## 출력 구조','## 사람 확인']`
  - `TERMINAL_VERDICT` = `'고정 불가'`, `OVERRIDE_VERDICT` = `{ dashboard: '조건부 고정 가능', skill: 'Claude 호출 유지' }`
  - `ROUTING` = `{ dashboard: <문자열>, skill: <문자열> }`
  - `parseVerdict(text, verdicts)` → 문자열 또는 `null`
  - `sampleKeySets(liteDir, samples)` → `string[][]`
  - `checkPhase2(liteDir, { mode, samples, override })` → `{ ok, errors, warnings, verdict }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/lite_phase2.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, LITE } from './helpers.mjs';
import { checkPhase2, parseVerdict, DASHBOARD_VERDICTS, SKILL_VERDICTS, OVERRIDE_VERDICT } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase2.mjs';

const lite = (app) => join(app, LITE);

test('parseVerdict: 마지막 판정 줄, 조건부가 고정 가능보다 먼저', () => {
  assert.equal(parseVerdict('판정: 고정 가능\n판정: 조건부 고정 가능(관찰 1회)\n', DASHBOARD_VERDICTS), '조건부 고정 가능');
  assert.equal(parseVerdict('판정: 고정 불가\n', DASHBOARD_VERDICTS), '고정 불가');
  assert.equal(parseVerdict('판정 없음\n', DASHBOARD_VERDICTS), null);
  assert.equal(parseVerdict('판정: Claude 호출 유지\n', SKILL_VERDICTS), 'Claude 호출 유지');
});

function dashVerdict(v) {
  return ['## 근거', '- 유일 키 후보 channel + sold_on 가 있다', '- 갱신 시각 열 checked_at 이 있다', '- 412행', '',
    '## 민감 열', '- 없음', '', `판정: ${v}`, ''].join('\n');
}

test('dashboard 2단계: 조건부면 통과', () => {
  const app = makeApp('a2wl-p2-');
  write(app, `${LITE}/verdict.md`, dashVerdict('조건부 고정 가능(관찰 1회)'));
  const r = checkPhase2(lite(app), { mode: 'dashboard' });
  assert.ok(r.ok, r.errors.join(' / '));
  assert.equal(r.verdict, '조건부 고정 가능');
});

test('dashboard 2단계: 관찰 1회 위에서 고정 가능은 거부한다', () => {
  const app = makeApp('a2wl-p2-');
  write(app, `${LITE}/verdict.md`, dashVerdict('고정 가능'));
  const r = checkPhase2(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('조건부')));
});

test('dashboard 2단계: 민감 열 절이 없으면 실패', () => {
  const app = makeApp('a2wl-p2-');
  write(app, `${LITE}/verdict.md`, '## 근거\n- 키 있음\n\n판정: 조건부 고정 가능\n');
  const r = checkPhase2(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('## 민감 열')));
});

test('2단계: 고정 불가는 통과하고 verdict 로 알린다 (CLI 가 종료를 기록한다)', () => {
  const app = makeApp('a2wl-p2-');
  write(app, `${LITE}/verdict.md`, dashVerdict('고정 불가'));
  const r = checkPhase2(lite(app), { mode: 'dashboard' });
  assert.ok(r.ok);
  assert.equal(r.verdict, '고정 불가');
});

test('2단계: override 는 모드별 중간 판정으로 진행한다', () => {
  const app = makeApp('a2wl-p2-');
  write(app, `${LITE}/verdict.md`, dashVerdict('고정 불가'));
  const r = checkPhase2(lite(app), { mode: 'dashboard', override: '사람이 뒤집었다' });
  assert.ok(r.ok);
  assert.equal(r.verdict, OVERRIDE_VERDICT.dashboard);
  assert.ok(r.warnings.some(w => w.includes('override')));
});

function skillVerdict(v) {
  return ['## 근거', '- 제어권: 코드가 순서를 정한다', '- 도구: 도메인 도구만', '- 환경: 몇 초', '',
    '## 출력 구조', '- 샘플 3건 모두 같은 키', '', '## 사람 확인', '- 금액은 사람이 확인한다', '', `판정: ${v}`, ''].join('\n');
}

function makeSamples(app, outputs) {
  outputs.forEach((o, i) => write(app, `${LITE}/runs/sample-${i + 1}/output.json`, o));
}

test('skill 2단계: 키가 같으면 코드로 고정 통과', () => {
  const app = makeApp('a2wl-p2-');
  makeSamples(app, ['{"a":1,"b":2}', '{"b":3,"a":4}']);
  write(app, `${LITE}/verdict.md`, skillVerdict('코드로 고정'));
  const r = checkPhase2(lite(app), { mode: 'skill', samples: 2 });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('skill 2단계: 샘플 키가 다르면 코드로 고정을 거부한다', () => {
  const app = makeApp('a2wl-p2-');
  makeSamples(app, ['{"a":1,"b":2}', '{"a":1}']);
  write(app, `${LITE}/verdict.md`, skillVerdict('코드로 고정'));
  const r = checkPhase2(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('키 집합')));
});

test('skill 2단계: 키가 달라도 Claude 호출 유지는 통과', () => {
  const app = makeApp('a2wl-p2-');
  makeSamples(app, ['{"a":1,"b":2}', '{"a":1}']);
  write(app, `${LITE}/verdict.md`, skillVerdict('Claude 호출 유지'));
  const r = checkPhase2(lite(app), { mode: 'skill', samples: 2 });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('2단계: verdict.md 가 없으면 실패', () => {
  const app = makeApp('a2wl-p2-');
  const r = checkPhase2(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('verdict.md')));
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test "tests/lite_phase2.test.mjs"`
Expected: FAIL — `Cannot find module …/lib/phase2.mjs`

- [ ] **Step 3: 구현**

`.claude/skills/agent-to-webapp-lite/scripts/lib/phase2.mjs`:

```js
// 2단계 판정 게이트. 마지막 '판정:' 줄과 모드별 필수 절.
// 증거 규칙: dashboard 는 관찰 1회 위에서 '고정 가능' 을 거부하고, skill 은 샘플 출력 키가
// 서로 다르면 '코드로 고정' 을 거부한다. 주장과 관찰이 어긋나는 것을 게이트가 직접 본다.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalize, sectionBody, isBlank } from './md.mjs';
import { readJson, topKeys, sameKeySets } from './schema.mjs';
import { sampleDir, SAMPLE_OUTPUT } from './phase1.mjs';
import { DEFAULT_SAMPLES } from './status.mjs';

export const VERDICT_FILE = 'verdict.md';
export const VERDICT_PREFIX = '판정:';
export const DASHBOARD_VERDICTS = ['고정 가능', '조건부 고정 가능', '고정 불가'];
export const SKILL_VERDICTS = ['코드로 고정', 'Claude 호출 유지', '고정 불가'];
export const DASHBOARD_SECTIONS = ['## 근거', '## 민감 열'];
export const SKILL_SECTIONS = ['## 근거', '## 출력 구조', '## 사람 확인'];
export const TERMINAL_VERDICT = '고정 불가';
// 사람이 판정을 뒤집을 때 남는 값. 가장 센 판정으로 올리지 않는다.
export const OVERRIDE_VERDICT = { dashboard: '조건부 고정 가능', skill: 'Claude 호출 유지' };
export const ROUTING = {
  dashboard: [
    '출력 스키마를 고정할 수 없다. 대시보드가 읽을 데이터 계약을 만들 수 없다.',
    '먼저 에이전트가 출력 형식을 고정하도록 고친 뒤 다시 오거나, 웹은 파일 내려받기만 두는 쪽으로 간다.',
  ].join('\n'),
  skill: [
    '이 스킬은 서버 함수로 옮길 대상이 아니다. 시각·OCR 이 필요하거나 실행이 길면 서버리스 함수 밖이다.',
    '별도 트랙: Agent SDK 를 Vercel 밖 컨테이너에 두거나 Managed Agents. 로컬 에이전트로 남기는 것도 답이다.',
  ].join('\n'),
};

// 긴 판정을 먼저 본다('조건부 고정 가능' 이 '고정 가능' 을 포함한다).
export function parseVerdict(text, verdicts) {
  const lines = normalize(text).split('\n').map(l => l.trim()).filter(Boolean);
  const last = [...lines].reverse().find(l => l.startsWith(VERDICT_PREFIX));
  if (!last) return null;
  const body = last.slice(VERDICT_PREFIX.length).trim();
  for (const v of [...verdicts].sort((a, b) => b.length - a.length)) {
    if (body.startsWith(v)) return v;
  }
  return null;
}

// 샘플 출력 JSON 의 최상위 키 집합들. 읽히지 않는 샘플은 건너뛴다(1단계가 이미 막았다).
export function sampleKeySets(liteDir, samples) {
  const sets = [];
  for (let k = 1; k <= samples; k++) {
    const r = readJson(join(liteDir, sampleDir(k), SAMPLE_OUTPUT));
    if (r.ok) sets.push(topKeys(r.value));
  }
  return sets;
}

export function checkPhase2(liteDir, { mode, samples = DEFAULT_SAMPLES, override = null } = {}) {
  const warnings = [];
  const p = join(liteDir, VERDICT_FILE);
  if (!existsSync(p)) return { ok: false, errors: [`${VERDICT_FILE} 없음`], warnings, verdict: null };
  const text = readFileSync(p, 'utf8');
  const verdicts = mode === 'dashboard' ? DASHBOARD_VERDICTS : SKILL_VERDICTS;
  const verdict = parseVerdict(text, verdicts);

  if (override) {
    warnings.push(`override: ${override} (파일의 판정 '${verdict ?? '없음'}' 대신 '${OVERRIDE_VERDICT[mode]}' 로 진행)`);
    return { ok: true, errors: [], warnings, verdict: OVERRIDE_VERDICT[mode] };
  }

  const errors = [];
  if (!verdict) errors.push(`마지막 '${VERDICT_PREFIX}' 줄이 ${verdicts.join(' / ')} 중 하나로 시작하지 않는다`);
  for (const h of mode === 'dashboard' ? DASHBOARD_SECTIONS : SKILL_SECTIONS) {
    const body = sectionBody(text, h);
    if (body === null) errors.push(`${VERDICT_FILE}: '${h}' 절이 없다`);
    else if (isBlank(body)) errors.push(`${VERDICT_FILE}: '${h}' 절이 비었다`);
  }

  if (mode === 'dashboard' && verdict === '고정 가능') {
    errors.push("관찰 1회로는 '고정 가능' 을 낼 수 없다. 실행 간 차이는 4단계가 본다. '조건부 고정 가능(관찰 1회)' 로 고쳐라");
  }
  if (mode === 'skill' && verdict === '코드로 고정') {
    const sets = sampleKeySets(liteDir, samples);
    if (!sameKeySets(sets)) {
      errors.push(`샘플 출력의 키 집합이 서로 다르다: ${sets.map((s, i) => `sample-${i + 1}(${s.join(',') || '없음'})`).join(' / ')}. '코드로 고정' 대신 'Claude 호출 유지' 로 고쳐라`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, verdict };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — lite_phase2 11건 포함 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/agent-to-webapp-lite/scripts/lib/phase2.mjs tests/lite_phase2.test.mjs
git commit -m "feat(lite): 2단계 판정 게이트 — 모드별 판정 어휘와 관찰이 뒤집는 주장 거부"
```

---

### Task 6: 3단계 고정 게이트

**Files:**
- Create: `.claude/skills/agent-to-webapp-lite/scripts/lib/phase3.mjs`
- Test: `tests/lite_phase3.test.mjs`

**Interfaces:**
- Consumes: `./md.mjs`, `./schema.mjs` 의 `parseColumnTable`·`jsonBlockAfter`·`topKeys`·`intersectKeys`, `./phase1.mjs` 의 `schemaFile`·`COLUMN_HEADING`, `./phase2.mjs` 의 `parseVerdict`·`sampleKeySets`·`VERDICT_FILE`·`SKILL_VERDICTS`
- Produces:
  - `CONTRACT_FILE` = `'contract.md'`, `SPEC_FILE` = `'skill-spec.md'`
  - `CONTRACT_HEADINGS` = `['## 테이블','## 열','## 유일 키','## 갱신 시각','## upsert 규칙','## 갱신 주체','## 제외 열','## 파생 집계','## 에이전트에 추가할 마지막 단계']`
  - `CONTRACT_REQUIRED` = `['## 유일 키','## 제외 열','## 갱신 주체']`
  - `NONE` = `'없음'`
  - `SPEC_HEADINGS` = `['## 입력 스키마','## 출력 스키마','## 사람 확인','## 실패 처리']`
  - `SPEC_RULES` = `'## 규칙'`, `SPEC_PROMPT` = `'## 프롬프트'`, `SPEC_FIELDS` = `['- 모델:','- 최대 토큰:','- 타임아웃:']`
  - `excludedColumns(text)` → `string[]` (제외 열 목록의 이름. `없음` 은 뺀다)
  - `checkPhase3(liteDir, { mode, samples })` → `{ ok, errors, warnings, verdict }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/lite_phase3.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, LITE } from './helpers.mjs';
import { checkPhase3, excludedColumns, CONTRACT_HEADINGS, SPEC_HEADINGS } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase3.mjs';

const lite = (app) => join(app, LITE);

function schemaDoc() {
  return ['## 출처', 'out/sales.csv', '', '## 열', '',
    '| 열 | 타입 | 예시값 | 빈 값 비율 |', '|---|---|---|---|',
    '| channel | 문자열 | 스마트스토어 | 0% |',
    '| sold_on | 날짜 | 2026-09-20 | 0% |',
    '| revenue | 정수 | 1250000 | 0% |',
    '| checked_at | 날짜 | 2026-09-21 | 0% |',
    '| memo | 문자열 | 개인 메모 | 10% |', '',
    '## 행 수', '412', '', '## 유일 키 후보', 'channel + sold_on', '',
    '## 갱신 시각 열', 'checked_at', '', '## LLM 문장 열', '- 없음', '', '## 민감 열 후보', '- memo', ''].join('\n');
}

function contract({ key = 'channel + sold_on', excluded = '- memo', owner = '에이전트 마지막 단계', cols } = {}) {
  return ['## 테이블', 'channel_sales', '', '## 열', '',
    '| 열 | 타입 | 필수 | 설명 |', '|---|---|---|---|',
    ...(cols ?? ['| channel | 문자열 | 예 | 판매 채널 |', '| sold_on | 날짜 | 예 | 판매일 |', '| revenue | 정수 | 예 | 매출 |', '| checked_at | 날짜 | 예 | 점검 시각 |']),
    '', '## 유일 키', key, '', '## 갱신 시각', 'checked_at', '',
    '## upsert 규칙', '같은 키면 덮어쓴다', '', '## 갱신 주체', owner, '',
    '## 제외 열', excluded, '', '## 파생 집계', '- 없음', '',
    '## 에이전트에 추가할 마지막 단계', 'CSV 를 읽어 Supabase 에 upsert 한다', ''].join('\n');
}

test('dashboard 3단계: 아홉 절이 차 있고 계약 열이 관찰 열 안이면 통과', () => {
  const app = makeApp('a2wl-p3-');
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  write(app, `${LITE}/contract.md`, contract());
  const r = checkPhase3(lite(app), { mode: 'dashboard' });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('dashboard 3단계: 유일 키가 없음이면 실패', () => {
  const app = makeApp('a2wl-p3-');
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  write(app, `${LITE}/contract.md`, contract({ key: '없음' }));
  const r = checkPhase3(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('유일 키')));
});

test('dashboard 3단계: 관찰에 없는 열을 계약에 넣으면 실패', () => {
  const app = makeApp('a2wl-p3-');
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  write(app, `${LITE}/contract.md`, contract({ cols: ['| channel | 문자열 | 예 | 채널 |', '| margin | 정수 | 예 | 관찰에 없는 열 |'] }));
  const r = checkPhase3(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('margin')));
});

test('dashboard 3단계: 갱신 주체가 비면 실패', () => {
  const app = makeApp('a2wl-p3-');
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc());
  write(app, `${LITE}/contract.md`, contract({ owner: '' }));
  const r = checkPhase3(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('## 갱신 주체')));
});

test('excludedColumns: 목록에서 이름만, 없음은 뺀다', () => {
  assert.deepEqual(excludedColumns(contract({ excluded: '- memo\n- account_no' })), ['memo', 'account_no']);
  assert.deepEqual(excludedColumns(contract({ excluded: '- 없음' })), []);
});

// skill 모드
function spec({ verdict = 'Claude 호출 유지', out = '{ "barcode": "문자열", "items": "배열" }', extra } = {}) {
  const head = ['## 입력 스키마', '', '```json', '{ "file": "PDF 한 건" }', '```', '',
    '## 출력 스키마', '', '```json', out, '```', ''];
  const branch = verdict === '코드로 고정'
    ? ['## 규칙', '- 바코드는 첫 줄의 숫자 13자리', '']
    : ['## 프롬프트', '', '```', '인보이스에서 바코드와 품목을 뽑아 JSON 으로 답하라', '```', '',
       '- 모델: claude-sonnet-5', '- 최대 토큰: 4096', '- 타임아웃: 60초', ''];
  return [...head, ...branch, ...(extra ?? []),
    '## 사람 확인', '- 확신도가 낮으면 사람이 고친다', '', '## 실패 처리', '- 멈추고 원인을 보여준다', ''].join('\n');
}

function skillFixture(app, { verdict = 'Claude 호출 유지', outputs = ['{"barcode":"1","items":[]}', '{"barcode":"2","items":[]}'] } = {}) {
  outputs.forEach((o, i) => write(app, `${LITE}/runs/sample-${i + 1}/output.json`, o));
  write(app, `${LITE}/verdict.md`, `## 근거\n- x\n\n## 출력 구조\n- x\n\n## 사람 확인\n- x\n\n판정: ${verdict}\n`);
}

test('skill 3단계: 스키마 블록과 프롬프트 필드가 있으면 통과', () => {
  const app = makeApp('a2wl-p3-');
  skillFixture(app);
  write(app, `${LITE}/skill-spec.md`, spec());
  const r = checkPhase3(lite(app), { mode: 'skill', samples: 2 });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('skill 3단계: 출력 스키마가 공통 샘플 키를 빠뜨리면 실패', () => {
  const app = makeApp('a2wl-p3-');
  skillFixture(app);
  write(app, `${LITE}/skill-spec.md`, spec({ out: '{ "barcode": "문자열" }' }));
  const r = checkPhase3(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('items')));
});

test('skill 3단계: Claude 호출 유지인데 모델·토큰·타임아웃이 없으면 실패', () => {
  const app = makeApp('a2wl-p3-');
  skillFixture(app);
  const text = spec().replace('- 최대 토큰: 4096\n', '');
  write(app, `${LITE}/skill-spec.md`, text);
  const r = checkPhase3(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('최대 토큰')));
});

test('skill 3단계: 코드로 고정인데 규칙 절이 없으면 실패', () => {
  const app = makeApp('a2wl-p3-');
  skillFixture(app, { verdict: '코드로 고정', outputs: ['{"barcode":"1","items":[]}', '{"barcode":"2","items":[]}'] });
  write(app, `${LITE}/skill-spec.md`, spec({ verdict: 'Claude 호출 유지' }));
  const r = checkPhase3(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('## 규칙')));
});

test('skill 3단계: 입력 스키마 json 블록이 없으면 실패', () => {
  const app = makeApp('a2wl-p3-');
  skillFixture(app);
  write(app, `${LITE}/skill-spec.md`, spec().replace('```json\n{ "file": "PDF 한 건" }\n```', '설명만 적었다'));
  const r = checkPhase3(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('## 입력 스키마')));
});

test('상수: 계약 아홉 절, 스펙 네 절', () => {
  assert.equal(CONTRACT_HEADINGS.length, 9);
  assert.equal(SPEC_HEADINGS.length, 4);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test "tests/lite_phase3.test.mjs"`
Expected: FAIL — `Cannot find module …/lib/phase3.mjs`

- [ ] **Step 3: 구현**

`.claude/skills/agent-to-webapp-lite/scripts/lib/phase3.mjs`:

```js
// 3단계 고정 게이트.
//   dashboard: contract.md 아홉 절. 유일 키·제외 열·갱신 주체는 필수, 유일 키에 '없음' 불가.
//              계약의 열이 1단계에서 관찰한 열 안에 있어야 한다.
//   skill:     skill-spec.md. 입출력 json 블록, 판정별 필수 절, 출력 스키마가 공통 샘플 키를 덮는가.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sectionBody, isBlank } from './md.mjs';
import { parseColumnTable, jsonBlockAfter, topKeys, intersectKeys } from './schema.mjs';
import { schemaFile, COLUMN_HEADING } from './phase1.mjs';
import { parseVerdict, sampleKeySets, VERDICT_FILE, SKILL_VERDICTS } from './phase2.mjs';
import { DEFAULT_SAMPLES } from './status.mjs';

export const CONTRACT_FILE = 'contract.md';
export const SPEC_FILE = 'skill-spec.md';
export const CONTRACT_HEADINGS = ['## 테이블', '## 열', '## 유일 키', '## 갱신 시각', '## upsert 규칙', '## 갱신 주체', '## 제외 열', '## 파생 집계', '## 에이전트에 추가할 마지막 단계'];
export const CONTRACT_REQUIRED = ['## 유일 키', '## 제외 열', '## 갱신 주체'];
export const CONTRACT_KEY = '## 유일 키';
export const CONTRACT_EXCLUDED = '## 제외 열';
export const CONTRACT_TABLE = '## 테이블';
export const NONE = '없음';
export const SPEC_HEADINGS = ['## 입력 스키마', '## 출력 스키마', '## 사람 확인', '## 실패 처리'];
export const SPEC_SCHEMA_HEADINGS = ['## 입력 스키마', '## 출력 스키마'];
export const SPEC_RULES = '## 규칙';
export const SPEC_PROMPT = '## 프롬프트';
export const SPEC_FIELDS = ['- 모델:', '- 최대 토큰:', '- 타임아웃:'];

// '## 제외 열' 목록의 이름들. '- 없음' 은 뺀다.
export function excludedColumns(text) {
  const body = sectionBody(text, CONTRACT_EXCLUDED) ?? '';
  return body.split('\n').map(l => l.trim())
    .filter(l => l.startsWith('- '))
    .map(l => l.slice(2).split(/[ (·—-]/)[0].replace(/[`*]/g, '').trim())
    .filter(n => n && n !== NONE);
}

function checkDashboard(liteDir, errors, warnings) {
  const p = join(liteDir, CONTRACT_FILE);
  if (!existsSync(p)) { errors.push(`${CONTRACT_FILE} 없음`); return; }
  const text = readFileSync(p, 'utf8');
  for (const h of CONTRACT_HEADINGS) {
    const body = sectionBody(text, h);
    if (body === null) errors.push(`${CONTRACT_FILE}: '${h}' 절이 없다`);
    else if (isBlank(body) && CONTRACT_REQUIRED.includes(h)) errors.push(`${CONTRACT_FILE}: '${h}' 절이 비었다. 없으면 '- 없음'`);
    else if (isBlank(body)) errors.push(`${CONTRACT_FILE}: '${h}' 절이 비었다`);
  }
  const key = (sectionBody(text, CONTRACT_KEY) ?? '').trim();
  if (key === NONE || key === `- ${NONE}`) {
    errors.push(`${CONTRACT_FILE}: '${CONTRACT_KEY}' 가 '${NONE}' 이다. 키가 없으면 upsert 가 없고 실행마다 중복 적재된다. 에이전트 출력에 키를 먼저 만들어라`);
  }
  const sp = join(liteDir, schemaFile(1));
  if (!existsSync(sp)) { errors.push('run-1.schema.md 이 없어 계약의 열을 관찰과 대조할 수 없다. 1단계로 돌아가라'); return; }
  const observed = parseColumnTable(readFileSync(sp, 'utf8'), COLUMN_HEADING).map(c => c.name);
  for (const c of parseColumnTable(text, COLUMN_HEADING)) {
    if (!observed.includes(c.name)) errors.push(`${CONTRACT_FILE}: 계약의 열 '${c.name}' 이 관찰(run-1.schema.md)에 없다`);
  }
}

function checkSkill(liteDir, samples, errors, warnings) {
  const p = join(liteDir, SPEC_FILE);
  if (!existsSync(p)) { errors.push(`${SPEC_FILE} 없음`); return null; }
  const text = readFileSync(p, 'utf8');
  for (const h of SPEC_HEADINGS) {
    const body = sectionBody(text, h);
    if (body === null) errors.push(`${SPEC_FILE}: '${h}' 절이 없다`);
    else if (isBlank(body)) errors.push(`${SPEC_FILE}: '${h}' 절이 비었다`);
  }
  for (const h of SPEC_SCHEMA_HEADINGS) {
    if (jsonBlockAfter(text, h) === null) errors.push(`${SPEC_FILE}: '${h}' 절에 json 코드 블록이 없거나 JSON 이 깨졌다 (최상위 키가 필드 이름인 객체)`);
  }

  const vp = join(liteDir, VERDICT_FILE);
  const verdict = existsSync(vp) ? parseVerdict(readFileSync(vp, 'utf8'), SKILL_VERDICTS) : null;
  if (verdict === '코드로 고정') {
    const body = sectionBody(text, SPEC_RULES);
    const items = (body ?? '').split('\n').filter(l => l.trim().startsWith('- '));
    if (body === null || items.length === 0) errors.push(`${SPEC_FILE}: 판정이 '코드로 고정' 이면 '${SPEC_RULES}' 절에 규칙을 하나 이상 적는다`);
  } else if (verdict === 'Claude 호출 유지') {
    const body = sectionBody(text, SPEC_PROMPT);
    if (body === null || !/```[\s\S]*?```/.test(body)) errors.push(`${SPEC_FILE}: 판정이 'Claude 호출 유지' 면 '${SPEC_PROMPT}' 절에 프롬프트 원문을 코드 블록으로 담는다`);
    for (const f of SPEC_FIELDS) if (!text.includes(f)) errors.push(`${SPEC_FILE}: '${f}' 가 없다. 웹 앱이 같은 값으로 불러야 한다`);
  }

  const declared = topKeys(jsonBlockAfter(text, '## 출력 스키마') ?? {});
  const common = intersectKeys(sampleKeySets(liteDir, samples));
  const missing = common.filter(k => !declared.includes(k));
  if (missing.length) errors.push(`${SPEC_FILE}: 모든 샘플에 있는 키를 출력 스키마가 빠뜨렸다: ${missing.join(', ')}`);
  return verdict;
}

export function checkPhase3(liteDir, { mode, samples = DEFAULT_SAMPLES } = {}) {
  const errors = [];
  const warnings = [];
  let verdict = null;
  if (mode === 'dashboard') checkDashboard(liteDir, errors, warnings);
  else verdict = checkSkill(liteDir, samples, errors, warnings);
  return { ok: errors.length === 0, errors, warnings, verdict };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — lite_phase3 11건 포함 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/agent-to-webapp-lite/scripts/lib/phase3.mjs tests/lite_phase3.test.mjs
git commit -m "feat(lite): 3단계 고정 게이트 — 계약의 키·제외 열·갱신 주체, 스펙의 출력 키 대조"
```

---

### Task 7: 4단계 재검증 게이트

**Files:**
- Create: `.claude/skills/agent-to-webapp-lite/scripts/lib/phase4.mjs`
- Test: `tests/lite_phase4.test.mjs`

**Interfaces:**
- Consumes: `./md.mjs`, `./schema.mjs` 의 `parseColumnTable`·`diffColumns`·`readJson`·`topKeys`·`jsonBlockAfter`, `./phase1.mjs` 의 `checkSchemaDoc`·`schemaFile`·`COLUMN_HEADING`·`sampleDir`·`SAMPLE_OUTPUT`, `./phase3.mjs` 의 `CONTRACT_FILE`·`SPEC_FILE`
- Produces:
  - `REPORT_FILE` = `'verify/report.md'`
  - `DASHBOARD_REPORT_HEADINGS` = `['## 스키마 diff','## 키 중복','## 판정']`
  - `SKILL_REPORT_HEADINGS` = `['## 스키마 일치율','## 샘플별 차이','## 사람 개입']`
  - `DUP_HEADING` = `'## 키 중복'`, `NONE` = `'없음'`
  - `verifySample(k)` → `'verify/sample-<k>.json'`
  - `checkPhase4(liteDir, { mode, samples })` → `{ ok, errors, warnings, notes, breaking }`

**핵심:** 게이트가 run-1·run-2 의 열 표를 직접 대조한다. 보고서의 문장은 그 결과를 담고 있는지만 본다(기획서 §5-2).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/lite_phase4.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, LITE } from './helpers.mjs';
import { checkPhase4, DASHBOARD_REPORT_HEADINGS, SKILL_REPORT_HEADINGS } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase4.mjs';

const lite = (app) => join(app, LITE);

function schemaDoc(rows) {
  return ['## 출처', 'out/sales.csv', '', '## 열', '',
    '| 열 | 타입 | 예시값 | 빈 값 비율 |', '|---|---|---|---|', ...rows, '',
    '## 행 수', '412', '', '## 유일 키 후보', 'channel + sold_on', '',
    '## 갱신 시각 열', 'checked_at', '', '## LLM 문장 열', '- 없음', '', '## 민감 열 후보', '- 없음', ''].join('\n');
}

const BASE = ['| channel | 문자열 | 스마트스토어 | 0% |', '| sold_on | 날짜 | 2026-09-20 | 0% |', '| revenue | 정수 | 1250000 | 0% |'];

function contractDoc() {
  return ['## 테이블', 'channel_sales', '', '## 열', '',
    '| 열 | 타입 | 필수 | 설명 |', '|---|---|---|---|',
    '| channel | 문자열 | 예 | 채널 |', '| sold_on | 날짜 | 예 | 판매일 |', '| revenue | 정수 | 예 | 매출 |', '',
    '## 유일 키', 'channel + sold_on', '', '## 갱신 시각', 'checked_at', '',
    '## upsert 규칙', '덮어쓴다', '', '## 갱신 주체', '마지막 단계', '', '## 제외 열', '- 없음', '',
    '## 파생 집계', '- 없음', '', '## 에이전트에 추가할 마지막 단계', 'upsert', ''].join('\n');
}

function report({ dup = '없음', body = '차이 없음' } = {}) {
  return ['## 스키마 diff', body, '', '## 키 중복', dup, '', '## 판정', '계약 그대로 간다', ''].join('\n');
}

function dashFixture(app, { run2 = BASE, rep = report() } = {}) {
  write(app, `${LITE}/runs/run-1.schema.md`, schemaDoc(BASE));
  write(app, `${LITE}/runs/run-2.schema.md`, schemaDoc(run2));
  write(app, `${LITE}/contract.md`, contractDoc());
  write(app, `${LITE}/verify/report.md`, rep);
}

test('dashboard 4단계: 두 관찰이 같으면 통과', () => {
  const app = makeApp('a2wl-p4-');
  dashFixture(app);
  const r = checkPhase4(lite(app), { mode: 'dashboard' });
  assert.ok(r.ok, r.errors.join(' / '));
  assert.deepEqual(r.breaking, []);
});

test('dashboard 4단계: 계약 열이 사라지면 실패', () => {
  const app = makeApp('a2wl-p4-');
  dashFixture(app, { run2: BASE.slice(0, 2), rep: report({ body: 'revenue 열이 사라졌다' }) });
  const r = checkPhase4(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('revenue')));
  assert.ok(r.errors.some(e => e.includes('rollback 3')));
});

test('dashboard 4단계: 타입이 바뀌면 실패', () => {
  const app = makeApp('a2wl-p4-');
  const run2 = ['| channel | 문자열 | 스마트스토어 | 0% |', '| sold_on | 날짜 | 2026-09-20 | 0% |', '| revenue | 문자열 | 1,250,000 | 0% |'];
  dashFixture(app, { run2, rep: report({ body: 'revenue 타입이 정수 → 문자열' }) });
  const r = checkPhase4(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('타입')));
});

test('dashboard 4단계: 깨지는 변경을 보고서가 안 적으면 실패', () => {
  const app = makeApp('a2wl-p4-');
  dashFixture(app, { run2: BASE.slice(0, 2), rep: report({ body: '차이 없음' }) });
  const r = checkPhase4(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('보고서')));
});

test('dashboard 4단계: 키 중복이 없음이 아니면 실패', () => {
  const app = makeApp('a2wl-p4-');
  dashFixture(app, { rep: report({ dup: '3건' }) });
  const r = checkPhase4(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('키 중복')));
});

test('dashboard 4단계: 새 열은 경고로만 알린다', () => {
  const app = makeApp('a2wl-p4-');
  dashFixture(app, { run2: [...BASE, '| orders | 정수 | 12 | 0% |'] });
  const r = checkPhase4(lite(app), { mode: 'dashboard' });
  assert.ok(r.ok, r.errors.join(' / '));
  assert.ok(r.warnings.some(w => w.includes('orders')));
});

// skill 모드
function specDoc() {
  return ['## 입력 스키마', '', '```json', '{ "file": "PDF" }', '```', '',
    '## 출력 스키마', '', '```json', '{ "barcode": "문자열", "items": "배열" }', '```', '',
    '## 사람 확인', '- 확인한다', '', '## 실패 처리', '- 멈춘다', ''].join('\n');
}

function skillReport() {
  return ['## 스키마 일치율', '2/2', '', '## 샘플별 차이', '- 1번 단가가 다르다', '', '## 사람 개입', '- 줄었다', ''].join('\n');
}

function skillFixture(app, { verify = ['{"barcode":"1","items":[]}', '{"barcode":"2","items":[]}'], rep = skillReport() } = {}) {
  write(app, `${LITE}/skill-spec.md`, specDoc());
  verify.forEach((v, i) => {
    write(app, `${LITE}/runs/sample-${i + 1}/output.json`, '{"barcode":"x","items":[]}');
    write(app, `${LITE}/verify/sample-${i + 1}.json`, v);
  });
  write(app, `${LITE}/verify/report.md`, rep);
}

test('skill 4단계: 샘플 N건이 스펙 키를 채우면 통과', () => {
  const app = makeApp('a2wl-p4-');
  skillFixture(app);
  const r = checkPhase4(lite(app), { mode: 'skill', samples: 2 });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('skill 4단계: 재검증 결과가 없으면 실패', () => {
  const app = makeApp('a2wl-p4-');
  skillFixture(app, { verify: ['{"barcode":"1","items":[]}'] });
  const r = checkPhase4(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('verify/sample-2.json')));
});

test('skill 4단계: 스펙 키가 빠진 샘플이 있으면 실패하고 rollback 3 을 안내한다', () => {
  const app = makeApp('a2wl-p4-');
  skillFixture(app, { verify: ['{"barcode":"1","items":[]}', '{"barcode":"2"}'] });
  const r = checkPhase4(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('sample-2') && e.includes('items')));
  assert.ok(r.errors.some(e => e.includes('rollback 3')));
});

test('skill 4단계: 보고서 절이 없으면 실패', () => {
  const app = makeApp('a2wl-p4-');
  skillFixture(app, { rep: '## 사람 개입\n- 줄었다\n' });
  const r = checkPhase4(lite(app), { mode: 'skill', samples: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('## 스키마 일치율')));
});

test('상수: 모드별 보고서 절 셋씩', () => {
  assert.equal(DASHBOARD_REPORT_HEADINGS.length, 3);
  assert.equal(SKILL_REPORT_HEADINGS.length, 3);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test "tests/lite_phase4.test.mjs"`
Expected: FAIL — `Cannot find module …/lib/phase4.mjs`

- [ ] **Step 3: 구현**

`.claude/skills/agent-to-webapp-lite/scripts/lib/phase4.mjs`:

```js
// 4단계 재검증 게이트. 게이트가 직접 대조한다.
//   dashboard: run-1 과 run-2 의 열 표를 계약과 대 본다. 깨지는 변경(계약 열 삭제·타입 변경·키 중복)은 실패.
//   skill:     verify/sample-k.json N건이 있고 파싱되고 스펙의 출력 키를 채우는가. 값 차이는 학습자 몫.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sectionBody, isBlank, normalize } from './md.mjs';
import { parseColumnTable, diffColumns, readJson, topKeys, jsonBlockAfter } from './schema.mjs';
import { checkSchemaDoc, schemaFile, COLUMN_HEADING, sampleDir, SAMPLE_OUTPUT } from './phase1.mjs';
import { CONTRACT_FILE, SPEC_FILE } from './phase3.mjs';
import { DEFAULT_SAMPLES } from './status.mjs';

export const REPORT_FILE = join('verify', 'report.md');
export const DASHBOARD_REPORT_HEADINGS = ['## 스키마 diff', '## 키 중복', '## 판정'];
export const SKILL_REPORT_HEADINGS = ['## 스키마 일치율', '## 샘플별 차이', '## 사람 개입'];
export const DUP_HEADING = '## 키 중복';
export const NONE = '없음';
export const ROLLBACK_HINT = '계약을 고치려면 node check_lite.mjs rollback 3, 판정부터 다시 하려면 rollback 2';

export const verifySample = (k) => join('verify', `sample-${k}.json`);

function readReport(liteDir, headings, errors) {
  const p = join(liteDir, REPORT_FILE);
  if (!existsSync(p)) { errors.push(`${REPORT_FILE.split(/[\\/]/).join('/')} 없음`); return null; }
  const text = readFileSync(p, 'utf8');
  for (const h of headings) {
    const body = sectionBody(text, h);
    if (body === null) errors.push(`report.md: '${h}' 절이 없다`);
    else if (isBlank(body)) errors.push(`report.md: '${h}' 절이 비었다`);
  }
  return text;
}

function checkDashboard(liteDir, errors, warnings, notes) {
  const two = checkSchemaDoc(liteDir, 2, errors);
  const p1 = join(liteDir, schemaFile(1));
  const pc = join(liteDir, CONTRACT_FILE);
  if (!two || !existsSync(p1) || !existsSync(pc)) { errors.push('run-1.schema.md 와 contract.md 가 있어야 대조한다'); return []; }

  const before = parseColumnTable(readFileSync(p1, 'utf8'), COLUMN_HEADING);
  const after = two.cols;
  const contracted = parseColumnTable(readFileSync(pc, 'utf8'), COLUMN_HEADING).map(c => c.name);
  const d = diffColumns(before, after);

  const breaking = [];
  for (const name of d.removed) {
    if (contracted.includes(name)) { breaking.push(name); errors.push(`계약의 열 '${name}' 이 run-2 에 없다(삭제). ${ROLLBACK_HINT}`); }
    else warnings.push(`계약 밖의 열 '${name}' 이 사라졌다`);
  }
  for (const t of d.typeChanged) {
    if (contracted.includes(t.name)) { breaking.push(t.name); errors.push(`계약의 열 '${t.name}' 타입이 ${t.from} → ${t.to} 로 바뀌었다. ${ROLLBACK_HINT}`); }
    else warnings.push(`계약 밖의 열 '${t.name}' 타입이 ${t.from} → ${t.to}`);
  }
  for (const name of d.added) warnings.push(`run-2 에 새 열 '${name}' 이 있다. 계약 밖이라 무시해도 된다`);

  const text = readReport(liteDir, DASHBOARD_REPORT_HEADINGS, errors);
  if (text) {
    const dup = (sectionBody(text, DUP_HEADING) ?? '').trim().replace(/^-\s*/, '');
    if (dup && dup !== NONE) errors.push(`report.md: '${DUP_HEADING}' 가 '${NONE}' 이 아니다(${dup}). 유일 키가 키 구실을 못 한다. ${ROLLBACK_HINT}`);
    const flat = normalize(text);
    for (const name of breaking) {
      if (!flat.includes(name)) errors.push(`report.md 가 깨지는 변경 '${name}' 을 적지 않았다. 보고서는 게이트가 찾은 것을 담아야 한다`);
    }
  }
  notes.push(`열 대조: 추가 ${d.added.length} · 삭제 ${d.removed.length} · 타입 변경 ${d.typeChanged.length}`);
  return breaking;
}

function checkSkill(liteDir, samples, errors, warnings, notes) {
  const sp = join(liteDir, SPEC_FILE);
  const declared = existsSync(sp) ? topKeys(jsonBlockAfter(readFileSync(sp, 'utf8'), '## 출력 스키마') ?? {}) : [];
  if (declared.length === 0) errors.push(`${SPEC_FILE} 의 '## 출력 스키마' 를 읽지 못했다. 3단계로 돌아가라`);

  const breaking = [];
  for (let k = 1; k <= samples; k++) {
    const rel = verifySample(k).split(/[\\/]/).join('/');
    const r = readJson(join(liteDir, verifySample(k)));
    if (!r.ok) { errors.push(`${rel}: ${r.why}. 고정한 프롬프트·규칙으로 샘플 ${k} 를 다시 돌려라`); continue; }
    const keys = topKeys(r.value);
    const missing = declared.filter(x => !keys.includes(x));
    if (missing.length) {
      breaking.push(`sample-${k}`);
      errors.push(`${rel}: 스펙의 출력 키가 빠졌다(sample-${k}): ${missing.join(', ')}. ${ROLLBACK_HINT.replace('계약을', '스펙을')}`);
    }
    const before = readJson(join(liteDir, sampleDir(k), SAMPLE_OUTPUT));
    if (before.ok) {
      const was = topKeys(before.value);
      const added = keys.filter(x => !was.includes(x));
      const gone = was.filter(x => !keys.includes(x));
      if (added.length || gone.length) notes.push(`sample-${k} 키 차이: 추가 ${added.join(',') || '없음'} · 빠짐 ${gone.join(',') || '없음'}`);
    }
  }
  readReport(liteDir, SKILL_REPORT_HEADINGS, errors);
  return breaking;
}

export function checkPhase4(liteDir, { mode, samples = DEFAULT_SAMPLES } = {}) {
  const errors = [];
  const warnings = [];
  const notes = [];
  const breaking = mode === 'dashboard'
    ? checkDashboard(liteDir, errors, warnings, notes)
    : checkSkill(liteDir, samples, errors, warnings, notes);
  return { ok: errors.length === 0, errors, warnings, notes, breaking };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — lite_phase4 12건 포함 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/agent-to-webapp-lite/scripts/lib/phase4.mjs tests/lite_phase4.test.mjs
git commit -m "feat(lite): 4단계 재검증 게이트 — 열 표와 출력 JSON 을 게이트가 직접 대조"
```

---

### Task 8: 5단계 전환 게이트

**Files:**
- Create: `.claude/skills/agent-to-webapp-lite/scripts/lib/phase5.mjs`
- Test: `tests/lite_phase5.test.mjs`

**Interfaces:**
- Consumes: `./md.mjs`, `./phase2.mjs` 의 `parseVerdict`·`VERDICT_FILE`·`SKILL_VERDICTS`, `./phase3.mjs` 의 `excludedColumns`·`CONTRACT_FILE`·`CONTRACT_TABLE`·`CONTRACT_KEY`, `./phase1.mjs` 의 `sampleDir`
- Produces:
  - `BRIEF_FILE` = `'brief.md'`, `PROMPT_FILE` = `'prompt.md'`
  - `TIERS_HEADING` = `'## 3층 구조'`, `TIERS` = `['화면(프리젠테이션)','처리(비즈니스)','데이터(저장·바깥)']`
  - `ISSUES_HEADING` = `'## 논의점'`, `DECISION` = `'결정:'`
  - `DASHBOARD_BRIEF_HEADINGS`, `SKILL_BRIEF_HEADINGS` (각 7개, 기획서 §5-4·§6-4)
  - `FRESHNESS` = `'마지막 갱신 시각'`, `PROTECTION` = `'배포 보호'`, `DURATION_KEYWORD` = `'maxDuration'`, `STATE_KEYWORDS` = `['Supabase','DB 없음']`, `HUMAN_CHECK` = `'확인·수정 화면'`, `SIZE_KEYWORD` = `'파일 크기'`, `BODY_LIMIT_MB` = `4.5`, `SIZE_NEAR_BYTES` = `3*1024*1024`
  - `DASHBOARD_PROMPT_MUST`, `SKILL_PROMPT_MUST`
  - `largestFile(dir)` → `{ rel, size }` 또는 `null`
  - `checkPhase5(liteDir, { mode, samples })` → `{ ok, errors, warnings, notes }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/lite_phase5.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, LITE } from './helpers.mjs';
import {
  checkPhase5, DASHBOARD_BRIEF_HEADINGS, SKILL_BRIEF_HEADINGS,
  DASHBOARD_PROMPT_MUST, SKILL_PROMPT_MUST, TIERS,
} from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase5.mjs';

const lite = (app) => join(app, LITE);

const TIER_TABLE = ['## 3층 구조', '', '| 층 | 이 앱에서 | 코드 위치 |', '|---|---|---|',
  `| ${TIERS[0]} | 표 한 화면 | \`src/app/\` |`,
  `| ${TIERS[1]} | 조회·집계 | \`src/lib/query/\` |`,
  `| ${TIERS[2]} | Supabase channel_sales | \`src/lib/data/\` |`, ''].join('\n');

const ISSUES = ['## 논의점', '- 민감 열을 뺄까요 · 기본값: 뺀다 · 결정: 뺀다 (기본값)', ''].join('\n');

function contractDoc(excluded = '- memo') {
  return ['## 테이블', 'channel_sales', '', '## 열', '', '| 열 | 타입 | 필수 | 설명 |', '|---|---|---|---|',
    '| channel | 문자열 | 예 | 채널 |', '', '## 유일 키', 'channel + sold_on', '', '## 갱신 시각', 'checked_at', '',
    '## upsert 규칙', '덮어쓴다', '', '## 갱신 주체', '마지막 단계', '', '## 제외 열', excluded, '',
    '## 파생 집계', '- 없음', '', '## 에이전트에 추가할 마지막 단계', 'upsert', ''].join('\n');
}

function dashBrief({ screens = '- 채널별 매출 표 한 화면', auth = '범위 밖. Vercel 배포 보호를 켠다.', fresh = '마지막 갱신 시각을 머리에 띄운다. 24시간 넘으면 회색으로.' } = {}) {
  return [TIER_TABLE, ISSUES,
    '## 1. 데이터 계약 요약', '테이블 `channel_sales`, 유일 키 channel + sold_on', '',
    '## 2. 화면 목록', screens, '',
    '## 3. 필터·정렬·집계', '- 기간 필터, 채널 필터', '',
    '## 4. 갱신 표시', fresh, '',
    '## 5. 적재 경로', '에이전트 마지막 단계가 Supabase 로 upsert 한다', '',
    '## 6. 인증', auth, '',
    '## 7. 배포 후 검증', '- [ ] 환경변수', '- [ ] 배포 보호', '- [ ] 제외 열이 화면에 없다', '- [ ] 마지막 갱신 시각', '- [ ] 중복 행 없음', ''].join('\n');
}

function promptDoc(must) {
  return ['# 다음 세션 프롬프트', '', '```', ...must, '```', ''].join('\n');
}

function dashFixture(app, opts = {}) {
  write(app, `${LITE}/contract.md`, contractDoc(opts.excluded));
  write(app, `${LITE}/brief.md`, dashBrief(opts));
  write(app, `${LITE}/prompt.md`, promptDoc(DASHBOARD_PROMPT_MUST));
}

test('dashboard 5단계: 아홉 절과 고정 문자열이 차 있으면 통과', () => {
  const app = makeApp('a2wl-p5-');
  dashFixture(app);
  const r = checkPhase5(lite(app), { mode: 'dashboard' });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('dashboard 5단계: 제외 열 이름이 화면 목록에 있으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  dashFixture(app, { screens: '- 채널별 매출과 memo 를 같이 보여준다' });
  const r = checkPhase5(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('memo')));
});

test('dashboard 5단계: 배포 보호가 없으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  dashFixture(app, { auth: '범위 밖이다.' });
  const r = checkPhase5(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('배포 보호')));
});

test('dashboard 5단계: 마지막 갱신 시각이 없으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  dashFixture(app, { fresh: '언제 갱신됐는지 보여준다' });
  const r = checkPhase5(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('마지막 갱신 시각')));
});

test('dashboard 5단계: prompt.md 코드 블록에 계약 경로가 없으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  dashFixture(app);
  write(app, `${LITE}/prompt.md`, promptDoc(DASHBOARD_PROMPT_MUST.filter(m => !m.includes('contract.md'))));
  const r = checkPhase5(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('contract.md')));
});

test('dashboard 5단계: 논의점 항목에 결정이 없으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  dashFixture(app);
  write(app, `${LITE}/brief.md`, dashBrief().replace('· 결정: 뺀다 (기본값)', ''));
  const r = checkPhase5(lite(app), { mode: 'dashboard' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('결정:')));
});

// skill 모드
function skillBrief({ human = '- 확인·수정 화면에서 사람이 금액을 고친다', state = 'Supabase', dur = '`maxDuration = 60`' } = {}) {
  return [TIER_TABLE, ISSUES,
    '## 1. 서버 쪽 호출', 'Route Handler 에만 키를 둔다', '',
    '## 2. 실행 시간 분할', `단계 시간 20초. ${dur}`, '',
    '## 3. 상태 저장', state, '- 파싱 결과와 확인 상태를 남긴다', '',
    '## 4. 사람 확인 지점', human, '',
    '## 5. 외부 서비스로 뺄 단계', '- 없음', '',
    '## 6. 인증', '범위 밖. Vercel 배포 보호를 켠다.', '',
    '## 7. 배포 후 검증', '- [ ] 환경변수', '- [ ] 배포 보호', '- [ ] 확인 화면', '- [ ] maxDuration', '- [ ] 샘플 5건', ''].join('\n');
}

function skillFixture(app, opts = {}) {
  write(app, `${LITE}/verdict.md`, '## 근거\n- x\n\n## 출력 구조\n- x\n\n## 사람 확인\n- x\n\n판정: Claude 호출 유지\n');
  write(app, `${LITE}/runs/sample-1/inv-1.pdf`, 'PDF');
  write(app, `${LITE}/brief.md`, skillBrief(opts));
  write(app, `${LITE}/prompt.md`, promptDoc(SKILL_PROMPT_MUST));
}

test('skill 5단계: 아홉 절과 고정 문자열이 차 있으면 통과', () => {
  const app = makeApp('a2wl-p5-');
  skillFixture(app);
  const r = checkPhase5(lite(app), { mode: 'skill', samples: 1 });
  assert.ok(r.ok, r.errors.join(' / '));
});

test('skill 5단계: Claude 호출 유지인데 확인·수정 화면이 없으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  skillFixture(app, { human: '- 없음' });
  const r = checkPhase5(lite(app), { mode: 'skill', samples: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('확인·수정 화면')));
});

test('skill 5단계: maxDuration 이 없으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  skillFixture(app, { dur: '충분히 잡는다' });
  const r = checkPhase5(lite(app), { mode: 'skill', samples: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('maxDuration')));
});

test('skill 5단계: 3절에 Supabase 도 DB 없음도 없으면 실패', () => {
  const app = makeApp('a2wl-p5-');
  skillFixture(app, { state: '적당히 저장' });
  const r = checkPhase5(lite(app), { mode: 'skill', samples: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Supabase')));
});

test('skill 5단계: 큰 샘플 파일이면 파일 크기 안내를 요구한다', () => {
  const app = makeApp('a2wl-p5-');
  skillFixture(app);
  write(app, `${LITE}/runs/sample-1/big.pdf`, 'x'.repeat(3 * 1024 * 1024 + 1));
  const r = checkPhase5(lite(app), { mode: 'skill', samples: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('파일 크기')));
  assert.ok(r.notes.some(n => n.includes('MB')));
});

test('상수: 브리프 절 일곱씩, PROMPT_MUST 여섯씩', () => {
  assert.equal(DASHBOARD_BRIEF_HEADINGS.length, 7);
  assert.equal(SKILL_BRIEF_HEADINGS.length, 7);
  assert.equal(DASHBOARD_PROMPT_MUST.length, 6);
  assert.equal(SKILL_PROMPT_MUST.length, 6);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test "tests/lite_phase5.test.mjs"`
Expected: FAIL — `Cannot find module …/lib/phase5.mjs`

- [ ] **Step 3: 구현**

`.claude/skills/agent-to-webapp-lite/scripts/lib/phase5.mjs`:

```js
// 5단계 전환 게이트. 브리프의 3층 구조·논의점·일곱 절과 모드별 고정 문자열, 다음 세션용 prompt.md.
// dashboard 의 교차 검사: 계약의 제외 열 이름이 화면·필터 절에 나타나면 실패한다. 이 모드의 진짜 사고다.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { normalize, sectionBody, isBlank } from './md.mjs';
import { parseVerdict, VERDICT_FILE, SKILL_VERDICTS } from './phase2.mjs';
import { excludedColumns, CONTRACT_FILE, CONTRACT_TABLE, CONTRACT_KEY } from './phase3.mjs';
import { sampleDir } from './phase1.mjs';
import { DEFAULT_SAMPLES } from './status.mjs';

export const BRIEF_FILE = 'brief.md';
export const PROMPT_FILE = 'prompt.md';
export const TIERS_HEADING = '## 3층 구조';
export const TIERS = ['화면(프리젠테이션)', '처리(비즈니스)', '데이터(저장·바깥)'];
export const ISSUES_HEADING = '## 논의점';
export const DECISION = '결정:';
export const DASHBOARD_BRIEF_HEADINGS = ['## 1. 데이터 계약 요약', '## 2. 화면 목록', '## 3. 필터·정렬·집계', '## 4. 갱신 표시', '## 5. 적재 경로', '## 6. 인증', '## 7. 배포 후 검증'];
export const SKILL_BRIEF_HEADINGS = ['## 1. 서버 쪽 호출', '## 2. 실행 시간 분할', '## 3. 상태 저장', '## 4. 사람 확인 지점', '## 5. 외부 서비스로 뺄 단계', '## 6. 인증', '## 7. 배포 후 검증'];
export const FRESHNESS = '마지막 갱신 시각';
export const PROTECTION = '배포 보호';
export const DURATION_KEYWORD = 'maxDuration';
export const STATE_KEYWORDS = ['Supabase', 'DB 없음'];
export const HUMAN_CHECK = '확인·수정 화면';
export const SIZE_KEYWORD = '파일 크기';
export const BODY_LIMIT_MB = 4.5;
export const SIZE_NEAR_BYTES = 3 * 1024 * 1024;
export const DASHBOARD_PROMPT_MUST = ['docs/agent-to-webapp-lite/brief.md', 'docs/agent-to-webapp-lite/contract.md', 'create-next-app', 'Supabase', '3층 구조', 'src/lib/data/'];
export const SKILL_PROMPT_MUST = ['docs/agent-to-webapp-lite/brief.md', 'docs/agent-to-webapp-lite/skill-spec.md', 'create-next-app', 'src/lib/workflow/', '3층 구조', 'maxDuration'];

// dir 아래에서 가장 큰 파일. 없으면 null.
export function largestFile(dir) {
  if (!existsSync(dir)) return null;
  let best = null;
  const walk = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(d, e.name), r);
      else if (e.isFile()) {
        const size = statSync(join(d, e.name)).size;
        if (!best || size > best.size) best = { rel: r, size };
      }
    }
  };
  walk(dir, '');
  return best;
}

function checkCommon(text, headings, errors) {
  for (const h of headings) {
    const body = sectionBody(text, h);
    if (body === null) errors.push(`${BRIEF_FILE}: '${h}' 절이 없다`);
    else if (isBlank(body)) errors.push(`${BRIEF_FILE}: '${h}' 절이 비었다`);
  }
  const tiers = sectionBody(text, TIERS_HEADING);
  if (tiers === null || isBlank(tiers)) errors.push(`${BRIEF_FILE}: '${TIERS_HEADING}' 절이 ${tiers === null ? '없다' : '비었다'}. ${TIERS.join('·')} 세 줄의 표를 적는다`);
  else for (const t of TIERS) if (!tiers.includes(t)) errors.push(`${BRIEF_FILE}: '${TIERS_HEADING}' 표에 '${t}' 줄이 없다`);

  const issues = sectionBody(text, ISSUES_HEADING);
  if (issues === null || isBlank(issues)) errors.push(`${BRIEF_FILE}: '${ISSUES_HEADING}' 절이 ${issues === null ? '없다' : '비었다'}. 물은 것이 없으면 '- 없음'`);
  else for (const line of issues.split('\n')) {
    const l = line.trim();
    if (!l.startsWith('- ') || l === '- 없음') continue;
    if (!l.includes(DECISION)) errors.push(`${BRIEF_FILE}: '${ISSUES_HEADING}' 항목에 '${DECISION}' 이 없다: ${l.slice(2, 60)}`);
  }

  const auth = sectionBody(text, headings[5]);
  if (auth !== null && !auth.includes(PROTECTION)) {
    errors.push(`${BRIEF_FILE}: '${headings[5]}' 절에 'Vercel ${PROTECTION}를 켠다' 가 없다. URL 을 아는 누구나 열 수 있다`);
  }
  const deploy = sectionBody(text, headings[6]) ?? '';
  const boxes = deploy.match(/^- \[ \] /gm) ?? [];
  if (boxes.length < 5) errors.push(`${BRIEF_FILE}: '${headings[6]}' 절의 체크박스가 ${boxes.length}개다. 다섯 개 이상 적는다`);
}

function checkPrompt(liteDir, must, errors) {
  const p = join(liteDir, PROMPT_FILE);
  if (!existsSync(p)) { errors.push(`${PROMPT_FILE} 없음. 단계 문서의 프롬프트 5 를 코드 블록으로 담아 둔다`); return; }
  const block = normalize(readFileSync(p, 'utf8')).match(/```[^\n]*\n([\s\S]*?)\n```/);
  if (!block) { errors.push(`${PROMPT_FILE}: 붙여넣을 프롬프트 코드 블록이 없다`); return; }
  for (const m of must) if (!block[1].includes(m)) errors.push(`${PROMPT_FILE}: 코드 블록에 '${m}' 가 없다 (프롬프트 5 원문을 그대로 넣는다)`);
}

export function checkPhase5(liteDir, { mode, samples = DEFAULT_SAMPLES } = {}) {
  const errors = [];
  const warnings = [];
  const notes = [];
  const p = join(liteDir, BRIEF_FILE);
  if (!existsSync(p)) return { ok: false, errors: [`${BRIEF_FILE} 없음`], warnings, notes };
  const text = readFileSync(p, 'utf8');
  const headings = mode === 'dashboard' ? DASHBOARD_BRIEF_HEADINGS : SKILL_BRIEF_HEADINGS;
  checkCommon(text, headings, errors);

  if (mode === 'dashboard') {
    const fresh = sectionBody(text, headings[3]) ?? '';
    if (!fresh.includes(FRESHNESS)) errors.push(`${BRIEF_FILE}: '${headings[3]}' 절에 '${FRESHNESS}' 가 없다. 갱신이 멈춘 화면이 최신처럼 보이면 안 된다`);

    const cp = join(liteDir, CONTRACT_FILE);
    if (existsSync(cp)) {
      const contract = readFileSync(cp, 'utf8');
      const table = (sectionBody(contract, CONTRACT_TABLE) ?? '').trim();
      const key = (sectionBody(contract, CONTRACT_KEY) ?? '').trim();
      const summary = sectionBody(text, headings[0]) ?? '';
      if (table && !summary.includes(table)) errors.push(`${BRIEF_FILE}: '${headings[0]}' 에 계약의 테이블 이름 '${table}' 이 없다`);
      if (key && !summary.includes(key)) errors.push(`${BRIEF_FILE}: '${headings[0]}' 에 계약의 유일 키 '${key}' 가 없다`);
      // 제외 열이 화면·필터로 새어 나가는지 본다
      const exposed = [sectionBody(text, headings[1]) ?? '', sectionBody(text, headings[2]) ?? ''].join('\n');
      for (const name of excludedColumns(contract)) {
        if (exposed.includes(name)) errors.push(`${BRIEF_FILE}: 계약의 제외 열 '${name}' 이 '${headings[1]}' 또는 '${headings[2]}' 에 있다. 민감 열은 대시보드에 싣지 않는다`);
      }
    } else warnings.push(`${CONTRACT_FILE} 이 없어 제외 열 교차 검사를 건너뛰었다`);
    checkPrompt(liteDir, DASHBOARD_PROMPT_MUST, errors);
  } else {
    const split = sectionBody(text, headings[1]) ?? '';
    if (!split.includes(DURATION_KEYWORD)) errors.push(`${BRIEF_FILE}: '${headings[1]}' 절에 '${DURATION_KEYWORD} = <초>' 가 없다. 기본 제한은 최대치보다 짧다`);
    const state = sectionBody(text, headings[2]) ?? '';
    if (!STATE_KEYWORDS.some(k => state.includes(k))) errors.push(`${BRIEF_FILE}: '${headings[2]}' 절에 '${STATE_KEYWORDS.join("' 또는 '")}' 이 명시돼야 한다`);

    const vp = join(liteDir, VERDICT_FILE);
    const verdict = existsSync(vp) ? parseVerdict(readFileSync(vp, 'utf8'), SKILL_VERDICTS) : null;
    const human = sectionBody(text, headings[3]) ?? '';
    if (verdict === 'Claude 호출 유지' && !human.includes(HUMAN_CHECK)) {
      errors.push(`${BRIEF_FILE}: 판정이 'Claude 호출 유지' 면 '${headings[3]}' 절에 '${HUMAN_CHECK}' 이 있어야 한다. LLM 결과를 확인 없이 확정하지 않는다`);
    }

    let biggest = null;
    for (let k = 1; k <= samples; k++) {
      const f = largestFile(join(liteDir, sampleDir(k)));
      if (f && (!biggest || f.size > biggest.size)) biggest = { rel: `sample-${k}/${f.rel}`, size: f.size };
    }
    if (biggest) {
      const mb = (biggest.size / 1048576).toFixed(1);
      notes.push(`샘플 입력 최대: runs/${biggest.rel} ${mb}MB (Vercel 함수 요청 본문 상한 ${BODY_LIMIT_MB}MB)`);
      if (biggest.size >= SIZE_NEAR_BYTES && !text.includes(SIZE_KEYWORD)) {
        errors.push(`runs/${biggest.rel} 이 ${mb}MB 로 상한(${BODY_LIMIT_MB}MB) 근처다(JSON base64 면 1.33배). 브리프에 '${SIZE_KEYWORD}' 안내를 적어라`);
      }
    }
    checkPrompt(liteDir, SKILL_PROMPT_MUST, errors);
  }
  return { ok: errors.length === 0, errors, warnings, notes };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — lite_phase5 12건 포함 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/agent-to-webapp-lite/scripts/lib/phase5.mjs tests/lite_phase5.test.mjs
git commit -m "feat(lite): 5단계 전환 게이트 — 제외 열 교차 검사, 확인·수정 화면 필수, prompt.md"
```

---

### Task 9: 게이트 CLI

**Files:**
- Create: `.claude/skills/agent-to-webapp-lite/scripts/check_lite.mjs`
- Test: `tests/lite_cli.test.mjs`

**Interfaces:**
- Consumes: Task 1·4~8 의 모든 모듈
- Produces: `run(argv, cwd, out, err)` → 종료코드 숫자, `parseArgs(argv)`, `PHASES` = `[1,2,3,4,5]`, `NEEDS_APPROVAL` = `[2,3]`, `SKILL_DIR`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/lite_cli.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeApp, write, LITE } from './helpers.mjs';
import { run, parseArgs } from '../.claude/skills/agent-to-webapp-lite/scripts/check_lite.mjs';

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
  assert.ok(readFileSync(join(app, LITE, 'STATUS.md'), 'utf8').includes('terminated:'));
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
  assert.ok(!text.includes('terminated:'));
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test "tests/lite_cli.test.mjs"`
Expected: FAIL — `Cannot find module …/scripts/check_lite.mjs`

- [ ] **Step 3: 구현**

`.claude/skills/agent-to-webapp-lite/scripts/check_lite.mjs`:

```js
#!/usr/bin/env node
// agent-to-webapp-lite 게이트 CLI. 작업 폴더(<이름>-app/)에서 실행한다.
//   node check_lite.mjs init --target <경로> --mode dashboard|skill [--output <경로>] [--skill <이름>] [--samples N]
//   node check_lite.mjs status
//   node check_lite.mjs <1-5> [--approve] [--batch] [--override "<사유>"]
//   node check_lite.mjs rollback <N>
// 종료코드: 0 통과 / 1 실패 / 2 사용법 오류. STATUS.md 는 이 스크립트만 쓴다. API 키는 쓰지 않는다.
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LITE_DIR, MODES, DEFAULT_SAMPLES, emptyStatus, readStatus, writeStatus, formatStatus, today } from './lib/status.mjs';
import { checkPhase1 } from './lib/phase1.mjs';
import { checkPhase2, TERMINAL_VERDICT, ROUTING } from './lib/phase2.mjs';
import { checkPhase3, CONTRACT_FILE, SPEC_FILE } from './lib/phase3.mjs';
import { checkPhase4 } from './lib/phase4.mjs';
import { checkPhase5, PROMPT_FILE } from './lib/phase5.mjs';

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const NEEDS_APPROVAL = [2, 3];
export const PHASES = [1, 2, 3, 4, 5];
const USAGE = [
  '사용법 (작업 폴더에서):',
  `  node check_lite.mjs init --target <경로> --mode ${MODES.join('|')} [--output <경로>] [--skill <이름>] [--samples N]`,
  '  node check_lite.mjs status',
  '  node check_lite.mjs <1-5> [--approve] [--batch] [--override "<사유>"]',
  '  node check_lite.mjs rollback <N>',
].join('\n');
const BOOL_FLAGS = new Set(['approve', 'batch']);
const CHECKS = {
  1: (d, o) => checkPhase1(d, o),
  2: (d, o) => checkPhase2(d, o),
  3: (d, o) => checkPhase3(d, o),
  4: (d, o) => checkPhase4(d, o),
  5: (d, o) => checkPhase5(d, o),
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
  const { target, mode } = flags;
  if (typeof target !== 'string' || !MODES.includes(mode)) {
    err(`init 은 --target <경로> --mode ${MODES.join('|')} 가 필요하다`); return 2;
  }
  if (!existsSync(resolve(cwd, target))) { err(`대상 폴더가 없다: ${target}`); return 2; }

  const opts = {};
  if (mode === 'dashboard') {
    if (typeof flags.output !== 'string') {
      err('dashboard 모드는 --output <경로> 가 필요하다 (에이전트가 남기는 출력 산출물. 구글 시트면 CSV 로 내보낸 파일)'); return 2;
    }
    opts.output = flags.output;
  } else {
    if (typeof flags.skill !== 'string') { err('skill 모드는 --skill <이름> 이 필요하다 (옮길 스킬 하나)'); return 2; }
    const samples = flags.samples === undefined ? DEFAULT_SAMPLES : Number(flags.samples);
    if (!Number.isInteger(samples) || samples < 1) { err(`--samples 는 1 이상의 정수다 (기본 ${DEFAULT_SAMPLES})`); return 2; }
    opts.skill = flags.skill;
    opts.samples = samples;
  }
  mkdirSync(join(cwd, LITE_DIR, 'runs'), { recursive: true });
  mkdirSync(join(cwd, LITE_DIR, 'verify'), { recursive: true });
  const st = emptyStatus(target, mode, opts);
  st.log.push(`${today()} init`);
  writeStatus(cwd, st);
  out(`STATUS 생성: target=${target} mode=${mode}${mode === 'dashboard' ? ` output=${opts.output}` : ` skill=${opts.skill} samples=${opts.samples}`}`);
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
  if (st.terminated) { err(`종료됨: ${st.terminated}. 다시 하려면 node check_lite.mjs rollback 2`); return 1; }
  if (n > 1 && !st.phases[n - 1]) { err(`${n - 1}단계를 먼저 통과해야 한다`); return 1; }

  const liteDir = join(cwd, LITE_DIR);
  const override = typeof flags.override === 'string' ? flags.override : null;
  const r = CHECKS[n](liteDir, { mode: st.mode, samples: st.samples, override });
  for (const w of r.warnings ?? []) out(`경고: ${w}`);
  for (const m of r.notes ?? []) out(m);
  if (!r.ok) {
    for (const e of r.errors) err(`실패: ${e}`);
    return 1;
  }

  const wantsApproval = NEEDS_APPROVAL.includes(n) && !flags.batch;
  if (wantsApproval && !flags.approve) {
    const doc = n === 2 ? 'verdict.md' : (st.mode === 'dashboard' ? CONTRACT_FILE : SPEC_FILE);
    err(`${n}단계 검사는 통과. 학습자가 ${doc} 를 읽고 동의하면 --approve 로 다시 실행하라. 통과 기록은 아직 안 남겼다`);
    return 1;
  }

  st.phases[n] = { passed: today(), approved: NEEDS_APPROVAL.includes(n) && Boolean(flags.approve) };
  if (override) st.log.push(`${today()} phase-${n} override: ${override}`);
  if (flags.batch && NEEDS_APPROVAL.includes(n)) st.log.push(`${today()} phase-${n} batch (승인 생략)`);

  if (n === 2 && r.verdict === TERMINAL_VERDICT) {
    st.terminated = `${TERMINAL_VERDICT} ${today()}`;
    st.log.push(`${today()} terminated: ${TERMINAL_VERDICT}`);
    writeStatus(cwd, st);
    out(`2단계 통과. 판정: ${TERMINAL_VERDICT} → 여기서 종료.\n${ROUTING[st.mode]}`);
    return 0;
  }
  writeStatus(cwd, st);
  out(`${n}단계 통과${r.verdict ? ` (판정: ${r.verdict})` : ''}`);
  if (n === 5) out(`다음 세션: 이 폴더에서 새 세션을 열고 ${LITE_DIR.split(/[\\/]/).join('/')}/${PROMPT_FILE} 의 코드 블록을 붙여넣는다`);
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

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — lite_cli 14건 포함 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add .claude/skills/agent-to-webapp-lite/scripts/check_lite.mjs tests/lite_cli.test.mjs
git commit -m "feat(lite): 게이트 CLI — init 의 모드별 필수 인자, 승인·batch·override·rollback"
```

---

### Task 10: dashboard 단계 문서와 브리프 틀

**Files:**
- Create: `.claude/skills/agent-to-webapp-lite/references/dashboard/phase-1.md` … `phase-5.md`
- Create: `.claude/skills/agent-to-webapp-lite/references/brief-template-dashboard.md`

**Interfaces:**
- Consumes: Task 4~8 의 상수 문자열. 문서가 그 문자열을 그대로 담아야 Task 12 의 `lite_references.test.mjs` 가 통과한다
- Produces: 각 단계 세션이 읽는 절차와 「프롬프트 N」 절

**규칙:** 문서마다 맨 위에 "언제 읽나: phase-K 통과, phase-K+1 미통과" 한 줄. 프롬프트는 문서 안 `### 프롬프트 N` 절에 둔다(정식 §2-17 과 같은 방식).

- [ ] **Step 1: `brief-template-dashboard.md` 를 쓴다**

게이트가 헤딩과 고정 문자열을 그대로 찾으므로 아래를 그대로 만든다.

````markdown
# 대시보드 브리프: <이름>

작성일: <YYYY-MM-DD> · 대상: <대상 경로> · 계약: docs/agent-to-webapp-lite/contract.md · 검증: docs/agent-to-webapp-lite/verify/report.md

이 문서는 같은 폴더의 다음 세션이 읽는 지시문이다. 헤딩은 고치지 않는다(게이트가 찾는다).

## 3층 구조
화면(프리젠테이션)은 사용자가 보는 곳, 처리(비즈니스)는 조회·집계, 데이터(저장·바깥)는 기억하는 곳이다.
대시보드는 읽기만 한다. 쓰는 것은 에이전트다.

| 층 | 이 앱에서 | 코드 위치 |
|---|---|---|
| 화면(프리젠테이션) | <표 한 화면 · 필터 · 마지막 갱신 시각 배지> | `src/app/` |
| 처리(비즈니스) | <조회·정렬·집계 함수. 제외 열은 select 에서 뺀다> | `src/lib/query/` |
| 데이터(저장·바깥) | <Supabase 테이블 이름. 밖으로 나가는 것: 없음> | `src/lib/data/` |

## 논의점
5단계에서 스킬이 학습자에게 물은 것과 답. 조건이 걸린 항목만. 없으면 `- 없음`. `--batch` 면 기본값에 `(기본값)`.
- <질문> · 기본값: <…> · 결정: <답> (<날짜> 또는 기본값)

## 1. 데이터 계약 요약
contract.md 의 테이블 이름과 유일 키를 **그대로** 적는다(게이트가 대조한다).
- 테이블: `<계약의 테이블 이름>`
- 유일 키: <계약의 유일 키>
- 열: <계약의 열 목록>
- 대시보드에서 빼는 열: <계약의 제외 열. 없으면 없음>

## 2. 화면 목록
한 화면 원칙. 표 하나로 시작하고 차트는 나중에 붙인다. 제외 열은 여기에 적지 않는다.
- <화면 이름과 보여주는 것>

## 3. 필터·정렬·집계
- 필터: <열과 기본값>
- 정렬: <기본 정렬>
- 집계: <합계·평균. 없으면 없음>

## 4. 갱신 표시
`마지막 갱신 시각` 을 화면에 둔다. 에이전트가 안 돌면 옛 데이터가 최신처럼 보이기 때문이다.
- 표시 위치: <머리 배지 등>
- 오래됐을 때: <n시간 넘으면 회색·경고 문구>
- 한 번도 안 돌았을 때: <빈 상태 문구>

## 5. 적재 경로
- 넣는 주체: <계약의 갱신 주체>
- 방법: <Supabase 클라이언트로 upsert / API 경로로 POST>
- 키 충돌: <같은 키면 덮어쓴다>

## 6. 인증
범위 밖. 단일 사용자 데모. 로그인·멀티테넌트를 만들지 않는다. 대신 Vercel 배포 보호를 켠다(프로젝트 Settings →
Deployment Protection). URL 을 아는 누구나 이 데이터를 볼 수 있기 때문이다. 행 단위 권한이 필요하면 논의점에
적고 Supabase RLS 를 다음 세션의 일로 남긴다.

## 7. 배포 후 검증
- [ ] Vercel 환경변수에 Supabase URL 과 anon 키가 있다
- [ ] 배포 보호가 켜져 있다: 시크릿 창에서 URL 을 열면 로그인을 요구한다
- [ ] 계약의 제외 열이 화면·네트워크 응답 어디에도 없다
- [ ] `마지막 갱신 시각` 이 화면에 보이고 값이 최신 행과 같다
- [ ] 에이전트를 한 번 더 돌려도 같은 키의 행이 늘지 않는다(upsert)
- [ ] 필터·정렬이 행 수를 바꿔도 합계가 맞는다

## 스타일 (선택)
<비워 두면 다음 세션이 기본 스타일로 만든다>
````

- [ ] **Step 2: `dashboard/phase-1.md` 를 쓴다**

제목 `# 1단계 관찰 (dashboard)`, "언제 읽나: init 완료, phase-1 미통과".

담아야 할 것:
- 학습자 안내: 대상 폴더에서 에이전트를 **1회** 돌리고 출력 산출물(STATUS 의 `output`)을 그대로 둔다. 구글 시트가 원장이면 CSV 로 내보내 경로를 준다. 스킬은 시트 API 를 쓰지 않는다
- `### 프롬프트 1` 절: 출력 파일을 읽고 `$LITE/runs/run-1.schema.md` 를 만드는 지시. 일곱 절(`## 출처`, `## 열`, `## 행 수`, `## 유일 키 후보`, `## 갱신 시각 열`, `## LLM 문장 열`, `## 민감 열 후보`)을 **그대로** 나열하고, `## 열` 은 `| 열 | 타입 | 예시값 | 빈 값 비율 |` 머리글의 표로, 타입은 `문자열·정수·실수·날짜·불리언` 중에서, 민감 열은 계좌·급여·상담 원문·개인 이름을 후보로 본다고 적는다. 없는 항목은 `없음`/`- 없음` 으로 적게 한다
- 게이트: `node $SKILL_DIR/scripts/check_lite.mjs 1`

- [ ] **Step 3: `dashboard/phase-2.md` 를 쓴다**

제목 `# 2단계 판정 (dashboard)`, "언제 읽나: phase-1 통과, phase-2 미통과".

담아야 할 것:
- 판정은 **서브에이전트**가 새 컨텍스트에서 한다(정식 §2-5 와 같은 이유: 자기 관찰을 자기가 평가하지 않는다)
- `### 프롬프트 2` 절: `run-1.schema.md` 를 읽고 `$LITE/verdict.md` 를 쓰는 지시. `## 근거`·`## 민감 열` 절과 마지막 줄 `판정: 고정 가능` / `판정: 조건부 고정 가능` / `판정: 고정 불가` 를 모두 문자열 그대로 적는다
- 관찰 1회 위에서는 `고정 가능` 을 쓰지 말고 `조건부 고정 가능(관찰 1회)` 로 쓴다고 명시(게이트가 거부한다)
- 근거에 넣을 것: 유일 키 후보 유무, 갱신 시각 열 유무, 행 수 규모, LLM 문장 열, 민감 열 처리 방침
- 게이트: `node $SKILL_DIR/scripts/check_lite.mjs 2` → 학습자 동의 후 `2 --approve`
- `고정 불가` 면 종료된다는 것과 그때의 안내(`ROUTING.dashboard` 문구 요약)

- [ ] **Step 4: `dashboard/phase-3.md` 를 쓴다**

제목 `# 3단계 고정 (dashboard)`, "언제 읽나: phase-2 통과, phase-3 미통과".

담아야 할 것:
- `### 프롬프트 3` 절: `$LITE/contract.md` 아홉 절을 문자열 그대로 나열 — `## 테이블`, `## 열`, `## 유일 키`, `## 갱신 시각`, `## upsert 규칙`, `## 갱신 주체`, `## 제외 열`, `## 파생 집계`, `## 에이전트에 추가할 마지막 단계`
- `## 열` 은 `| 열 | 타입 | 필수 | 설명 |` 표. 관찰에 없는 열을 만들지 않는다(게이트가 실패시킨다)
- `## 유일 키` 에 `없음` 을 쓸 수 없다. 키가 없으면 에이전트 출력에 키를 먼저 만들고 1단계로 돌아간다
- `## 제외 열` 에는 1단계 민감 열 후보를 옮긴다. 없으면 `- 없음`
- `## 에이전트에 추가할 마지막 단계` 는 사람 말로 적는다(예: "CSV 를 읽어 channel_sales 에 upsert 한다")
- 게이트: `3` → 동의 후 `3 --approve`

- [ ] **Step 5: `dashboard/phase-4.md` 를 쓴다**

제목 `# 4단계 재검증 (dashboard)`, "언제 읽나: phase-3 통과, phase-4 미통과".

담아야 할 것:
- 학습자 안내: 에이전트를 **한 번 더** 돌린다. 같은 입력이 아니어도 된다
- `### 프롬프트 4` 절: 새 출력으로 `$LITE/runs/run-2.schema.md` 를 1단계와 **같은 일곱 절**로 만들고, `$LITE/verify/report.md` 에 `## 스키마 diff`·`## 키 중복`·`## 판정` 을 적는 지시
- `## 키 중복` 은 유일 키가 겹치는 행 수. 없으면 `없음`(게이트가 `없음` 이 아니면 실패시킨다)
- 게이트가 열 표를 직접 대조하므로 보고서에 없는 변경을 지어내거나 있는 변경을 빠뜨리면 실패한다고 명시
- 깨지면 `rollback 3`(계약 수정) 또는 `rollback 2`(재판정)
- 게이트: `node $SKILL_DIR/scripts/check_lite.mjs 4`

- [ ] **Step 6: `dashboard/phase-5.md` 를 쓴다**

제목 `# 5단계 전환 (dashboard)`, "언제 읽나: phase-4 통과, phase-5 미통과".

담아야 할 것:
1. `references/brief-template-dashboard.md` 를 `$LITE/brief.md` 로 복사해 채운다. 헤딩은 고치지 않는다
2. 절별 채우는 법: 1절은 계약의 테이블·유일 키를 **그대로**, 4절에 `마지막 갱신 시각`, 6절의 `배포 보호` 문장은 그대로 둔다, 2·3절에 제외 열 이름을 쓰지 않는다(게이트가 잡는다)
3. `### 논의점 묻는 법`: 한 번에 하나씩, 상황 한 줄·선택지 둘·기본값과 이유. `--batch` 면 기본값에 `(기본값)`. 조건이 안 걸리면 묻지 않는다
   - 제외 열이 있을 때: "민감한 열(<이름>)을 대시보드에서 빼면 <…>를 볼 수 없습니다. 그래도 뺄까요?" 기본값: 뺀다
   - 행 수가 많을 때(계약의 행 수가 5000 이상): "행이 <n>건입니다. 전부 불러오면 느립니다. 기간 필터를 기본으로 걸까요?" 기본값: 최근 3개월
4. `## 2. prompt.md 작성`: 아래 프롬프트를 `$LITE/prompt.md` 에 코드 블록으로 남긴다
5. `### 프롬프트 5 — 대시보드 만들기` 절에 아래를 그대로 담는다(게이트의 `DASHBOARD_PROMPT_MUST` 가 이 여섯 문자열을 찾는다):

```
docs/agent-to-webapp-lite/brief.md 와 docs/agent-to-webapp-lite/contract.md 를 읽고 이 데이터를 보는 대시보드를 Next.js 로 만들어줘.
- 이 폴더에서 create-next-app 을 먼저 돌릴 것. docs/ 와 .git 은 그대로 둔다
- 저장소는 Supabase 를 쓴다. contract.md 의 테이블·열·타입·유일 키 그대로 테이블을 만들고, 같은 키면 덮어쓰는 upsert 로 둔다
- 브리프의 "3층 구조" 표대로 둘 것. 화면은 src/app/, 조회·집계는 src/lib/query/, 저장은 src/lib/data/.
  화면 파일에서 DB 를 직접 부르지 말 것
- contract.md 의 "제외 열" 은 select 에서 빼고 화면·응답 어디에도 내보내지 말 것
- 화면은 표 하나로 시작한다. 브리프 "3. 필터·정렬·집계" 의 필터와 정렬을 붙이고, 머리에 마지막 갱신 시각을 띄운다
- 에이전트가 안 돌아 데이터가 오래됐거나 비었을 때 보이는 화면을 브리프 "4. 갱신 표시" 대로 만들 것
- 로그인은 만들지 말 것. 단일 사용자 데모다. 배포 보호는 브리프 6절대로 Vercel 설정에서 켠다
- 에이전트 쪽에 붙일 적재 코드는 브리프 "5. 적재 경로" 대로 따로 만들어 둘 것(웹 앱은 읽기만 한다)
```

- [ ] **Step 7: 문서가 게이트 상수를 담는지 눈으로 확인**

Run: `node -e "const fs=require('fs');const d='.claude/skills/agent-to-webapp-lite/references/dashboard/';for(const n of [1,2,3,4,5])console.log('phase-'+n, fs.readFileSync(d+'phase-'+n+'.md','utf8').length+'자')"`
Expected: 다섯 파일이 모두 읽힌다. 정식 검증은 Task 12 의 `lite_references.test.mjs` 가 한다

- [ ] **Step 8: 커밋**

```bash
git add .claude/skills/agent-to-webapp-lite/references/dashboard .claude/skills/agent-to-webapp-lite/references/brief-template-dashboard.md
git commit -m "docs(lite): dashboard 다섯 단계 문서와 대시보드 브리프 틀"
```

---

### Task 11: skill 단계 문서와 브리프 틀

**Files:**
- Create: `.claude/skills/agent-to-webapp-lite/references/skill/phase-1.md` … `phase-5.md`
- Create: `.claude/skills/agent-to-webapp-lite/references/brief-template-skill.md`

**Interfaces:**
- Consumes: Task 4~8 의 상수. 특히 `RUN_HEADINGS`, `SKILL_VERDICTS`, `SPEC_HEADINGS`·`SPEC_FIELDS`, `SKILL_REPORT_HEADINGS`, `SKILL_BRIEF_HEADINGS`, `SKILL_PROMPT_MUST`

- [ ] **Step 1: `brief-template-skill.md` 를 쓴다**

정식 `port-brief-template.md` 의 일곱 절을 가져오되 대상이 워크플로우가 아니라 스킬 하나다. 아래를 그대로 만든다.

````markdown
# 스킬 이식 브리프: <스킬 이름>

작성일: <YYYY-MM-DD> · 대상: <대상 경로> · 스펙: docs/agent-to-webapp-lite/skill-spec.md · 검증: docs/agent-to-webapp-lite/verify/report.md

이 문서는 같은 폴더의 다음 세션이 읽는 지시문이다. 헤딩은 고치지 않는다(게이트가 찾는다).

## 3층 구조

| 층 | 이 앱에서 | 코드 위치 |
|---|---|---|
| 화면(프리젠테이션) | <올리는 파일 종류·개수 · 기다리는 동안 보이는 것 · 확인·수정 화면 · 확정 버튼> | `src/app/` |
| 처리(비즈니스) | <파싱 함수 하나. LLM 호출 n회. skill-spec.md 의 스키마 그대로> | `src/lib/workflow/` |
| 데이터(저장·바깥) | <파싱 결과 테이블과 확인 상태 · 입력 파일 크기: 최대 n MB, 상한 4.5MB> | `src/lib/data/` |

## 논의점
조건이 걸린 항목만. 없으면 `- 없음`. `--batch` 면 기본값에 `(기본값)`.
- <질문> · 기본값: <…> · 결정: <답> (<날짜> 또는 기본값)

## 1. 서버 쪽 호출
Claude 를 부르는 코드와 API 키는 Route Handler 또는 Server Action 에만 둔다. 브라우저 번들에 키가 가지 않는다.
- LLM 호출: <skill-spec.md 의 프롬프트 한 번 / 없음(코드로 고정)>
- 환경변수: ANTHROPIC_API_KEY (Vercel 프로젝트 설정), 모델 ID 는 skill-spec.md 의 `- 모델:` 값
- 로컬 `next dev` 는 이 폴더의 `.env.local` 에 키를 둔다

## 2. 실행 시간 분할
- 샘플별 걸린 시간: <sample-1: n초 …>
- 함수 실행 시간 설정: `maxDuration = <초>` (가장 오래 걸린 샘플의 2배쯤. 기본 제한은 최대치보다 짧아 반드시 적는다)
- 나눌 단계: <없음 / 업로드와 파싱을 나눈다>

## 3. 상태 저장
<첫 줄에 `Supabase` 또는 `DB 없음`>
- 확인·수정 화면이 있으면 사람이 고친 값과 확정 여부를 남겨야 하므로 `Supabase`
- Supabase 면: 테이블 `parses`(입력 파일명·원본 JSON·수정 JSON·상태 pending|confirmed)

## 4. 사람 확인 지점
<판정이 `Claude 호출 유지` 면 `확인·수정 화면` 이 반드시 있다. 파싱 결과를 표로 보여주고 값을 고칠 수 있게 한 뒤
확정 버튼을 누르면 상태가 confirmed 가 된다. skill-spec.md 의 확신도 규칙에 걸린 필드는 눈에 띄게 표시한다>

## 5. 외부 서비스로 뺄 단계
<OCR·외부 API 등. 없으면 `- 없음`>

## 6. 인증
범위 밖. 단일 사용자 데모. 로그인·멀티테넌트를 만들지 않는다. 대신 Vercel 배포 보호를 켠다(프로젝트 Settings →
Deployment Protection). URL 을 아는 누구나 학습자의 API 키로 앱을 돌릴 수 있기 때문이다.

## 7. 배포 후 검증
- [ ] Vercel 환경변수에 `ANTHROPIC_API_KEY` 가 있다. Supabase 면 URL 과 키도
- [ ] 브라우저 번들에 키가 없다: 빌드 뒤 `grep -r "sk-ant" .next/static` 이 비어 있다
- [ ] 배포 보호가 켜져 있다: 시크릿 창에서 URL 을 열면 로그인을 요구한다
- [ ] Route Handler 에 `export const maxDuration` 이 있고 값이 2절과 같다
- [ ] `runs/sample-*/` 의 입력을 배포된 앱에 넣어 `verify/report.md` 와 비교했다
- [ ] 확인·수정 화면 없이는 결과를 확정할 수 없다
- [ ] 상한을 넘는 파일을 올리면 거절 문구가 나온다

## 스타일 (선택)
<비워 두면 다음 세션이 기본 스타일로 만든다>
````

- [ ] **Step 2: `skill/phase-1.md` 를 쓴다**

제목 `# 1단계 관찰 (skill)`, "언제 읽나: init 완료, phase-1 미통과".

담아야 할 것:
- 학습자 안내: 대상 폴더에서 그 스킬 하나만 샘플 N건(STATUS 의 `samples`)에 돌린다. 입력 원본과 결과를 `$LITE/runs/sample-k/` 에 둔다. 결과 파일 이름은 `output.json` 고정
- 샘플 고르는 법: 쉬운 것 하나, 보통 둘, 예외 하나 이상(형식이 다르거나 값이 빠진 것)
- `### 프롬프트 1` 절: `$LITE/runs/run-1.md` 를 네 절(`## 수행한 단계`, `## 판단이 필요했던 지점`, `## 예상과 달라서 방식을 바꾼 지점`, `## 샘플별 기록`)로 쓰는 지시. `## 샘플별 기록` 은 `| 샘플 | 입력 파일 | 사람 개입 |` 표
- `output.json` 은 최상위가 객체여야 한다(배열이면 `{ "items": [...] }` 로 감싼다). 게이트가 최상위 키로 판정한다
- 게이트: `node $SKILL_DIR/scripts/check_lite.mjs 1`

- [ ] **Step 3: `skill/phase-2.md` 를 쓴다**

제목 `# 2단계 판정 (skill)`, "언제 읽나: phase-1 통과, phase-2 미통과".

담아야 할 것:
- 판정은 서브에이전트가 새 컨텍스트에서. `references/decision-axes.md` 의 세 결정 축(제어권·도구·환경)을 그대로 적용
- `### 프롬프트 2` 절: `$LITE/verdict.md` 를 `## 근거`·`## 출력 구조`·`## 사람 확인` 절과 마지막 줄 `판정: 코드로 고정` / `판정: Claude 호출 유지` / `판정: 고정 불가` 로 쓰는 지시(세 문자열 모두 그대로)
- 판정 고르는 법: 출력 구조가 샘플마다 같고 규칙으로 쓸 수 있으면 `코드로 고정`, 문장·표를 읽어 뜻을 판단해야 하면 `Claude 호출 유지`, 시각·OCR 이 필요하거나 실행이 길면 `고정 불가`
- 게이트가 샘플 출력의 키 집합을 직접 비교해 다르면 `코드로 고정` 을 거부한다고 명시
- 게이트: `2` → 동의 후 `2 --approve`

- [ ] **Step 4: `skill/phase-3.md` 를 쓴다**

제목 `# 3단계 고정 (skill)`, "언제 읽나: phase-2 통과, phase-3 미통과".

담아야 할 것:
- `### 프롬프트 3` 절: `$LITE/skill-spec.md` 를 `## 입력 스키마`·`## 출력 스키마`·`## 사람 확인`·`## 실패 처리` 로 쓰는 지시
- 두 스키마는 헤딩 **다음 줄에** ```json 블록. 최상위 키가 필드 이름이고 값은 타입 이름 문자열인 객체로 쓴다(예: `{ "barcode": "문자열", "items": "배열" }`). 게이트가 이 키로 대조한다
- 출력 스키마는 모든 샘플에 공통으로 있는 키를 빠뜨리면 안 된다
- 판정이 `코드로 고정` 이면 `## 규칙` 절에 규칙을 목록으로. `Claude 호출 유지` 면 `## 프롬프트` 절에 프롬프트 원문을 코드 블록으로 담고 `- 모델:`·`- 최대 토큰:`·`- 타임아웃:` 세 줄을 적는다(세 문자열 그대로)
- `## 사람 확인` 에는 확신도가 낮은 필드를 어떻게 표시하고 누가 고치는지
- 게이트: `3` → 동의 후 `3 --approve`

- [ ] **Step 5: `skill/phase-4.md` 를 쓴다**

제목 `# 4단계 재검증 (skill)`, "언제 읽나: phase-3 통과, phase-4 미통과".

담아야 할 것:
- 학습자 안내: `skill-spec.md` 에 고정한 프롬프트·규칙 **그대로** 샘플 N건을 다시 돌려 `$LITE/verify/sample-k.json` 에 저장한다. 스킬을 즉흥으로 고치지 않는다 — 고쳐야 하면 `rollback 3`
- `### 프롬프트 4` 절: `$LITE/verify/report.md` 를 `## 스키마 일치율`·`## 샘플별 차이`·`## 사람 개입` 세 절로 쓰는 지시
- 게이트가 각 결과의 최상위 키를 스펙과 대조한다. 값 차이는 학습자가 허용 여부를 정한다. 허용 못 하면 `rollback 3`
- 게이트: `node $SKILL_DIR/scripts/check_lite.mjs 4`

- [ ] **Step 6: `skill/phase-5.md` 를 쓴다**

제목 `# 5단계 전환 (skill)`, "언제 읽나: phase-4 통과, phase-5 미통과".

담아야 할 것:
1. `references/brief-template-skill.md` 를 `$LITE/brief.md` 로 복사해 채운다
2. 절별 채우는 법: 2절에 `maxDuration = <초>`, 3절 첫 줄에 `Supabase` 또는 `DB 없음`, 4절은 판정이 `Claude 호출 유지` 면 `확인·수정 화면` 을 반드시 쓴다, 6절 문장은 그대로 둔다, 샘플 입력이 3MB 이상이면 3층 구조 데이터 줄에 `파일 크기` 안내
3. `### 논의점 묻는 법`: 조건이 걸릴 때만 최대 둘
   - 파싱 결과를 나중에 다시 볼 일이 있는지 — "확인한 결과를 나중에 다시 열어 볼 일이 있나요?" 기본값: 있다(확인 화면이 있으면 상태를 남겨야 한다)
   - 밖으로 나가는 단계가 있을 때 — "진짜 보낼까요, 화면에 보여주고 복사하게 할까요?" 기본값: 흉내
4. `### 프롬프트 5 — 스킬 이식` 절에 아래를 그대로 담는다(`SKILL_PROMPT_MUST` 여섯 문자열):

```
docs/agent-to-webapp-lite/brief.md 와 docs/agent-to-webapp-lite/skill-spec.md 를 읽고 이 스킬을 Next.js 웹 앱으로 만들어줘.
- 이 폴더에서 create-next-app 을 먼저 돌릴 것. docs/ 와 .git 은 그대로 둔다
- skill-spec.md 의 입력·출력 스키마를 타입으로 그대로 옮기고, 파싱 함수는 src/lib/workflow/ 에 하나로 둘 것.
  프롬프트를 쓴다면 spec 의 원문·모델·최대 토큰·타임아웃을 그대로 쓴다
- Claude 를 부르는 코드와 API 키는 서버 쪽(Route Handler 또는 Server Action)에만 둘 것
- 파싱하는 Route Handler 에 export const maxDuration 을 브리프 2절의 값으로 둘 것. 기본 제한은 최대치보다 짧다
- 브리프의 "3층 구조" 표대로 둘 것. 화면은 src/app/, 처리는 src/lib/workflow/, 저장은 src/lib/data/
- 파일은 multipart 로 올릴 것(JSON 에 base64 로 담으면 1.33배 커진다). 상한을 넘으면 올리기 전에 거절 문구를 보여준다
- 브리프 "4. 사람 확인 지점" 의 확인·수정 화면을 만들 것. 파싱 결과를 표로 보여주고 고칠 수 있게 한 뒤 확정한다.
  확정 전에는 결과를 내보내지 않는다
- 로그인은 만들지 말 것. 단일 사용자 데모다. 배포 보호는 브리프 6절대로 Vercel 설정에서 켠다
```

- [ ] **Step 7: 커밋**

```bash
git add .claude/skills/agent-to-webapp-lite/references/skill .claude/skills/agent-to-webapp-lite/references/brief-template-skill.md
git commit -m "docs(lite): skill 다섯 단계 문서와 스킬 이식 브리프 틀"
```

---

### Task 12: SKILL.md 와 문서·상수 대조 테스트

**Files:**
- Create: `.claude/skills/agent-to-webapp-lite/SKILL.md`
- Test: `tests/lite_skill_md.test.mjs`, `tests/lite_references.test.mjs`

**Interfaces:**
- Consumes: Task 4~11 의 상수와 문서 전부
- Produces: 학습자가 `/agent-to-webapp-lite` 로 부르는 진입 문서

- [ ] **Step 1: 실패하는 테스트 둘을 쓴다**

`tests/lite_skill_md.test.mjs`:

```js
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
```

`tests/lite_references.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCHEMA_HEADINGS, RUN_HEADINGS } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase1.mjs';
import { DASHBOARD_VERDICTS, SKILL_VERDICTS, VERDICT_PREFIX, DASHBOARD_SECTIONS, SKILL_SECTIONS } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase2.mjs';
import { CONTRACT_HEADINGS, SPEC_HEADINGS, SPEC_RULES, SPEC_PROMPT, SPEC_FIELDS } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase3.mjs';
import { DASHBOARD_REPORT_HEADINGS, SKILL_REPORT_HEADINGS } from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase4.mjs';
import {
  DASHBOARD_BRIEF_HEADINGS, SKILL_BRIEF_HEADINGS, DASHBOARD_PROMPT_MUST, SKILL_PROMPT_MUST,
  TIERS_HEADING, TIERS, ISSUES_HEADING, DECISION, PROTECTION, FRESHNESS, DURATION_KEYWORD, HUMAN_CHECK,
} from '../.claude/skills/agent-to-webapp-lite/scripts/lib/phase5.mjs';

const REF = '.claude/skills/agent-to-webapp-lite/references';
const doc = (mode, n) => readFileSync(`${REF}/${mode}/phase-${n}.md`, 'utf8');

test('dashboard 단계 문서가 게이트 상수를 담는다', () => {
  const p1 = doc('dashboard', 1);
  for (const h of SCHEMA_HEADINGS) assert.ok(p1.includes(h), h);
  const p2 = doc('dashboard', 2);
  for (const v of DASHBOARD_VERDICTS) assert.ok(p2.includes(`${VERDICT_PREFIX} ${v}`), v);
  for (const s of DASHBOARD_SECTIONS) assert.ok(p2.includes(s), s);
  const p3 = doc('dashboard', 3);
  for (const h of CONTRACT_HEADINGS) assert.ok(p3.includes(h), h);
  const p4 = doc('dashboard', 4);
  for (const h of [...SCHEMA_HEADINGS.slice(0, 2), ...DASHBOARD_REPORT_HEADINGS]) assert.ok(p4.includes(h), h);
  assert.ok(p4.includes('rollback 3'));
  const p5 = doc('dashboard', 5);
  for (const h of DASHBOARD_BRIEF_HEADINGS) assert.ok(p5.includes(h), h);
});

test('skill 단계 문서가 게이트 상수를 담는다', () => {
  const p1 = doc('skill', 1);
  for (const h of RUN_HEADINGS) assert.ok(p1.includes(h), h);
  assert.ok(p1.includes('output.json'));
  const p2 = doc('skill', 2);
  for (const v of SKILL_VERDICTS) assert.ok(p2.includes(`${VERDICT_PREFIX} ${v}`), v);
  for (const s of SKILL_SECTIONS) assert.ok(p2.includes(s), s);
  const p3 = doc('skill', 3);
  for (const s of [...SPEC_HEADINGS, SPEC_RULES, SPEC_PROMPT, ...SPEC_FIELDS]) assert.ok(p3.includes(s), s);
  const p4 = doc('skill', 4);
  for (const h of SKILL_REPORT_HEADINGS) assert.ok(p4.includes(h), h);
  assert.ok(p4.includes('rollback 3'));
  const p5 = doc('skill', 5);
  for (const h of SKILL_BRIEF_HEADINGS) assert.ok(p5.includes(h), h);
});

test('프롬프트 5 가 PROMPT_MUST 를 그대로 담는다', () => {
  const d5 = doc('dashboard', 5);
  const dp = d5.slice(d5.indexOf('### 프롬프트 5'));
  assert.ok(dp.length > 0, 'dashboard phase-5 에 프롬프트 5 절');
  for (const m of DASHBOARD_PROMPT_MUST) assert.ok(dp.includes(m), `dashboard 프롬프트 5 에 ${m}`);
  const s5 = doc('skill', 5);
  const sp = s5.slice(s5.indexOf('### 프롬프트 5'));
  assert.ok(sp.length > 0, 'skill phase-5 에 프롬프트 5 절');
  for (const m of SKILL_PROMPT_MUST) assert.ok(sp.includes(m), `skill 프롬프트 5 에 ${m}`);
});

test('브리프 틀이 헤딩을 순서대로 담고 고정 문자열이 있다', () => {
  const pairs = [
    ['brief-template-dashboard.md', DASHBOARD_BRIEF_HEADINGS, [FRESHNESS, PROTECTION]],
    ['brief-template-skill.md', SKILL_BRIEF_HEADINGS, [DURATION_KEYWORD, PROTECTION, HUMAN_CHECK]],
  ];
  for (const [file, headings, musts] of pairs) {
    const text = readFileSync(`${REF}/${file}`, 'utf8');
    let last = -1;
    for (const h of headings) {
      const i = text.indexOf(`\n${h}\n`);
      assert.ok(i > last, `${file}: 없거나 순서가 틀림 ${h}`);
      last = i;
    }
    for (const s of [TIERS_HEADING, ISSUES_HEADING, DECISION, ...TIERS, ...musts]) assert.ok(text.includes(s), `${file}: ${s}`);
    const deploy = text.slice(text.indexOf(`\n${headings[6]}\n`));
    const boxes = deploy.match(/^- \[ \] /gm) ?? [];
    assert.ok(boxes.length >= 5, `${file}: 7절 체크박스 ${boxes.length}개`);
  }
});

test('단계 문서가 자기 게이트 명령을 알려준다', () => {
  for (const mode of ['dashboard', 'skill']) {
    for (const n of [1, 2, 3, 4, 5]) {
      assert.ok(doc(mode, n).includes(`check_lite.mjs ${n}`), `${mode}/phase-${n}`);
    }
    assert.ok(doc(mode, 2).includes('--approve'));
    assert.ok(doc(mode, 3).includes('--approve'));
  }
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test "tests/lite_skill_md.test.mjs" "tests/lite_references.test.mjs"`
Expected: FAIL — `SKILL.md` 가 없고, 단계 문서에 빠진 문자열이 있으면 그 이름이 찍힌다

- [ ] **Step 3: `SKILL.md` 를 쓴다**

```markdown
---
name: agent-to-webapp-lite
description: 에이전트 전체가 아니라 출력 데이터 한 벌이나 스킬 하나만 웹으로 옮긴다. 관찰→판정→고정→재검증→전환 다섯 단계를 게이트로 밟는다. Use when the user says "출력을 대시보드로", "이 스킬만 서버로", "데이터 계약 만들자", "agent to webapp lite", or runs /agent-to-webapp-lite with a target path and --mode dashboard|skill. Run it from the sibling work folder named after the agent with an -app suffix, not inside the agent project.
---

# agent-to-webapp-lite

에이전트를 통째로 옮기지 않는다. 옮기는 것은 둘 중 하나다.

- `--mode dashboard`: 에이전트는 로컬에 남고 웹은 에이전트가 남긴 출력을 읽기만 한다. 고정하는 것은 **출력 데이터**
- `--mode skill`: 파일을 올리면 서버가 파싱·판정한다. 고정하는 것은 **스킬 하나**

에이전트 전체를 옮기려면 `agent-to-webapp` 을 쓴다.

- 호출 인자: `$ARGUMENTS`. 첫 경로가 대상. `--mode dashboard|skill`(필수), `--output <경로>`(dashboard),
  `--skill <이름>`·`--samples N`(skill, 기본 5), `--batch`
- 이 스킬 폴더(references 문서의 `$SKILL_DIR`): `${CLAUDE_SKILL_DIR}`
- 게이트: `node "${CLAUDE_SKILL_DIR}/scripts/check_lite.mjs" …`. 항상 작업 폴더에서 실행한다
- API 키를 쓰지 않는다. 관찰과 재검증은 학습자가 자기 세션에서 돌리고 이 스킬은 산출물만 읽는다

## 이름

- `$APP`: 지금 열린 폴더 `<이름>-app/`. 나중에 웹 앱 repo 가 된다
- `$LITE`: `$APP/docs/agent-to-webapp-lite`. 산출물은 전부 여기
- `$TARGET`: 대상 에이전트 폴더. STATUS 의 `target`
- `$OUTPUT`(dashboard): 에이전트가 남기는 출력 산출물. 구글 시트가 원장이면 CSV 로 내보낸 파일
- `$SKILL`·`$SAMPLES`(skill): 옮길 스킬 이름과 샘플 수

## 원칙

- `$TARGET` 의 파일을 건드리지 않는다. 훅도 설치하지 않는다
- `$LITE/STATUS.md` 는 게이트 스크립트만 쓴다. 통과 선언을 스킬이 하지 않는다
- 게이트를 통과하기 전에 다음 단계 산출물을 만들지 않는다. 컨텍스트가 압축돼도 STATUS 부터 읽는다
- `--batch` 면 질문하지 않고 승인 게이트도 `--batch` 로 넘긴다
- 학습자에게는 한국어로 말한다. 학습자가 다른 언어로 쓰면 그 언어로 답한다
- 민감한 열(계좌·급여·상담 원문·개인 이름)은 계약의 제외 열로 빼고 화면에 싣지 않는다

## 시작

1. `node "${CLAUDE_SKILL_DIR}/scripts/check_lite.mjs" status`. STATUS 가 있으면 "재개" 로
2. 없으면 대상과 모드를 정한다. 인자에 없으면 묻는다
   - 웹이 에이전트 출력을 **읽기만** 하면 dashboard. 웹이 **판정을 해야** 하면 skill
3. dashboard 면 출력 산출물 경로를, skill 이면 옮길 스킬 이름을 확인한다
4. `git rev-parse --is-inside-work-tree` 가 실패할 때만 `$APP` 에서 `git init`
5. `node "${CLAUDE_SKILL_DIR}/scripts/check_lite.mjs" init --target <경로> --mode <모드> [--output <경로>] [--skill <이름>] [--samples N]` 뒤 1단계로

## 단계

| 단계 | 읽을 문서 | dashboard 산출물 | skill 산출물 | 게이트 |
|---|---|---|---|---|
| 1 관찰 | references/<모드>/phase-1.md | runs/run-1.schema.md | runs/sample-k/, runs/run-1.md | `check_lite.mjs 1` |
| 2 판정 | references/<모드>/phase-2.md | verdict.md | verdict.md | `check_lite.mjs 2 --approve` |
| 3 고정 | references/<모드>/phase-3.md | contract.md | skill-spec.md | `check_lite.mjs 3 --approve` |
| 4 재검증 | references/<모드>/phase-4.md | runs/run-2.schema.md, verify/report.md | verify/sample-k.json, verify/report.md | `check_lite.mjs 4` |
| 5 전환 | references/<모드>/phase-5.md | brief.md, prompt.md | brief.md, prompt.md | `check_lite.mjs 5` |

`<모드>` 는 STATUS 의 `mode`. 각 단계는 그 문서를 읽고 그대로 한다. 프롬프트는 문서 안에 있다.
결정 축은 references/decision-axes.md, 브리프 틀은 references/brief-template-dashboard.md 와
references/brief-template-skill.md 다.

1단계와 4단계는 학습자가 자기 세션에서 에이전트를 돌리는 단계다. 안내한 뒤 스킬은 멈추고, 돌아오면 게이트부터 실행한다.

## 게이트 규칙

- 종료코드 0 통과, 1 실패, 2 사용법. 실패 메시지의 항목을 고친 뒤 다시 실행한다
- 2·3단계는 `--approve` 없이는 기록되지 않는다. 산출물을 보여주고 동의를 받은 뒤 붙인다
- dashboard 2단계는 관찰 1회 위에서 `고정 가능` 을 거부한다. `조건부 고정 가능(관찰 1회)` 로 적고 4단계가 확정한다
- skill 2단계는 샘플 출력의 키가 서로 다르면 `코드로 고정` 을 거부한다
- 2단계 판정이 `고정 불가` 면 게이트가 종료를 기록하고 라우팅을 출력한다. 그대로 전하고 멈춘다
- 사람이 판정을 뒤집을 때만 `--override "<사유>"`
- `rollback N` 은 N단계 이후 기록을 지운다. 4단계가 깨졌을 때 `rollback 3` 을 쓴다

## 재개

STATUS 에 `terminated` 가 있으면 종료된 과제라고 알리고 멈춘다. phase-K 까지 통과면 K+1 단계 문서를 읽고 시작한다.

## 끝

5단계 통과 후 `$LITE/prompt.md` 경로와 그 안의 코드 블록을 보여주고 끝낸다. 바이브 코딩은 다음 세션의 일이다.
```

- [ ] **Step 4: 테스트가 가리키는 빠진 문자열을 단계 문서에 채운다**

Run: `node --test "tests/lite_references.test.mjs"`
실패가 남으면 그 문자열을 Task 10·11 의 해당 문서에 넣는다. 상수를 문서에 맞추지 말고 **문서를 상수에 맞춘다** — 상수는 게이트가 실제로 찾는 값이다.

- [ ] **Step 5: 전체 테스트 통과 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — lite_skill_md 5건, lite_references 5건 포함 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add .claude/skills/agent-to-webapp-lite/SKILL.md tests/lite_skill_md.test.mjs tests/lite_references.test.mjs .claude/skills/agent-to-webapp-lite/references
git commit -m "feat(lite): SKILL.md 와 문서·게이트 상수 대조 테스트"
```

---

### Task 13: 두 스킬을 함께 설치하고 문서를 고친다

**Files:**
- Modify: `.claude/skills/agent-to-webapp/scripts/install.mjs` (`installAll` 추가, `install` 은 그대로)
- Modify: `tests/install.test.mjs` (기존 4건 아래에 추가. 기존 건은 고치지 않는다)
- Modify: `CLAUDE.md`, `README.md`
- Modify: `docs/superpowers/specs/2026-09-22-agent-to-webapp-lite-design.md` (§13 에 구현 완료 한 줄)

**Interfaces:**
- Consumes: 없음
- Produces: `installAll(skillsRoot, destRoot)` → `[{ name, dest, copied, removed, keptEnv }]`, `SKILLS_ROOT`, `DEFAULT_DEST_ROOT`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/install.test.mjs` **끝에** 추가한다(기존 import 줄에 `installAll` 을 더한다):

```js
import { install, installAll } from '../.claude/skills/agent-to-webapp/scripts/install.mjs';

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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test "tests/install.test.mjs"`
Expected: FAIL — `installAll is not a function`

- [ ] **Step 3: `install.mjs` 를 고친다**

머리 주석과 상수, `installAll`, CLI 블록만 바꾼다. `PRESERVE`·`walk`·`install` 은 그대로 둔다.

파일 위쪽(주석과 상수):

```js
#!/usr/bin/env node
// 저장소의 스킬을 유저 스코프로 설치한다. 설치된 쪽의 .env(사용자 API 키)는 지우지도 덮지도 않고,
// 원본의 .env 는 복사하지 않는다. 원본에 없는 옛 파일은 지운다.
//   node .claude/skills/agent-to-webapp/scripts/install.mjs            # .claude/skills/ 아래 스킬을 모두 설치
//   node .claude/skills/agent-to-webapp/scripts/install.mjs <대상 폴더>  # 이 스킬 하나만 그 폴더로
import { readdirSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PRESERVE = ['.env'];
export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SKILLS_ROOT = dirname(SKILL_DIR);
export const DEFAULT_DEST_ROOT = join(homedir(), '.claude', 'skills');
export const DEFAULT_DEST = join(DEFAULT_DEST_ROOT, basename(SKILL_DIR));
```

`install` 함수 아래에 추가:

```js
// skillsRoot 아래의 폴더 하나하나를 스킬로 보고 destRoot/<이름> 으로 설치한다.
// 스킬이 둘 이상이면 설치 절차가 갈라지지 않게 한 번에 한다.
export function installAll(skillsRoot, destRoot) {
  const names = readdirSync(skillsRoot, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
  return names.map(name => {
    const dest = join(destRoot, name);
    return { name, dest, ...install(join(skillsRoot, name), dest) };
  });
}
```

CLI 블록 교체:

```js
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const arg = process.argv[2];
    const results = arg
      ? [{ name: basename(SKILL_DIR), dest: resolve(arg), ...install(SKILL_DIR, resolve(arg)) }]
      : installAll(SKILLS_ROOT, DEFAULT_DEST_ROOT);
    for (const r of results) {
      console.log(`설치: ${r.dest}`);
      console.log(`  복사 ${r.copied}개, 지움 ${r.removed.length}개${r.removed.length ? ` (${r.removed.join(', ')})` : ''}`);
      if (existsSync(join(r.dest, '.env.example'))) {
        console.log(r.keptEnv
          ? '  API 키 .env: 있던 것을 그대로 뒀다'
          : `  API 키 .env: 아직 없다. ${join(r.dest, '.env.example')} 를 같은 폴더에 .env 로 복사하고 키를 넣어라`);
      }
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — install 7건(기존 4 + 새 3) 포함 전부 통과

- [ ] **Step 5: `CLAUDE.md` 를 고친다**

- 머리글 밑 목록에 한 줄 추가: "형제 스킬 `agent-to-webapp-lite` 는 출력 한 벌(dashboard)·스킬 하나(skill)만 옮긴다. 기획서는 `docs/superpowers/specs/2026-09-22-agent-to-webapp-lite-design.md`, 정본은 `.claude/skills/agent-to-webapp-lite/`"
- 「스킬을 고친 뒤 다시 설치하기」 2번 항목을 고친다: 인자 없이 부르면 두 스킬을 함께 설치한다는 것
- 3번 확인 명령을 두 줄로: `diff -rq -x .env .claude/skills/agent-to-webapp ~/.claude/skills/agent-to-webapp` 와 `diff -rq .claude/skills/agent-to-webapp-lite ~/.claude/skills/agent-to-webapp-lite`
- 「API 키」 절에 한 줄: lite 는 키를 쓰지 않는다
- 「남은 일」에 lite dogfood 두 사례 추가

- [ ] **Step 6: `README.md` 를 고친다**

「설치」 절에 인자 없는 설치가 두 스킬을 설치한다는 것과, 「사용」 절 아래에 짧은 lite 절을 넣는다:

```markdown
## 출력만·스킬 하나만 옮길 때

에이전트를 통째로 옮기지 않고 에이전트가 남긴 출력을 웹에서 보기만 하거나, 스킬 하나만 서버로 옮길 때는
형제 스킬을 쓴다.

    /agent-to-webapp-lite ../<이름> --mode dashboard --output ../<이름>/out/data.csv
    /agent-to-webapp-lite ../<이름> --mode skill --skill <스킬 이름> --samples 5

산출물은 `<이름>-app/docs/agent-to-webapp-lite/` 에 쌓인다. API 키는 필요 없다.
```

- [ ] **Step 7: 기획서 §13 에 한 줄 더한다**

```markdown
- 2026-09-22 구현: 13개 Task, 테스트 `tests/lite_*.test.mjs`. 두 스킬을 `install.mjs` 하나가 같이 설치한다
```

- [ ] **Step 8: 전체 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: PASS — 전체 통과. 실패가 하나라도 있으면 다음으로 넘어가지 않는다

Run: `node .claude/skills/agent-to-webapp/scripts/install.mjs`
Expected: 두 줄의 "설치: …" 출력. `~/.claude/skills/agent-to-webapp/.env` 가 있으면 "그대로 뒀다"

Run: `diff -rq .claude/skills/agent-to-webapp-lite ~/.claude/skills/agent-to-webapp-lite`
Expected: 아무 출력 없음

- [ ] **Step 9: 커밋**

```bash
git add .claude/skills/agent-to-webapp/scripts/install.mjs tests/install.test.mjs CLAUDE.md README.md docs/superpowers/specs/2026-09-22-agent-to-webapp-lite-design.md
git commit -m "feat: install.mjs 가 두 스킬을 함께 설치, 문서에 lite 추가"
```

---

## 실행 뒤

1. 계획서를 `docs/superpowers/plans/archive/` 로 옮긴다(저장소 관례)
2. dogfood 는 저장소 밖에서. 기획서 §11 의 두 사례. 결과 요약은 LLM-Wiki `raw/practice/`
