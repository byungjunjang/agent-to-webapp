// 단계 계약과 러너가 쓰는 공용 타입. 스킬 자산(assets/verify-template)에서 복사된다. 고치지 않는다.
// steps/index.ts 가 이 타입으로 단계 배열 `steps` 를 내보내면 run.ts 가 순서대로 부른다.
// Node 24 가 타입만 지우고 그대로 실행한다. enum·파라미터 프로퍼티 같은 지워지지 않는 문법은 쓰지 않는다.

export const MODEL: string = process.env.A2W_MODEL ?? 'claude-sonnet-5-5';

/** 같은 단계로 되돌아가는 횟수 한도. 넘으면 needs_attention. */
export const MAX_ATTEMPTS = 3;

export type Actor = 'code' | 'llm' | 'human';

/** run.ts 가 입력 폴더에서 읽어 단계 1 에 넘기는 파일. 역할(어떤 파일이 무엇인지)은 단계 1 이 정한다. */
export interface InputFile {
  name: string;
  media_type: string;
  data_base64: string;
}

/** 단계 1 이 받는 입력. */
export interface InitialInput {
  input_name: string;
  files: InputFile[];
  received_at: string;
}

export interface StepContext {
  inputName: string;
  inputDir: string;
  outDir: string;
  /** 앞 단계들의 출력. 단계 번호로 읽는다. */
  outputs: Map<number, unknown>;
  /** 이 단계가 이번 실행에서 몇 번째로 도는지. 되돌아오면 2, 3, … */
  attempt: number;
  /** 뒤 단계가 Goto 로 되돌린 경우 그 Goto. 사유와 payload 를 읽어 다시 시도한다. */
  feedback: Goto | null;
  log(msg: string): void;
  /** 사람이 봤어야 할 것. summary.json 의 human_notes 로 남고 report.md 로 옮긴다. */
  note(msg: string): void;
}

/** 단계 하나. workflow.md 의 '### 단계 N' 과 번호·이름·실행 주체가 같아야 한다. */
export interface Step<I = any, O = any> {
  n: number;
  name: string;
  actor: Actor;
  run(input: I, ctx: StepContext): O | Goto | Skip | Promise<O | Goto | Skip>;
}

/** 앞 단계로 되돌아간다(재추출·재작성). 되돌아간 단계는 ctx.feedback 으로 사유를 받는다. */
export class Goto {
  step: number;
  reason: string;
  payload: unknown;
  constructor(step: number, reason: string, payload?: unknown) {
    this.step = step;
    this.reason = reason;
    this.payload = payload;
  }
}

/** 이 단계를 건너뛴다. 입력이 그대로 다음 단계로 간다. 외부 서비스로 뺄 단계의 stub 에 쓴다. */
export class Skip {
  reason: string;
  constructor(reason: string) {
    this.reason = reason;
  }
}

/** 단계가 스스로 처리할 수 없어 작업을 멈추고 사람에게 넘긴다. run.ts 가 잡아 summary 에 남긴다. */
export class NeedsAttention extends Error {
  step: number | string;
  payload: unknown;
  constructor(step: number | string, message: string, payload?: unknown) {
    super(`[단계 ${step}] ${message}`);
    this.name = 'NeedsAttention';
    this.step = step;
    this.payload = payload;
  }
}

export interface UsageEntry {
  step: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  ms: number;
  stop_reason: string | null;
  note?: string;
}

/** LLM 호출마다 남긴다. summary.json 과 report.md 가 읽는다. */
export const usageLog: UsageEntry[] = [];

export function pretty(v: unknown): string {
  return JSON.stringify(v, null, 2);
}
