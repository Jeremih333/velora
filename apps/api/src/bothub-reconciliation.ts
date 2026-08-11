import { BotHubProvider } from '@velora/ai';
import { nowMs } from '@velora/shared';
import { ROLEPLAY_MODEL_CANDIDATES } from './bothub-models';
import { sha256 } from './telegram-auth';
import type { Env } from './types';

const INTEGRATION_KEY = 'bothub_provider';
const LEASE_MS = 2 * 60 * 1000;
const VERIFY_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RETRY_BASE_MS = 5 * 60 * 1000;
const HEALTH_TIMEOUT_MS = 8_000;
const DEFAULT_MODELS_ENDPOINT = 'https://openai.bothub.chat/v1/models';

interface ReconciliationRow {
  readonly desiredHash: string;
  readonly attempts: number;
  readonly nextAttemptAt: number;
}

export type BotHubReconciliationResult = 'not_configured' | 'skipped' | 'ready' | 'failed';

export async function reconcileBotHubProvider(
  env: Env,
  timestamp = nowMs(),
  fetcher: typeof fetch = fetch,
): Promise<BotHubReconciliationResult> {
  if (!env.BOTHUB_API_KEY) return 'not_configured';
  const modelsEndpoint =
    env.ENVIRONMENT === 'local' && env.BOTHUB_MODELS_URL
      ? env.BOTHUB_MODELS_URL
      : DEFAULT_MODELS_ENDPOINT;
  const desiredHash = await sha256(
    `bothub-health-v3:${modelsEndpoint}:${ROLEPLAY_MODEL_CANDIDATES.map(({ model }) => model).join(',')}`,
  );
  const current = await env.DB.prepare(
    `SELECT desired_hash AS desiredHash, attempts, next_attempt_at AS nextAttemptAt
     FROM integration_reconciliations WHERE integration_key = ?`,
  )
    .bind(INTEGRATION_KEY)
    .first<ReconciliationRow>();
  if (current?.desiredHash === desiredHash && current.nextAttemptAt > timestamp) return 'skipped';

  const lease = await env.DB.prepare(
    `INSERT INTO integration_reconciliations
       (integration_key, desired_hash, state, attempts, next_attempt_at, updated_at)
     VALUES (?, ?, 'APPLYING', 1, ?, ?)
     ON CONFLICT(integration_key) DO UPDATE SET
       desired_hash = excluded.desired_hash,
       state = 'APPLYING',
       attempts = CASE WHEN integration_reconciliations.desired_hash = excluded.desired_hash
         THEN MIN(10, integration_reconciliations.attempts + 1) ELSE 1 END,
       next_attempt_at = excluded.next_attempt_at,
       last_error_code = NULL,
       updated_at = excluded.updated_at
     WHERE integration_reconciliations.desired_hash != excluded.desired_hash
        OR integration_reconciliations.next_attempt_at <= ?
     RETURNING attempts`,
  )
    .bind(INTEGRATION_KEY, desiredHash, timestamp + LEASE_MS, timestamp, timestamp)
    .first<{ attempts: number }>();
  if (!lease) return 'skipped';

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, HEALTH_TIMEOUT_MS);
  try {
    const provider = new BotHubProvider({
      apiKey: env.BOTHUB_API_KEY,
      prices: {},
      fetcher: (input, init) => fetcher(input, init),
      modelsEndpoint,
    });
    const modelIds = await provider.listModelIds(abortController.signal);
    const modelIdSet = new Set(modelIds);
    const availableCandidates = ROLEPLAY_MODEL_CANDIDATES.map(({ model }) => model).filter(
      (model) => modelIdSet.has(model),
    );
    const selectedModel = availableCandidates[0] ?? null;
    const catalogSha256 = await sha256([...modelIdSet].sort().join('\n'));
    await env.DB.prepare(
      `INSERT INTO provider_model_capabilities
        (provider, catalog_sha256, available_candidates_json, selected_model, checked_at)
       VALUES ('BOTHUB', ?, ?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET catalog_sha256 = excluded.catalog_sha256,
         available_candidates_json = excluded.available_candidates_json,
         selected_model = excluded.selected_model, checked_at = excluded.checked_at`,
    )
      .bind(catalogSha256, JSON.stringify(availableCandidates), selectedModel, timestamp)
      .run();
    if (!selectedModel) {
      throw new Error('BOTHUB_NO_ROLEPLAY_CANDIDATE');
    }
    await env.DB.prepare(
      `UPDATE integration_reconciliations SET state = 'READY', attempts = 0,
       next_attempt_at = ?, verified_at = ?, last_error_code = NULL, updated_at = ?
       WHERE integration_key = ? AND desired_hash = ? AND state = 'APPLYING'`,
    )
      .bind(timestamp + VERIFY_INTERVAL_MS, timestamp, timestamp, INTEGRATION_KEY, desiredHash)
      .run();
    return 'ready';
  } catch (error) {
    const errorCode =
      error instanceof DOMException && error.name === 'AbortError'
        ? 'BOTHUB_HEALTH_TIMEOUT'
        : error instanceof Error && error.message === 'BOTHUB_NO_ROLEPLAY_CANDIDATE'
          ? 'BOTHUB_NO_ROLEPLAY_CANDIDATE'
          : 'BOTHUB_HEALTH_FAILED';
    const retryDelay = Math.min(VERIFY_INTERVAL_MS, RETRY_BASE_MS * 2 ** (lease.attempts - 1));
    await env.DB.prepare(
      `UPDATE integration_reconciliations SET state = 'FAILED', next_attempt_at = ?,
       last_error_code = ?, updated_at = ?
       WHERE integration_key = ? AND desired_hash = ? AND state = 'APPLYING'`,
    )
      .bind(timestamp + retryDelay, errorCode, timestamp, INTEGRATION_KEY, desiredHash)
      .run();
    return 'failed';
  } finally {
    clearTimeout(timeout);
  }
}
