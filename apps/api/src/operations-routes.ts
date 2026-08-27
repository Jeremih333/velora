import { AppError, createId, nowMs } from '@velora/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { isFeatureEnabled, type FeatureFlagKey } from './reliability';
import { readAiSmoke, readAiSmokeHistory, runAiSmoke } from './ai-smoke';
import { readBotHubModelCapabilities } from './bothub-models';
import {
  readRoleplayModelEvals,
  roleplayModelEvalCatalog,
  runRoleplayModelEval,
} from './model-eval';
import {
  readRoleplayBenchmarkRuns,
  reviewRoleplayBenchmark,
  ROLEPLAY_BENCHMARK_CONFIRMATION,
  runRoleplayBenchmark,
} from './roleplay-benchmark';
import type { Env, Variables } from './types';
import { findRoleplayModelProfile } from './model-registry';
import {
  readDefaultRoleplayModelId,
  readEffectiveRoleplayModelProfiles,
} from './model-registry-config';
import { projectCloudflareFreeCapacity } from './cloudflare-capacity';
import { deriveCapacityRuntimePolicy } from './capacity-runtime';

interface OperationsEnvironment {
  Bindings: Env;
  Variables: Variables;
}

interface FeatureFlagRow {
  readonly key: FeatureFlagKey;
  readonly enabled: number;
  readonly rolloutPercent: number;
  readonly configJson: string;
  readonly updatedAt: number;
  readonly updatedBy: string | null;
}

interface ModelHealthRow {
  readonly model: string;
  readonly requestCount: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly averageLatencyMs: number | null;
  readonly averageTtftMs: number | null;
}

interface ModelErrorRow {
  readonly model: string;
  readonly errorCode: string;
  readonly completedAt: number | null;
}

interface AiUsageAggregateRow {
  readonly dailyRequests: number;
  readonly dailyInputTokens: number;
  readonly dailyOutputTokens: number;
  readonly dailyCostMicros: number;
  readonly weeklyRequests: number;
  readonly weeklyInputTokens: number;
  readonly weeklyOutputTokens: number;
  readonly weeklyCostMicros: number;
  readonly lifetimeRequests: number;
  readonly lifetimeInputTokens: number;
  readonly lifetimeOutputTokens: number;
  readonly lifetimeCostMicros: number;
}

interface AiModelUsageRow {
  readonly model: string;
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costMicros: number;
}

const featureFlagKeySchema = z.enum([
  'advanced_memory',
  'new_model',
  'public_reviews',
  'experimental_renderer',
  'groups',
]);
const featureFlagPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    rolloutPercent: z.number().int().min(0).max(100).optional(),
    config: z.record(z.string().max(80), z.unknown()).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'At least one field is required.')
  .refine(
    (body) => body.config === undefined || JSON.stringify(body.config).length <= 4096,
    'Feature config is too large.',
  );
const staffRoleSchema = z.enum(['MODERATOR', 'SENIOR_MODERATOR']);
const telegramIdSchema = z.string().regex(/^\d{5,20}$/u, 'Invalid Telegram ID.');
const staffAssignmentSchema = z.object({
  telegramId: telegramIdSchema,
  role: staffRoleSchema,
});
const aiSmokeSchema = z.object({ confirmation: z.literal('ПОТРАТИТЬ 1 ЗАПРОС V3') });
const modelEvalSchema = z.object({
  modelProfileId: z.string().min(1).max(80),
  confirmation: z.literal('ПОТРАТИТЬ 1 ЗАПРОС НА ПРОВЕРКУ МОДЕЛИ'),
});
const benchmarkScoreSchema = z.number().int().min(1).max(5);
const roleplayBenchmarkSchema = z.object({
  modelProfileId: z.string().min(1).max(80),
  confirmation: z.literal(ROLEPLAY_BENCHMARK_CONFIRMATION),
});
const roleplayBenchmarkReviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  scores: z.object({
    character_adherence: benchmarkScoreSchema,
    persona_adherence: benchmarkScoreSchema,
    narrative_quality: benchmarkScoreSchema,
    russian_quality: benchmarkScoreSchema,
    english_quality: benchmarkScoreSchema,
    emotional_continuity: benchmarkScoreSchema,
    memory_use: benchmarkScoreSchema,
    lore_use: benchmarkScoreSchema,
    formatting: benchmarkScoreSchema,
    repetition_control: benchmarkScoreSchema,
    verbosity_control: benchmarkScoreSchema,
    latency: benchmarkScoreSchema,
    cost: benchmarkScoreSchema,
    consensual_mature_fictional_compatibility: benchmarkScoreSchema,
  }),
});
const modelControlPatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    descriptionRu: z.string().trim().min(1).max(1_000).optional(),
    tier: z.enum(['free', 'standard', 'premium']).optional(),
    enabled: z.boolean().optional(),
    fallbackIds: z.array(z.string().min(1).max(80)).max(2).optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'At least one field is required.');

