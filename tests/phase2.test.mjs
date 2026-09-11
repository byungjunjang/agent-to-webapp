import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { makeApp, write, A2W } from './helpers.mjs';
import {
  checkPhase2, parseVerdict, agentQuadrantRows, AGENT_QUADRANT,
} from '../.claude/skills/agent-to-webapp/scripts/lib/phase2.mjs';

const TABLE_OK = `| 단계 | 칸 | 근거 |\n|---|---|---|\n| 1 스펙 추출 | 단위 작업 × 확률론 | 매번 PDF 해석 |\n| 2 루트 판정 | 단위 작업 × 결정론 | 스크립트 |\n`;
const TABLE_AGENT = TABLE_OK + `| 3 재수집 | ${AGENT_QUADRANT} | 실패 시 순서를 다시 짬 |\n`;

function app(verdictText) {
  const a = makeApp();
  write(a, `${A2W}/verdict.md`, verdictText);
  return join(a, A2W);
}

test('parseVerdict: 마지막 판정 줄, 조건부 우선', () => {
  assert.equal(parseVerdict('판정: 고정 가능\n'), '고정 가능');
  assert.equal(parseVerdict('판정: 조건부 고정 가능(조건: 도면은 PDF 만)\n'), '조건부 고정 가능');
  assert.equal(parseVerdict('본문\n판정: 고정 불가\n\n'), '고정 불가');
  assert.equal(parseVerdict('판정: 아마도\n'), null);
  assert.equal(parseVerdict('판정 없음\n'), null);
});

test('agentQuadrantRows: ×, x, X 를 같은 기호로 본다', () => {
  assert.deepEqual(agentQuadrantRows(TABLE_OK), []);
  assert.deepEqual(agentQuadrantRows(TABLE_AGENT), ['3 재수집']);
  assert.deepEqual(agentQuadrantRows('| a | 워크플로우 x 확률론 | b |\n'), ['a']);
  assert.deepEqual(agentQuadrantRows('| a | **워크플로우 X 확률론** | b |\n'), ['a']);
});

test('phase2: 고정 가능 + 4번째 칸 없음 → 통과', () => {
  const r = checkPhase2(app(`# 판정\n${TABLE_OK}\n판정: 고정 가능\n`));
  assert.equal(r.ok, true);
  assert.equal(r.verdict, '고정 가능');
});

test('phase2: 고정 가능 + 4번째 칸 있음 → 거부', () => {
  const r = checkPhase2(app(`${TABLE_AGENT}\n판정: 고정 가능\n`));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('4번째 칸') && e.includes('3 재수집')));
});

test('phase2: 조건부 + 4번째 칸 있음 → 통과, 경고', () => {
  const r = checkPhase2(app(`${TABLE_AGENT}\n판정: 조건부 고정 가능(조건: 재수집은 사람 확인)\n`));
  assert.equal(r.ok, true);
  assert.equal(r.verdict, '조건부 고정 가능');
  assert.ok(r.warnings.some(w => w.includes('3 재수집')));
});

test('phase2: 고정 불가 → 통과하되 verdict 가 불가', () => {
  const r = checkPhase2(app(`${TABLE_AGENT}\n판정: 고정 불가\n`));
  assert.equal(r.ok, true);
  assert.equal(r.verdict, '고정 불가');
});

test('phase2: 판정 줄 없음 → 실패, 파일 없음 → 실패', () => {
  assert.equal(checkPhase2(app(TABLE_OK)).ok, false);
  assert.equal(checkPhase2(join(makeApp(), A2W)).ok, false);
});

test('phase2: override 는 조건부로 통과시키고 사유를 경고에 남긴다', () => {
  const r = checkPhase2(app(`${TABLE_AGENT}\n판정: 고정 불가\n`), { override: '재수집은 우리 사이트 3개뿐' });
  assert.equal(r.ok, true);
  assert.equal(r.verdict, '조건부 고정 가능');
  assert.ok(r.warnings.some(w => w.includes('override') && w.includes('사이트 3개')));
});
