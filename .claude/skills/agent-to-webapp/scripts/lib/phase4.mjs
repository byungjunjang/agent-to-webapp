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