export const operationsRoutes = new Hono<OperationsEnvironment>();

operationsRoutes.get('/feature-flags', async (context) => {
  const principal = context.get('principal');
  const keys = featureFlagKeySchema.options;
  const flags: Record<FeatureFlagKey, boolean> = {
    advanced_memory: false,
    new_model: false,
    public_reviews: false,
    experimental_renderer: false,
    groups: false,
  };
  await Promise.all(
    keys.map(async (key) => {
      flags[key] = await isFeatureEnabled(context.env.DB, key, principal.userId);
    }),
  );
  return context.json({ flags });
});

operationsRoutes.get('/admin/operations/dashboard', async (context) => {
  const principal = context.get('principal');
  requireAdmin(principal.role);
  const generatedAt = nowMs();
  const since = generatedAt - 24 * 60 * 60 * 1000;
  const weekSince = generatedAt - 7 * 24 * 60 * 60 * 1000;
  const row = await context.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS users,
       (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND last_seen_at >= ?) AS activeUsers24h,
       (SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL AND created_at >= ?) AS messages24h,
       (SELECT COUNT(*) FROM ai_requests WHERE created_at >= ?) AS aiRequests24h,
       (SELECT COUNT(*) FROM ai_requests WHERE created_at >= ? AND status = 'FAILED') AS failedGenerations24h,
       (SELECT COALESCE(SUM(CASE WHEN provider_actual_cost_micros > 0
          THEN provider_actual_cost_micros WHEN status IN ('RESERVED', 'STREAMING')
          THEN provider_estimated_cost_micros ELSE 0 END), 0)
          FROM ai_requests WHERE created_at >= ?) AS aiCostMicros24h,
       (SELECT COUNT(*) FROM payments WHERE created_at >= ? AND state IN ('FAILED', 'CANCELLED', 'EXPIRED')) AS paymentFailures24h,
       (SELECT COUNT(*) FROM moderation_cases WHERE state NOT IN ('RESOLVED', 'CLOSED')) AS moderationBacklog,
       (SELECT COUNT(*) FROM jobs WHERE status IN ('PENDING', 'PROCESSING')) AS jobBacklog,
       (SELECT COUNT(*) FROM jobs WHERE created_at >= ?) AS jobsCreated24h,
       (SELECT COUNT(*) FROM product_events WHERE created_at >= ?) AS productEvents24h,
       (SELECT COUNT(*) FROM file_objects WHERE deleted_at IS NULL AND created_at >= ?)
          AS mediaObjectsCreated24h,
       (SELECT COALESCE(SUM(byte_size), 0) FROM file_objects
          WHERE deleted_at IS NULL AND created_at >= ?) AS mediaBytesCreated24h,
       (SELECT COALESCE(SUM(byte_size), 0) FROM file_objects WHERE deleted_at IS NULL)
          AS mediaBytesTotal,
       (SELECT MAX(completed_at) FROM ai_requests WHERE status = 'COMPLETED') AS providerLastSuccessAt,
       (SELECT MAX(completed_at) FROM ai_requests WHERE status = 'FAILED') AS providerLastFailureAt`,
  )
    .bind(since, since, since, since, since, since, since, since, since, since)
    .first<{
      users: number;
      activeUsers24h: number;
      messages24h: number;
      aiRequests24h: number;
      failedGenerations24h: number;
      aiCostMicros24h: number;
      paymentFailures24h: number;
      moderationBacklog: number;
      jobBacklog: number;
      jobsCreated24h: number;
      productEvents24h: number;
      mediaObjectsCreated24h: number;
      mediaBytesCreated24h: number;
      mediaBytesTotal: number;
      providerLastSuccessAt: number | null;
      providerLastFailureAt: number | null;
    }>();
  if (!row) throw new AppError('DASHBOARD_UNAVAILABLE', 'Метрики временно недоступны.', 503);
  const ownerAiUsage =
    principal.role === 'OWNER' ? await readOwnerAiUsage(context.env, since, weekSince) : null;
  const distributionRows = await context.env.DB.prepare(
    `WITH effective_plans AS (
       SELECT u.id,
         COALESCE((SELECT p.code FROM (
             SELECT id, user_id, plan_code, starts_at, expires_at
             FROM plan_access_grants WHERE revoked_at IS NULL AND refunded_at IS NULL
             UNION ALL
             SELECT id, user_id, plan_code, starts_at, expires_at
             FROM admin_plan_access_grants WHERE revoked_at IS NULL
           ) g JOIN plans p ON p.code = g.plan_code
           WHERE g.user_id = u.id AND g.starts_at <= ? AND g.expires_at > ? AND p.active = 1
           ORDER BY p.rank DESC, g.expires_at DESC, g.id DESC LIMIT 1), 'FREE') AS planCode
       FROM users u WHERE u.deleted_at IS NULL
     ) SELECT planCode, COUNT(*) AS users FROM effective_plans GROUP BY planCode`,
  )
    .bind(generatedAt, generatedAt)
    .all<{ planCode: string; users: number }>();
  const planDistribution: Record<string, number> = {};
  for (const item of distributionRows.results) planDistribution[item.planCode] = item.users;
  const capacityProjection = projectCloudflareFreeCapacity(row);
  return context.json({
    ...row,
    ownerAiUsage,
    planDistribution,
    capacityProjection: {
      ...capacityProjection,
      runtimePolicy: deriveCapacityRuntimePolicy(capacityProjection),
    },
    generatedAt,
  });
});

async function readOwnerAiUsage(env: Env, since: number, weekSince: number) {
  const providerCostSql = `CASE WHEN provider_actual_cost_micros > 0
    THEN provider_actual_cost_micros WHEN status IN ('RESERVED', 'STREAMING')
    THEN provider_estimated_cost_micros ELSE 0 END`;
  const [aggregate, byModel] = await Promise.all([
    env.DB.prepare(
      `SELECT
       COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS dailyRequests,
       COALESCE(SUM(CASE WHEN created_at >= ? THEN input_tokens ELSE 0 END), 0) AS dailyInputTokens,
       COALESCE(SUM(CASE WHEN created_at >= ? THEN output_tokens ELSE 0 END), 0) AS dailyOutputTokens,
       COALESCE(SUM(CASE WHEN created_at >= ? THEN ${providerCostSql} ELSE 0 END), 0) AS dailyCostMicros,
       COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS weeklyRequests,
       COALESCE(SUM(CASE WHEN created_at >= ? THEN input_tokens ELSE 0 END), 0) AS weeklyInputTokens,
       COALESCE(SUM(CASE WHEN created_at >= ? THEN output_tokens ELSE 0 END), 0) AS weeklyOutputTokens,
       COALESCE(SUM(CASE WHEN created_at >= ? THEN ${providerCostSql} ELSE 0 END), 0) AS weeklyCostMicros,
       COUNT(*) AS lifetimeRequests,
       COALESCE(SUM(input_tokens), 0) AS lifetimeInputTokens,
       COALESCE(SUM(output_tokens), 0) AS lifetimeOutputTokens,
       COALESCE(SUM(${providerCostSql}), 0) AS lifetimeCostMicros
       FROM ai_requests`,
    )
      .bind(since, since, since, since, weekSince, weekSince, weekSince, weekSince)
      .first<AiUsageAggregateRow>(),
    env.DB.prepare(
      `SELECT model, COUNT(*) AS requests,
       COALESCE(SUM(input_tokens), 0) AS inputTokens,
       COALESCE(SUM(output_tokens), 0) AS outputTokens,
       COALESCE(SUM(${providerCostSql}), 0) AS costMicros
       FROM ai_requests WHERE created_at >= ? GROUP BY model
       ORDER BY costMicros DESC, requests DESC, model ASC LIMIT 50`,
    )
      .bind(weekSince)
      .all<AiModelUsageRow>(),
  ]);
  if (!aggregate) {
    throw new AppError('DASHBOARD_UNAVAILABLE', 'AI usage is temporarily unavailable.', 503);
  }
  const lifetimeBudgetMicros = usdBudgetMicros(env.LIFETIME_AI_BUDGET_USD);
  return {
    daily: usageWindow(
      aggregate.dailyRequests,
      aggregate.dailyInputTokens,
      aggregate.dailyOutputTokens,
      aggregate.dailyCostMicros,
    ),
    weekly: usageWindow(
      aggregate.weeklyRequests,
      aggregate.weeklyInputTokens,
      aggregate.weeklyOutputTokens,
      aggregate.weeklyCostMicros,
    ),
    lifetime: usageWindow(
      aggregate.lifetimeRequests,
      aggregate.lifetimeInputTokens,
      aggregate.lifetimeOutputTokens,
      aggregate.lifetimeCostMicros,
    ),
    perModelWeekly: byModel.results,
    configuredBudgetMicros: {
      daily: usdBudgetMicros(env.DAILY_AI_BUDGET_USD),
      monthly: usdBudgetMicros(env.MONTHLY_AI_BUDGET_USD),
      lifetime: lifetimeBudgetMicros,
      remainingLifetime: Math.max(0, lifetimeBudgetMicros - aggregate.lifetimeCostMicros),
    },
    capsBalance: {
      estimatedRemainingCaps: null,
      status: 'PROVIDER_BALANCE_API_UNAVAILABLE' as const,
    },
  };
}

function usageWindow(
  requests: number,
  inputTokens: number,
  outputTokens: number,
  costMicros: number,
) {
  return { requests, inputTokens, outputTokens, costMicros };
}

function usdBudgetMicros(value: string): number {
  const usd = Number(value);
  return Number.isFinite(usd) && usd >= 0 ? Math.round(usd * 1_000_000) : 0;
}

operationsRoutes.get('/admin/operations/alerts', async (context) => {
  requireAdmin(context.get('principal').role);
  const result = await context.env.DB.prepare(
    `SELECT id, alert_key AS alertKey, severity, state, summary, occurrences,
       first_detected_at AS firstDetectedAt, last_detected_at AS lastDetectedAt,
       last_notified_at AS lastNotifiedAt, resolved_at AS resolvedAt
     FROM operational_alerts ORDER BY CASE state WHEN 'OPEN' THEN 0 ELSE 1 END,
       last_detected_at DESC LIMIT 100`,
  ).all();
  return context.json({ items: result.results });
});

operationsRoutes.get('/admin/operations/ai-smoke', async (context) => {
  requireOwner(context.get('principal').role);
  const [run, history, capabilities] = await Promise.all([
    readAiSmoke(context.env.DB),
    readAiSmokeHistory(context.env.DB),
    readBotHubModelCapabilities(context.env.DB),
  ]);
  return context.json({ run, history, capabilities });
});

operationsRoutes.post('/admin/operations/ai-smoke', async (context) => {
  const principal = context.get('principal');
  requireOwner(principal.role);
  aiSmokeSchema.parse(await context.req.json());
  const run = await runAiSmoke(context.env, principal.userId, context.get('requestId'));
  return context.json({ run }, run.alreadyAttempted ? 200 : 201);
});

operationsRoutes.get('/admin/operations/model-evals', async (context) => {
  requireOwner(context.get('principal').role);
  return context.json({
    models: roleplayModelEvalCatalog(),
    items: await readRoleplayModelEvals(context.env.DB),
  });
});

operationsRoutes.post('/admin/operations/model-evals', async (context) => {
  const principal = context.get('principal');
  requireOwner(principal.role);
  const body = modelEvalSchema.parse(await context.req.json());
  const run = await runRoleplayModelEval(
    context.env,
    principal.userId,
    context.get('requestId'),
    body.modelProfileId,
  );
  return context.json({ run }, run.alreadyAttempted ? 200 : 201);
});

operationsRoutes.get('/admin/operations/model-benchmarks', async (context) => {
  requireOwner(context.get('principal').role);
  return context.json({ items: await readRoleplayBenchmarkRuns(context.env.DB) });
});

operationsRoutes.post('/admin/operations/model-benchmarks', async (context) => {
  const principal = context.get('principal');
  requireOwner(principal.role);
  const body = roleplayBenchmarkSchema.parse(await context.req.json());
  const run = await runRoleplayBenchmark(
    context.env,
    principal.userId,
    context.get('requestId'),
    body.modelProfileId,
  );
  return context.json({ run }, run.alreadyAttempted ? 200 : 201);
});

operationsRoutes.post('/admin/operations/model-benchmarks/:runKey/review', async (context) => {
  const principal = context.get('principal');
  requireOwner(principal.role);
  const body = roleplayBenchmarkReviewSchema.parse(await context.req.json());
  const run = await reviewRoleplayBenchmark(
    context.env.DB,
    principal.userId,
    context.req.param('runKey'),
    body.decision,
    body.scores,
  );
  return context.json({ run });
});

operationsRoutes.get('/admin/operations/models', async (context) => {
  requireOwner(context.get('principal').role);
  const since = nowMs() - 24 * 60 * 60 * 1000;
  const [items, defaultModelProfileId, healthResult, recentErrorsResult] = await Promise.all([
    readEffectiveRoleplayModelProfiles(context.env.DB),
    readDefaultRoleplayModelId(context.env.DB),
    context.env.DB.prepare(
      `SELECT model, COUNT(*) AS requestCount,
         SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS successCount,
         SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failureCount,
         ROUND(AVG(CASE WHEN status = 'COMPLETED' THEN latency_ms END)) AS averageLatencyMs,
         ROUND(AVG(first_token_latency_ms)) AS averageTtftMs
         FROM ai_requests WHERE purpose = 'ROLEPLAY' AND created_at >= ? GROUP BY model`,
    )
      .bind(since)
      .all<ModelHealthRow>(),
    context.env.DB.prepare(
      `SELECT model, error_code AS errorCode, completed_at AS completedAt
         FROM ai_requests WHERE purpose = 'ROLEPLAY' AND status = 'FAILED'
          AND created_at >= ? AND error_code IS NOT NULL
         ORDER BY completed_at DESC LIMIT 30`,
    )
      .bind(since)
      .all<ModelErrorRow>(),
  ]);
  const healthByModel = new Map(healthResult.results.map((row) => [row.model, row] as const));
  return context.json({
    defaultModelProfileId,
    items: items.map((item) => ({
      modelProfileId: item.id,
      displayName: item.displayName,
      descriptionRu: item.descriptionRu,
      tier: item.tier,
      enabled: item.enabled,
      fallbackIds: item.fallbackIds,
      updatedAt: item.updatedAt,
      updatedBy: item.updatedBy,
      health: toModelHealth(
        healthByModel.get(item.providerModelId),
        recentErrorsResult.results
          .filter((error) => error.model === item.providerModelId)
          .slice(0, 3),
      ),
    })),
  });
});

operationsRoutes.patch('/admin/operations/models/:modelProfileId', async (context) => {
  const principal = context.get('principal');
  requireOwner(principal.role);
  const modelProfileId = context.req.param('modelProfileId');
  if (!findRoleplayModelProfile(modelProfileId)) {
    throw new AppError('MODEL_PROFILE_NOT_FOUND', 'Модель не входит в разрешённый реестр.', 404);
  }
  const body = modelControlPatchSchema.parse(await context.req.json());
  if (body.fallbackIds) {
    if (new Set(body.fallbackIds).size !== body.fallbackIds.length) {
      throw new AppError('MODEL_FALLBACK_INVALID', 'Fallback-модели не должны повторяться.', 400);
    }
    if (
      body.fallbackIds.includes(modelProfileId) ||
      body.fallbackIds.some((id) => findRoleplayModelProfile(id) === null)
    ) {
      throw new AppError('MODEL_FALLBACK_INVALID', 'Fallback содержит недоступную модель.', 400);
    }
  }
  const profiles = await readEffectiveRoleplayModelProfiles(context.env.DB);
  const current = profiles.find((profile) => profile.id === modelProfileId);
  if (!current) throw new AppError('MODEL_PROFILE_NOT_FOUND', 'Модель не найдена.', 404);
  const enabled = body.enabled ?? current.enabled;
  if (
    !enabled &&
    profiles.filter((profile) => profile.enabled && profile.id !== modelProfileId).length === 0
  ) {
    throw new AppError('LAST_MODEL_REQUIRED', 'Нельзя отключить последнюю доступную модель.', 409);
  }
  const fallbackIds = body.fallbackIds ?? current.fallbackIds;
  if (fallbackIds.some((id) => !profiles.some((profile) => profile.id === id && profile.enabled))) {
    throw new AppError(
      'MODEL_FALLBACK_INVALID',
      'Fallback должен вести на включённую модель.',
      409,
    );
  }
  const prospectiveFallbacks = new Map(
    profiles.map(
      (profile) =>
        [profile.id, profile.id === modelProfileId ? fallbackIds : profile.fallbackIds] as const,
    ),
  );
  if (hasFallbackCycle(prospectiveFallbacks)) {
    throw new AppError(
      'MODEL_FALLBACK_CYCLE',
      'Цепочка резервных моделей не должна содержать цикл.',
      409,
    );
  }
  if (body.isDefault === true && !enabled) {
    throw new AppError('DEFAULT_MODEL_DISABLED', 'Модель по умолчанию должна быть включена.', 409);
  }
  const currentDefault = await readDefaultRoleplayModelId(context.env.DB);
  if (!enabled && currentDefault === modelProfileId && body.isDefault !== true) {
    throw new AppError(
      'DEFAULT_MODEL_REPLACEMENT_REQUIRED',
      'Сначала назначьте другую модель по умолчанию.',
      409,
    );
  }
  const timestamp = nowMs();
  const updated = {
    displayName: body.displayName ?? current.displayName,
    descriptionRu: body.descriptionRu ?? current.descriptionRu,
    tier: body.tier ?? current.tier,
    enabled,
    fallbackIds,
  };
  const statements = [
    context.env.DB.prepare(
      `INSERT INTO roleplay_model_overrides
       (model_profile_id, display_name, description_ru, tier, enabled,
        fallback_ids_json, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(model_profile_id) DO UPDATE SET
       display_name = excluded.display_name,
       description_ru = excluded.description_ru,
       tier = excluded.tier,
       enabled = excluded.enabled,
       fallback_ids_json = excluded.fallback_ids_json,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
    ).bind(
      modelProfileId,
      updated.displayName,
      updated.descriptionRu,
      updated.tier,
      updated.enabled ? 1 : 0,
      JSON.stringify(updated.fallbackIds),
      timestamp,
      principal.userId,
    ),
    context.env.DB.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, request_id,
       metadata_json, created_at) VALUES (?, ?, 'ROLEPLAY_MODEL_UPDATE', 'PROVIDER', ?, ?, ?, ?)`,
    ).bind(
      createId(),
      principal.userId,
      modelProfileId,
      context.get('requestId'),
      JSON.stringify({ ...updated, isDefault: body.isDefault === true }),
      timestamp,
    ),
  ];
  if (body.isDefault === true) {
    statements.push(
      context.env.DB.prepare(
        `UPDATE roleplay_model_default SET model_profile_id = ?, updated_at = ?, updated_by = ?
         WHERE singleton = 1`,
      ).bind(modelProfileId, timestamp, principal.userId),
    );
  }
  await context.env.DB.batch(statements);
  return context.json({
    modelProfileId,
    ...updated,
    isDefault: body.isDefault === true || currentDefault === modelProfileId,
    updatedAt: timestamp,
    updatedBy: principal.userId,
  });
});

operationsRoutes.get('/admin/feature-flags', async (context) => {
  requireOwner(context.get('principal').role);
  const result = await context.env.DB.prepare(
    `SELECT key, enabled, rollout_percent AS rolloutPercent, config_json AS configJson,
       updated_at AS updatedAt, updated_by AS updatedBy
     FROM feature_flags ORDER BY key`,
  ).all<FeatureFlagRow>();
  return context.json({ items: result.results.map(toFeatureFlagResponse) });
});

operationsRoutes.patch('/admin/feature-flags/:key', async (context) => {
  const principal = context.get('principal');
  requireOwner(principal.role);
  const key = featureFlagKeySchema.parse(context.req.param('key'));
  const body = featureFlagPatchSchema.parse(await context.req.json());
  const current = await context.env.DB.prepare(
    `SELECT key, enabled, rollout_percent AS rolloutPercent, config_json AS configJson,
       updated_at AS updatedAt, updated_by AS updatedBy FROM feature_flags WHERE key = ?`,
  )
    .bind(key)
    .first<FeatureFlagRow>();
  if (!current) throw new AppError('FEATURE_FLAG_NOT_FOUND', 'Feature flag не найден.', 404);
  const timestamp = nowMs();
  const enabled = body.enabled ?? current.enabled === 1;
  const rolloutPercent = body.rolloutPercent ?? current.rolloutPercent;
  const configJson = body.config === undefined ? current.configJson : JSON.stringify(body.config);
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE feature_flags SET enabled = ?, rollout_percent = ?, config_json = ?,
         updated_at = ?, updated_by = ? WHERE key = ?`,
    ).bind(enabled ? 1 : 0, rolloutPercent, configJson, timestamp, principal.userId, key),
    context.env.DB.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, request_id,
         metadata_json, created_at) VALUES (?, ?, 'FEATURE_FLAG_UPDATE', 'FEATURE_FLAG', ?, ?, ?, ?)`,
    ).bind(
      createId(),
      principal.userId,
      key,
      context.get('requestId'),
      JSON.stringify({ enabled, rolloutPercent }),
      timestamp,
    ),
  ]);
  return context.json({
    key,
    enabled,
    rolloutPercent,
    config: safeConfig(configJson),
    updatedAt: timestamp,
    updatedBy: principal.userId,
  });
});

operationsRoutes.get('/admin/staff', async (context) => {
  requireOwner(context.get('principal').role);
  const result = await context.env.DB.prepare(
    `SELECT a.id, u.id AS userId, u.telegram_id AS telegramId, u.username,
       u.display_name AS displayName, a.assigned_role AS role,
       a.assigned_by AS assignedBy, a.assigned_at AS assignedAt
     FROM staff_assignments a JOIN users u ON u.id = a.user_id
     WHERE a.revoked_at IS NULL AND u.deleted_at IS NULL
     ORDER BY CASE a.assigned_role WHEN 'SENIOR_MODERATOR' THEN 0 ELSE 1 END,
       a.assigned_at, u.id`,
  ).all();
  return context.json({ items: result.results });
});

operationsRoutes.post('/admin/staff', async (context) => {
  const principal = context.get('principal');
  requireOwner(principal.role);
  const input = staffAssignmentSchema.parse(await context.req.json());
  const target = await context.env.DB.prepare(
    `SELECT id, role, deleted_at AS deletedAt FROM users WHERE telegram_id = ?`,
  )
    .bind(input.telegramId)
    .first<{
      id: string;
      role: Variables['principal']['role'];
      deletedAt: number | null;
    }>();
  if (target?.deletedAt !== null) {
    throw new AppError(
      'STAFF_USER_NOT_FOUND',
      'Пользователь должен сначала открыть Velora через Telegram.',
      404,
    );
  }
  if (target.id === principal.userId || !['USER', 'CREATOR'].includes(target.role)) {
    throw new AppError('STAFF_ROLE_PROTECTED', 'Эту роль нельзя изменить через назначение.', 409);
  }
  const timestamp = nowMs();
  const assignmentId = createId();
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO staff_assignments
          (id, user_id, assigned_role, previous_role, assigned_by, assigned_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(assignmentId, target.id, input.role, target.role, principal.userId, timestamp),
      context.env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').bind(
        input.role,
        timestamp,
        target.id,
      ),
      context.env.DB.prepare(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, request_id,
           metadata_json, created_at)
         VALUES (?, ?, 'STAFF_ASSIGNED', 'USER', ?, ?, ?, ?)`,
      ).bind(
        createId(),
        principal.userId,
        target.id,
        context.get('requestId'),
        JSON.stringify({ assignmentId, role: input.role, telegramId: input.telegramId }),
        timestamp,
      ),
    ]);
  } catch (error) {
    if (/unique|constraint/iu.test(error instanceof Error ? error.message : '')) {
      throw new AppError('STAFF_ALREADY_ASSIGNED', 'Пользователь уже состоит в команде.', 409);
    }
    throw error;
  }
  return context.json({ id: assignmentId, userId: target.id, role: input.role }, 201);
});

