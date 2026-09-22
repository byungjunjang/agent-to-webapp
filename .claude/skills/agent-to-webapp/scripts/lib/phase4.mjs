// 4단계 재검증 게이트: verify/ 파일 구성과 report.md 절, workflow.md 와 steps/ 의 단계 대조. 러너·라이브러리가 템플릿과 같은지도 본다.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sectionBody, isBlank, hasHeading, normalize } from './md.mjs';
import { parseWorkflow, ACTOR_CLASS, STEP_HEADING } from './phase3.mjs';

export const REQUIRED_FILES = ['run.ts', 'package.json', '.gitignore', 'report.md', 'steps/index.ts'];
// 스킬 자산 assets/verify-template 에서 복사되는 파일. LLM 이 고치면 경고한다(고친 내용이 스킬로 돌아와야 한다).
export const TEMPLATE_DIR = join('assets', 'verify-template');
export const TEMPLATE_FIXED = ['run.ts', 'lib/step.ts', 'lib/llm.ts'];
export const REPORT_MODEL = '## 모델';
export const REPORT_INPUT = '## 입력 ';
export const REPORT_HUMAN = '## 사람이 봤어야 할 것';
export const REPORT_EXTERNAL = '## 외부 서비스로 뺄 단계';
// 재검증 중 단계 코드를 고쳤으면 여기 적는다. 비어 있지 않으면 workflow.md 반영을 경고한다.
export const REPORT_FIXES = '## 재검증 중 고친 것';
// .env 는 API 키를 담으므로 반드시 가린다. '/x', 'x/' 표기도 같은 줄로 본다.
export const GITIGNORE_MUST = ['node_modules', '.env'];

