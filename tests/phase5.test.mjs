import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, A2W } from './helpers.mjs';
import { checkPhase5, BRIEF_HEADINGS, PROMPT_FILE, PROMPT_MUST } from '../.claude/skills/agent-to-webapp/scripts/lib/phase5.mjs';

const BRIEF = `# port brief
${BRIEF_HEADINGS[0]}
Route Handler 에서만 Anthropic SDK 호출. 키는 환경변수
${BRIEF_HEADINGS[1]}
단계 3 원가 계산이 40초. 단계마다 함수 하나
${BRIEF_HEADINGS[2]}
DB 없음. 사람 확인 지점 없고 합계 55초
${BRIEF_HEADINGS[3]}
없음
${BRIEF_HEADINGS[4]}
- 없음
${BRIEF_HEADINGS[5]}
범위 밖. 단일 사용자 데모
${BRIEF_HEADINGS[6]}
배포 후 runs/inputs/ 3건을 넣어 verify/report.md 와 비교
`;

const PROMPT = `# 다음 세션 프롬프트: demo

\`\`\`
${PROMPT_MUST.join(' 를 읽고\n- ')}
\`\`\`
`;

function app(text, prompt = PROMPT) {
  const a = makeApp();
  write(a, `${A2W}/port-brief.md`, text);
  if (prompt !== null) write(a, `${A2W}/${PROMPT_FILE}`, prompt);
  return join(a, A2W);
}

test('phase5: 정상 통과', () => {
  const r = checkPhase5(app(BRIEF));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('phase5: 절이 빠지거나 비면 실패', () => {
  const missing = BRIEF.replace(`${BRIEF_HEADINGS[5]}\n범위 밖. 단일 사용자 데모\n`, '');
  assert.ok(checkPhase5(app(missing)).errors.some(e => e.includes('6. 인증')));
  const empty = BRIEF.replace('없음\n' + BRIEF_HEADINGS[4], BRIEF_HEADINGS[4]);
  assert.ok(checkPhase5(app(empty)).errors.some(e => e.includes('4. 사람 확인 지점') && e.includes('비었다')));
});

test('phase5: 상태 저장 절에 Supabase 또는 DB 없음 명시', () => {
  const vague = BRIEF.replace('DB 없음. 사람 확인 지점 없고 합계 55초', '적당히 저장');
  const r = checkPhase5(app(vague));
  assert.ok(r.errors.some(e => e.includes('Supabase') && e.includes('DB 없음')));
  assert.equal(checkPhase5(app(BRIEF.replace('DB 없음.', 'Supabase.'))).ok, true);
});

test('phase5: 파일 없으면 실패', () => {
  assert.equal(checkPhase5(join(makeApp(), A2W)).ok, false);
});

test('phase5: prompt.md 가 없으면 실패', () => {
  const r = checkPhase5(app(BRIEF, null));
  assert.ok(r.errors.some(e => e.includes(PROMPT_FILE) && e.includes('없음')));
});

test('phase5: prompt.md 에 코드 블록이 없거나 프롬프트 5 문자열이 빠지면 실패', () => {
  const noBlock = checkPhase5(app(BRIEF, `# 다음 세션\n${PROMPT_MUST.join('\n')}\n`));
  assert.ok(noBlock.errors.some(e => e.includes('코드 블록이 없다')));
  const partial = checkPhase5(app(BRIEF, PROMPT.replace('create-next-app', 'next')));
  assert.ok(partial.errors.some(e => e.includes('create-next-app')));
  assert.equal(partial.errors.length, 1);
});
