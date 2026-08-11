import { publicConfigSchema } from '@velora/config';
import { AppError, asError, createId, nowMs } from '@velora/shared';
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import { sha256, verifyTelegramInitData } from './telegram-auth';
import { authenticateSession, verifyCsrfToken } from './session';
import { personaRoutes } from './persona-routes';
import { characterRoutes } from './character-routes';
import { discoveryRoutes } from './discovery-routes';
import { mediaRoutes } from './media-routes';
import { conversationRoutes } from './conversation-routes';
import { generationRoutes } from './generation-routes';
import { lorebookRoutes } from './lorebook-routes';
import { moderationRoutes } from './moderation-routes';
import { billingRoutes } from './billing-routes';
import { processDueMemoryJobs } from './memory-jobs';
import { operationsRoutes } from './operations-routes';
import { readThroughPublicCache } from './public-cache';
import { publicRoutes } from './public-routes';
import { accountControlRoutes, processDueAccountDeletions } from './account-controls';
import {
  cleanupReliabilityData,
  effectiveLimit,
  enforceRateLimit,
  observeIpRateSignal,
  policyForRequest,
  productEventForRequest,
  recordProductEvent,
} from './reliability';
import { upsertTelegramUser } from './telegram-user';
import { reconcileTelegramConfiguration } from './telegram-configuration';
import { reconcileBotHubProvider } from './bothub-reconciliation';
import { parseTelegramUpdate, processTelegramUpdate, secretsEqual } from './telegram-webhook';
import type { Env, Variables } from './types';
import { runOperationalAlertCycle } from './operational-alerts';
import { onboardingRoutes } from './onboarding-routes';
import { supportRoutes } from './support-routes';
import { profileRoutes } from './profile-routes';
import { readEffectivePlan, requireModelProfile as requirePlanModelProfile } from './plans';
import { createOpenApiDocument } from './openapi';

interface AppEnvironment {
  Bindings: Env;
  Variables: Variables;
}

const app = new Hono<AppEnvironment>();
const telegramAuthBodySchema = z.object({ initData: z.string().min(1).max(16_384) });
const settingsPatchSchema = z
  .object({
    theme: z.enum(['dark', 'amoled', 'light']).optional(),
    locale: z.enum(['ru', 'en']).optional(),
    defaultPersonaId: z.uuid().nullable().optional(),
    generationProfile: z.enum(['BALANCED', 'CREATIVE', 'PREMIUM']).optional(),
    nsfwVisible: z.boolean().optional(),
    preferences: z.record(z.string().max(80), z.unknown()).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'At least one setting is required.')
  .refine(
    (body) => body.preferences === undefined || JSON.stringify(body.preferences).length <= 8_192,
    'Preferences are too large.',
  );
const ageGateSchema = z.object({ confirmedAdult: z.literal(true) });

function randomToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

app.use('*', async (context, next) => {
  const startedAt = Date.now();
  const requestId = context.req.header('cf-ray') ?? crypto.randomUUID();
  context.set('requestId', requestId);
  context.set('requestStartedAt', startedAt);
  context.set('actorHash', undefined);
  context.set('requestFailed', false);
  await next();
  context.header('x-request-id', requestId);
  if (!context.get('requestFailed')) {
    writeRequestLog('info', context.req.method, context.req.path, context.res.status, {
      requestId,
      startedAt,
      actorHash: context.get('actorHash'),
    });
  }
});

app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", 'https://api.telegram.org', 'https://openai.bothub.chat'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://t.me', 'https://*.telegram.org'],
      mediaSrc: ["'self'", 'blob:', 'https://*.telegram.org'],
      scriptSrc: ["'self'", 'https://telegram.org'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      frameAncestors: ['https://web.telegram.org', 'https://*.telegram.org'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
    referrerPolicy: 'no-referrer',
  }),
);

app.get('/health', (context) => context.json({ status: 'ok', service: 'velora-app' }));

app.get('/ready', async (context) => {
  const result = await context.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
  if (result?.ok !== 1) throw new AppError('DEPENDENCY_UNAVAILABLE', 'База данных не готова.', 503);
  return context.json({ status: 'ready', dependencies: { d1: true } });
});

