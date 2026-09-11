// 단계 5: 누락 스펙 식별 (LLM). §3 체크리스트 여섯 개를 문서와 대조하고 provisional 필드마다 quote_basis 항목을 만든다.
//
// 재검증에서 바꾼 것(2026-09-11): 처음 구현은 LLM 이 missing_specs 와 checklist_defined 두 목록을 따로 내게 했다.
// Helios 입력에서 두 번 연속 실패했다. 모델이 'straightening' 을 "정의됨" 이라고 쓰면서도 두 목록에 다 넣었고(자기모순),
// 재시도에서는 JSON 전체를 문자열 하나로 감쌌다. 지금은 여섯 key 마다 { key, defined, … } 판정 하나씩을 받고,
// 두 목록으로 나누는 일은 코드가 한다. "합쳐 정확히 한 번" 은 구조로 보장된다.
// 단계의 입출력 스키마(MissingInput / MissingOutput)는 workflow.md 그대로다. 바뀐 것은 LLM 도구 스키마와 프롬프트 초안이다.
import { callTool, fileBlocks, LlmOutputError } from '../lib/llm.ts';
import { NeedsAttention, pretty } from '../lib/util.ts';
import type { ToolSpec } from '../lib/llm.ts';
import type { ChecklistDefined, ChecklistKey, ExtractedSpecs, InputFile, MissingSpec, Mode, QuoteBasisField } from '../lib/types.ts';

export interface MissingInput {
  files: InputFile[];
  specs: ExtractedSpecs;
  mode: Mode;
  provisional_fields: QuoteBasisField[];
}

export interface MissingOutput {
  missing_specs: MissingSpec[];
  checklist_defined: ChecklistDefined[];
  notes: string[];
}

export const CHECKLIST_KEYS: ChecklistKey[] = ['masking', 'sampling_plan', 'hardness_test', 'straightening', 'packing', 'ppap_fai'];
const QUOTE_BASIS_ORDER: QuoteBasisField[] = ['material', 'lot_size', 'delivery_days'];

const CHECKLIST_DESC: Record<ChecklistKey, string> = {
  masking: '마스킹 / 비열처리 구간 (masking / no-heat-treat area)',
  sampling_plan: '검사 샘플링 기준 (acceptance sampling plan)',
  hardness_test: '경도 측정 위치 및 방법 (hardness test location and method)',
  straightening: '열처리 후 교정 허용 여부 (whether straightening is allowed after heat treatment)',
  packing: '포장 / 방청 조건 (packing / rust-prevention requirement)',
  ppap_fai: 'PPAP / FAI / 시작품 승인 요구 (PPAP, FAI, or trial approval requirement)',
};
const QUOTE_BASIS_DESC: Record<QuoteBasisField, string> = {
  material: '재질 확정 (material confirmation)',
  lot_size: '수량 — 로트 수량 / 월·연 소요량 (quantity)',
  delivery_days: '요청 납기 (required delivery date)',
};

/** LLM 원시 출력: 여섯 key 마다 판정 하나. */
export interface ChecklistVerdict {
  key: ChecklistKey;
  defined: boolean;
  evidence: string;
  item_name: string;
  item_name_en: string;
  reason: string;
  assumption: string;
}
export interface QuoteBasisItem {
  key: QuoteBasisField;
  item_name: string;
  item_name_en: string;
  evidence: string;
  reason: string;
  assumption: string;
}
export interface RawOutput {
  checklist: ChecklistVerdict[];
  quote_basis: QuoteBasisItem[];
  notes: string[];
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    key: { type: 'string', enum: CHECKLIST_KEYS },
    defined: { type: 'boolean', description: 'RFQ 나 도면이 이 항목을 분명히 정했으면 true, 아니면 false' },
    evidence: { type: 'string', description: '무엇을 봤는지(문서의 어느 부분)' },
    item_name: { type: 'string', description: '한국어 항목명' },
    item_name_en: { type: 'string' },
    reason: { type: 'string', description: 'defined=false 일 때 한국어 1–2문장, 끝에 "가정: …". defined=true 면 빈 문자열' },
    assumption: { type: 'string', description: 'defined=false 일 때 영어 1문장. defined=true 면 빈 문자열' },
  },
  required: ['key', 'defined', 'evidence', 'item_name', 'item_name_en', 'reason', 'assumption'],
};

