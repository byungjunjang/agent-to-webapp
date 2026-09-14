// 5단계 전환 게이트: port-brief.md 의 일곱 절과, 다음 세션에 붙여넣을 prompt.md.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalize, sectionBody, isBlank } from './md.mjs';

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
// 다음 세션에 붙여넣을 프롬프트 5 를 파일로 남긴다. 터미널 출력은 스크롤에 묻히고 다른 기기에서 안 보인다(2026-09-14).
export const PROMPT_FILE = 'prompt.md';
// prompt.md 의 코드 블록이 프롬프트 5 인지 가르는 문자열. references/phase-5.md 의 프롬프트 5 에도 들어 있어야 한다.
export const PROMPT_MUST = [
  'docs/agent-to-webapp/port-brief.md',
  'docs/agent-to-webapp/workflow.md',
  'create-next-app',
  'src/lib/workflow/',
];

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

  const pp = join(a2wDir, PROMPT_FILE);
  if (!existsSync(pp)) errors.push(`${PROMPT_FILE} 없음. references/phase-5.md 의 프롬프트 5 를 코드 블록으로 담아 둔다`);
  else {
    const block = normalize(readFileSync(pp, 'utf8')).match(/```[^\n]*\n([\s\S]*?)\n```/);
    if (!block) errors.push(`${PROMPT_FILE}: 붙여넣을 프롬프트 코드 블록이 없다`);
    else {
      for (const m of PROMPT_MUST) if (!block[1].includes(m)) errors.push(`${PROMPT_FILE}: 코드 블록에 '${m}' 가 없다 (프롬프트 5 원문을 그대로 넣는다)`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
