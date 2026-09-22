import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseColumnTable, diffColumns, jsonBlockAfter, topKeys, intersectKeys, sameKeySets, readJson,
} from '../.claude/skills/agent-to-webapp-lite/scripts/lib/schema.mjs';

const TABLE = [
  '## 출처', 'out/sales.csv', '',
  '## 열', '',
  '| 열 | 타입 | 예시값 | 빈 값 비율 |',
  '|---|---|---|---|',
  '| channel | 문자열 | 스마트스토어 | 0% |',
  '| revenue | 정수 | 1250000 | 0% |',
  '| note | 문자열 | 재고 확인 필요 | 40% |',
  '',
  '## 행 수', '412',
].join('\n');

test('parseColumnTable: 머리글과 구분선을 버리고 이름·타입을 뽑는다', () => {
  const cols = parseColumnTable(TABLE, '## 열');
  assert.deepEqual(cols, [
    { name: 'channel', type: '문자열' },
    { name: 'revenue', type: '정수' },
    { name: 'note', type: '문자열' },
  ]);
});

test('parseColumnTable: 절이 없거나 표가 없으면 빈 배열', () => {
  assert.deepEqual(parseColumnTable(TABLE, '## 없는절'), []);
  assert.deepEqual(parseColumnTable('## 열\n표가 없다\n', '## 열'), []);
});

test('diffColumns: 추가·삭제·타입 변경', () => {
  const a = [{ name: 'channel', type: '문자열' }, { name: 'revenue', type: '정수' }, { name: 'note', type: '문자열' }];
  const b = [{ name: 'channel', type: '문자열' }, { name: 'revenue', type: '문자열' }, { name: 'orders', type: '정수' }];
  assert.deepEqual(diffColumns(a, b), {
    added: ['orders'],
    removed: ['note'],
    typeChanged: [{ name: 'revenue', from: '정수', to: '문자열' }],
  });
});

test('jsonBlockAfter: 헤딩 다음 json 블록을 파싱한다', () => {
  const t = '## 출력 스키마\n\n```json\n{ "barcode": "문자열", "items": "배열" }\n```\n\n## 실패 처리\n- 멈춘다\n';
  assert.deepEqual(jsonBlockAfter(t, '## 출력 스키마'), { barcode: '문자열', items: '배열' });
  assert.equal(jsonBlockAfter(t, '## 실패 처리'), null, '블록이 없으면 null');
  assert.equal(jsonBlockAfter('## a\n```json\n{ 깨진\n```\n', '## a'), null, '깨진 JSON 은 null');
});

test('topKeys·intersectKeys·sameKeySets', () => {
  assert.deepEqual(topKeys({ b: 1, a: 2 }), ['a', 'b']);
  assert.deepEqual(topKeys([1, 2]), [], '배열은 최상위 키가 없다');
  assert.deepEqual(topKeys(null), []);
  assert.deepEqual(intersectKeys([['a', 'b', 'c'], ['a', 'c'], ['c', 'a']]), ['a', 'c']);
  assert.deepEqual(intersectKeys([]), []);
  assert.equal(sameKeySets([['a', 'b'], ['b', 'a']]), true);
  assert.equal(sameKeySets([['a', 'b'], ['a']]), false);
});

test('readJson: 없는 파일과 깨진 JSON 을 이유와 함께 돌려준다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'a2wl-json-'));
  assert.equal(readJson(join(dir, 'none.json')).ok, false);
  writeFileSync(join(dir, 'bad.json'), '{ 깨진', 'utf8');
  const bad = readJson(join(dir, 'bad.json'));
  assert.equal(bad.ok, false);
  assert.match(bad.why, /JSON/);
  writeFileSync(join(dir, 'ok.json'), '{"a":1}', 'utf8');
  assert.deepEqual(readJson(join(dir, 'ok.json')), { ok: true, value: { a: 1 } });
});
