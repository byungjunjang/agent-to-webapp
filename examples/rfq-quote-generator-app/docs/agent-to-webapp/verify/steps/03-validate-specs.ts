// 단계 3: 스펙 검증·모드 판정 (코드). validate_specs.py 의 양수 검사를 유지하고 provisional 분기를 더한다.
import { isInt, isNum, isStrArray } from '../lib/util.ts';
import type { ExtractedSpecs, Mode, QuoteBasisField, Source } from '../lib/types.ts';

export interface ValidateInput {
  job_id: string;
  received_date: string;
  specs: ExtractedSpecs;
  attempt: number; // 1부터
}

export interface ValidateOutput {
  specs: ExtractedSpecs;
  errors: string[];
  mode: Mode;
  provisional_fields: QuoteBasisField[];
}

const REQUIRED_STRING = ['part_name', 'drawing_no'] as const;
const REQUIRED_POSITIVE = [
  'part_weight_kg', 'case_depth_low', 'case_depth_high',
  'surface_hardness_low', 'surface_hardness_high', 'core_hardness_low', 'core_hardness_high',
  'distortion_limit_mm',
] as const;
const OPTIONAL_POSITIVE_INT = ['lot_size', 'monthly_volume', 'annual_volume', 'delivery_days'] as const;
const OPTIONAL_STRING = [
  'drawing_rev', 'material', 'case_depth_zone', 'hardness_test_standard', 'distortion_definition',
  'delivery_basis', 'packing_requirement', 'ppap_requirement', 'inspection_requirement',
  'customer_name', 'customer_email', 'customer_company', 'rfq_number', 'rfq_date', 'rfq_subject',
] as const;
const OPTIONAL_BOOL = [
  'straightening_allowed', 'accepts_medium_distortion', 'automotive_quality_priority',
  'nitriding_compatible', 'prefers_carburizing_behavior',
] as const;
const REQUIRED_STR_ARRAY = ['customer_requested_reply_items', 'unconfirmed_fields', 'extraction_notes'] as const;
const SOURCE_VALUES: Source[] = ['rfq', 'drawing', 'both', 'missing', 'sales', 'internal'];
export const QUOTE_BASIS_FIELDS: QuoteBasisField[] = ['material', 'lot_size', 'delivery_days'];

export function validateSpecs(input: ValidateInput): ValidateOutput {
  const specs: ExtractedSpecs = structuredClone(input.specs);
  const s = specs as unknown as Record<string, unknown>;
  const errors: string[] = [];

  // 1. `?` 없는 필드는 null 불가, 타입 일치. 양수 검사 유지. lot_size·delivery_days 는 null 이 아닐 때만 양수
  for (const k of REQUIRED_STRING) {
    if (typeof s[k] !== 'string' || (s[k] as string).trim() === '') errors.push(`${k}: 비어 있지 않은 문자열이어야 한다`);
  }
  for (const k of REQUIRED_POSITIVE) {
    if (!isNum(s[k])) errors.push(`${k}: 숫자여야 한다 (지금 ${JSON.stringify(s[k])})`);
    else if ((s[k] as number) <= 0) errors.push(`${k}: 0 보다 커야 한다 (지금 ${s[k]})`);
  }
  for (const k of OPTIONAL_POSITIVE_INT) {
    if (s[k] === null || s[k] === undefined) { s[k] = null; continue; }
    if (!isInt(s[k])) errors.push(`${k}: 정수 또는 null 이어야 한다 (지금 ${JSON.stringify(s[k])})`);
    else if ((s[k] as number) <= 0) errors.push(`${k}: 0 보다 커야 한다 (지금 ${s[k]})`);
  }
  for (const k of OPTIONAL_STRING) {
    if (s[k] === null || s[k] === undefined) { s[k] = null; continue; }
    if (typeof s[k] !== 'string') errors.push(`${k}: 문자열 또는 null 이어야 한다`);
  }
  for (const k of OPTIONAL_BOOL) {
    if (s[k] === null || s[k] === undefined) { s[k] = null; continue; }
    if (typeof s[k] !== 'boolean') errors.push(`${k}: boolean 또는 null 이어야 한다`);
  }
  if (typeof s.grinding_after_ht !== 'boolean') errors.push('grinding_after_ht: boolean 이어야 한다');
  for (const k of REQUIRED_STR_ARRAY) {
    if (!isStrArray(s[k])) errors.push(`${k}: 문자열 배열이어야 한다`);
  }

  // 2. 경화층 깊이·경도 범위
  if (isNum(specs.case_depth_low) && isNum(specs.case_depth_high) && !(specs.case_depth_low < specs.case_depth_high)) {
    errors.push(`case_depth_low (${specs.case_depth_low}) 는 case_depth_high (${specs.case_depth_high}) 보다 작아야 한다`);
  }
  if (isNum(specs.surface_hardness_low) && isNum(specs.surface_hardness_high) && !(specs.surface_hardness_low <= specs.surface_hardness_high)) {
    errors.push(`surface_hardness_low (${specs.surface_hardness_low}) 는 surface_hardness_high (${specs.surface_hardness_high}) 이하여야 한다`);
  }

  // 3. sources 에 material·lot_size·delivery_days
  if (typeof specs.sources !== 'object' || specs.sources === null) {
    errors.push('sources: 객체여야 한다');
    specs.sources = {};
  } else {
    for (const [k, v] of Object.entries(specs.sources)) {
      if (!SOURCE_VALUES.includes(v)) errors.push(`sources.${k}: ${JSON.stringify(v)} 는 허용값이 아니다`);
    }
    for (const k of QUOTE_BASIS_FIELDS) {
      if (!(k in specs.sources)) errors.push(`sources 에 ${k} 출처가 없다`);
    }
  }

  // 4·5. provisional 필드와 mode
  const unconfirmed = isStrArray(specs.unconfirmed_fields) ? specs.unconfirmed_fields : [];
  const provisional_fields = QUOTE_BASIS_FIELDS.filter((k) =>
    specs[k] === null || specs.sources[k] === 'missing' || unconfirmed.includes(k));
  const mode: Mode = provisional_fields.length === 0 ? 'firm' : 'provisional';

  // 6. rfq_number 가 없으면 내부 번호
  if (specs.rfq_number === null || specs.rfq_number === undefined || String(specs.rfq_number).trim() === '') {
    const yymmdd = input.received_date.replace(/-/g, '').slice(2, 8);
    specs.rfq_number = `INT-${yymmdd}-${input.job_id.slice(0, 4).toUpperCase()}`;
    specs.sources.rfq_number = 'internal';
  }

  return { specs, errors, mode, provisional_fields };
}
