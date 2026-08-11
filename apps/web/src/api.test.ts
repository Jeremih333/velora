import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from './api';

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
      message: 'Нет подключения к сети. Проверь соединение и повтори действие.',
    });
  });

  it('keeps an intentional abort distinct from a retryable network failure', async () => {
    const aborted = new DOMException('aborted', 'AbortError');
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', () => Promise.reject(aborted));
    await expect(apiRequest('/api/v1/me')).rejects.toBe(aborted);
    expect(aborted).not.toBeInstanceOf(ApiError);
  });
});