function gitignoreEntries(text) {
  return text.split(/\r?\n/).map(l => l.trim().replace(/^\//, '').replace(/\/$/, '')).filter(Boolean);
}

// 학습자가 3단계에서 승인한 설계와 5단계가 웹 앱으로 복사하는 코드가 같아야 한다. 모델의 자기 보고(report 절)에 기대지 않고
// 게이트가 workflow.md 의 '### 단계 N' 과 steps/ 의 단계 객체를 번호로 짝지어 이름·실행 주체를 대조한다.
export const STEPS_HINT =
  'workflow.md 와 steps/ 는 번호·이름·실행 주체가 같아야 한다. 5단계가 steps/ 를 그대로 웹 앱에 복사한다. 코드를 고쳤으면 workflow.md 의 그 단계도 고치고, 순서·단계 수가 바뀌면 rollback 3';

// 단계 파일에서 단계 객체의 n·name·actor 를 읽는다. 줄 첫머리의 'n: 숫자' 를 단계 객체의 시작으로 보고 그 뒤 run 전까지에서
// name·actor 를 찾는다. LLM 단계 파일은 앞쪽에 도구 스펙의 name: 이 따로 있어 파일 전체의 첫 name: 은 쓰지 않는다.
// n: 이 없으면 보조 파일(common.ts 등)이라 null.
export function parseStepFile(text) {
  const t = normalize(text);
  const m = t.match(/^\s*n:\s*(\d+)\s*(?:,|$)/m);
  if (!m) return null;
  let rest = t.slice(m.index + m[0].length);
  const end = rest.search(/^\s*(?:async\s+)?run\s*[(:]/m);
  if (end !== -1) rest = rest.slice(0, end);
  const name = rest.match(/^\s*name:\s*(['"`])(.*?)\1/m)?.[2] ?? null;
  const actor = rest.match(/^\s*actor:\s*['"`](code|llm|human)['"`]/m)?.[1] ?? null;
  return { n: Number(m[1]), name, actor };
}

const squash = (s) => String(s).replace(/\s+/g, ' ').trim();

// workflow.md 의 단계와 steps/ 의 단계 객체를 대조한다. 어긋난 곳마다 오류 문자열 하나.
export function compareSteps(workflowText, stepsDir, stepFiles) {
  const errors = [];
  const declared = new Map();
  for (const f of stepFiles) {
    const s = parseStepFile(readFileSync(join(stepsDir, f), 'utf8'));
    if (!s) continue;
    if (s.name === null || s.actor === null) { errors.push(`steps/${f}: 단계 객체에 name·actor 가 없다 (n: ${s.n} 다음 줄에 name, actor)`); continue; }
    if (declared.has(s.n)) { errors.push(`steps/${f}: n: ${s.n} 이 steps/${declared.get(s.n).file} 과 겹친다`); continue; }
    declared.set(s.n, { file: f, ...s });
  }
  const wfSteps = parseWorkflow(workflowText).steps.filter(s => s.n !== null);
  for (const s of wfSteps) {
    const tag = `단계 ${s.n}(${s.name})`;
    const d = declared.get(s.n);
    if (!d) { errors.push(`${tag}: steps/ 에 n: ${s.n} 인 단계 파일이 없다`); continue; }
    if (squash(d.name) !== squash(s.name)) errors.push(`${tag}: steps/${d.file} 의 name 이 '${d.name}' 이다. workflow.md 의 이름과 같아야 한다`);
    const want = ACTOR_CLASS[s.actor];
    if (want && d.actor !== want) errors.push(`${tag}: 실행 주체 ${s.actor} 인데 steps/${d.file} 의 actor 가 '${d.actor}'. '${want}' 여야 한다`);
  }
  const wfNums = new Set(wfSteps.map(s => s.n));
  for (const [n, d] of declared) {
    if (!wfNums.has(n)) errors.push(`steps/${d.file}: n: ${n} 에 맞는 '${STEP_HEADING}${n}' 이 workflow.md 에 없다`);
  }
  return errors;
}

// runs: STATUS 의 관찰 횟수. 입력 절도 그만큼만 요구한다.
export function checkPhase4(a2wDir, { skillDir = null, runs = 3 } = {}) {
  const errors = [];
  const warnings = [];
  const vdir = join(a2wDir, 'verify');
  if (!existsSync(vdir)) return { ok: false, errors: ['verify/ 폴더가 없다'], warnings, stepCount: 0 };

  for (const f of REQUIRED_FILES) if (!existsSync(join(vdir, f))) errors.push(`verify/${f} 없음`);
  const gi = join(vdir, '.gitignore');
  if (existsSync(gi)) {
    const entries = gitignoreEntries(readFileSync(gi, 'utf8'));
    for (const m of GITIGNORE_MUST) {
      if (!entries.includes(m)) errors.push(`verify/.gitignore 에 '${m}' 줄이 없다 (.env 는 API 키가 커밋되지 않게 가린다)`);
    }
  }
  const stepsDir = join(vdir, 'steps');
  const stepFiles = existsSync(stepsDir) ? readdirSync(stepsDir).filter(f => f.endsWith('.ts') && f !== 'index.ts') : [];
  if (stepFiles.length === 0) errors.push('verify/steps/ 에 단계 파일이 없다 (index.ts 말고 단계당 .ts 하나)');

  const notes = [];
  const wf = join(a2wDir, 'workflow.md');
  if (!existsSync(wf)) errors.push('workflow.md 없음. 3단계 산출물이다. steps/ 의 번호·이름·실행 주체를 이것과 대조한다');
  else if (stepFiles.length > 0) {
    const mismatches = compareSteps(readFileSync(wf, 'utf8'), stepsDir, stepFiles);
    if (mismatches.length) { errors.push(...mismatches); notes.push(STEPS_HINT); }
  }

  if (skillDir) {
    for (const f of TEMPLATE_FIXED) {
      const tp = join(skillDir, TEMPLATE_DIR, f);
      const vp = join(vdir, f);
      if (!existsSync(tp) || !existsSync(vp)) continue;
      if (normalize(readFileSync(tp, 'utf8')).trimEnd() !== normalize(readFileSync(vp, 'utf8')).trimEnd()) {
        warnings.push(`verify/${f} 가 템플릿과 다르다. 러너·라이브러리는 스킬 자산이라 LLM 이 고치지 않는다. 고쳐야 했다면 이유를 report 의 '${REPORT_FIXES}' 에 적어라`);
      }
    }
  }

  const rp = join(vdir, 'report.md');
  if (existsSync(rp)) {
    const text = readFileSync(rp, 'utf8');
    if (isBlank(sectionBody(text, REPORT_MODEL))) errors.push(`report.md: '${REPORT_MODEL}' 절에 모델명이 없다`);
    for (let n = 1; n <= runs; n++) {
      const body = sectionBody(text, `${REPORT_INPUT}${n}`);
      if (isBlank(body)) errors.push(`report.md: '${REPORT_INPUT}${n}' 절이 없거나 비었다`);
      else if (!body.split('\n').some(l => l.trim().startsWith('|'))) {
        warnings.push(`report.md: '${REPORT_INPUT}${n}' 절에 차이 표가 없다. 로컬·스크립트 결과를 되풀이하지 말고 차이 표 하나만 둔다`);
      }
    }
    if (sectionBody(text, REPORT_EXTERNAL) === null) errors.push(`report.md: '${REPORT_EXTERNAL}' 절이 없다 (없으면 '- 없음')`);
    if (!hasHeading(text, REPORT_HUMAN)) warnings.push(`report.md: '${REPORT_HUMAN}' 절이 없다. 사람 확인 지점이 있었다면 적어라`);
    const fixes = sectionBody(text, REPORT_FIXES);
    if (fixes !== null && !isBlank(fixes) && fixes.trim() !== '- 없음') {
      warnings.push(`report.md: '${REPORT_FIXES}' 가 비어 있지 않다. 고친 내용을 workflow.md 의 그 단계에도 반영했는지 확인하라. 5단계는 둘을 함께 넘긴다`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, notes, stepCount: stepFiles.length };
}
