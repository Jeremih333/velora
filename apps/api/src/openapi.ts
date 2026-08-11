interface HonoRouteDescriptor {
  readonly method: string;
  readonly path: string;
}

type OpenApiObject = Readonly<Record<string, unknown>>;

const supportedMethods = new Set(['get', 'post', 'put', 'patch', 'delete']);
const publicOperations = new Set([
  'GET /health',
  'GET /ready',
  'GET /openapi.json',
  'GET /api/v1/config',
  'POST /api/v1/auth/telegram',
]);

function openApiPath(path: string): string {
  return path.replaceAll(/:([A-Za-z][A-Za-z0-9_]*)/gu, '{$1}');
}

function operationId(method: string, path: string): string {
  const words = `${method.toLowerCase()}-${path}`
    .replaceAll(/:([A-Za-z][A-Za-z0-9_]*)/gu, '-by-$1')
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean);
  return words
    .map((word, index) =>
      index === 0 ? word.toLowerCase() : `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`,
    )
    .join('');
}

function tagFor(path: string): string {
  if (path === '/health' || path === '/ready') return 'operations';
  if (path === '/openapi.json') return 'contract';
  if (path === '/telegram/webhook') return 'telegram';
  const segments = path.split('/').filter(Boolean);
  if (segments[2] === 'admin') return segments[3] ?? 'admin';
  return segments[2] ?? 'api';
}

function pathParameters(path: string): readonly OpenApiObject[] {
  return [...path.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/gu)].map((match) => ({
    name: match[1],
    in: 'path',
    required: true,
    schema: { type: 'string', minLength: 1 },
  }));
}

function securityFor(method: string, path: string): readonly OpenApiObject[] {
  if (path === '/telegram/webhook') return [{ telegramWebhookSecret: [] }];
  if (publicOperations.has(`${method} ${path}`)) return [];
  if (method === 'GET') return [{ sessionCookie: [] }];
  return [{ sessionCookie: [], csrfHeader: [] }];
}

function responseFor(path: string): OpenApiObject {
  if (path.endsWith('/generate')) {
    return {
      description: 'Server-sent roleplay generation events.',
      content: {
        'text/event-stream': { schema: { type: 'string' } },
      },
    };
  }
  return {
    description: 'Successful response.',
    content: {
      'application/json': { schema: { type: ['object', 'array', 'null'] } },
    },
  };
}

function operationFor(method: string, path: string): OpenApiObject {
  const mutation = method !== 'GET';
  const parameters: OpenApiObject[] = [...pathParameters(path)];
  if (mutation && path.startsWith('/api/v1/')) {
    parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: false,
      schema: { type: 'string', minLength: 8, maxLength: 160 },
      description: 'Required by operations documented as idempotent.',
    });
  }
  return {
    operationId: operationId(method, path),
    tags: [tagFor(path)],
    parameters,
    security: securityFor(method, path),
    ...(mutation
      ? {
          requestBody: {
            required: path !== '/telegram/webhook',
            content: {
              'application/json': { schema: { type: 'object' } },
            },
          },
        }
      : {}),
    responses: {
      '200': responseFor(path),
      '400': { $ref: '#/components/responses/ApiError' },
      '401': { $ref: '#/components/responses/ApiError' },
      '403': { $ref: '#/components/responses/ApiError' },
      '404': { $ref: '#/components/responses/ApiError' },
      '409': { $ref: '#/components/responses/ApiError' },
      '429': { $ref: '#/components/responses/ApiError' },
      '500': { $ref: '#/components/responses/ApiError' },
      '503': { $ref: '#/components/responses/ApiError' },
    },
    'x-velora-runtime-validation': 'zod',
  };
}

export function createOpenApiDocument(routes: readonly HonoRouteDescriptor[]): OpenApiObject {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const method = route.method.toLowerCase();
    if (!supportedMethods.has(method) || !route.path.startsWith('/')) continue;
    if (route.path.includes('*')) continue;
    const path = openApiPath(route.path);
    const pathItem = paths[path] ?? {};
    pathItem[method] = operationFor(route.method.toUpperCase(), route.path);
    paths[path] = pathItem;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Velora Worker API',
      version: '0.0.1',
      description:
        'Generated route-level contract. Runtime request payloads are validated by strict Zod schemas.',
    },
    servers: [{ url: '/' }],
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'velora_session' },
        csrfHeader: { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
        telegramWebhookSecret: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Telegram-Bot-Api-Secret-Token',
        },
      },
      schemas: {
        ApiError: {
          type: 'object',
          additionalProperties: false,
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              additionalProperties: false,
              required: ['code', 'message', 'requestId'],
              properties: {
                code: { type: 'string', minLength: 1 },
                message: { type: 'string', minLength: 1 },
                requestId: { type: 'string', minLength: 1 },
                details: {},
              },
            },
          },
        },
      },
      responses: {
        ApiError: {
          description: 'Stable safe error envelope.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ApiError' } },
          },
        },
      },
    },
  };
}