app.get('/api/v1/config', async (context) => {
  const result = await readThroughPublicCache(context, 'config', 300, () => {
    const parsed = publicConfigSchema.parse({
      environment: context.env.ENVIRONMENT,
      appName: context.env.APP_NAME,
      telegramBotUsername: context.env.TELEGRAM_BOT_USERNAME,
      maxInitDataAgeSeconds: context.env.MAX_INIT_DATA_AGE_SECONDS,
      dailyAiBudgetUsd: context.env.DAILY_AI_BUDGET_USD,
      monthlyAiBudgetUsd: context.env.MONTHLY_AI_BUDGET_USD,
      lifetimeAiBudgetUsd: context.env.LIFETIME_AI_BUDGET_USD,
    });
    return {
      environment: parsed.environment,
      appName: parsed.appName,
      telegramBotUsername: parsed.telegramBotUsername,
    };
  });
  context.header('x-velora-cache', result.status);
  context.header('cache-control', 'public, max-age=300');
  return context.json(result.value);
});

app.post('/api/v1/auth/telegram', async (context) => {
  if (!context.env.TELEGRAM_BOT_TOKEN || !context.env.SESSION_SIGNING_KEY) {
    throw new AppError('SERVICE_NOT_CONFIGURED', 'Telegram-вход пока не настроен.', 503);
  }
  const body = telegramAuthBodySchema.parse(await context.req.json());
  const maxAgeSeconds = Number(context.env.MAX_INIT_DATA_AGE_SECONDS);
  const verified = await verifyTelegramInitData(body.initData, context.env.TELEGRAM_BOT_TOKEN, {
    nowSeconds: Math.floor(Date.now() / 1000),
    maxAgeSeconds,
  });
  await Promise.all([
    enforceRateLimit(context.env.DB, {
      policy: { scope: 'AUTH', limit: 10, windowMs: 60_000 },
      subject: `telegram:${verified.user.id}`,
    }),
    observeIpRateSignal(
      context.env.DB,
      'AUTH',
      context.req.header('cf-connecting-ip') ?? context.req.header('x-forwarded-for'),
    ),
  ]);
  const replay = await context.env.DB.prepare(
    'SELECT 1 AS found FROM auth_nonces WHERE init_hash = ? AND expires_at > ?',
  )
    .bind(verified.hash, nowMs())
    .first<{ found: number }>();
  if (replay !== null)
    throw new AppError(
      'INIT_DATA_REPLAYED',
      'Эта ссылка входа уже использована. Откройте приложение заново.',
      409,
    );

  const user = await upsertTelegramUser(
    context.env.DB,
    {
      id: verified.user.id,
      firstName: verified.user.first_name,
      lastName: verified.user.last_name,
      username: verified.user.username,
      languageCode: verified.user.language_code,
    },
    context.env.OWNER_TELEGRAM_ID,
  );
  const userId = user.id;
  const sessionId = createId();
  const sessionToken = randomToken();
  const csrfToken = randomToken();
  const sessionHash = await sha256(`${context.env.SESSION_SIGNING_KEY}:${sessionToken}`);
  const csrfHash = await sha256(`${context.env.SESSION_SIGNING_KEY}:${csrfToken}`);
  const timestamp = nowMs();
  const expiresAt = timestamp + 7 * 24 * 60 * 60 * 1000;
  await context.env.DB.batch([
    context.env.DB.prepare('INSERT INTO auth_nonces (init_hash, expires_at) VALUES (?, ?)').bind(
      verified.hash,
      (verified.authDate + maxAgeSeconds) * 1000,
    ),
    context.env.DB.prepare(
      'INSERT INTO sessions (id, user_id, token_hash, csrf_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(sessionId, userId, sessionHash, csrfHash, timestamp, expiresAt),
  ]);

  setCookie(context, 'velora_session', sessionToken, {
    httpOnly: true,
    secure: context.env.ENVIRONMENT !== 'local',
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  return context.json(
    {
      user: {
        id: userId,
        displayName: user.displayName,
        username: verified.user.username ?? null,
        role: user.role,
      },
      csrfToken,
    },
    201,
  );
});

app.post('/telegram/webhook', async (context) => {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET } = context.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET) {
    throw new AppError('SERVICE_NOT_CONFIGURED', 'Telegram webhook пока не настроен.', 503);
  }
  const authorized = await secretsEqual(
    context.req.header('x-telegram-bot-api-secret-token'),
    TELEGRAM_WEBHOOK_SECRET,
  );
  if (!authorized) throw new AppError('UNAUTHORIZED_WEBHOOK', 'Webhook не авторизован.', 401);
  const update = parseTelegramUpdate(await context.req.json());
  const result = await processTelegramUpdate(context.env.DB, update, {
    botUsername: context.env.TELEGRAM_BOT_USERNAME,
    botToken: TELEGRAM_BOT_TOKEN,
    publicAppUrl: context.env.PUBLIC_APP_URL,
    ownerTelegramId: context.env.OWNER_TELEGRAM_ID,
    ...(context.env.ENVIRONMENT === 'local' && context.env.TELEGRAM_API_BASE_URL
      ? { telegramApiBaseUrl: context.env.TELEGRAM_API_BASE_URL }
      : {}),
  });
  return context.json({ ok: true, result });
});

const authenticated = new Hono<AppEnvironment>();
authenticated.use('*', async (context, next) => {
  const principal = await authenticateSession(
    context.env,
    context.req.header('cookie'),
    Date.now(),
    true,
  );
  context.set('principal', principal);
  context.set('actorHash', (await sha256(`velora-actor:${principal.userId}`)).slice(0, 16));
  const path = context.req.path;
  const recoveryRoute =
    path === '/api/v1/me' || path === '/api/v1/appeals' || path === '/api/v1/auth/logout';
  if (
    (principal.moderationState === 'BANNED' || principal.moderationState === 'SUSPENDED') &&
    !recoveryRoute
  ) {
    throw new AppError(
      principal.moderationState === 'BANNED' ? 'ACCOUNT_BANNED' : 'ACCOUNT_SUSPENDED',
      principal.moderationState === 'BANNED'
        ? 'Аккаунт заблокирован. Доступна подача апелляции.'
        : 'Доступ временно ограничен. Доступна подача апелляции.',
      403,
    );
  }
  if (
    principal.moderationState === 'RESTRICTED' &&
    !['GET', 'HEAD', 'OPTIONS'].includes(context.req.method) &&
    !recoveryRoute
  ) {
    throw new AppError(
      'ACCOUNT_RESTRICTED',
      'Действие недоступно из-за ограничения аккаунта.',
      403,
    );
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
    await verifyCsrfToken(
      context.req.header('x-csrf-token'),
      principal.csrfHash,
      context.env.SESSION_SIGNING_KEY,
    );
  }
  const ratePolicy = policyForRequest(context.req.method, context.req.path);
  if (ratePolicy) {
    const plan = await readEffectivePlan(context.env.DB, principal.userId);
    const state = await enforceRateLimit(context.env.DB, {
      policy: ratePolicy,
      subject: `user:${principal.userId}:plan:${plan.code}`,
      limit: effectiveLimit(
        ratePolicy.limit * plan.entitlements.rateLimitMultiplier,
        principal.role,
        principal.moderationState,
      ),
    });
    context.header('x-ratelimit-limit', String(state.limit));
    context.header('x-ratelimit-remaining', String(state.remaining));
    context.header('x-ratelimit-reset', String(state.resetAt));
    await observeIpRateSignal(
      context.env.DB,
      ratePolicy.scope,
      context.req.header('cf-connecting-ip') ?? context.req.header('x-forwarded-for'),
    );
  }
  await next();
  const event = productEventForRequest(context.req.method, context.req.path, context.res.status);
  if (event) {
    try {
      await recordProductEvent(context.env.DB, principal.userId, event);
    } catch (error) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'product_event_write_failed',
          requestId: context.get('requestId'),
          errorName: asError(error).name,
        }),
      );
    }
  }
});

