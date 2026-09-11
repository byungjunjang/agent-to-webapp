// 공용 유틸. 반올림은 workflow.md "## 조건" 5 의 10진 사사오입 하나만 쓴다.

/** 10진 사사오입. 6.549999… 같은 부동소수 표현을 12자리로 정리한 뒤 반올림한다. */
export function r(x: number, d: number): number {
  return Number(Math.round(Number(x.toPrecision(12) + 'e' + d)) + 'e-' + d);
}

/** `#,##0.00` 형식 문자열. 견적서 합계 문구와 최종 검증이 같은 함수를 쓴다. */
export function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 단계가 스스로 처리할 수 없어 사람에게 넘기는 상태. run.ts 가 잡아서 기록한다. */
export class NeedsAttention extends Error {
  step: string;
  payload: unknown;
  constructor(step: string, message: string, payload?: unknown) {
    super(`[단계 ${step}] ${message}`);
    this.name = 'NeedsAttention';
    this.step = step;
    this.payload = payload;
  }
}

export function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

export function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isStrArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

/** JSON 을 사람이 읽기 좋게. 단계 사이 데이터를 LLM 에 넘길 때도 쓴다. */
export function pretty(v: unknown): string {
  return JSON.stringify(v, null, 2);
}