const QUOTE_BASIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    key: { type: 'string', enum: QUOTE_BASIS_ORDER },
    item_name: { type: 'string', description: '한국어 항목명' },
    item_name_en: { type: 'string' },
    evidence: { type: 'string' },
    reason: { type: 'string', description: '한국어 1–2문장, 끝에 "가정: …"' },
    assumption: { type: 'string', description: '영어 1문장. 영업이 정한 현재 값' },
  },
  required: ['key', 'item_name', 'item_name_en', 'evidence', 'reason', 'assumption'],
};

const TOOL: ToolSpec = {
  name: 'submit_checklist_verdicts',
  description: '체크리스트 여섯 개의 판정(checklist, 정확히 6개), 견적 전제 항목(quote_basis), notes 를 제출한다',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      checklist: { type: 'array', minItems: 6, maxItems: 6, items: VERDICT_SCHEMA, description: '여섯 key 마다 판정 하나. 같은 key 두 번 금지' },
      quote_basis: { type: 'array', items: QUOTE_BASIS_SCHEMA, description: 'provisional_fields 의 필드마다 하나. 비었으면 []' },
      notes: { type: 'array', items: { type: 'string' } },
    },
    required: ['checklist', 'quote_basis', 'notes'],
  },
};

// workflow.md 단계 5 프롬프트 초안을 "판정 하나씩" 구조에 맞게 고친 것. report.md 에 기록.
function systemPrompt(): string {
  const list = CHECKLIST_KEYS.map((k) => `  - ${k}: ${CHECKLIST_DESC[k]}`).join('\n');
  const basis = QUOTE_BASIS_ORDER.map((k) => `  - ${k}: ${QUOTE_BASIS_DESC[k]}`).join('\n');
  return `너는 열처리 업체 영업기술팀의 견적 엔지니어다.
routing_pricing_rules.md §3 체크리스트 여섯 개(masking, sampling_plan, hardness_test, straightening, packing, ppap_fai)를
RFQ 메일·도면·ExtractedSpecs 와 대조해 하나씩 판정한다(도구 1개).
- checklist 에는 여섯 key 마다 판정 하나씩, 정확히 여섯 개를 넣는다. 같은 key 를 두 번 넣지 않는다
- RFQ 나 도면이 그 항목을 분명히 정했으면 defined=true. evidence 에 문서의 어느 부분인지 적고 reason 과 assumption 은 빈 문자열
- 정하지 않았으면 defined=false. evidence 는 무엇을 봤는지, reason 은 왜 견적에 필요한지(한국어 1–2문장, 끝에 "가정: …"),
  assumption 은 이 견적에 깐 가정(영어 1문장). 가정은 이 도면의 실제 형상과 노트에 맞춰 쓴다
- quote_basis 에는 provisional_fields 의 필드마다 항목 하나씩을 넣는다. provisional_fields 가 비었으면 빈 배열.
  assumption 에는 영업이 정한 현재 값을 쓴다
- 여섯 개 밖의 항목은 만들지 않는다. 더 알릴 것은 notes 에 적는다

체크리스트 여섯 개(key: 뜻):
${list}
quote_basis 의 key(provisional_fields 에 있는 것만):
${basis}`;
}

const MISSING_TEXT_FIELDS = ['item_name', 'item_name_en', 'reason', 'assumption'] as const;

/** 원시 출력 검사. 문제 목록을 돌려준다(비었으면 통과). 같은 key 가 두 번이면 첫 판정만 본다. */
export function checkRawOutput(out: RawOutput, provisional_fields: QuoteBasisField[]): string[] {
  const problems: string[] = [];
  if (!Array.isArray(out.checklist) || !Array.isArray(out.quote_basis)) {
    return ['checklist 와 quote_basis 는 배열이어야 한다'];
  }
  const seen = new Set<string>();
  for (const v of out.checklist) {
    if (typeof v !== 'object' || v === null) { problems.push('checklist 항목이 객체가 아니다'); continue; }
    if (!CHECKLIST_KEYS.includes(v.key)) { problems.push(`checklist key 가 여섯 개 밖이다: ${String(v.key)}`); continue; }
    if (seen.has(v.key)) continue;
    seen.add(v.key);
    if (typeof v.defined !== 'boolean') { problems.push(`checklist '${v.key}': defined 는 boolean 이어야 한다`); continue; }
    if (v.defined === false) {
      for (const f of MISSING_TEXT_FIELDS) {
        if (typeof v[f] !== 'string' || v[f].trim() === '') problems.push(`checklist '${v.key}' 는 defined=false 인데 ${f} 가 비었다`);
      }
    }
  }
  for (const k of CHECKLIST_KEYS) {
    if (!seen.has(k)) problems.push(`checklist 에 '${k}' 판정이 없다`);
  }
  const qb = new Set<string>();
  for (const q of out.quote_basis) {
    if (typeof q !== 'object' || q === null) { problems.push('quote_basis 항목이 객체가 아니다'); continue; }
    if (!QUOTE_BASIS_ORDER.includes(q.key)) { problems.push(`quote_basis key 가 아니다: ${String(q.key)}`); continue; }
    if (!provisional_fields.includes(q.key)) { problems.push(`quote_basis '${q.key}' 는 provisional_fields 에 없다`); continue; }
    qb.add(q.key);
    for (const f of MISSING_TEXT_FIELDS) {
      if (typeof q[f] !== 'string' || q[f].trim() === '') problems.push(`quote_basis '${q.key}' 의 ${f} 가 비었다`);
    }
  }
  for (const f of provisional_fields) {
    if (!qb.has(f)) problems.push(`provisional 필드 '${f}' 의 quote_basis 항목이 없다`);
  }
  return problems;
}

