// 게이트가 보고서의 글 대신 산출물 자체를 읽는 곳. 열 표 파싱, 열 diff, 출력 JSON 의 키 집합.
import { existsSync, readFileSync } from 'node:fs';
import { normalize, sectionBody } from './md.mjs';

const isSeparator = (cells) => cells.every(c => /^:?-{2,}:?$/.test(c.replace(/\s/g, '')));

// '| a | b |' → ['a','b']. 표 줄이 아니면 null.
function rowCells(line) {
  const l = line.trim();
  if (!l.startsWith('|')) return null;
  const inner = l.endsWith('|') ? l.slice(1, -1) : l.slice(1);
  return inner.split('|').map(c => c.trim());
}

// heading 절의 표에서 { name, type } 을 뽑는다. 첫 줄은 머리글, 구분선(|---|)은 버린다.
export function parseColumnTable(text, heading) {
  const body = sectionBody(normalize(text), heading);
  if (body === null) return [];
  const rows = [];
  for (const line of body.split('\n')) {
    const cells = rowCells(line);
    if (!cells || cells.length < 2 || isSeparator(cells)) continue;
    rows.push(cells);
  }
  // 머리글 한 줄을 버린다. 표가 머리글뿐이면 열이 없다.
  return rows.slice(1).map(c => ({ name: c[0].replace(/[`*]/g, '').trim(), type: c[1].replace(/[`*]/g, '').trim() }));
}

export function diffColumns(a, b) {
  const byName = (list) => new Map(list.map(c => [c.name, c.type]));
  const A = byName(a);
  const B = byName(b);
  const added = [...B.keys()].filter(n => !A.has(n));
  const removed = [...A.keys()].filter(n => !B.has(n));
  const typeChanged = [];
  for (const [n, from] of A) {
    const to = B.get(n);
    if (to !== undefined && to !== from) typeChanged.push({ name: n, from, to });
  }
  return { added, removed, typeChanged };
}

// heading 절 안의 첫 json 코드 블록. 없거나 깨지면 null.
export function jsonBlockAfter(text, heading) {
  const body = sectionBody(normalize(text), heading);
  if (body === null) return null;
  const m = body.match(/```json[^\n]*\n([\s\S]*?)\n\s*```/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

export function topKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value).sort();
}

export function intersectKeys(keySets) {
  if (keySets.length === 0) return [];
  return keySets.reduce((acc, ks) => acc.filter(k => ks.includes(k))).slice().sort();
}

export function sameKeySets(keySets) {
  if (keySets.length < 2) return true;
  const first = [...keySets[0]].sort().join('\u0000');
  return keySets.every(ks => [...ks].sort().join('\u0000') === first);
}

export function readJson(path) {
  if (!existsSync(path)) return { ok: false, why: '파일이 없다' };
  try { return { ok: true, value: JSON.parse(readFileSync(path, 'utf8')) }; }
  catch (e) { return { ok: false, why: `JSON 으로 읽히지 않는다: ${e.message}` }; }
}
