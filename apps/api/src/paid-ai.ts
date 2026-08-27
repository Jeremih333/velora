import type { Env } from './types';
import type { ModelTier } from './model-registry';

export function isPaidAiEnabled(env: Pick<Env, 'PAID_AI_ENABLED'>): boolean {
  return env.PAID_AI_ENABLED === 'true';
}

export function isGenerationTierEnabled(
  env: Pick<Env, 'PAID_AI_ENABLED' | 'SPONSORED_FREE_AI_ENABLED'>,
  tier: ModelTier,
): boolean {
  return tier === 'free'
    ? env.SPONSORED_FREE_AI_ENABLED === 'true'
    : env.PAID_AI_ENABLED === 'true';
}

export async function isPaidAiReady(input: {
  readonly enabled: string | undefined;
  readonly database: D1Database;
  readonly model: string;
}): Promise<boolean> {
  if (input.enabled !== 'true') return false;
  const row = await input.database
    .prepare(
      `SELECT CASE WHEN EXISTS (
         SELECT 1 FROM provider_smoke_runs smoke
         JOIN provider_model_capabilities capability ON capability.provider = smoke.provider
         JOIN integration_reconciliations reconciliation
           ON reconciliation.integration_key = 'bothub_provider'
         WHERE smoke.state = 'COMPLETED' AND smoke.model = ?
           AND EXISTS (SELECT 1 FROM json_each(capability.available_candidates_json)
             WHERE json_each.value = ?)
           AND reconciliation.state = 'READY'
       ) THEN 1 ELSE 0 END AS ready`,
    )
    .bind(input.model, input.model)
    .first<{ readonly ready: number }>();
  return row?.ready === 1;
}
