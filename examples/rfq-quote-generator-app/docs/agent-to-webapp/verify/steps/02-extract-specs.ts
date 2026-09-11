// 단계 2: 스펙 추출 (LLM). RFQ 메일과 도면에서 ExtractedSpecs 하나를 도구로 받는다.
import { callTool, fileBlocks, LlmOutputError } from '../lib/llm.ts';
import { NeedsAttention } from '../lib/util.ts';
import type { ToolSpec } from '../lib/llm.ts';
import type { ExtractedSpecs, InputFile } from '../lib/types.ts';

export interface ExtractInput {
  job_id: string;
  files: InputFile[];
  previous_errors: string[]; // 단계 3 이 돌려보낸 오류. 첫 호출은 []
}

export interface ExtractOutput {
  specs: ExtractedSpecs;
}

const SOURCE_ENUM = ['rfq', 'drawing', 'both', 'missing', 'sales', 'internal'];
const nullable = (t: string, extra: Record<string, unknown> = {}) => ({ type: [t, 'null'], ...extra });

/** 공통 스키마의 ExtractedSpecs 를 JSON Schema 로. 모든 키를 required 로 두어 null 이라도 채우게 한다. */
export const SPECS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    part_name: { type: 'string' },
    drawing_no: { type: 'string' },
    drawing_rev: nullable('string'),
    material: nullable('string'),
    lot_size: nullable('integer', { description: '이번 견적의 첫 로트 수량' }),
    monthly_volume: nullable('integer'),
    annual_volume: nullable('integer'),
    part_weight_kg: { type: 'number' },
    case_depth_low: { type: 'number', description: 'mm' },
    case_depth_high: { type: 'number', description: 'mm' },
    case_depth_zone: nullable('string'),
    hardness_test_standard: nullable('string', { description: '예: HV550' }),
    surface_hardness_low: { type: 'number', description: 'HRC' },
    surface_hardness_high: { type: 'number', description: 'HRC' },
    core_hardness_low: { type: 'number', description: 'HRC' },
    core_hardness_high: { type: 'number', description: 'HRC' },
    distortion_limit_mm: { type: 'number' },
    distortion_definition: nullable('string'),
    grinding_after_ht: { type: 'boolean' },
    straightening_allowed: nullable('boolean'),
    accepts_medium_distortion: nullable('boolean'),
    automotive_quality_priority: nullable('boolean'),
    nitriding_compatible: nullable('boolean'),
    prefers_carburizing_behavior: nullable('boolean'),
    delivery_days: nullable('integer', { description: 'calendar days' }),
    delivery_basis: nullable('string'),
    packing_requirement: nullable('string'),
    ppap_requirement: nullable('string'),
    inspection_requirement: nullable('string'),
    customer_name: nullable('string'),
    customer_email: nullable('string'),
    customer_company: nullable('string'),
    rfq_number: nullable('string'),
    rfq_date: nullable('string', { description: 'YYYY-MM-DD' }),
    rfq_subject: nullable('string'),
    customer_requested_reply_items: { type: 'array', items: { type: 'string' } },
    sources: {
      type: 'object',
      description: '필드명 → 출처. material, lot_size, delivery_days 는 반드시 있어야 한다',
      additionalProperties: { type: 'string', enum: SOURCE_ENUM },
    },
    unconfirmed_fields: { type: 'array', items: { type: 'string' } },
    extraction_notes: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'part_name', 'drawing_no', 'drawing_rev', 'material', 'lot_size', 'monthly_volume', 'annual_volume',
    'part_weight_kg', 'case_depth_low', 'case_depth_high', 'case_depth_zone', 'hardness_test_standard',
    'surface_hardness_low', 'surface_hardness_high', 'core_hardness_low', 'core_hardness_high',
    'distortion_limit_mm', 'distortion_definition', 'grinding_after_ht', 'straightening_allowed',
    'accepts_medium_distortion', 'automotive_quality_priority', 'nitriding_compatible',
    'prefers_carburizing_behavior', 'delivery_days', 'delivery_basis', 'packing_requirement',
    'ppap_requirement', 'inspection_requirement', 'customer_name', 'customer_email', 'customer_company',
    'rfq_number', 'rfq_date', 'rfq_subject', 'customer_requested_reply_items', 'sources',
    'unconfirmed_fields', 'extraction_notes',
  ],
};

