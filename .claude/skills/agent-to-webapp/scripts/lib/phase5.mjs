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
