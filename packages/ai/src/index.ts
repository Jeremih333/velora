import { z } from 'zod';

export const modelProfileSchema = z.enum(['BALANCED', 'CREATIVE', 'PREMIUM']);
export type ModelProfile = z.infer<typeof modelProfileSchema>;

export interface AIMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface StreamRequest {
  readonly requestId: string;
  readonly model: string;
  readonly messages: readonly AIMessage[];
  readonly temperature: number;
  readonly maxOutputTokens: number;
  readonly maxCostUsd: number;
}

export interface AIUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly costUsd: number;
  readonly providerReportedCostUsd?: number;
}

export type AIStreamEvent =
  | { readonly type: 'delta'; readonly text: string }
  | { readonly type: 'completed'; readonly usage: AIUsage; readonly finishReason: string };

export interface AIProvider {
  readonly name: string;
  stream(request: StreamRequest, signal: AbortSignal): AsyncIterable<AIStreamEvent>;
  healthCheck(signal: AbortSignal): Promise<boolean>;
  estimateCost(model: string, inputTokens: number, outputTokens: number): number;
}

export interface ModelPrice {
  readonly inputPerMillionUsd: number;
  readonly outputPerMillionUsd: number;
  readonly fixedRequestUsd: number;
}

export class AIProviderError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export function isTransientAIError(error: unknown): error is AIProviderError {
  return error instanceof AIProviderError && error.retryable;
}

const streamChunkSchema = z
  .object({
    choices: z
      .array(
        z.object({
          delta: z.object({ content: z.string().nullable().optional() }).loose().optional(),
          finish_reason: z.string().nullable().optional(),
        }),
      )
      .optional(),
    usage: z
      .object({
        prompt_tokens: z.number().int().nonnegative(),
        completion_tokens: z.number().int().nonnegative(),
        cost: z.number().nonnegative().optional(),
        prompt_tokens_details: z
          .object({ cached_tokens: z.number().int().nonnegative().default(0) })
          .optional(),
      })
      .optional(),
    error: z
      .object({ code: z.union([z.string(), z.number()]).optional(), message: z.string() })
      .optional(),
  })
  .loose();

const modelListSchema = z.object({
  data: z.array(z.object({ id: z.string().min(1) }).loose()).min(1),
});

export interface BotHubProviderOptions {
  readonly apiKey: string;
  readonly prices: Readonly<Record<string, ModelPrice>>;
  readonly fetcher?: typeof fetch;
  readonly endpoint?: string;
  readonly modelsEndpoint?: string;
  readonly streamProtocol?: 'OPENAI_INCLUDE_USAGE' | 'BOTHUB_DOCUMENTED';
}

export class BotHubProvider implements AIProvider {
  public readonly name = 'BOTHUB';
  readonly #apiKey: string;
  readonly #prices: Readonly<Record<string, ModelPrice>>;
  readonly #fetcher: typeof fetch;
  readonly #endpoint: string;
  readonly #modelsEndpoint: string;
  readonly #streamProtocol: 'OPENAI_INCLUDE_USAGE' | 'BOTHUB_DOCUMENTED';

  public constructor(options: BotHubProviderOptions) {
    this.#apiKey = options.apiKey;
    this.#prices = options.prices;
    // Cloudflare's native fetch rejects calls where a class instance becomes its `this` value.
    // Keep the platform function behind a lexical wrapper so private-field method access cannot
    // accidentally rebind it.
    this.#fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
    this.#endpoint = options.endpoint ?? 'https://openai.bothub.chat/v1/chat/completions';
    this.#modelsEndpoint = options.modelsEndpoint ?? 'https://openai.bothub.chat/v1/models';
    this.#streamProtocol = options.streamProtocol ?? 'OPENAI_INCLUDE_USAGE';
  }