authenticated.get('/me', async (context) => {
  const principal = context.get('principal');
  const [balance, onboarding, plan] = await Promise.all([
    context.env.DB.prepare(
      'SELECT COALESCE(SUM(amount_micros), 0) AS balanceMicros FROM credit_transactions WHERE user_id = ?',
    )
      .bind(principal.userId)
      .first<{ balanceMicros: number }>(),
    context.env.DB.prepare(
      'SELECT completed_at AS completedAt FROM onboarding_completions WHERE user_id = ?',
    )
      .bind(principal.userId)
      .first<{ completedAt: number }>(),
    readEffectivePlan(context.env.DB, principal.userId),
  ]);
  return context.json({
    id: principal.userId,
    username: principal.username,
    displayName: principal.displayName,
    avatarFileId: principal.avatarFileId,
    locale: principal.locale,
    role: principal.role,
    moderationState: principal.moderationState,
    ageGateAccepted: principal.ageGateAcceptedAt !== null,
    onboardingCompleted: Boolean(onboarding),
    plan: plan.code,
    planDisplayName: plan.displayName,
    planAccessUntil: plan.accessUntil,
    planEntitlements: plan.entitlements,
    creditBalanceMicros: balance?.balanceMicros ?? 0,
  });
});

authenticated.get('/settings', async (context) => {
  const principal = context.get('principal');
  const settings = await readSettings(context.env.DB, principal.userId);
  return context.json({ ...settings, locale: principal.locale });
});

