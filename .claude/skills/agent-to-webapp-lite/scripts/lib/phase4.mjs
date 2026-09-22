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