operationsRoutes.delete('/admin/staff/:telegramId', async (context) => {
  const principal = context.get('principal');
  requireOwner(principal.role);
  const telegramId = telegramIdSchema.parse(context.req.param('telegramId'));
  const assignment = await context.env.DB.prepare(
    `SELECT a.id, a.user_id AS userId, a.previous_role AS previousRole,
       a.assigned_role AS assignedRole
     FROM staff_assignments a JOIN users u ON u.id = a.user_id
     WHERE u.telegram_id = ? AND a.revoked_at IS NULL`,
  )
    .bind(telegramId)
    .first<{
      id: string;
      userId: string;
      previousRole: 'USER' | 'CREATOR';
      assignedRole: 'MODERATOR' | 'SENIOR_MODERATOR';
    }>();
  if (!assignment) throw new AppError('STAFF_NOT_FOUND', 'Назначение не найдено.', 404);
  const timestamp = nowMs();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE staff_assignments SET revoked_by = ?, revoked_at = ?
       WHERE id = ? AND revoked_at IS NULL`,
    ).bind(principal.userId, timestamp, assignment.id),
    context.env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').bind(
      assignment.previousRole,
      timestamp,
      assignment.userId,
    ),
    context.env.DB.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, request_id,
         metadata_json, created_at)
       VALUES (?, ?, 'STAFF_REVOKED', 'USER', ?, ?, ?, ?)`,
    ).bind(
      createId(),
      principal.userId,
      assignment.userId,
      context.get('requestId'),
      JSON.stringify({
        assignmentId: assignment.id,
        role: assignment.assignedRole,
        telegramId,
      }),
      timestamp,
    ),
  ]);
  return context.json({ revoked: true });
});

