// 4단계 재검증 게이트: verify/ 파일 구성과 report.md 절. 러너·라이브러리가 템플릿과 같은지도 본다.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sectionBody, isBlank, hasHeading, normalize } from './md.mjs';

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

export function checkPhase4(a2wDir, { skillDir = null } = {}) {
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
    for (const n of [1, 2, 3]) {
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
  return { ok: errors.length === 0, errors, warnings, stepCount: stepFiles.length };
}
