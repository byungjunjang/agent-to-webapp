// 단계 7: 원가·견적 계산 (코드). routing_pricing_rules.md §4 를 그대로. 반올림은 사사오입 r().
import { NeedsAttention, r } from '../lib/util.ts';
import type { Equipment, ExtractedSpecs, QuoteBasisField, QuoteCalculation, QuoteRow, RouteResult, RouteStatus } from '../lib/types.ts';

export interface CalcInput {
  specs: ExtractedSpecs;
  routes: RouteResult[];
  equipment: Equipment[];
  provisional_fields: QuoteBasisField[];
  extra_lot_sizes: number[];
}

export interface CalcOutput {
  calc: QuoteCalculation;
}

export const INSPECTION_FEE = 0.35;
export const MARGIN = 1.18;
const QUOTE_STATUSES: RouteStatus[] = ['recommended', 'valid', 'candidate_not_recommended'];
const STATUS_RANK: Record<RouteStatus, number> = { recommended: 0, valid: 1, candidate_not_recommended: 2, not_suitable: 3 };

export function cycleTime(route: RouteResult['route_name'], mid: number): number {
  if (route === 'vacuum_carburizing') return r(2.5 + 4.0 * mid + 0.8, 1);
  if (route === 'gas_carburizing') return r(3.0 + 5.0 * mid + 0.8, 1);
  return r(10.0 + 18.0 * mid, 1);
}

/** 한 루트·한 수량의 QuoteRow. */
export function quoteRow(route: RouteResult, eq: Equipment, specs: ExtractedSpecs, lot: number): QuoteRow {
  const mid = (specs.case_depth_low + specs.case_depth_high) / 2;
  // r(·, 6): 0.82 × 1200 = 983.9999… 같은 부동소수 오차로 배치 수가 하나 늘지 않게
  const total = r(lot * specs.part_weight_kg, 6);
  const batches = Math.ceil(total / eq.max_load_kg);
  const cycle = cycleTime(route.route_name, mid);
  const cost_per_batch = eq.setup_fee_cny + eq.hourly_rate_cny * cycle + eq.temper_fee_cny;
  const unit_cost = r((batches * cost_per_batch) / lot, 2);
  const quote = r((unit_cost + INSPECTION_FEE) * MARGIN, 2);
  return {
    route_name: route.route_name,
    equipment_id: eq.equipment_id,
    display_name: eq.display_name,
    status: route.status,
    lot_size: lot,
    case_depth_mid: r(mid, 3),
    total_weight_kg: r(total, 2),
    batches,
    cycle_time_hr: cycle,
    cost_per_batch_cny: r(cost_per_batch, 2),
    unit_cost_cny: unit_cost,
    inspection_fee_cny: INSPECTION_FEE,
    margin: MARGIN,
    quote_per_pc_cny: quote,
    total_quote_cny: r(quote * lot, 2),
  };
}

/** CLAUDE.md Step 4 검증: 모든 수치 > 0, quote > unit_cost. 단계 11 도 같은 함수를 부른다. */
export function validateCalc(calc: QuoteCalculation): string[] {
  const problems: string[] = [];
  const rows: [string, QuoteRow][] = [
    ...calc.quotes.map((q): [string, QuoteRow] => ['quotes', q]),
    ...calc.references.not_suitable_routes.map((q): [string, QuoteRow] => ['references.not_suitable_routes', q]),
    ...calc.references.monthly_volume.map((q): [string, QuoteRow] => ['references.monthly_volume', q]),
    ...calc.references.lot_table.map((q): [string, QuoteRow] => ['references.lot_table', q]),
  ];
  const numericKeys: (keyof QuoteRow)[] = [
    'lot_size', 'case_depth_mid', 'total_weight_kg', 'batches', 'cycle_time_hr', 'cost_per_batch_cny',
    'unit_cost_cny', 'inspection_fee_cny', 'margin', 'quote_per_pc_cny', 'total_quote_cny',
  ];
  for (const [where, q] of rows) {
    const tag = `${where} ${q.route_name}@${q.lot_size}`;
    for (const k of numericKeys) {
      const v = q[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) problems.push(`${tag}: ${k} 가 양수가 아니다 (${String(v)})`);
    }
    if (!(q.quote_per_pc_cny > q.unit_cost_cny)) problems.push(`${tag}: quote_per_pc_cny (${q.quote_per_pc_cny}) 가 unit_cost_cny (${q.unit_cost_cny}) 보다 크지 않다`);
  }
  return problems;
}

export function calculateQuote(input: CalcInput): CalcOutput {
  const { specs, routes, equipment } = input;
  const eqByRoute = new Map(equipment.map((e) => [e.route_name, e]));
  const eqOf = (route: RouteResult): Equipment => {
    const eq = eqByRoute.get(route.route_name);
    if (!eq) throw new NeedsAttention('7', `장비 행이 없다: ${route.route_name}`);
    return eq;
  };
  if (specs.lot_size === null) {
    throw new NeedsAttention('7', 'lot_size 가 null 이다. 단계 4 에서 값을 받아야 한다');
  }
  const lot = specs.lot_size;

  // quotes: recommended → valid → candidate_not_recommended, 같으면 CSV 순서(routes 는 CSV 순서로 온다)
  const quoteRoutes = routes
    .map((route, csvIndex) => ({ route, csvIndex }))
    .filter(({ route }) => QUOTE_STATUSES.includes(route.status))
    .sort((a, b) => STATUS_RANK[a.route.status] - STATUS_RANK[b.route.status] || a.csvIndex - b.csvIndex)
    .map(({ route }) => route);
  const quotes = quoteRoutes.map((route) => quoteRow(route, eqOf(route), specs, lot));
  const headline_route = quotes[0]?.route_name ?? null;

  const not_suitable_routes = routes
    .filter((route) => route.status === 'not_suitable')
    .map((route) => quoteRow(route, eqOf(route), specs, lot));

  const monthly_volume = specs.monthly_volume !== null && specs.monthly_volume !== lot
    ? quoteRoutes.map((route) => quoteRow(route, eqOf(route), specs, specs.monthly_volume as number))
    : [];

  let lot_table: QuoteRow[] = [];
  if (input.provisional_fields.includes('lot_size') && headline_route !== null) {
    const headlineEq = eqByRoute.get(headline_route) as Equipment;
    const fullLoad = Math.floor(headlineEq.max_load_kg / specs.part_weight_kg);
    const lots = [...new Set([fullLoad, 500, 1000, 2000, 5000, ...input.extra_lot_sizes])]
      .filter((n) => Number.isInteger(n) && n > 0)
      .sort((a, b) => a - b);
    lot_table = quoteRoutes.flatMap((route) => lots.map((n) => quoteRow(route, eqOf(route), specs, n)));
  }

  const calc: QuoteCalculation = {
    outcome: quotes.length > 0 ? 'quote' : 'no_route',
    headline_route,
    quotes,
    references: { not_suitable_routes, monthly_volume, lot_table },
  };

  const problems = validateCalc(calc);
  if (problems.length > 0) {
    throw new NeedsAttention('7', `계산 검증 실패: ${problems.join('; ')}`, { specs, routes, equipment });
  }
  return { calc };
}