  public async *stream(request: StreamRequest, signal: AbortSignal): AsyncIterable<AIStreamEvent> {
    let response: Response;
    try {
      response = await this.#fetcher(this.#endpoint, {
        method: 'POST',
        signal,
        headers: {
          authorization: `Bearer ${this.#apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.maxOutputTokens,
          stream: true,
          ...(this.#streamProtocol === 'OPENAI_INCLUDE_USAGE'
            ? { stream_options: { include_usage: true } }
            : {}),
        }),
      });
    } catch (error) {
      if (signal.aborted) {
        throw new AIProviderError('BOTHUB_ABORTED', 'BotHub request was aborted.', false);
      }
      throw new AIProviderError(
        'BOTHUB_NETWORK_ERROR',
        error instanceof Error ? error.message : 'BotHub network request failed.',
        true,
      );
    }
    if (!response.ok) {
      // Read the body only to classify the response in memory. Never expose or persist it: an
      // upstream error may echo request fragments or provider-internal details.
      await response.text();
      throw new AIProviderError(
        classifyBotHubHttpStatus(response.status),
        `BotHub returned HTTP ${String(response.status)}.`,
        response.status === 408 ||
          response.status === 409 ||
          response.status === 429 ||
          response.status >= 500,
        response.status,
      );
    }
    if (!response.body) {
      throw new AIProviderError('BOTHUB_EMPTY_STREAM', 'BotHub returned no response body.', true);
    }
    let usage: AIUsage | null = null;
    let finishReason = 'stop';
    for await (const data of readSseData(response.body)) {
      if (data === '[DONE]') break;
      let unknownChunk: unknown;
      try {
        unknownChunk = JSON.parse(data);
      } catch {
        throw new AIProviderError('BOTHUB_INVALID_SSE', 'BotHub returned invalid JSON.', true);
      }
      const chunk = streamChunkSchema.parse(unknownChunk);
      if (chunk.error) {
        throw new AIProviderError(
          `BOTHUB_${String(chunk.error.code ?? 'STREAM_ERROR')}`,
          chunk.error.message,
          true,
        );
      }
      const choice = chunk.choices?.[0];
      const text = choice?.delta?.content;
      if (text) yield { type: 'delta', text };
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (chunk.usage) {
        const conservativeEstimate = this.estimateCost(
          request.model,
          chunk.usage.prompt_tokens,
          chunk.usage.completion_tokens,
        );
        usage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
          cachedInputTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
          // BotHub labels `usage.cost` as upstream inference cost. Never reserve less than the
          // configured retail ceiling until live balance reconciliation proves the billed unit.
          costUsd: Math.max(chunk.usage.cost ?? 0, conservativeEstimate),
          ...(chunk.usage.cost === undefined ? {} : { providerReportedCostUsd: chunk.usage.cost }),
        };
      }
    }
    if (!usage) {
      throw new AIProviderError(
        'BOTHUB_USAGE_MISSING',
        'BotHub stream ended without usage accounting.',
        true,
      );
    }
    yield { type: 'completed', usage, finishReason };
  }

  public async healthCheck(signal: AbortSignal): Promise<boolean> {
    try {
      return (await this.listModelIds(signal)).length > 0;
    } catch {
      return false;
    }
  }

  public async listModelIds(signal: AbortSignal): Promise<readonly string[]> {
    let response: Response;
    try {
      response = await this.#fetcher(this.#modelsEndpoint, {
        signal,
        headers: { authorization: `Bearer ${this.#apiKey}` },
      });
    } catch (error) {
      if (signal.aborted) {
        throw new AIProviderError('BOTHUB_ABORTED', 'BotHub request was aborted.', false);
      }
      throw new AIProviderError(
        'BOTHUB_NETWORK_ERROR',
        error instanceof Error ? error.message : 'BotHub network request failed.',
        true,
      );
    }
    if (!response.ok) {
      await response.text();
      throw new AIProviderError(
        classifyBotHubHttpStatus(response.status),
        `BotHub returned HTTP ${String(response.status)}.`,
        response.status === 408 ||
          response.status === 409 ||
          response.status === 429 ||
          response.status >= 500,
        response.status,
      );
    }
    const parsed = modelListSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new AIProviderError(
        'BOTHUB_MODEL_LIST_INVALID',
        'BotHub returned an invalid model list.',
        false,
      );
    }
    return parsed.data.data.map((model) => model.id);
  }

  public estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const price = this.#prices[model];
    if (!price)
      throw new AIProviderError('MODEL_PRICE_MISSING', `No price configured for ${model}.`, false);
    return estimateTokenCost(price, inputTokens, outputTokens);
  }
}

export function classifyBotHubHttpStatus(status: number): string {
  if (status === 400) return 'BOTHUB_BAD_REQUEST';
  if (status === 401) return 'BOTHUB_AUTH_REJECTED';
  if (status === 402) return 'BOTHUB_BALANCE_REQUIRED';
  if (status === 403) return 'BOTHUB_FORBIDDEN';
  if (status === 404) return 'BOTHUB_ENDPOINT_OR_MODEL_NOT_FOUND';
  if (status === 408) return 'BOTHUB_TIMEOUT';
  if (status === 409) return 'BOTHUB_CONFLICT';
  if (status === 422) return 'BOTHUB_REQUEST_REJECTED';
  if (status === 429) return 'BOTHUB_RATE_LIMITED';
  if (status >= 500) return 'BOTHUB_UPSTREAM_UNAVAILABLE';
  return 'BOTHUB_HTTP_ERROR';
}

export async function* readSseData(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const result = await reader.read();
      buffer = `${buffer}${decoder.decode(result.value, { stream: !result.done })}`.replaceAll(
        '\r\n',
        '\n',
      );
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) yield data;
        boundary = buffer.indexOf('\n\n');
      }
      if (result.done) break;
    }
    const tail = buffer.trim();
    if (tail.startsWith('data:')) yield tail.slice(5).trimStart();
  } finally {
    reader.releaseLock();
  }
}

export function estimateTokenCost(
  price: ModelPrice,
  inputTokens: number,
  outputTokens: number,
): number {
  if (
    !Number.isSafeInteger(inputTokens) ||
    !Number.isSafeInteger(outputTokens) ||
    inputTokens < 0 ||
    outputTokens < 0
  ) {
    throw new RangeError('Token counts must be non-negative safe integers.');
  }
  return (
    price.fixedRequestUsd +
    (inputTokens * price.inputPerMillionUsd + outputTokens * price.outputPerMillionUsd) / 1_000_000
  );
}

export function canReserveBudget(
  remainingUsd: number,
  estimatedUsd: number,
  reserveRatio = 0.15,
): boolean {
  return (
    remainingUsd >= 0 && estimatedUsd >= 0 && estimatedUsd <= remainingUsd * (1 - reserveRatio)
  );
}