/** 원시 출력을 단계 출력 스키마로. 순서와 id 는 코드가 정한다: quote_basis(material, lot_size, delivery_days) → checklist(정의 순서). */
export function toMissingOutput(out: RawOutput, provisional_fields: QuoteBasisField[]): MissingOutput {
  const firstByKey = new Map<ChecklistKey, ChecklistVerdict>();
  for (const v of out.checklist) {
    if (CHECKLIST_KEYS.includes(v.key) && !firstByKey.has(v.key)) firstByKey.set(v.key, v);
  }
  const qbByKey = new Map<QuoteBasisField, QuoteBasisItem>();
  for (const q of out.quote_basis) {
    if (provisional_fields.includes(q.key) && !qbByKey.has(q.key)) qbByKey.set(q.key, q);
  }
  const missing: Omit<MissingSpec, 'id'>[] = [];
  for (const k of QUOTE_BASIS_ORDER) {
    const q = qbByKey.get(k);
    if (!q) continue;
    missing.push({ category: 'quote_basis', key: k, item_name: q.item_name, item_name_en: q.item_name_en, evidence: q.evidence, reason: q.reason, assumption: q.assumption });
  }
  const checklist_defined: ChecklistDefined[] = [];
  for (const k of CHECKLIST_KEYS) {
    const v = firstByKey.get(k);
    if (!v) continue;
    if (v.defined) checklist_defined.push({ key: k, evidence: v.evidence });
    else missing.push({ category: 'checklist', key: k, item_name: v.item_name, item_name_en: v.item_name_en, evidence: v.evidence, reason: v.reason, assumption: v.assumption });
  }
  return {
    missing_specs: missing.map((m, i) => ({ id: i + 1, ...m })),
    checklist_defined,
    notes: Array.isArray(out.notes) ? out.notes.filter((s): s is string => typeof s === 'string') : [],
  };
}

export async function identifyMissingSpecs(input: MissingInput): Promise<MissingOutput> {
  const system = systemPrompt();
  const baseContent = [
    ...fileBlocks(input.files),
    {
      type: 'text',
      text: `ExtractedSpecs:\n${pretty(input.specs)}\n\nmode: ${input.mode}\nprovisional_fields: ${JSON.stringify(input.provisional_fields)}\n\n위 문서와 스펙으로 체크리스트 여섯 개를 하나씩 판정해 도구로 제출하라.`,
    },
  ];

  let retried = false;
  let feedback: string[] = [];
  for (;;) {
    const content = feedback.length === 0
      ? baseContent
      : [...baseContent, { type: 'text', text: `지난 결과가 검사에 어긋났다. 아래를 고쳐 다시 제출하라.\n${feedback.map((p) => `- ${p}`).join('\n')}` }];
    let out: RawOutput;
    try {
      out = await callTool<RawOutput>({ step: '5', system, content, tool: TOOL, max_tokens: 4096 });
    } catch (e) {
      if (e instanceof LlmOutputError && !retried) { retried = true; feedback = [e.message]; continue; }
      throw e instanceof NeedsAttention ? e : new NeedsAttention('5', (e as Error).message);
    }
    const problems = checkRawOutput(out, input.provisional_fields);
    if (problems.length === 0) return toMissingOutput(out, input.provisional_fields);
    if (!retried) { retried = true; feedback = problems; continue; }
    throw new NeedsAttention('5', `누락 스펙 출력이 검사에 어긋난다: ${problems.join('; ')}`, out);
  }
}