const TOOL: ToolSpec = {
  name: 'submit_extracted_specs',
  description: 'RFQ 메일과 도면에서 읽은 열처리 스펙을 ExtractedSpecs 로 제출한다',
  input_schema: SPECS_SCHEMA,
};

// workflow.md 단계 2 프롬프트 초안 그대로
const SYSTEM = `너는 열처리 업체 영업기술팀의 견적 엔지니어다. 첨부한 고객 RFQ 메일과 부품 도면에서 열처리 스펙을 뽑아
ExtractedSpecs JSON 하나로 답한다(도구 1개, input_schema = ExtractedSpecs).
- 숫자는 숫자 타입. 단위는 mm, kg, 일(calendar day). 도면 MASS 가 g 이면 kg 으로 바꾼다
- 값을 지어내지 않는다. 문서에 없으면 null 이고 sources 에 missing
- material, lot_size, delivery_days 는 반드시 sources 에 출처를 적는다: 메일에만 rfq, 도면에만 drawing, 둘이 같으면 both, 없으면 missing
- 다른 필드도 값을 채웠으면 sources 에 같은 방식으로 출처를 적는다
- 고객이 "to be confirmed" 라고 했거나 메일과 도면 값이 다른 필드는 unconfirmed_fields 에 넣고, 값은 도면 쪽을 쓴다
- lot_size 는 이번 견적의 첫 주문(첫 로트) 수량이다. 월 소요량은 monthly_volume, 연 소요량은 annual_volume
- 납기는 일수로 바꾼다: "N weeks" → N×7, "PO 후 N일" → N. 기준(PO 후, 입고 후 등)은 delivery_basis 에 원문 뜻대로
- grinding_after_ht: "no grinding correction after heat treatment" 류면 false, 연삭 허용·예정이면 true, 언급이 없으면 true 에 sources missing
- straightening_allowed, accepts_medium_distortion, nitriding_compatible, prefers_carburizing_behavior 는 문서에 근거가 있을 때만 true/false, 없으면 null
- automotive_quality_priority 는 자동차(EV 포함) 부품이고 변형·품질 요구가 단가보다 앞선다고 읽힐 때 true, 반대 근거가 있으면 false, 판단 근거가 없으면 null
- customer_requested_reply_items 에는 고객이 회신에 넣어 달라고 한 항목을 그대로 적는다
- 스키마에 없는 필드를 만들지 않는다. 해석한 근거(예: "6 weeks → 42")는 extraction_notes 에 한 줄씩`;

function looksLikeSpecs(v: unknown): v is ExtractedSpecs {
  return typeof v === 'object' && v !== null
    && typeof (v as ExtractedSpecs).part_name === 'string'
    && typeof (v as ExtractedSpecs).sources === 'object' && (v as ExtractedSpecs).sources !== null;
}

/**
 * 실패 처리: 출력이 스키마에 맞지 않으면 같은 호출을 1회 다시 하고,
 * PDF 를 읽지 못하면(API 오류·"읽을 수 없음" 응답) 최대 2회 다시 한 뒤 needs_attention.
 */
export async function extractSpecs(input: ExtractInput): Promise<ExtractOutput> {
  let system = SYSTEM;
  if (input.previous_errors.length > 0) {
    system += `\n\n지난 결과의 오류는 아래와 같다. 문서를 다시 읽고 고쳐라.\n${input.previous_errors.map((e) => `- ${e}`).join('\n')}`;
  }
  const content = [
    ...fileBlocks(input.files),
    { type: 'text', text: '위 두 문서에서 ExtractedSpecs 를 추출해 도구로 제출하라.' },
  ];

  let schemaRetries = 0;
  let readRetries = 0;
  for (;;) {
    try {
      const specs = await callTool<ExtractedSpecs>({ step: '2', system, content, tool: TOOL, max_tokens: 4096 });
      if (!looksLikeSpecs(specs)) {
        if (schemaRetries++ < 1) continue;
        throw new NeedsAttention('2', '출력이 ExtractedSpecs 모양이 아니다', specs);
      }
      return { specs };
    } catch (e) {
      if (e instanceof NeedsAttention) throw e;
      if (e instanceof LlmOutputError) {
        if (schemaRetries++ < 1) continue;
        throw new NeedsAttention('2', e.message);
      }
      if (readRetries++ < 2) continue;
      throw new NeedsAttention('2', `문서를 읽지 못했다: ${(e as Error).message}`);
    }
  }
}
