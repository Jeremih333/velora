import { afterEach, describe, expect, it, vi } from 'vitest';
import fragmentedSuccessFixture from './fixtures/bothub-fragmented-success.json';
import missingUsageFixture from './fixtures/bothub-missing-usage.json';
import streamErrorFixture from './fixtures/bothub-stream-error.json';
import {
  AIProviderError,
  BotHubProvider,
  canReserveBudget,
  estimateTokenCost,
  isTransientAIError,
  readSseData,
} from './index';

describe('AI budget', () => {
  it('matches the documented active Creative estimate', () => {
    expect(
      estimateTokenCost(
        { inputPerMillionUsd: 0.3, outputPerMillionUsd: 0.5, fixedRequestUsd: 0.02 },
        8_000,
        600,
      ),
    ).toBeCloseTo(0.0227, 8);
  });

  it('keeps the emergency reserve', () => {
    expect(canReserveBudget(1, 0.84)).toBe(true);
    expect(canReserveBudget(1, 0.86)).toBe(false);
  });
});

describe('BotHub streaming', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('verifies the API key through a non-generative model-list request', async () => {
    const fetcher = vi.fn<typeof fetch>((_input, init) => {
      expect(init?.headers).toEqual({ authorization: 'Bearer health-key' });
      return Promise.resolve(
        Response.json({ object: 'list', data: [{ id: 'deepseek-v3.2-speciale' }] }),
      );
    });
    const provider = new BotHubProvider({ apiKey: 'health-key', prices: {}, fetcher });
    await expect(provider.healthCheck(new AbortController().signal)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('returns the exact model IDs for a required-model readiness check', async () => {
    const provider = new BotHubProvider({
      apiKey: 'health-key',
      prices: {},
      fetcher: () =>
        Promise.resolve(
          Response.json({
            object: 'list',
            data: [{ id: 'other-model' }, { id: 'deepseek-v3.2-speciale' }],
          }),
        ),
    });
    await expect(provider.listModelIds(new AbortController().signal)).resolves.toEqual([
      'other-model',
      'deepseek-v3.2-speciale',
    ]);
  });

  it('fails health verification on rejection or a malformed successful response', async () => {
    const rejected = new BotHubProvider({
      apiKey: 'invalid',
      prices: {},
      fetcher: () => Promise.resolve(new Response('unauthorized', { status: 401 })),
    });
    const malformed = new BotHubProvider({
      apiKey: 'invalid',
      prices: {},
      fetcher: () => Promise.resolve(Response.json({ ok: true })),
    });
    await expect(rejected.healthCheck(new AbortController().signal)).resolves.toBe(false);
    await expect(malformed.healthCheck(new AbortController().signal)).resolves.toBe(false);
  });

  it('calls the Cloudflare fetch binding without rebinding its receiver', async () => {
    const nativeStyleFetch = vi.fn(function (this: unknown) {
      expect(this).toBeUndefined();
      return Promise.resolve(
        new Response(
          'data: {"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":1,"cost":0}}\n\ndata: [DONE]\n\n',
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal('fetch', nativeStyleFetch);
    const provider = new BotHubProvider({
      apiKey: 'test',
      prices: {
        model: { inputPerMillionUsd: 1, outputPerMillionUsd: 1, fixedRequestUsd: 0 },
      },
    });
    const events = [];
    for await (const event of provider.stream(
      {
        requestId: 'request',
        model: 'model',
        messages: [],
        temperature: 1,
        maxOutputTokens: 10,
        maxCostUsd: 1,
      },
      new AbortController().signal,
    )) {
      events.push(event);
    }
    expect(nativeStyleFetch).toHaveBeenCalledOnce();
    expect(events.at(-1)?.type).toBe('completed');
  });

  it('classifies network failures as transient but never retries an explicit abort', async () => {
    const networkProvider = new BotHubProvider({
      apiKey: 'test',
      prices: {
        model: { inputPerMillionUsd: 1, outputPerMillionUsd: 1, fixedRequestUsd: 0 },
      },
      fetcher: () => Promise.reject(new TypeError('network unavailable')),
    });
    const networkError = await collectError(
      networkProvider.stream(
        {
          requestId: 'request',
          model: 'model',
          messages: [],
          temperature: 1,
          maxOutputTokens: 10,
          maxCostUsd: 1,
        },
        new AbortController().signal,
      ),
    );
    expect(networkError).toMatchObject({ code: 'BOTHUB_NETWORK_ERROR', retryable: true });
    expect(isTransientAIError(networkError)).toBe(true);

    const abortController = new AbortController();
    abortController.abort();
    const abortedError = await collectError(
      networkProvider.stream(
        {
          requestId: 'request',
          model: 'model',
          messages: [],
          temperature: 1,
          maxOutputTokens: 10,
          maxCostUsd: 1,
        },
        abortController.signal,
      ),
    );
    expect(abortedError).toMatchObject({ code: 'BOTHUB_ABORTED', retryable: false });
    expect(isTransientAIError(abortedError)).toBe(false);
  });

  it('does not classify provider authentication rejection as transient', async () => {
    const provider = new BotHubProvider({
      apiKey: 'invalid',
      prices: {
        model: { inputPerMillionUsd: 1, outputPerMillionUsd: 1, fixedRequestUsd: 0 },
      },
      fetcher: () => Promise.resolve(new Response('unauthorized', { status: 401 })),
    });
    const error = await collectError(
      provider.stream(
        {
          requestId: 'request',
          model: 'model',
          messages: [],
          temperature: 1,
          maxOutputTokens: 10,
          maxCostUsd: 1,
        },
        new AbortController().signal,
      ),
    );
    expect(error).toMatchObject({ code: 'BOTHUB_AUTH_REJECTED', retryable: false, status: 401 });
    expect(isTransientAIError(error)).toBe(false);
  });

  it('classifies balance rejection without retaining the upstream response body', async () => {
    const provider = new BotHubProvider({
      apiKey: 'valid',
      prices: {
        model: { inputPerMillionUsd: 1, outputPerMillionUsd: 1, fixedRequestUsd: 0 },
      },
      fetcher: () =>
        Promise.resolve(
          new Response('{"error":{"message":"sensitive provider detail"}}', { status: 402 }),
        ),
    });
    const error = await collectError(
      provider.stream(
        {
          requestId: 'request',
          model: 'model',
          messages: [],
          temperature: 1,
          maxOutputTokens: 10,
          maxCostUsd: 1,
        },
        new AbortController().signal,
      ),
    );
    expect(error).toMatchObject({
      code: 'BOTHUB_BALANCE_REQUIRED',
      retryable: false,
      status: 402,
    });
    expect(error.message).not.toContain('sensitive provider detail');
  });

  it('classifies only explicit provider content-policy codes without retaining the body', async () => {
    const provider = new BotHubProvider({
      apiKey: 'valid',
      prices: {
        model: { inputPerMillionUsd: 1, outputPerMillionUsd: 1, fixedRequestUsd: 0 },
      },
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: 'content_policy', message: 'private echoed prompt fragment' },
            }),
            { status: 422 },
          ),
        ),
    });
    const error = await collectError(
      provider.stream(
        {
          requestId: 'request',
          model: 'model',
          messages: [],
          temperature: 1,
          maxOutputTokens: 10,
          maxCostUsd: 1,
        },
        new AbortController().signal,
      ),
    );
    expect(error).toMatchObject({ code: 'BOTHUB_CONTENT_RESTRICTED', retryable: false });
    expect(error.message).not.toContain('private echoed prompt fragment');
  });

  it('treats an explicit content-filter finish reason as a non-retryable restriction', async () => {
    const provider = new BotHubProvider({
      apiKey: 'valid',
      prices: {
        model: { inputPerMillionUsd: 1, outputPerMillionUsd: 1, fixedRequestUsd: 0 },
      },
      fetcher: () =>
        Promise.resolve(
          new Response(
            'data: {"choices":[{"delta":{},"finish_reason":"content_filter"}],"usage":{"prompt_tokens":2,"completion_tokens":0,"cost":0.0001}}\n\ndata: [DONE]\n\n',
            { status: 200 },
          ),
        ),
    });
    const error = await collectError(
      provider.stream(
        {
          requestId: 'request',
          model: 'model',
          messages: [],
          temperature: 1,
          maxOutputTokens: 10,
          maxCostUsd: 1,
        },
        new AbortController().signal,
      ),
    );
    expect(error).toMatchObject({ code: 'BOTHUB_CONTENT_RESTRICTED', retryable: false });
  });

  it('uses the documented BotHub streaming shape without stream_options when requested', async () => {
    const fetcher = vi.fn<typeof fetch>((_input, init) => {
      if (typeof init?.body !== 'string') throw new Error('Expected a JSON request body.');
      const body: unknown = JSON.parse(init.body);
      expect(body).toMatchObject({ model: 'model', stream: true, max_tokens: 10 });
      expect(body).not.toHaveProperty('stream_options');
      return Promise.resolve(
        new Response(
          'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":1,"cost":0.0001}}\n\ndata: [DONE]\n\n',
          { status: 200 },
        ),
      );
    });
    const provider = new BotHubProvider({
      apiKey: 'valid',
      prices: {
        model: { inputPerMillionUsd: 1, outputPerMillionUsd: 1, fixedRequestUsd: 0 },
      },
      fetcher,
      streamProtocol: 'BOTHUB_DOCUMENTED',
    });
    const events = [];
    for await (const event of provider.stream(
      {
        requestId: 'request',
        model: 'model',
        messages: [],
        temperature: 1,
        maxOutputTokens: 10,
        maxCostUsd: 1,
      },
      new AbortController().signal,
    )) {
      events.push(event);
    }
    expect(fetcher).toHaveBeenCalledOnce();
    expect(events.at(-1)?.type).toBe('completed');
  });

  it('parses fragmented SSE, ignores comments and reports final usage', async () => {
    const encoder = new TextEncoder();
    const pieces: readonly string[] = fragmentedSuccessFixture.chunks;
    const fetcher: typeof fetch = () =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              for (const piece of pieces) controller.enqueue(encoder.encode(piece));
              controller.close();
            },
          }),
          { status: 200 },
        ),
      );
    const provider = new BotHubProvider({
      apiKey: 'test',
      prices: {
        model: { inputPerMillionUsd: 1, outputPerMillionUsd: 1, fixedRequestUsd: 0 },
      },
      fetcher,
    });
    const events = [];
    for await (const event of provider.stream(
      {
        requestId: 'request',
        model: 'model',
        messages: [],
        temperature: 1,
        maxOutputTokens: 100,
        maxCostUsd: 1,
      },
      new AbortController().signal,
    ))
      events.push(event);
    expect(events).toEqual([
      { type: 'delta', text: 'Пр' },
      { type: 'delta', text: 'ивет' },
      {
        type: 'completed',
        usage: {
          inputTokens: 10,
          outputTokens: 2,
          cachedInputTokens: 4,
          costUsd: 0.00002,
          providerReportedCostUsd: 0.00002,
        },
        finishReason: 'stop',
      },
    ]);
  });

  it('fails closed when a fixture stream ends without usage accounting', async () => {
    const provider = providerFromSseFixture(missingUsageFixture.body);
    await expect(
      collectError(
        provider.stream(
          {
            requestId: 'missing-usage-fixture',
            model: 'model',
            messages: [],
            temperature: 1,
            maxOutputTokens: 100,
            maxCostUsd: 1,
          },
          new AbortController().signal,
        ),
      ),
    ).resolves.toMatchObject({ code: 'BOTHUB_USAGE_MISSING', retryable: true });
  });

  it('classifies an error event from the reusable provider fixture', async () => {
    const provider = providerFromSseFixture(streamErrorFixture.body);
    await expect(
      collectError(
        provider.stream(
          {
            requestId: 'stream-error-fixture',
            model: 'model',
            messages: [],
            temperature: 1,
            maxOutputTokens: 100,
            maxCostUsd: 1,
          },
          new AbortController().signal,
        ),
      ),
    ).resolves.toMatchObject({ code: 'BOTHUB_overloaded', retryable: true });
  });

  it('does not trust an upstream-only cost lower than the configured BotHub ceiling', async () => {
    const fetcher: typeof fetch = () =>
      Promise.resolve(
        new Response(
          'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"completion_tokens":50,"cost":0.000001}}\n\ndata: [DONE]\n\n',
          { status: 200 },
        ),
      );
    const provider = new BotHubProvider({
      apiKey: 'test',
      prices: {
        model: { inputPerMillionUsd: 2, outputPerMillionUsd: 4, fixedRequestUsd: 0 },
      },
      fetcher,
    });
    const events = [];
    for await (const event of provider.stream(
      {
        requestId: 'request',
        model: 'model',
        messages: [],
        temperature: 1,
        maxOutputTokens: 100,
        maxCostUsd: 1,
      },
      new AbortController().signal,
    )) {
      events.push(event);
    }
    expect(events.at(-1)).toEqual({
      type: 'completed',
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 0,
        costUsd: 0.0004,
        providerReportedCostUsd: 0.000001,
      },
      finishReason: 'stop',
    });
  });

  it('joins multiline data fields without exposing comment frames', async () => {
    const stream = new Response(
      'event: message\ndata: first\ndata: second\n\n: keepalive\n\ndata: [DONE]\n\n',
    ).body;
    if (!stream) throw new Error('Fixture stream missing.');
    const values = [];
    for await (const value of readSseData(stream)) values.push(value);
    expect(values).toEqual(['first\nsecond', '[DONE]']);
  });
});

async function collectError(stream: AsyncIterable<unknown>): Promise<AIProviderError> {
  try {
    for await (const event of stream) {
      // The fixtures fail before yielding an event.
      void event;
    }
  } catch (error) {
    if (error instanceof AIProviderError) return error;
    throw error;
  }
  throw new Error('Expected the stream to fail.');
}

function providerFromSseFixture(body: string): BotHubProvider {
  return new BotHubProvider({
    apiKey: 'fixture-key',
    prices: {
      model: { inputPerMillionUsd: 1, outputPerMillionUsd: 1, fixedRequestUsd: 0 },
    },
    fetcher: () => Promise.resolve(new Response(body, { status: 200 })),
  });
}
