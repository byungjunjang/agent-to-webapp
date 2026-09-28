// 3단계 고정 게이트: 흐름도와 단계 대조, 단계별 네 필드 + json 스키마, 규칙화 불가 항목의 재배치, 웹 앱 간소화 점검.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalize, sectionBody, isBlank } from './md.mjs';
import { finalVerdict, isConditional } from './phase2.mjs';

export const STEP_HEADING = '### 단계 ';
export const ACTORS = ['코드', 'LLM', '사람'];
export const FIELD_ACTOR = '- 실행 주체:';
export const FIELD_IN = '- 입력 스키마:';
export const FIELD_OUT = '- 출력 스키마:';
export const FIELD_FAIL = '- 실패 처리:';
export const UNRULED_HEADING = '## 규칙화 불가';
export const UNRULED_TARGETS = ['LLM 단계', '사람 확인'];
export const UNRULED_REJUDGE = '재판정';
export const DIAGRAM_HEADING = '## 흐름도';
export const ACTOR_CLASS = { 코드: 'code', LLM: 'llm', 사람: 'human' };
// 스키마는 json 블록 대신 참조로 쓸 수 있다: '단계 N 출력과 같음' / '공통 스키마 <이름>' / (출력만) '입력과 같음'
export const COMMON_SCHEMA_HEADING = '## 공통 스키마';
// 웹 앱에 필요 없는 단계 경계(로컬 흔적, 분기 없는 코드 단계, 중간 사람 단계)를 점검한 결과. 4단계 전에 줄여야
// 검증한 steps/ 와 5단계가 옮기는 코드가 같다.
export const SIMPLIFY_HEADING = '## 웹 앱 간소화';
// 조건부 판정(override 포함)의 조건. 흐름도 바로 다음에 둔다. 판정은 STATUS 의 verdict 로 안다.
export const CONDITION_HEADING = '## 조건';
const REF_STEP = /단계\s*(\d+)\s*(?:의\s*)?출력/;
const REF_COMMON = /공통\s*스키마\s*[`'"]?([A-Za-z0-9_-]*)/;
const REF_SAME = /입력과\s*같/;

// '- 입력 스키마:' 줄: 바로 다음 줄의 json 블록이나, 같은 줄의 참조.
function parseSchemaField(body, field) {
  const m = body.match(new RegExp(`^${field.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*(.*)$`, 'm'));
  const rest = (m?.[1] ?? '').trim();
  let ref = null;
  let r;
  if ((r = rest.match(REF_STEP))) ref = { step: Number(r[1]) };
  else if ((r = rest.match(REF_COMMON))) ref = { common: r[1] };
  else if (REF_SAME.test(rest)) ref = { same: true };
  return { json: hasJsonAfter(body, field), ref };
}

// '## 공통 스키마' 절의 '### 이름' 들.
function parseCommonSchemas(t) {
  const body = sectionBody(t, COMMON_SCHEMA_HEADING);
  if (body === null) return { found: false, names: [] };
  const names = [...body.matchAll(/^###\s+`?([A-Za-z0-9_-]+)`?/gm)].map(x => x[1]);
  return { found: true, names };
}

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

// 화살표 하나: 'A --> B', 'A -->|| B', 'A -- --> B'(라벨을 지운 '-- "라벨" -->'), 'A -.-> B'. 뒤 노드는 소비하지 않아 체인을 잇는다.
const NODE = String.raw`([A-Za-z_]\w*)[\[\](){}<>\/]*(?::::\w+)?`;
const EDGE = new RegExp(String.raw`${NODE}\s*(?:--\s+)?(?:-{2,}>|-\.+->|={2,}>)\s*(?:\|[^|\n]*\|)?\s*(?=${NODE})`, 'g');

// '## 흐름도' 절의 mermaid 블록에서 노드 'S<단계 번호>' 와 그 class, 단계 노드끼리의 화살표를 뽑는다. 라벨(큰따옴표)은 먼저 지운다.
export function parseDiagram(text) {
  const body = sectionBody(text, DIAGRAM_HEADING);
  const m = body && body.match(/```mermaid[^\n]*\n([\s\S]*?)\n\s*```/);
  if (!m) return { found: false, nodes: [], classes: {}, edges: [] };
  const src = m[1].replace(/"[^"\n]*"/g, '');
  const nodes = [...new Set([...src.matchAll(/\bS(\d+)\b/g)].map(x => Number(x[1])))].sort((a, b) => a - b);
  const classes = {};
  for (const x of src.matchAll(/^\s*class\s+(.+?)\s+(code|llm|human)\s*;?\s*$/gm)) {
    for (const id of x[1].split(',')) {
      const k = id.trim().match(/^S(\d+)$/);
      if (k) classes[Number(k[1])] = x[2];
    }
  }
  for (const x of src.matchAll(/\bS(\d+)[\[\](){}<>\/]*:::(code|llm|human)\b/g)) classes[Number(x[1])] = x[2];
  const edges = [];
  const seen = new Set();
  for (const line of src.split('\n')) {
    for (const x of line.matchAll(EDGE)) {
      const [a, b] = [x[1], x[2]].map(id => id.match(/^S(\d+)$/));
      if (!a || !b || seen.has(`${a[1]}>${b[1]}`)) continue;
      seen.add(`${a[1]}>${b[1]}`);
      edges.push([Number(a[1]), Number(b[1])]);
    }
  }
  return { found: true, nodes, classes, edges };
}

// 분기 없이 이어지는 코드 단계 쌍: N 에서 나가는 화살표가 N+1 하나뿐이고 N+1 로 들어오는 화살표도 N 하나뿐.
// 되돌아가기·건너뛰기가 걸리면 단계 경계가 필요한 것이다.
export function mergeableCodePairs(steps, edges) {
  if (edges.length === 0) return [];
  const actor = new Map(steps.map(s => [s.n, s.actor]));
  const outs = (n) => new Set(edges.filter(([a, b]) => a === n && b !== n).map(([, b]) => b));
  const ins = (n) => new Set(edges.filter(([a, b]) => b === n && a !== n).map(([a]) => a));
  const pairs = [];
  for (const s of steps) {
    const n = s.n;
    if (n === null || actor.get(n) !== '코드' || actor.get(n + 1) !== '코드') continue;
    const o = outs(n);
    const i = ins(n + 1);
    if (o.size === 1 && o.has(n + 1) && i.size === 1 && i.has(n)) pairs.push([n, n + 1]);
  }
  return pairs;
}

export function parseWorkflow(text) {
  const t = normalize(text).replace(/->/g, '→');
  const steps = stepSections(t).map(s => ({
    n: s.n,
    name: s.name,
    actor: (s.body.match(/^- 실행 주체:\s*(\S+)/m) || [])[1] ?? null,
    schemaIn: parseSchemaField(s.body, FIELD_IN),
    schemaOut: parseSchemaField(s.body, FIELD_OUT),
    failure: ((s.body.match(/^- 실패 처리:\s*(.*)$/m) || [])[1] ?? '').trim(),
  }));
  const common = parseCommonSchemas(t);
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
  // 흐름도는 '->' 치환 전 원문으로 읽는다. 치환하면 '-->' 가 망가진다.
  return { steps, unruled, hasUnruledSection: idx !== -1, diagram: parseDiagram(text), common };
}

// 스키마 하나를 끝까지 따라가 본다. 문제가 있으면 문자열(이유), 없으면 null.
function resolveSchema(step, kind, steps, common, visited = new Set()) {
  const field = kind === 'in' ? FIELD_IN : FIELD_OUT;
  const sch = kind === 'in' ? step.schemaIn : step.schemaOut;
  const key = `${step.n}:${kind}`;
  if (visited.has(key)) return `'${field}' 참조가 순환한다`;
  visited.add(key);
  if (sch.json) return null;
  const ref = sch.ref;
  if (!ref) return `'${field}' 다음 줄에 json 블록 없음 (참조 '단계 N 출력과 같음' / '공통 스키마 이름' 도 없다)`;
  if ('step' in ref) {
    const target = steps.find(s => s.n === ref.step);
    if (!target) return `'${field}' 가 가리키는 단계 ${ref.step} 가 없다`;
    return resolveSchema(target, 'out', steps, common, visited);
  }
  if ('common' in ref) {
    if (!common.found) return `'${field}' 가 가리키는 공통 스키마 ${ref.common} 가 없다 ('${COMMON_SCHEMA_HEADING}' 절이 없다)`;
    if (ref.common && !common.names.includes(ref.common)) return `'${field}' 가 가리키는 공통 스키마 ${ref.common} 가 없다 ('${COMMON_SCHEMA_HEADING}' 절에 '### ${ref.common}' 필요)`;
    return null;
  }
  if (kind !== 'in') return resolveSchema(step, 'in', steps, common, visited);
  return `'${field}' 는 '입력과 같음' 을 쓸 수 없다`;
}

// verdict: STATUS 의 최종 판정. 없으면 verdict.md 에서 읽는다.
export function checkPhase3(a2wDir, { verdict = null } = {}) {
  const errors = [];
  const warnings = [];
  const p = join(a2wDir, 'workflow.md');
  if (!existsSync(p)) return { ok: false, errors: ['workflow.md 없음'], warnings, rejudge: false, stepCount: 0 };
  const text = readFileSync(p, 'utf8');
  const { steps, unruled, hasUnruledSection, diagram, common } = parseWorkflow(text);

  if (steps.length === 0) errors.push(`'${STEP_HEADING}N: 이름' 헤딩이 하나도 없다`);
  for (const s of steps) {
    const tag = `단계 ${s.n ?? '?'}(${s.name})`;
    if (!s.actor || !ACTORS.includes(s.actor)) errors.push(`${tag}: '${FIELD_ACTOR} ${ACTORS.join('|')}' 없음`);
    for (const kind of ['in', 'out']) {
      const why = resolveSchema(s, kind, steps, common);
      if (why) errors.push(`${tag}: ${why}`);
    }
    if (!s.failure) errors.push(`${tag}: '${FIELD_FAIL}' 없음`);
  }

  // 흐름도 노드는 단계 헤딩과 하나씩 맞고 class 는 실행 주체와 같아야 한다. 그림과 명세가 따로 놀지 않게.
  if (!diagram.found) errors.push(`'${DIAGRAM_HEADING}' 절에 mermaid 블록 없음`);
  else {
    const numbered = steps.filter(s => s.n !== null);
    for (const s of numbered) {
      const tag = `단계 ${s.n}(${s.name})`;
      if (!diagram.nodes.includes(s.n)) { errors.push(`흐름도에 ${tag} 노드 S${s.n} 없음`); continue; }
      const want = ACTOR_CLASS[s.actor];
      const got = diagram.classes[s.n];
      if (want && got !== want) errors.push(`${tag}: 실행 주체 ${s.actor} 인데 흐름도 class 가 ${got ?? '없음'}. 'class S${s.n} ${want}' 여야 한다`);
    }
    const stepNums = new Set(numbered.map(s => s.n));
    for (const n of diagram.nodes) {
      if (!stepNums.has(n)) errors.push(`흐름도의 S${n} 에 맞는 '${STEP_HEADING}${n}' 없음. 끝점(완료·needs_attention)은 S숫자가 아닌 id 를 쓴다`);
    }
    for (const [a, b] of mergeableCodePairs(steps, diagram.edges)) {
      warnings.push(`단계 ${a}·${b}: 분기 없이 이어지는 코드 단계다. 웹 앱에서는 함수·상태만 늘린다. 합치거나 '${SIMPLIFY_HEADING}' 에 유지 이유를 적는다`);
    }
  }

  const simplify = sectionBody(text, SIMPLIFY_HEADING);
  if (simplify === null || isBlank(simplify)) {
    errors.push(`'${SIMPLIFY_HEADING}' 절이 ${simplify === null ? '없다' : '비었다'}. 웹 앱에 필요 없는 단계를 점검한 결과를 적는다. 줄인 것이 없으면 '- 없음'`);
  }

  if (isConditional(finalVerdict(a2wDir, verdict))) {
    const cond = sectionBody(text, CONDITION_HEADING);
    if (cond === null || isBlank(cond)) {
      errors.push(`판정이 조건부 고정 가능인데 '${CONDITION_HEADING}' 절이 ${cond === null ? '없다' : '비었다'}. 흐름도 바로 다음에 조건(override 면 그 사유)을 적는다`);
    }
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
