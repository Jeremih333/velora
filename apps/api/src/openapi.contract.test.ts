import { describe, expect, it } from 'vitest';
import { app } from './index';

interface ContractOperation {
  readonly operationId?: unknown;
  readonly security?: unknown;
  readonly parameters?: unknown;
  readonly requestBody?: unknown;
  readonly responses?: Readonly<Record<string, unknown>>;
}

interface ContractDocument {
  readonly openapi?: unknown;
  readonly paths?: Readonly<Record<string, Readonly<Record<string, ContractOperation>>>>;
  readonly components?: {
    readonly schemas?: Readonly<Record<string, unknown>>;
    readonly securitySchemes?: Readonly<Record<string, unknown>>;
  };
}

async function readContract(): Promise<ContractDocument> {
  const response = await app.request('/openapi.json');
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(response.headers.get('cache-control')).toBe('public, max-age=300');
  return response.json();
}

function operation(document: ContractDocument, method: string, path: string): ContractOperation {
  const found = document.paths?.[path]?.[method];
  if (!found) throw new Error(`Missing contract operation: ${method.toUpperCase()} ${path}`);
  return found;
}

describe('OpenAPI route contract', () => {
  it('publishes the critical implemented surface and stable error envelope', async () => {
    const document = await readContract();
    expect(document.openapi).toBe('3.1.0');
    for (const [method, path] of [
      ['post', '/api/v1/auth/telegram'],
      ['post', '/api/v1/onboarding/complete'],
      ['get', '/api/v1/discovery'],
      ['post', '/api/v1/conversations/{conversationId}/generate'],
      ['put', '/api/v1/conversations/{conversationId}/generations/{generationId}/reaction'],
      ['delete', '/api/v1/conversations/{conversationId}/generations/{generationId}/reaction'],
      ['get', '/api/v1/conversations/{conversationId}/prompt-inspector'],
      ['post', '/api/v1/reports'],
      ['post', '/api/v1/billing/invoices'],
      ['post', '/api/v1/admin/operations/ai-smoke'],
      ['get', '/api/v1/admin/operations/model-evals'],
      ['post', '/api/v1/admin/operations/model-evals'],
      ['get', '/api/v1/admin/operations/models'],
      ['patch', '/api/v1/admin/operations/models/{modelProfileId}'],
      ['post', '/api/v1/admin/billing/user-grants'],
      ['get', '/api/v1/admin/billing/payments'],
      ['post', '/api/v1/admin/billing/payments/{paymentId}/refund'],
      ['get', '/api/v1/data-export'],
      ['post', '/telegram/webhook'],
    ] as const) {
      expect(operation(document, method, path).responses?.['500']).toBeDefined();
    }
    expect(document.components?.schemas?.['ApiError']).toBeDefined();
    expect(document.components?.securitySchemes).toMatchObject({
      sessionCookie: { type: 'apiKey', in: 'cookie', name: 'velora_session' },
      csrfHeader: { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
      telegramWebhookSecret: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Telegram-Bot-Api-Secret-Token',
      },
    });
  });

  it('models public, authenticated, CSRF and webhook-secret boundaries', async () => {
    const document = await readContract();
    expect(operation(document, 'get', '/api/v1/config').security).toEqual([]);
    expect(operation(document, 'post', '/api/v1/auth/telegram').security).toEqual([]);
    expect(operation(document, 'get', '/api/v1/me').security).toEqual([{ sessionCookie: [] }]);
    expect(operation(document, 'patch', '/api/v1/settings').security).toEqual([
      { sessionCookie: [], csrfHeader: [] },
    ]);
    expect(operation(document, 'post', '/telegram/webhook').security).toEqual([
      { telegramWebhookSecret: [] },
    ]);
  });

  it('keeps operation identifiers unique and exposes every concrete Hono route', async () => {
    const document = await readContract();
    const operationIds: string[] = [];
    for (const pathItem of Object.values(document.paths ?? {})) {
      for (const operationValue of Object.values(pathItem)) {
        expect(typeof operationValue.operationId).toBe('string');
        operationIds.push(String(operationValue.operationId));
      }
    }
    expect(new Set(operationIds).size).toBe(operationIds.length);

    const documented = new Set(
      Object.entries(document.paths ?? {}).flatMap(([path, pathItem]) =>
        Object.keys(pathItem).map((method) => `${method.toUpperCase()} ${path}`),
      ),
    );
    const concreteRoutes = app.routes
      .filter(
        (route) =>
          ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method) &&
          !route.path.includes('*'),
      )
      .map(
        (route) => `${route.method} ${route.path.replaceAll(/:([A-Za-z][A-Za-z0-9_]*)/gu, '{$1}')}`,
      );
    for (const route of concreteRoutes) expect(documented.has(route), route).toBe(true);
  });

  it('describes path parameters and the generation SSE media type', async () => {
    const document = await readContract();
    expect(operation(document, 'get', '/api/v1/profiles/{userId}').parameters).toContainEqual({
      name: 'userId',
      in: 'path',
      required: true,
      schema: { type: 'string', minLength: 1 },
    });
    expect(
      operation(document, 'post', '/api/v1/conversations/{conversationId}/generate').responses?.[
        '200'
      ],
    ).toMatchObject({ content: { 'text/event-stream': { schema: { type: 'string' } } } });
  });

  it('documents direct image upload as bounded binary content rather than JSON or base64', async () => {
    const document = await readContract();
    const upload = operation(document, 'post', '/api/v1/media');
    expect(upload.parameters).toContainEqual({
      name: 'x-upload-name',
      in: 'header',
      required: false,
      schema: { type: 'string', maxLength: 768 },
      description: 'Display-only filename. The server always generates the R2 object key.',
    });
    expect(upload.requestBody).toMatchObject({
      required: true,
      content: {
        'image/jpeg': { schema: { type: 'string', format: 'binary', maxLength: 10_000_000 } },
        'image/png': { schema: { type: 'string', format: 'binary', maxLength: 10_000_000 } },
        'image/webp': { schema: { type: 'string', format: 'binary', maxLength: 10_000_000 } },
      },
    });
    expect(upload.responses?.['201']).toBeDefined();
    expect(
      operation(document, 'get', '/api/v1/media/{mediaId}/content').responses?.['200'],
    ).toMatchObject({
      content: {
        'image/jpeg': { schema: { type: 'string', format: 'binary' } },
        'image/png': { schema: { type: 'string', format: 'binary' } },
        'image/webp': { schema: { type: 'string', format: 'binary' } },
      },
    });
  });
});
