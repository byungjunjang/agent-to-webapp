// available_equipment.csv 를 읽어 단계 6·7 이 쓰는 장비 행 3개로 만든다.
import { readFileSync } from 'node:fs';
import { NeedsAttention } from './util.ts';
import type { Equipment, RouteName } from './types.ts';

export const ROUTE_ORDER: RouteName[] = ['vacuum_carburizing', 'gas_carburizing', 'gas_nitriding'];

/** 따옴표 안의 쉼표를 처리하는 작은 CSV 파서. 외부 패키지를 쓰지 않는다. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuote = false;
      } else field += ch;
    } else if (ch === '"') inQuote = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* CRLF 의 CR 은 버린다 */ }
    else field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((cols) => cols.some((c) => c.trim() !== ''));
}

export function parseEquipment(csvText: string): Equipment[] {
  const [header, ...body] = parseCsv(csvText.replace(/^﻿/, ''));
  if (!header) throw new NeedsAttention('6', '장비 CSV 가 비어 있다');
  const col = (name: string): number => {
    const i = header.indexOf(name);
    if (i < 0) throw new NeedsAttention('6', `장비 CSV 에 '${name}' 열이 없다`);
    return i;
  };
  const num = (cols: string[], name: string): number => {
    const v = Number(cols[col(name)]);
    if (!Number.isFinite(v)) throw new NeedsAttention('6', `장비 CSV ${name} 값이 숫자가 아니다: ${cols[col(name)]}`);
    return v;
  };
  const rows: Equipment[] = body
    .filter((cols) => (cols[col('equipment_id')] ?? '').trim() !== '')
    .map((cols) => ({
      equipment_id: cols[col('equipment_id')].trim(),
      route_name: cols[col('route_name')].trim() as RouteName,
      display_name: cols[col('display_name')].trim(),
      max_load_kg: num(cols, 'max_load_kg'),
      depth_min_mm: num(cols, 'depth_min_mm'),
      depth_max_mm: num(cols, 'depth_max_mm'),
      distortion_risk: cols[col('distortion_risk')].trim(),
      hourly_rate_cny: num(cols, 'hourly_rate_cny'),
      setup_fee_cny: num(cols, 'setup_fee_cny'),
      temper_fee_cny: num(cols, 'temper_fee_cny'),
    }));
  // 단계 6 실패 처리: CSV 가 3행이 아니거나 route_name 이 셋과 다르면 설정 오류
  if (rows.length !== 3) throw new NeedsAttention('6', `장비 CSV 는 3행이어야 한다 (지금 ${rows.length}행)`);
  const names = rows.map((e) => e.route_name);
  for (const want of ROUTE_ORDER) {
    if (!names.includes(want)) throw new NeedsAttention('6', `장비 CSV 에 route_name '${want}' 이 없다`);
  }
  return rows;
}

export function loadEquipment(csvPath: string): Equipment[] {
  return parseEquipment(readFileSync(csvPath, 'utf8'));
}
