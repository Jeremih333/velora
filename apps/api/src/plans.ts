import { AppError, nowMs, ru } from '@velora/shared';
import { z } from 'zod';

const modelProfileSchema = z.enum(['BALANCED', 'CREATIVE', 'PREMIUM']);
const entitlementSchema = z.object({
  rateLimitMultiplier: z.number().int().min(1).max(10),
  characterLimit: z.number().int().min(1).max(1_000),
  personaLimit: z.number().int().min(1).max(100),
  memoryTokenBudget: z.number().int().min(100).max(100_000),
  loreTokenBudget: z.number().int().min(100).max(100_000),
  advancedOperationsDaily: z.number().int().min(0).max(1_000),
  modelProfiles: z.array(modelProfileSchema).min(1).max(3),
});

export type ModelProfile = z.infer<typeof modelProfileSchema>;
export interface EffectivePlan {
  readonly code: string;
  readonly displayName: string;
  readonly accessUntil: number | null;
  readonly entitlements: z.infer<typeof entitlementSchema>;
}
export type PlanEntitlements = EffectivePlan['entitlements'];

interface PlanRow {
  readonly code: string;
  readonly displayName: string;
  readonly accessUntil: number | null;
  readonly planId: string;
}

interface EntitlementRow {
  readonly entitlement: string;
  readonly valueJson: string;
}

export async function readEffectivePlan(
  database: D1Database,
  userId: string,
  timestamp = nowMs(),
): Promise<EffectivePlan> {
  const paid = await database
    .prepare(
      `SELECT p.id AS planId, p.code, p.display_name AS displayName,
       (SELECT MAX(g2.expires_at) FROM plan_access_grants g2
         WHERE g2.user_id = g.user_id AND g2.plan_code = g.plan_code
           AND g2.revoked_at IS NULL AND g2.refunded_at IS NULL) AS accessUntil
       FROM plan_access_grants g JOIN plans p ON p.code = g.plan_code
       WHERE g.user_id = ? AND g.starts_at <= ? AND g.expires_at > ?
         AND g.revoked_at IS NULL AND g.refunded_at IS NULL AND p.active = 1
       ORDER BY p.rank DESC, g.expires_at DESC, g.id DESC LIMIT 1`,
    )
    .bind(userId, timestamp, timestamp)
    .first<PlanRow>();
  const plan =
    paid ??
    (await database
      .prepare(
        `SELECT id AS planId, code, display_name AS displayName, NULL AS accessUntil
         FROM plans WHERE code = 'FREE' AND active = 1`,
      )
      .first<PlanRow>());
  if (!plan) throw new AppError('PLAN_CONFIGURATION_INVALID', ru.billing.planUnavailable, 503);
  const entitlements = await readPlanEntitlements(database, plan.planId);
  return {
    code: plan.code,
    displayName: plan.displayName,
    accessUntil: plan.accessUntil,
    entitlements,
  };
}

export async function readPlanEntitlements(
  database: D1Database,
  planId: string,
): Promise<PlanEntitlements> {
  const rows = await database
    .prepare(
      `SELECT entitlement, value_json AS valueJson FROM plan_entitlements
       WHERE plan_id = ? ORDER BY entitlement`,
    )
    .bind(planId)
    .all<EntitlementRow>();
  const raw: Record<string, unknown> = {};
  for (const row of rows.results) {
    try {
      raw[toCamelCase(row.entitlement)] = JSON.parse(row.valueJson) as unknown;
    } catch {
      throw new AppError('PLAN_CONFIGURATION_INVALID', ru.billing.planUnavailable, 503);
    }
  }
  const parsed = entitlementSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError('PLAN_CONFIGURATION_INVALID', ru.billing.planUnavailable, 503);
  }
  return parsed.data;
}

export function requireModelProfile(plan: EffectivePlan, requested: ModelProfile): void {
  if (!plan.entitlements.modelProfiles.includes(requested)) {
    throw new AppError('PLAN_ENTITLEMENT_REQUIRED', ru.billing.planRequired, 403, [
      { entitlement: 'model_profiles', plan: plan.code },
    ]);
  }
}

export async function requirePlanResourceCapacity(
  database: D1Database,
  userId: string,
  resource: 'CHARACTER' | 'PERSONA',
): Promise<void> {
  const plan = await readEffectivePlan(database, userId);
  const row = await (resource === 'CHARACTER'
    ? database
        .prepare(
          'SELECT COUNT(*) AS count FROM characters WHERE owner_id = ? AND deleted_at IS NULL',
        )
        .bind(userId)
        .first<{ count: number }>()
    : database
        .prepare('SELECT COUNT(*) AS count FROM personas WHERE user_id = ? AND deleted_at IS NULL')
        .bind(userId)
        .first<{ count: number }>());
  const limit =
    resource === 'CHARACTER' ? plan.entitlements.characterLimit : plan.entitlements.personaLimit;
  if ((row?.count ?? 0) >= limit) {
    throw new AppError('PLAN_RESOURCE_LIMIT_REACHED', ru.billing.planLimitReached, 403, [
      { resource, limit, plan: plan.code },
    ]);
  }
}

export async function reserveAdvancedOperation(
  database: D1Database,
  userId: string,
  operationKey: string,
  operation: string,
  timestamp = nowMs(),
): Promise<void> {
  const plan = await readEffectivePlan(database, userId, timestamp);
  const usageDate = new Date(timestamp).toISOString().slice(0, 10);
  const result = await database
    .prepare(
      `INSERT INTO plan_operation_usage
       (user_id, operation_key, usage_date, operation, created_at)
       SELECT ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM plan_operation_usage
         WHERE user_id = ? AND usage_date = ?) < ?
       ON CONFLICT(user_id, operation_key) DO NOTHING`,
    )
    .bind(
      userId,
      operationKey,
      usageDate,
      operation,
      timestamp,
      userId,
      usageDate,
      plan.entitlements.advancedOperationsDaily,
    )
    .run();
  if (result.meta.changes === 1) return;
  const replay = await database
    .prepare('SELECT 1 AS found FROM plan_operation_usage WHERE user_id = ? AND operation_key = ?')
    .bind(userId, operationKey)
    .first<{ found: number }>();
  if (replay) return;
  throw new AppError('PLAN_DAILY_OPERATION_LIMIT_REACHED', ru.billing.planLimitReached, 403, [
    {
      resource: 'ADVANCED_OPERATION',
      limit: plan.entitlements.advancedOperationsDaily,
      plan: plan.code,
    },
  ]);
}

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/gu, (_match, letter: string) => letter.toUpperCase());
}
