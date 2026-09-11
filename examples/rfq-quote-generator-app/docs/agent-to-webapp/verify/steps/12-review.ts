// 단계 12: 발송 전 검토 (사람). 웹 앱은 UI 승인, 재검증 스크립트는 자동 승인하고 확인 목록을 report 에 남긴다.
import type { Check, Emails, ExtractedSpecs, MissingSpec, Mode, QuoteCalculation, RouteResult, XlsxFile } from '../lib/types.ts';

export interface ReviewInput {
  job_id: string;
  specs: ExtractedSpecs;
  missing_specs: MissingSpec[];
  mode: Mode;
  routes: RouteResult[];
  calc: QuoteCalculation;
  emails: Emails;
  xlsx: XlsxFile | null;
  checks: Check[];
}

export interface Review {
  status: 'approved' | 'rejected';
  reviewed_by: string;
  reviewed_at: string;
  comment: string | null;
}

export interface ReviewOutput {
  review: Review;
}

/** workflow.md 단계 12 "확인할 것". 사람이 봤어야 할 목록으로 report.md 에 그대로 간다. */
export const REVIEW_CHECKLIST: string[] = [
  'headline 루트와 단가가 맞는지, 대안·참고 루트 설명이 사실과 맞는지',
  '누락 스펙의 가정 문구가 이 도면에 맞는지(나사부 방탄, 측정 구간처럼 도면마다 다른 내용)',
  'provisional 이면 가정값이 JSON·견적서·이메일 세 곳에 가정으로 표시됐는지',
  '세 언어 이메일의 호칭과 톤, 고객이 요청한 회신 항목에 답했는지',
];

export interface ReviewDecision {
  status: 'approved' | 'rejected';
  reviewed_by: string;
  comment?: string | null;
}

export function reviewBeforeSend(input: ReviewInput, decision: ReviewDecision): ReviewOutput {
  const failed = input.checks.filter((c) => c.level === 'error' && !c.ok).map((c) => c.name);
  const comment = decision.comment ?? (failed.length ? `자동 승인이지만 검증 실패 항목 있음: ${failed.join(', ')}` : null);
  return {
    review: {
      status: decision.status,
      reviewed_by: decision.reviewed_by,
      reviewed_at: new Date().toISOString(),
      comment,
    },
  };
}
