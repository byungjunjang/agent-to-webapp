// workflow.md "## 공통 스키마" 를 그대로 옮긴 타입. 모든 단계가 이 이름을 쓴다.

export type Source = 'rfq' | 'drawing' | 'both' | 'missing' | 'sales' | 'internal';
export type FileRole = 'rfq_email' | 'drawing';
export type MediaType = 'application/pdf' | 'text/markdown' | 'text/plain';

export interface InputFile {
  name: string;
  role: FileRole;
  media_type: MediaType;
  data_base64: string;
}

export interface ExtractedSpecs {
  part_name: string;
  drawing_no: string;
  drawing_rev: string | null;
  material: string | null;
  lot_size: number | null;
  monthly_volume: number | null;
  annual_volume: number | null;
  part_weight_kg: number;
  case_depth_low: number;
  case_depth_high: number;
  case_depth_zone: string | null;
  hardness_test_standard: string | null;
  surface_hardness_low: number;
  surface_hardness_high: number;
  core_hardness_low: number;
  core_hardness_high: number;
  distortion_limit_mm: number;
  distortion_definition: string | null;
  grinding_after_ht: boolean;
  straightening_allowed: boolean | null;
  accepts_medium_distortion: boolean | null;
  automotive_quality_priority: boolean | null;
  nitriding_compatible: boolean | null;
  prefers_carburizing_behavior: boolean | null;
  delivery_days: number | null;
  delivery_basis: string | null;
  packing_requirement: string | null;
  ppap_requirement: string | null;
  inspection_requirement: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_company: string | null;
  rfq_number: string | null;
  rfq_date: string | null;
  rfq_subject: string | null;
  customer_requested_reply_items: string[];
  sources: Record<string, Source>;
  unconfirmed_fields: string[];
  extraction_notes: string[];
}

export type QuoteBasisField = 'material' | 'lot_size' | 'delivery_days';
export type Mode = 'firm' | 'provisional';
export type ChecklistKey = 'masking' | 'sampling_plan' | 'hardness_test' | 'straightening' | 'packing' | 'ppap_fai';

export interface MissingSpec {
  id: number;
  category: 'quote_basis' | 'checklist';
  key: QuoteBasisField | ChecklistKey;
  item_name: string;
  item_name_en: string;
  evidence: string;
  reason: string;
  assumption: string;
}

export interface ChecklistDefined {
  key: ChecklistKey;
  evidence: string;
}

export type RouteName = 'vacuum_carburizing' | 'gas_carburizing' | 'gas_nitriding';
export type RouteStatus = 'recommended' | 'valid' | 'candidate_not_recommended' | 'not_suitable';
export type LeadTime = 'feasible' | 'risk' | 'not_feasible';

export interface Equipment {
  equipment_id: string;
  route_name: RouteName;
  display_name: string;
  max_load_kg: number;
  depth_min_mm: number;
  depth_max_mm: number;
  distortion_risk: string;
  hourly_rate_cny: number;
  setup_fee_cny: number;
  temper_fee_cny: number;
}

export interface RouteResult {
  route_name: RouteName;
  equipment_id: string;
  display_name: string;
  distortion_risk: string;
  status: RouteStatus;
  rule_hits: string[];
  material_valid: boolean;
  equipment_range_match: boolean;
  lead_time_assessment: LeadTime | null;
  lead_time_days: string | null;
  conditional_on: string[];
  reason: string | null;
  recommendation_comment: string | null;
  technical_reason: string | null;
  commercial_tradeoff: string | null;
  assumptions_to_confirm: string[];
  lead_time_note: string | null;
}

export interface QuoteRow {
  route_name: RouteName;
  equipment_id: string;
  display_name: string;
  status: RouteStatus;
  lot_size: number;
  case_depth_mid: number;
  total_weight_kg: number;
  batches: number;
  cycle_time_hr: number;
  cost_per_batch_cny: number;
  unit_cost_cny: number;
  inspection_fee_cny: number;
  margin: number;
  quote_per_pc_cny: number;
  total_quote_cny: number;
}

export interface QuoteCalculation {
  outcome: 'quote' | 'no_route';
  headline_route: RouteName | null;
  quotes: QuoteRow[];
  references: {
    not_suitable_routes: QuoteRow[];
    monthly_volume: QuoteRow[];
    lot_table: QuoteRow[];
  };
}

export interface Email {
  subject: string;
  body_md: string;
}

export interface Emails {
  ko: Email;
  zh: Email;
  en: Email;
}

export interface XlsxFile {
  filename: string;
  data_base64: string;
}

export interface Check {
  name: string;
  level: 'error' | 'warning';
  ok: boolean;
  detail: string | null;
}

export interface EmailMissing {
  ko: string[];
  zh: string[];
  en: string[];
}
