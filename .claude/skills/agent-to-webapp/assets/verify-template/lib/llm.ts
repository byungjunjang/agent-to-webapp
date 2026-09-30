// Anthropic 호출을 한 곳에 모은다. LLM 단계는 structured outputs(output_config.format)로 스키마에 맞는 JSON 만 받는다.
// 도구를 JSON 통로로 쓰지 않으므로 도구 호출 누락을 다시 묻거나 문자열로 감싼 입력을 풀 일이 없다.
// API 키는 SDK 가 환경변수 ANTHROPIC_API_KEY 에서 읽는다(node --env-file-if-exists 로 주입). 코드는 키를 만지지 않는다.
// 스킬 자산(assets/verify-template)에서 복사된다. 고치지 않는다.
import { MODEL, usageLog } from './step.ts';
import type { InputFile, UsageEntry } from './step.ts';

export { MODEL, usageLog };

/**
 * 단계 파일이 넘기는 출력 명세. input_schema 가 응답 JSON 의 스키마가 된다(output_config.format).
 * name·description 은 요청에 싣지 않는다. 이름과 모양은 도구로 JSON 을 받던 때의 단계 파일과 맞춘 것이다.
 */
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

/** 거절·잘림·JSON 이 아닌 응답. 스키마 불일치와 같은 급으로 다룬다. */
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
 * structured outputs 는 모든 object 에 additionalProperties: false 를 요구한다. 빠진 곳에만 채운 사본을 돌려준다.
 * 수치·길이 제약(minimum·maxLength 등)은 API 가 받지 않으므로 workflow.md 스키마에 쓰지 않는다.
 */
export function outputSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(outputSchema);
  if (typeof schema !== 'object' || schema === null) return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === 'properties' || k === '$defs' || k === 'definitions') {
      out[k] = Object.fromEntries(Object.entries((v ?? {}) as Record<string, unknown>).map(([pk, pv]) => [pk, outputSchema(pv)]));
    } else if (k === 'items' || k === 'anyOf' || k === 'allOf') {
      out[k] = outputSchema(v);
    } else {
      out[k] = v;
    }
  }
  const t = out.type;
  const isObject = t === 'object' || (Array.isArray(t) && t.includes('object')) || 'properties' in out;
  if (isObject && !('additionalProperties' in out)) out.additionalProperties = false;
  return out;
}

export interface CallToolOptions {
  /** usage 기록에 남는 이름. 단계 번호 "2" 처럼. */
  step: string;
  system: string;
  content: Block[] | string;
  tool: ToolSpec;
  max_tokens?: number;
  model?: string;
}

/** messages.create 에 넘길 요청. 순수 함수라 테스트가 모양을 확인한다. */
export function buildRequest(opts: CallToolOptions, content: Block[], model: string, maxTokens: number): Record<string, unknown> {
  return {
    model,
    max_tokens: maxTokens,
    system: opts.system,
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema: outputSchema(opts.tool.input_schema) } },
  };
}

/** 응답에서 JSON 을 꺼낸다. 거절·잘림·파싱 실패는 LlmOutputError. 순수 함수라 테스트가 부른다. */
export function readOutput<T>(res: { stop_reason: string | null; content: Block[] }, maxTokens: number): T {
  if (res.stop_reason === 'refusal') throw new LlmOutputError('모델이 요청을 거절했다 (stop_reason=refusal)');
  if (res.stop_reason === 'max_tokens') throw new LlmOutputError(`출력이 max_tokens(${maxTokens}) 에서 잘렸다`);
  // 생각이 켜진 모델은 thinking 블록이 앞에 온다. JSON 은 text 블록에 있다.
  const text = res.content.filter((b) => b.type === 'text').map((b) => String(b.text)).join('');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new LlmOutputError(`응답이 JSON 이 아니다 (stop_reason=${res.stop_reason})`);
  }
}

/** 스키마에 맞는 JSON 을 받아 돌려준다. API 오류는 그대로 던진다(SDK 가 429·5xx 는 스스로 재시도한다). */
export async function callTool<T>(opts: CallToolOptions): Promise<T> {
  // 최신 모델은 생각이 켜져 있고 생각 토큰도 max_tokens 에 든다. 4096 이면 JSON 을 다 쓰기 전에 잘릴 수 있다.
  const maxTokens = opts.max_tokens ?? 16000;
  const model = opts.model ?? MODEL;
  const content: Block[] = typeof opts.content === 'string' ? [{ type: 'text', text: opts.content }] : opts.content;
  const started = Date.now();
  const res = await (await getClient()).messages.create(buildRequest(opts, content, model, maxTokens));
  const entry: UsageEntry = {
    step: opts.step,
    model: res.model,
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
    ms: Date.now() - started,
    stop_reason: res.stop_reason,
  };
  usageLog.push(entry);
  try {
    return readOutput<T>(res, maxTokens);
  } catch (e) {
    if (e instanceof LlmOutputError) entry.note = e.message;
    throw e;
  }
}
