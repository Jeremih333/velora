import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, apiSse } from './api';

describe('browser network errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports an offline connection without leaking the browser fetch error', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(apiRequest('/api/v1/me')).rejects.toMatchObject({
      code: 'NETWORK_OFFLINE',
      status: 0,
      message: 'No network connection. Check your connection and try again.',
    });
  });

  it('keeps an intentional abort distinct from a retryable network failure', async () => {
    const aborted = new DOMException('aborted', 'AbortError');
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', () => Promise.reject(aborted));
    await expect(apiRequest('/api/v1/me')).rejects.toBe(aborted);
    expect(aborted).not.toBeInstanceOf(ApiError);
  });

  it('preserves an explicit provider restriction code from an SSE error frame', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'event: error\ndata: {"code":"BOTHUB_CONTENT_RESTRICTED","message":"safe"}\n\n',
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(stream, { status: 200 }))),
    );

    await expect(apiSse('/api/v1/generate', {}, vi.fn())).rejects.toMatchObject({
      code: 'BOTHUB_CONTENT_RESTRICTED',
      message: 'safe',
      status: 502,
    });
  });
});
