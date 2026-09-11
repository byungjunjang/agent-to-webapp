// 단계 9: 회신 이메일 (LLM). 한국어·중국어·영어 세 통을 한 번에 받는다.
//
// 재검증에서 바꾼 것(2026-09-11): 처음 구현은 모델이 첨부 파일명(견적서_{rfq}.xlsx)을 본문에 직접 쓰게 했다. Helios 입력의
// 중국어 본문에서 모델이 파일명을 "见积서_…" 로 변형했고, 단계 11 이 돌려보낸 재작성에서도 같았다(로컬 run-3 도 "见积书" 로
// 썼다가 손으로 고쳤다). 파일명은 코드가 아는 확정 문자열이므로 모델은 자리표시자 [[ATTACHMENT]] 만 쓰고 코드가 바꾼다.
// 단계의 입출력 스키마(EmailsInput / EmailsOutput)는 workflow.md 그대로다. 바뀐 것은 프롬프트 초안 10번과 후처리 한 줄이다.
import { callTool, LlmOutputError } from '../lib/llm.ts';
import { NeedsAttention, pretty } from '../lib/util.ts';
import type { ToolSpec } from '../lib/llm.ts';
import type { EmailMissing, Emails, ExtractedSpecs, MissingSpec, Mode, QuoteCalculation, RouteResult } from '../lib/types.ts';

export interface EmailsInput {
  specs: ExtractedSpecs;
  missing_specs: MissingSpec[];
  mode: Mode;
  routes: RouteResult[];
  calc: QuoteCalculation;
  xlsx_filename: string | null;
  retry_missing: EmailMissing; // 단계 11 이 돌려보낸 누락 문자열. 첫 호출은 빈 배열들
}

export interface EmailsOutput {
  emails: Emails;
}

const EMAIL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { subject: { type: 'string' }, body_md: { type: 'string', description: 'Markdown 본문' } },
  required: ['subject', 'body_md'],
};

const TOOL: ToolSpec = {
  name: 'submit_reply_emails',
  description: '견적 회신 메일 초안 세 통(ko, zh, en)을 제출한다',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: { ko: EMAIL_SCHEMA, zh: EMAIL_SCHEMA, en: EMAIL_SCHEMA },
    required: ['ko', 'zh', 'en'],
  },
};

/** 첨부 파일명 자리표시자. 모델은 이것만 쓰고 코드가 실제 파일명으로 바꾼다. */
export const ATTACHMENT_PLACEHOLDER = '[[ATTACHMENT]]';

// workflow.md 단계 9 프롬프트 초안. 10번(첨부 파일명)만 자리표시자 방식으로 고쳤다. report.md 에 기록.
const SYSTEM = `너는 열처리 업체 영업기술팀의 견적 엔지니어다.
견적 회신 메일 초안을 한국어·중국어·영어로 쓴다(도구 1개, 출력 Emails). 세 언어의 수치와 항목 구성은 같아야 한다.
섹션 순서는 고정이다.
1 제목: "RE: {rfq_subject 가 없으면 Quotation request} — 견적 회신" / "… — 报价回复" / "… — Quotation Reply"
2 인사: customer_name 이 있으면 이름으로, 없으면 ko "담당자님", zh "尊敬的客户", en "Dear Sir or Madam". RFQ 번호와 도면 번호·Rev 를 적는다
3 mode 가 provisional 이면 잠정 견적 안내: 어떤 전제(수량·납기·재질)를 가정했는지. ko "잠정", zh "暂定", en "provisional" 을 쓴다
4 견적 요약: headline 루트 이름, 단가(CNY/pc), 수량, 총액
5 대안 루트: 다른 견적 루트를 한 줄씩 비교. not_suitable 루트는 이유 한 줄
6 참고 단가: calc.references 의 monthly_volume·lot_table 이 있으면 표로
7 확인 요청 사항: missing_specs 를 번호순으로, 항목마다 왜 필요한지와 우리가 깐 가정. provisional 이면
  A(견적 전제, 회신 필수 = quote_basis)와 B(공정·품질 조건 = checklist) 두 묶음
8 customer_requested_reply_items 가운데 위에서 다루지 않은 것에 대한 답
9 납기: headline 루트의 lead_time_assessment. feasible 은 대응 가능, risk 는 사전 협의 필요, not_feasible 은 요청 납기
  대응 불가와 표준 리드타임
10 마무리: 첨부 견적서 안내, "본 견적은 러프 견적이며 최종 단가는 시험 가공 후 확정", 추가 문의 환영,
  서명 "Dongwoo Dongam Technology (Wuxi) — Sales Engineering Team"
첨부 파일명: xlsx_filename 이 있으면 세 통 모두 파일명 자리에 자리표시자 ${ATTACHMENT_PLACEHOLDER} 만 쓴다
  (예: ko "첨부된 견적서(${ATTACHMENT_PLACEHOLDER})", zh "请查收附件报价单（${ATTACHMENT_PLACEHOLDER}）", en "attached quotation (${ATTACHMENT_PLACEHOLDER})").
  파일명을 직접 쓰거나 번역·음역하지 않는다. 코드가 자리표시자를 실제 파일명으로 바꾼다
outcome 이 no_route 면 4–6 대신 대응 불가 안내(ko "대응 불가", zh "无法", en "unable")와 루트별 이유 한 줄. 첨부 안내는 없다.
톤: ko 합니다체·"귀사", zh 商务正式·"贵司"·"请贵司确认", en formal business.
금액: ko "¥ 1,234.56 CNY", zh "¥ 1,234.56 元 (CNY)", en "CNY 1,234.56". 숫자는 입력 JSON 값만 쓴다.
RFQ 번호(rfq_number)와 도면 번호(drawing_no)는 세 통 모두 본문에 글자 그대로 넣는다. 단가와 총액은 소수 둘째 자리까지 그대로 쓴다.`;

