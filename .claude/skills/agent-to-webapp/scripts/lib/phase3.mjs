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
