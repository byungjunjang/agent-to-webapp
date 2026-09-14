// Anthropic 호출을 한 곳에 모은다. LLM 단계는 도구 1개를 강제해 JSON 만 받는다.
// API 키는 SDK 가 환경변수 ANTHROPIC_API_KEY 에서 읽는다(node --env-file-if-exists 로 주입). 코드는 키를 만지지 않는다.
// 스킬 자산(assets/verify-template)에서 복사된다. 고치지 않는다.
import { MODEL, usageLog } from './step.ts';
import type { InputFile, UsageEntry } from './step.ts';

export { MODEL, usageLog };

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** SDK 의 content block 타입은 넓어서 느슨하게 둔다. */
export type Block = Record<string, unknown>;

// SDK 는 처음 호출할 때 읽는다. 순수 함수만 쓰는 곳(테스트)은 SDK 없이도 이 파일을 불러올 수 있다.
let client: any = null;
async function getClient(): Promise<any> {
  if (!client) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    client = new Anthropic();
  }
  return client;
}

/** 도구가 호출되지 않았거나 출력이 잘린 경우. 스키마 불일치와 같은 급으로 다룬다. */
export class LlmOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmOutputError';
  }
}

/** 입력 파일 → 메시지 블록. PDF 는 document, 이미지는 image, 나머지는 본문을 text 로 넣는다. */
export function fileBlocks(files: InputFile[], label: (f: InputFile) => string = (f) => `파일: ${f.name}`): Block[] {
  const blocks: Block[] = [];
  for (const f of files) {
    if (f.media_type === 'application/pdf') {
      blocks.push({ type: 'text', text: `[${label(f)}]` });
      blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data_base64 } });
    } else if (f.media_type.startsWith('image/')) {
      blocks.push({ type: 'text', text: `[${label(f)}]` });
      blocks.push({ type: 'image', source: { type: 'base64', media_type: f.media_type, data: f.data_base64 } });
    } else {
      const text = Buffer.from(f.data_base64, 'base64').toString('utf8');
      blocks.push({ type: 'text', text: `[${label(f)}]\n\n${text}` });
    }
  }
  return blocks;
}

/**
 * 도구 input 이 JSON 문자열 하나로 감싸져 온 경우를 푼다. 모델이 {"key": "{...전체 JSON...}"} 처럼 낼 때가 있다.
 * 필수 키가 다 있으면 손대지 않는다. 문자열 값 가운데 JSON 으로 풀려 필수 키를 모두 가진 것이 있으면 그것을 쓴다.
 */
export function unwrapStringified(input: unknown, required: string[]): { value: unknown; unwrapped: boolean } {
  if (typeof input !== 'object' || input === null || required.length === 0) return { value: input, unwrapped: false };
  const obj = input as Record<string, unknown>;
  if (required.every((k) => k in obj)) return { value: input, unwrapped: false };
  for (const v of Object.values(obj)) {
    if (typeof v !== 'string') continue;
    try {
      const parsed = JSON.parse(v) as unknown;
      if (typeof parsed === 'object' && parsed !== null && required.every((k) => k in (parsed as Record<string, unknown>))) {
        return { value: parsed, unwrapped: true };
      }
    } catch {
      // JSON 이 아니면 다음 값
    }
  }
  return { value: input, unwrapped: false };
}

export interface CallToolOptions {
  /** usage 기록에 남는 이름. "2" 또는 "2#재시도" 처럼. */
  step: string;
  system: string;
  content: Block[] | string;
  tool: ToolSpec;
  max_tokens?: number;
  model?: string;
  /** 도구 호출이 없거나 출력이 잘렸을 때 다시 묻는 횟수. 기본 1. */
  retries?: number;
}

/** 도구 1개를 강제 호출해 그 input 을 돌려준다. API 오류는 그대로 던진다(SDK 가 429·5xx 는 스스로 재시도한다). */
export async function callTool<T>(opts: CallToolOptions): Promise<T> {
  const retries = opts.retries ?? 1;
  const maxTokens = opts.max_tokens ?? 4096;
  const model = opts.model ?? MODEL;
  const content: Block[] = typeof opts.content === 'string' ? [{ type: 'text', text: opts.content }] : [...opts.content];
  let lastError: LlmOutputError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now();
    const res = await (await getClient()).messages.create({
      model,
      max_tokens: maxTokens,
      system: opts.system,
      messages: [{ role: 'user', content }],
      tools: [opts.tool],
      tool_choice: { type: 'tool', name: opts.tool.name },
    });
    const entry: UsageEntry = {
      step: attempt === 0 ? opts.step : `${opts.step}#재시도${attempt}`,
      model: res.model,
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
      ms: Date.now() - started,
      stop_reason: res.stop_reason,
    };
    usageLog.push(entry);
    const block = res.content.find((b: any) => b.type === 'tool_use');
    if (res.stop_reason === 'max_tokens') lastError = new LlmOutputError(`출력이 max_tokens(${maxTokens}) 에서 잘렸다`);
    else if (!block) lastError = new LlmOutputError(`도구 호출이 없다 (stop_reason=${res.stop_reason})`);
    else {
      const required = Array.isArray(opts.tool.input_schema.required) ? (opts.tool.input_schema.required as string[]) : [];
      const { value, unwrapped } = unwrapStringified(block.input, required);
      if (unwrapped) entry.note = '도구 input 이 JSON 문자열로 감싸져 있어 풀었다';
      return value as T;
    }
    entry.note = lastError.message;
    content.push({ type: 'text', text: `앞 응답은 쓸 수 없었다: ${lastError.message}. 도구 ${opts.tool.name} 을 한 번만 호출해 스키마대로만 답하라. 다른 말은 넣지 않는다.` });
  }
  throw lastError ?? new LlmOutputError('알 수 없는 실패');
}
