import { AppError, createId, nowMs } from '@velora/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { isFeatureEnabled, type FeatureFlagKey } from './reliability';
import { readAiSmoke, readAiSmokeHistory, runAiSmoke } from './ai-smoke';
import { readBotHubModelCapabilities } from './bothub-models';
import type { Env, Variables } from './types';

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

const featureFlagKeySchema = z.enum([
  'advanced_memory',
  'new_model',
  'public_reviews',
  'experimental_renderer',
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

export const operationsRoutes = new Hono<OperationsEnvironment>();

operationsRoutes.get('/feature-flags', async (context) => {
  const principal = context.get('principal');
  const keys = featureFlagKeySchema.options;
  const flags: Record<FeatureFlagKey, boolean> = {
    advanced_memory: false,
    new_model: false,
    public_reviews: false,
    experimental_renderer: false,
  };
  await Promise.all(
    keys.map(async (key) => {
      flags[key] = await isFeatureEnabled(context.env.DB, key, principal.userId);
    }),
  );
  return context.json({ flags });
});

operationsRoutes.get('/admin/operations/dashboard', async (context) => {
  requireAdmin(context.get('principal').role);
  const generatedAt = nowMs();
  const since = generatedAt - 24 * 60 * 60 * 1000;
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
       (SELECT COUNT(*) FROM product_events WHERE created_at >= ?) AS productEvents24h,
       (SELECT MAX(completed_at) FROM ai_requests WHERE status = 'COMPLETED') AS providerLastSuccessAt,
       (SELECT MAX(completed_at) FROM ai_requests WHERE status = 'FAILED') AS providerLastFailureAt`,
  )
    .bind(since, since, since, since, since, since, since)
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
      productEvents24h: number;
      providerLastSuccessAt: number | null;
      providerLastFailureAt: number | null;
    }>();
  if (!row) throw new AppError('DASHBOARD_UNAVAILABLE', 'Метрики временно недоступны.', 503);
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
  return context.json({
    ...row,
    planDistribution,
    generatedAt,
  });
});

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
