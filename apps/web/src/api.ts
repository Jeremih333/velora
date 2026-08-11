interface ErrorEnvelope {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly requestId?: string;
  };
}

export class ApiError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let csrfToken: string | null = null;

export function setCsrfToken(value: string): void {
  csrfToken = value;
}

export async function apiRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) {
    headers.set('x-csrf-token', csrfToken);
  }
  const response = await safeFetch(url, { ...init, headers, credentials: 'same-origin' });
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = payload as ErrorEnvelope | null;
    throw new ApiError(
      envelope?.error?.code ?? 'REQUEST_FAILED',
      envelope?.error?.message ?? 'Запрос не выполнен.',
      response.status,
      envelope?.error?.requestId,
    );
  }
  return payload as T;
}

export interface SseEvent {
  readonly event: string;
  readonly data: unknown;
}

export async function apiSse(
  url: string,
  body: unknown,
  onEvent: (event: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (csrfToken) headers.set('x-csrf-token', csrfToken);
  const response = await safeFetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    credentials: 'same-origin',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const envelope = payload as ErrorEnvelope | null;
    throw new ApiError(
      envelope?.error?.code ?? 'REQUEST_FAILED',
      envelope?.error?.message ?? 'Запрос не выполнен.',
      response.status,
      envelope?.error?.requestId,
    );
  }
  if (!response.body) throw new ApiError('EMPTY_STREAM', 'Сервис не вернул поток ответа.', 502);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const result = await reader.read();
      buffer += decoder.decode(result.value, { stream: !result.done }).replaceAll('\r\n', '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = frame
          .split('\n')
          .find((line) => line.startsWith('event:'))
          ?.slice(6)
          .trim();
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (event && data) onEvent({ event, data: JSON.parse(data) as unknown });
        boundary = buffer.indexOf('\n\n');
      }
      if (result.done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

async function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    throw new ApiError(
      offline ? 'NETWORK_OFFLINE' : 'NETWORK_ERROR',
      offline
        ? 'Нет подключения к сети. Проверь соединение и повтори действие.'
        : 'Не удалось связаться с сервисом. Попробуй ещё раз.',
      0,
    );
  }
}
