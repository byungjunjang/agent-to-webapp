// Anthropic SDK 호출을 한 곳에 모은다. LLM 단계(2·5·8·9)는 전부 도구 1개를 강제해 JSON 만 받는다.
// API 키는 SDK 가 환경변수 ANTHROPIC_API_KEY 에서 읽는다(node --env-file-if-exists 로 주입). 코드는 키를 만지지 않는다.
import Anthropic from '@anthropic-ai/sdk';
import type { InputFile } from './types.ts';

export const MODEL: string = process.env.A2W_MODEL ?? 'claude-sonnet-5';

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** SDK 의 content block 타입은 넓어서 여기서는 느슨하게 둔다. */
export type Block = Record<string, unknown>;

export interface UsageEntry {
  step: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  ms: number;
  stop_reason: string | null;
  note?: string;
}

/** 호출마다 토큰과 시간을 남긴다. report.md 가 읽는다. */
export const usageLog: UsageEntry[] = [];

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/** 도구가 호출되지 않았거나 출력이 잘린 경우. 스키마 불일치와 같은 급으로 다룬다. */
export class LlmOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmOutputError';
  }
}

/** 입력 파일을 Claude 메시지 블록으로. PDF 는 document, md·txt 는 본문을 text 로 넣는다. */
export function fileBlocks(files: InputFile[]): Block[] {
  const blocks: Block[] = [];
  for (const f of files) {
    const label = f.role === 'rfq_email' ? '고객 RFQ 메일' : '부품 도면';
    if (f.media_type === 'application/pdf') {
      blocks.push({ type: 'text', text: `[${label}: ${f.name}]` });
      blocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: f.data_base64 },
      });
    } else {
      const text = Buffer.from(f.data_base64, 'base64').toString('utf8');
      blocks.push({ type: 'text', text: `[${label}: ${f.name}]\n\n${text}` });
    }
  }
  return blocks;
}

/**
 * 도구 input 이 JSON 문자열 하나로 감싸져 온 경우를 푼다.
 * 재검증(Helios 2차 시도)에서 모델이 {"missing_specs": "{...전체 JSON...}"} 처럼 냈다.
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
  step: string;
  system: string;
  content: Block[];
  tool: ToolSpec;
  max_tokens?: number;
}

/** 도구 1개를 강제 호출해 그 input 을 돌려준다. 호출 실패(API 오류)는 그대로 던진다. */
export async function callTool<T>(opts: CallToolOptions): Promise<T> {
  const started = Date.now();
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: opts.max_tokens ?? 4096,
    system: opts.system,
    messages: [{ role: 'user', content: opts.content as never }],
    tools: [opts.tool as never],
    tool_choice: { type: 'tool', name: opts.tool.name },
  });
  const entry: UsageEntry = {
    step: opts.step,
    model: res.model,
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
    ms: Date.now() - started,
    stop_reason: res.stop_reason,
  };
  usageLog.push(entry);
  if (res.stop_reason === 'max_tokens') {
    throw new LlmOutputError(`출력이 max_tokens(${opts.max_tokens ?? 4096}) 에서 잘렸다`);
  }
  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    throw new LlmOutputError(`도구 호출이 없다 (stop_reason=${res.stop_reason})`);
  }
  const required = Array.isArray(opts.tool.input_schema.required) ? (opts.tool.input_schema.required as string[]) : [];
  const { value, unwrapped } = unwrapStringified(block.input, required);
  if (unwrapped) entry.note = '도구 input 이 JSON 문자열로 감싸져 있어 풀었다';
  return value as T;
}