authenticated.patch('/settings', async (context) => {
  const principal = context.get('principal');
  const body = settingsPatchSchema.parse(await context.req.json());
  const current = await readSettings(context.env.DB, principal.userId);
  if (body.generationProfile) {
    requirePlanModelProfile(
      await readEffectivePlan(context.env.DB, principal.userId),
      body.generationProfile,
    );
  }
  if (body.nsfwVisible === true && principal.ageGateAcceptedAt === null) {
    throw new AppError('AGE_GATE_REQUIRED', 'Сначала подтвердите совершеннолетие.', 403);
  }
  if (body.defaultPersonaId) {
    const ownedPersona = await context.env.DB.prepare(
      'SELECT 1 AS found FROM personas WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    )
      .bind(body.defaultPersonaId, principal.userId)
      .first<{ found: number }>();
    if (!ownedPersona) throw new AppError('PERSONA_NOT_FOUND', 'Persona не найдена.', 404);
  }
  const timestamp = nowMs();
  await context.env.DB.batch([
    context.env.DB.prepare('UPDATE users SET locale = ?, updated_at = ? WHERE id = ?').bind(
      body.locale ?? principal.locale,
      timestamp,
      principal.userId,
    ),
    context.env.DB.prepare(
      `UPDATE user_settings SET theme = ?, default_persona_id = ?, generation_profile = ?,
          nsfw_visible = ?, preferences_json = ?, updated_at = ? WHERE user_id = ?`,
    ).bind(
      body.theme ?? current.theme,
      body.defaultPersonaId === undefined ? current.defaultPersonaId : body.defaultPersonaId,
      body.generationProfile ?? current.generationProfile,
      body.nsfwVisible === undefined ? (current.nsfwVisible ? 1 : 0) : body.nsfwVisible ? 1 : 0,
      body.preferences === undefined
        ? JSON.stringify(current.preferences)
        : JSON.stringify(body.preferences),
      timestamp,
      principal.userId,
    ),
  ]);
  const updated = await readSettings(context.env.DB, principal.userId);
  return context.json({ ...updated, locale: body.locale ?? principal.locale });
});

authenticated.post('/age-gate', async (context) => {
  const principal = context.get('principal');
  ageGateSchema.parse(await context.req.json());
  const acceptedAt = nowMs();
  await context.env.DB.prepare(
    'UPDATE users SET age_gate_accepted_at = COALESCE(age_gate_accepted_at, ?), updated_at = ? WHERE id = ?',
  )
    .bind(acceptedAt, acceptedAt, principal.userId)
    .run();
  return context.json({ accepted: true, acceptedAt });
});

authenticated.post('/auth/logout', async (context) => {
  const principal = context.get('principal');
  await context.env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?')
    .bind(nowMs(), principal.sessionId)
    .run();
  deleteCookie(context, 'velora_session', {
    path: '/',
    secure: context.env.ENVIRONMENT !== 'local',
  });
  return context.body(null, 204);
});

authenticated.route('/personas', personaRoutes);
authenticated.route('/onboarding', onboardingRoutes);
authenticated.route('/characters', characterRoutes);
authenticated.route('/discovery', discoveryRoutes);
authenticated.route('/public', publicRoutes);
authenticated.route('/media', mediaRoutes);
authenticated.route('/conversations', conversationRoutes);
authenticated.route('/conversations', generationRoutes);
authenticated.route('/', lorebookRoutes);
authenticated.route('/', moderationRoutes);
authenticated.route('/', billingRoutes);
authenticated.route('/', operationsRoutes);
authenticated.route('/', accountControlRoutes);
authenticated.route('/', supportRoutes);
authenticated.route('/', profileRoutes);

app.route('/api/v1', authenticated);

app.get('/openapi.json', (context) =>
  context.json(createOpenApiDocument(app.routes), 200, {
    'cache-control': 'public, max-age=300',
  }),
);

interface SettingsRow {
  readonly theme: 'dark' | 'amoled' | 'light';
  readonly defaultPersonaId: string | null;
  readonly generationProfile: 'BALANCED' | 'CREATIVE' | 'PREMIUM';
  readonly nsfwVisible: number;
  readonly preferencesJson: string;
}

async function readSettings(database: D1Database, userId: string) {
  const row = await database
    .prepare(
      `SELECT theme, default_persona_id AS defaultPersonaId,
        generation_profile AS generationProfile, nsfw_visible AS nsfwVisible,
        preferences_json AS preferencesJson FROM user_settings WHERE user_id = ?`,
    )
    .bind(userId)
    .first<SettingsRow>();
  if (!row) throw new AppError('SETTINGS_NOT_FOUND', 'Настройки не найдены.', 404);
  let preferences: Readonly<Record<string, unknown>> = {};
  try {
    const parsed: unknown = JSON.parse(row.preferencesJson);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      preferences = parsed as Readonly<Record<string, unknown>>;
    }
  } catch {
    preferences = {};
  }
  return {
    theme: row.theme,
    defaultPersonaId: row.defaultPersonaId,
    generationProfile: row.generationProfile,
    nsfwVisible: row.nsfwVisible === 1,
    preferences,
  };
}

