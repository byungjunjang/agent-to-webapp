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