function toFeatureFlagResponse(row: FeatureFlagRow) {
  return {
    key: row.key,
    enabled: row.enabled === 1,
    rolloutPercent: row.rolloutPercent,
    config: safeConfig(row.configJson),
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

function safeConfig(value: string): Readonly<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Readonly<Record<string, unknown>>;
    }
  } catch {
    // Invalid legacy config is represented as empty without breaking the dashboard.
  }
  return {};
}

function toModelHealth(row: ModelHealthRow | undefined, errors: readonly ModelErrorRow[]) {
  const requestCount = row?.requestCount ?? 0;
  const successCount = row?.successCount ?? 0;
  const failureCount = row?.failureCount ?? 0;
  return {
    windowHours: 24,
    requestCount,
    successRatePercent: requestCount === 0 ? null : (successCount / requestCount) * 100,
    failureRatePercent: requestCount === 0 ? null : (failureCount / requestCount) * 100,
    averageLatencyMs: row?.averageLatencyMs ?? null,
    averageTtftMs: row?.averageTtftMs ?? null,
    recentErrors: errors.map(({ errorCode, completedAt }) => ({ errorCode, completedAt })),
  };
}

function hasFallbackCycle(graph: ReadonlyMap<string, readonly string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const fallbackId of graph.get(id) ?? []) {
      if (visit(fallbackId)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...graph.keys()].some(visit);
}

function requireAdmin(role: Variables['principal']['role']): void {
  if (role !== 'ADMIN' && role !== 'OWNER') {
    throw new AppError('FORBIDDEN', 'Раздел доступен только администраторам.', 403);
  }
}

function requireOwner(role: Variables['principal']['role']): void {
  if (role !== 'OWNER') {
    throw new AppError('FORBIDDEN', 'Раздел доступен только владельцу.', 403);
  }
}