function hasRetry(m: EmailMissing): boolean {
  return m.ko.length + m.zh.length + m.en.length > 0;
}

/** 자리표시자를 실제 파일명으로. xlsx 가 없으면(no_route) 자리표시자를 지운다. */
export function fillAttachment(emails: Emails, xlsx_filename: string | null): Emails {
  const fill = (s: string): string => s.split(ATTACHMENT_PLACEHOLDER).join(xlsx_filename ?? '');
  const out = {} as Emails;
  for (const k of ['ko', 'zh', 'en'] as const) out[k] = { subject: fill(emails[k].subject), body_md: fill(emails[k].body_md) };
  return out;
}

function looksLikeEmails(v: unknown): v is Emails {
  if (typeof v !== 'object' || v === null) return false;
  return (['ko', 'zh', 'en'] as const).every((k) => {
    const e = (v as Record<string, unknown>)[k] as Record<string, unknown> | undefined;
    return typeof e === 'object' && e !== null && typeof e.subject === 'string' && typeof e.body_md === 'string';
  });
}

export async function writeEmails(input: EmailsInput): Promise<EmailsOutput> {
  let text = `입력 JSON:\n${pretty({
    mode: input.mode,
    xlsx_filename: input.xlsx_filename,
    specs: input.specs,
    missing_specs: input.missing_specs,
    routes: input.routes,
    calc: input.calc,
  })}\n\n세 언어의 회신 메일을 도구로 제출하라.`;
  if (hasRetry(input.retry_missing)) {
    // 빠진 것이 첨부 파일명이면 파일명을 다시 쓰라고 하지 않고 자리표시자를 쓰라고 한다
    const show = (s: string): string =>
      s === input.xlsx_filename ? `첨부 파일명 (본문에는 자리표시자 ${ATTACHMENT_PLACEHOLDER} 를 쓴다)` : JSON.stringify(s);
    const lines = (['ko', 'zh', 'en'] as const)
      .filter((k) => input.retry_missing[k].length > 0)
      .map((k) => `- ${k}: ${input.retry_missing[k].map(show).join(', ')}`);
    text += `\n\n지난 초안에 아래 문자열이 빠졌다. 넣어서 다시 써라.\n${lines.join('\n')}`;
  }
  const content = [{ type: 'text', text }];

  let retried = false;
  for (;;) {
    try {
      const emails = await callTool<Emails>({ step: '9', system: SYSTEM, content, tool: TOOL, max_tokens: 12000 });
      if (!looksLikeEmails(emails)) {
        if (!retried) { retried = true; continue; }
        throw new NeedsAttention('9', '출력이 Emails 모양이 아니다', emails);
      }
      return { emails: fillAttachment(emails, input.xlsx_filename) };
    } catch (e) {
      if (e instanceof NeedsAttention) throw e;
      if (e instanceof LlmOutputError && !retried) { retried = true; continue; }
      throw new NeedsAttention('9', (e as Error).message);
    }
  }
}
