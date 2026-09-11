// 단계 8: 판정 설명 (LLM). 코드가 정한 status·수치는 그대로 두고 설명 문장만 받는다.
import { callTool, LlmOutputError } from '../lib/llm.ts';
import { NeedsAttention, pretty } from '../lib/util.ts';
import type { ToolSpec } from '../lib/llm.ts';
import type { ExtractedSpecs, MissingSpec, Mode, QuoteCalculation, RouteName, RouteResult } from '../lib/types.ts';

export interface ExplainInput {
  specs: ExtractedSpecs;
  missing_specs: MissingSpec[];
  mode: Mode;
  routes: RouteResult[];
  calc: QuoteCalculation;
}

export interface ExplainOutput {
  routes: RouteResult[];
}

interface Explanation {
  route_name: RouteName;
  reason: string;
  recommendation_comment: string;
  lead_time_note: string;
  technical_reason: string | null;
  commercial_tradeoff: string | null;
  assumptions_to_confirm: string[];
}

const TOOL: ToolSpec = {
  name: 'submit_route_explanations',
  description: '루트별 설명 문장을 제출한다. status·수치는 바꾸지 않는다',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      explanations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            route_name: { type: 'string', enum: ['vacuum_carburizing', 'gas_carburizing', 'gas_nitriding'] },
            reason: { type: 'string', description: 'rule_hits 근거, 스펙 값 인용, 2–3문장. 한국어' },
            recommendation_comment: { type: 'string', description: '한 줄' },
            lead_time_note: { type: 'string', description: '표준 리드타임, 요청 납기, 영업 가정값 여부 한 줄' },
            technical_reason: { type: ['string', 'null'], description: 'headline 루트만. 나머지는 null' },
            commercial_tradeoff: { type: ['string', 'null'], description: 'headline 루트만. 나머지는 null' },
            assumptions_to_confirm: { type: 'array', items: { type: 'string' }, description: 'headline 루트만. 나머지는 []' },
          },
          required: ['route_name', 'reason', 'recommendation_comment', 'lead_time_note', 'technical_reason', 'commercial_tradeoff', 'assumptions_to_confirm'],
        },
      },
    },
    required: ['explanations'],
  },
};

// workflow.md 단계 8 프롬프트 초안 그대로
const SYSTEM = `너는 열처리 업체 영업기술팀의 견적 엔지니어다.
루트 판정과 계산은 코드가 끝냈다. status·rule_hits·리드타임·수치는 바꾸지 않고 설명 문장만 쓴다. 한국어.
route_name 별로 { reason, recommendation_comment, lead_time_note, technical_reason, commercial_tradeoff,
assumptions_to_confirm } 를 낸다(도구 1개).
- reason: rule_hits 의 조항을 근거로 스펙 값을 인용해 2–3문장. not_suitable 이면 걸린 조건
- recommendation_comment: 한 줄
- lead_time_note: 표준 리드타임, 요청 납기, 납기가 영업 가정값(sources.delivery_days = sales)인지 한 줄.
  lead_time_assessment 가 null 이면 판정 대상이 아닌 이유
- headline_route 만 technical_reason(공정 특성), commercial_tradeoff(다른 견적 루트와 배치 수·단가 비교),
  assumptions_to_confirm(missing_specs 의 item_name 목록)을 쓴다. 나머지 루트는 null 과 []
- conditional_on 이 있으면 reason 끝에 그 전제가 바뀌면 판정이 달라진다는 문장을 붙인다
- 숫자는 입력 JSON 에 있는 값만 쓴다. 새로 계산하지 않는다

규칙 조항 참고: 2A 진공침탄(valid: 재질 SCM420H/20CrMnTi/20MnCr5, ECD 상한 0.35–0.80, HRC 58–62 / recommended: 런아웃 ≤0.03, 연삭 수정 불가, 자동차 품질 우선),
2B 가스침탄(valid: 재질, ECD 상한 0.40–1.20, 중간 변형 수용 / candidate: 런아웃 ≤0.03 + 연삭 불가),
2C 가스질화(valid: ECD 상한 ≤0.40, 변형 우선, 질화 호환, 침탄강 선호 없음 / ECD 상한 >0.40 이면 not_suitable),
§5 리드타임(진공 10–12일, 가스침탄 8–10일, 질화는 ≤12일 요청 시 리스크).`;

function merge(routes: RouteResult[], calc: QuoteCalculation, explanations: Explanation[]): RouteResult[] {
  const byName = new Map(explanations.map((e) => [e.route_name, e]));
  return routes.map((route) => {
    const e = byName.get(route.route_name);
    if (!e) return { ...route };
    const isHeadline = route.route_name === calc.headline_route;
    return {
      ...route, // 코드 필드는 입력값 유지
      reason: e.reason || null,
      recommendation_comment: e.recommendation_comment || null,
      lead_time_note: e.lead_time_note || null,
      technical_reason: isHeadline ? e.technical_reason || null : null,
      commercial_tradeoff: isHeadline ? e.commercial_tradeoff || null : null,
      assumptions_to_confirm: isHeadline && Array.isArray(e.assumptions_to_confirm) ? e.assumptions_to_confirm : [],
    };
  });
}

function complete(routes: RouteResult[]): boolean {
  return routes.every((r) => Boolean(r.reason) && Boolean(r.recommendation_comment));
}

export async function explainRoutes(input: ExplainInput): Promise<ExplainOutput> {
  const content = [{
    type: 'text',
    text: `입력 JSON:\n${pretty({
      headline_route: input.calc.headline_route,
      outcome: input.calc.outcome,
      mode: input.mode,
      specs: input.specs,
      missing_specs: input.missing_specs,
      routes: input.routes,
      calc: input.calc,
    })}\n\n루트 셋의 설명을 도구로 제출하라.`,
  }];

  let retried = false;
  for (;;) {
    let out: { explanations: Explanation[] };
    try {
      out = await callTool<{ explanations: Explanation[] }>({ step: '8', system: SYSTEM, content, tool: TOOL, max_tokens: 4096 });
    } catch (e) {
      if (e instanceof LlmOutputError && !retried) { retried = true; continue; }
      throw e instanceof NeedsAttention ? e : new NeedsAttention('8', (e as Error).message);
    }
    const routes = merge(input.routes, input.calc, Array.isArray(out.explanations) ? out.explanations : []);
    if (complete(routes)) return { routes };
    if (!retried) { retried = true; continue; }
    throw new NeedsAttention('8', '루트 셋 모두에 reason·recommendation_comment 가 있어야 한다', out);
  }
}