app.notFound(async (context) => {
  if (context.req.path.startsWith('/api/') || context.req.path.startsWith('/telegram/')) {
    return context.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Маршрут не найден.',
          requestId: context.get('requestId'),
        },
      },
      404,
    );
  }
  return context.env.ASSETS.fetch(context.req.raw);
});

app.onError((error, context) => {
  context.set('requestFailed', true);
  const requestId = context.get('requestId') || crypto.randomUUID();
  const status = error instanceof z.ZodError ? 400 : error instanceof AppError ? error.status : 500;
  writeRequestLog('error', context.req.method, context.req.path, status, {
    requestId,
    startedAt: context.get('requestStartedAt') || Date.now(),
    actorHash: context.get('actorHash'),
    errorName: asError(error).name,
  });
  const internalMessage = asError(error).message;
  if (
    context.env.ENVIRONMENT === 'local' &&
    status === 500 &&
    /(?:D1_ERROR|SQLITE_(?:ERROR|CONSTRAINT))/u.test(internalMessage)
  ) {
    // Local-only database diagnostics contain the prepared SQL shape, never bound user values.
    console.error(JSON.stringify({ level: 'error', event: 'local_d1_error', internalMessage }));
  }
  if (error instanceof z.ZodError) {
    return context.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Проверьте заполненные поля.',
          requestId,
          details: error.issues,
        },
      },
      400,
    );
  }
  if (error instanceof AppError) {
    return context.json(
      { error: { code: error.code, message: error.message, requestId, details: error.details } },
      error.status as 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503,
    );
  }
  return context.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервиса.', requestId } },
    500,
  );
});

export { app };

export default {
  fetch(
    request: Request,
    env: Env,
    executionContext: ExecutionContext,
  ): Response | Promise<Response> {
    return app.fetch(request, env, executionContext);
  },
  scheduled(_controller: ScheduledController, env: Env, executionContext: ExecutionContext): void {
    executionContext.waitUntil(
      Promise.all([
        processDueMemoryJobs(env.DB, 3),
        processDueAccountDeletions(env.DB, 1),
        cleanupReliabilityData(env.DB),
        runOperationalAlertCycle(env),
        reconcileTelegramConfiguration(env),
        reconcileBotHubProvider(env),
      ]).then(() => undefined),
    );
  },
} satisfies ExportedHandler<Env>;

function writeRequestLog(
  level: 'info' | 'error',
  method: string,
  path: string,
  status: number,
  input: {
    readonly requestId: string;
    readonly startedAt: number;
    readonly actorHash: string | undefined;
    readonly errorName?: string;
  },
): void {
  const payload = {
    level,
    event: 'http_request',
    requestId: input.requestId,
    route: normalizeRoute(path),
    method,
    status,
    latencyMs: Math.max(0, Date.now() - input.startedAt),
    actorHash: input.actorHash ?? null,
    ...(input.errorName ? { errorName: input.errorName } : {}),
  };
  if (level === 'error') console.error(JSON.stringify(payload));
  else console.log(JSON.stringify(payload));
}

function normalizeRoute(path: string): string {
  return path
    .split('/')
    .map((segment) =>
      /^[0-9a-f]{8}-[0-9a-f-]{27,}$/iu.test(segment) || segment.length > 80 ? ':id' : segment,
    )
    .join('/');
}
