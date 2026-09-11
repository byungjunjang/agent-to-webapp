// 단계 6: 루트 판정·리드타임 (코드). routing_pricing_rules.md §2·§5 를 수치 규칙으로 옮겼다.
import { ROUTE_ORDER } from '../lib/equipment.ts';
import { NeedsAttention } from '../lib/util.ts';
import type { Equipment, ExtractedSpecs, LeadTime, QuoteBasisField, RouteResult, RouteStatus } from '../lib/types.ts';

export interface RoutesInput {
  specs: ExtractedSpecs;
  provisional_fields: QuoteBasisField[];
  equipment: Equipment[];
}

export interface RoutesOutput {
  routes: RouteResult[];
}

const VALID_MATERIALS = new Set(['SCM420H', '20CRMNTI', '20MNCR5']);

/** 대문자로 바꾸고 공백·하이픈을 지운다. */
export function normalizeMaterial(m: string | null): string {
  return (m ?? '').toUpperCase().replace(/[\s-]/g, '');
}

interface Judged { status: RouteStatus; hits: string[] }

function judgeVacuum(s: ExtractedSpecs, mat_ok: boolean, hi: number, tight: boolean, no_grind: boolean, hrc_ok: boolean): Judged {
  const hits: string[] = [];
  if (!mat_ok) hits.push('2A.fail:material');
  if (!(hi >= 0.35 && hi <= 0.80)) hits.push('2A.fail:ecd');
  if (!hrc_ok) hits.push('2A.fail:hardness');
  if (hits.length > 0) return { status: 'not_suitable', hits };
  hits.push('2A.valid');
  if (tight) hits.push('2A.rec:tight');
  if (no_grind) hits.push('2A.rec:no_grind');
  if (s.automotive_quality_priority === true) hits.push('2A.rec:automotive');
  return { status: hits.length > 1 ? 'recommended' : 'valid', hits };
}

function judgeGas(s: ExtractedSpecs, mat_ok: boolean, hi: number, tight: boolean, no_grind: boolean): Judged {
  const hits: string[] = [];
  if (!mat_ok) hits.push('2B.fail:material');
  if (!(hi >= 0.40 && hi <= 1.20)) hits.push('2B.fail:ecd');
  if (hits.length > 0) return { status: 'not_suitable', hits };
  if (tight && no_grind) return { status: 'candidate_not_recommended', hits: ['2B.candidate:tight+no_grind'] };
  const accepts = s.accepts_medium_distortion ?? !tight;
  if (accepts) return { status: 'valid', hits: ['2B.valid'] };
  return { status: 'candidate_not_recommended', hits: ['2B.candidate:no_medium_distortion_acceptance'] };
}

function judgeNitriding(s: ExtractedSpecs, hi: number, tight: boolean, no_grind: boolean): Judged {
  if (hi > 0.40) return { status: 'not_suitable', hits: ['2C.not_suitable:ecd'] };
  const hits: string[] = [];
  if (!(tight || no_grind)) hits.push('2C.not_suitable:distortion_priority');
  if (s.nitriding_compatible !== true) hits.push('2C.not_suitable:not_compatible');
  if (s.prefers_carburizing_behavior === true) hits.push('2C.not_suitable:prefers_carburizing');
  if (hits.length > 0) return { status: 'not_suitable', hits };
  return { status: 'valid', hits: ['2C.valid'] };
}

/** §5 리드타임. not_suitable 이면 null. */
export function leadTime(route: RouteResult['route_name'], status: RouteStatus, d: number | null): { assessment: LeadTime | null; days: string | null } {
  if (status === 'not_suitable' || d === null) return { assessment: null, days: null };
  if (route === 'vacuum_carburizing') {
    return { days: '10-12', assessment: d >= 12 ? 'feasible' : d >= 10 ? 'risk' : 'not_feasible' };
  }
  if (route === 'gas_carburizing') {
    return { days: '8-10', assessment: d >= 10 ? 'feasible' : d >= 8 ? 'risk' : 'not_feasible' };
  }
  return { days: null, assessment: d <= 12 ? 'risk' : 'feasible' };
}

export function evaluateRoutes(input: RoutesInput): RoutesOutput {
  const s = input.specs;
  const byRoute = new Map(input.equipment.map((e) => [e.route_name, e]));
  for (const name of ROUTE_ORDER) {
    if (!byRoute.has(name)) throw new NeedsAttention('6', `장비 행이 없다: ${name}`);
  }
  if (input.equipment.length !== 3) throw new NeedsAttention('6', `장비 행은 3개여야 한다 (지금 ${input.equipment.length})`);

  const mat_ok = VALID_MATERIALS.has(normalizeMaterial(s.material));
  const hi = s.case_depth_high;
  const tight = s.distortion_limit_mm <= 0.03;
  const no_grind = s.grinding_after_ht === false;
  const hrc_ok = Math.abs(s.surface_hardness_low - 58) <= 2 && Math.abs(s.surface_hardness_high - 62) <= 2;

  const routes: RouteResult[] = [];
  for (const eq of input.equipment) {
    let judged: Judged;
    if (eq.route_name === 'vacuum_carburizing') judged = judgeVacuum(s, mat_ok, hi, tight, no_grind, hrc_ok);
    else if (eq.route_name === 'gas_carburizing') judged = judgeGas(s, mat_ok, hi, tight, no_grind);
    else judged = judgeNitriding(s, hi, tight, no_grind);

    const lt = leadTime(eq.route_name, judged.status, s.delivery_days);
    const conditional_on: string[] = [];
    if (input.provisional_fields.includes('material') && eq.route_name !== 'gas_nitriding') conditional_on.push('material');
    if (input.provisional_fields.includes('delivery_days') && lt.assessment !== null) conditional_on.push('delivery_days');

    routes.push({
      route_name: eq.route_name,
      equipment_id: eq.equipment_id,
      display_name: eq.display_name,
      distortion_risk: eq.distortion_risk,
      status: judged.status,
      rule_hits: judged.hits,
      material_valid: mat_ok,
      equipment_range_match: s.case_depth_low >= eq.depth_min_mm && s.case_depth_high <= eq.depth_max_mm,
      lead_time_assessment: lt.assessment,
      lead_time_days: lt.days,
      conditional_on,
      reason: null,
      recommendation_comment: null,
      technical_reason: null,
      commercial_tradeoff: null,
      assumptions_to_confirm: [],
      lead_time_note: null,
    });
  }
  return { routes };
}
