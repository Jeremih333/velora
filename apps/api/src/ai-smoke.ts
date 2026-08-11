import { AIProviderError, BotHubProvider, type AIUsage, type ModelPrice } from '@velora/ai';
import { AppError, createId, nowMs, ru } from '@velora/shared';
import { sha256 } from './telegram-auth';
import type { Env } from './types';

const RUN_KEY = 'BOTHUB_INITIAL_ROLEPLAY_V3';
const MODEL = 'deepseek-chat-v3.1';
const PROTOCOL_VARIANT = 'BOTHUB_DOCUMENTED';
const MAX_OUTPUT_TOKENS = 32;
const TIMEOUT_MS = 20_000;
const PREFLIGHT_TIMEOUT_MS = 8_000;
const PRICE: ModelPrice = {
  inputPerMillionUsd: 0.41,
  outputPerMillionUsd: 1.55,
  fixedRequestUsd: 0.02,
};

interface SmokeRow {
  readonly runKey: string;
  readonly provider: 'BOTHUB';
  readonly model: string;
  readonly state: 'RUNNING' | 'COMPLETED' | 'FAILED';
  readonly protocolVariant: 'OPENAI_INCLUDE_USAGE' | 'BOTHUB_DOCUMENTED';
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
  readonly providerReportedCostMicros: number;
  readonly conservativeCostMicros: number;
  readonly latencyMs: number | null;
  readonly outputLength: number;
  readonly errorCode: string | null;
  readonly httpStatus: number | null;
  readonly responseStarted: boolean;
  readonly startedAt: number;
  readonly completedAt: number | null;
}

export interface SmokeResponse extends SmokeRow {
  readonly alreadyAttempted: boolean;
  readonly output?: string;
}

export async function readAiSmoke(database: D1Database): Promise<SmokeResponse | null> {
  const row = await readSmokeRow(database);
  return row ? { ...row, alreadyAttempted: true } : null;
}

export async function readAiSmokeHistory(database: D1Database): Promise<readonly SmokeResponse[]> {
  const result = await database
    .prepare(
      `SELECT run_key AS runKey, provider, model, state, protocol_variant AS protocolVariant,
       input_tokens AS inputTokens, output_tokens AS outputTokens, cached_tokens AS cachedTokens,
       provider_reported_cost_micros AS providerReportedCostMicros,
       conservative_cost_micros AS conservativeCostMicros, latency_ms AS latencyMs,
       output_length AS outputLength, error_code AS errorCode, http_status AS httpStatus,
       response_started AS responseStarted, started_at AS startedAt, completed_at AS completedAt
       FROM provider_smoke_runs ORDER BY started_at DESC LIMIT 10`,
    )
    .all<Omit<SmokeRow, 'responseStarted'> & { readonly responseStarted: number }>();
  return result.results.map((row) => ({
    ...row,
    responseStarted: row.responseStarted === 1,
    alreadyAttempted: true,
  }));
}

export async function runAiSmoke(
  env: Env,
  actorId: string,
  requestId: string,
  fetcher: typeof fetch = fetch,
): Promise<SmokeResponse> {
  if (!env.BOTHUB_API_KEY) throw new AppError('AI_NOT_CONFIGURED', ru.aiSmoke.notConfigured, 503);
  const provider = new BotHubProvider({
    apiKey: env.BOTHUB_API_KEY,
    prices: { [MODEL]: PRICE },
    fetcher: (input, init) => fetcher(input, init),
    streamProtocol: PROTOCOL_VARIANT,
    ...(env.ENVIRONMENT === 'local' && env.BOTHUB_BASE_URL
      ? { endpoint: env.BOTHUB_BASE_URL }
      : {}),
    ...(env.ENVIRONMENT === 'local' && env.BOTHUB_MODELS_URL
      ? { modelsEndpoint: env.BOTHUB_MODELS_URL }
      : {}),
  });
  const preflightAbort = new AbortController();
  const preflightTimeout = setTimeout(() => {
    preflightAbort.abort();
  }, PREFLIGHT_TIMEOUT_MS);
  try {
    const modelIds = await provider.listModelIds(preflightAbort.signal);
    if (!modelIds.includes(MODEL)) {
      throw new AppError('AI_MODEL_UNAVAILABLE', ru.aiSmoke.modelUnavailable, 503);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('AI_MODEL_PREFLIGHT_FAILED', ru.aiSmoke.modelUnavailable, 503);
  } finally {
    clearTimeout(preflightTimeout);
  }
  const startedAt = nowMs();
  const claimed = await env.DB.prepare(
    `INSERT INTO provider_smoke_runs
      (run_key, actor_id, provider, model, state, request_id, protocol_variant, started_at)
     VALUES (?, ?, 'BOTHUB', ?, 'RUNNING', ?, ?, ?)
     ON CONFLICT(run_key) DO NOTHING`,
  )
    .bind(RUN_KEY, actorId, MODEL, requestId, PROTOCOL_VARIANT, startedAt)
    .run();
  if (claimed.meta.changes !== 1) {
    const existing = await readSmokeRow(env.DB);
    if (!existing) throw new AppError('AI_SMOKE_STATE_LOST', ru.aiSmoke.failed, 503);
    return { ...existing, alreadyAttempted: true };
  }

  await env.DB.prepare(
    `INSERT INTO audit_logs
      (id, actor_id, action, target_type, target_id, request_id, metadata_json, created_at)
     VALUES (?, ?, 'AI_SMOKE_STARTED', 'PROVIDER', ?, ?, ?, ?)`,
  )
    .bind(
      createId(),
      actorId,
      RUN_KEY,
      requestId,
      JSON.stringify({ provider: 'BOTHUB', model: MODEL, maxOutputTokens: MAX_OUTPUT_TOKENS }),
      startedAt,
    )
    .run();

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, TIMEOUT_MS);
  let output = '';
  let usage: AIUsage | null = null;
  try {
    for await (const event of provider.stream(
      {
        requestId,
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: 'Ты рассказчик в безопасной ролевой сцене. Ответь одной короткой фразой.',
          },
          { role: 'user', content: 'Герой открывает дверь в ночной сад.' },
        ],
        temperature: 0.7,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxCostUsd: 0.021,
      },
      abortController.signal,
    )) {
      if (event.type === 'delta') output += event.text;
      else usage = event.usage;
    }
    if (!usage || output.length === 0 || output.length > 2_000) {
      throw new AIProviderError('AI_SMOKE_INVALID_RESPONSE', ru.aiSmoke.failed, false);
    }
    const completedAt = nowMs();
    const providerReportedCostMicros = Math.max(
      0,
      Math.ceil((usage.providerReportedCostUsd ?? 0) * 1_000_000),
    );
    const conservativeCostMicros = Math.max(0, Math.ceil(usage.costUsd * 1_000_000));
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE provider_smoke_runs SET state = 'COMPLETED', input_tokens = ?,
         output_tokens = ?, cached_tokens = ?, provider_reported_cost_micros = ?,
         conservative_cost_micros = ?, latency_ms = ?, output_sha256 = ?, output_length = ?,
         response_started = 1, completed_at = ?, error_code = NULL, http_status = 200
         WHERE run_key = ? AND state = 'RUNNING'`,
      ).bind(
        usage.inputTokens,
        usage.outputTokens,
        usage.cachedInputTokens,
        providerReportedCostMicros,
        conservativeCostMicros,
        completedAt - startedAt,
        await sha256(output),
        output.length,
        completedAt,
        RUN_KEY,
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs
          (id, actor_id, action, target_type, target_id, request_id, metadata_json, created_at)
         VALUES (?, ?, 'AI_SMOKE_COMPLETED', 'PROVIDER', ?, ?, ?, ?)`,
      ).bind(
        createId(),
        actorId,
        RUN_KEY,
        requestId,
        JSON.stringify({
          provider: 'BOTHUB',
          model: MODEL,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          providerReportedCostMicros,
          conservativeCostMicros,
        }),
        completedAt,
      ),
    ]);
    const completed = await readSmokeRow(env.DB);
    if (!completed) throw new AppError('AI_SMOKE_STATE_LOST', ru.aiSmoke.failed, 503);
    return { ...completed, alreadyAttempted: false, output };
  } catch (error) {
    const completedAt = nowMs();
    const errorCode = error instanceof AIProviderError ? error.code : 'AI_SMOKE_INTERNAL_ERROR';
    const httpStatus = error instanceof AIProviderError ? (error.status ?? null) : null;
    const responseStarted = output.length > 0;
    const outputHash = responseStarted ? await sha256(output) : null;
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE provider_smoke_runs SET state = 'FAILED', latency_ms = ?, error_code = ?,
         http_status = ?, response_started = ?, output_sha256 = ?, output_length = ?,
         completed_at = ? WHERE run_key = ? AND state = 'RUNNING'`,
      ).bind(
        completedAt - startedAt,
        errorCode.slice(0, 120),
        httpStatus,
        responseStarted ? 1 : 0,
        outputHash,
        output.length,
        completedAt,
        RUN_KEY,
      ),
      env.DB.prepare(
        `INSERT INTO audit_logs
          (id, actor_id, action, target_type, target_id, request_id, metadata_json, created_at)
         VALUES (?, ?, 'AI_SMOKE_FAILED', 'PROVIDER', ?, ?, ?, ?)`,
      ).bind(
        createId(),
        actorId,
        RUN_KEY,
        requestId,
        JSON.stringify({
          provider: 'BOTHUB',
          model: MODEL,
          protocolVariant: PROTOCOL_VARIANT,
          errorCode,
          httpStatus,
          responseStarted,
        }),
        completedAt,
      ),
    ]);
    throw new AppError('AI_SMOKE_FAILED', ru.aiSmoke.failed, 503);
  } finally {
    clearTimeout(timeout);
  }
}

async function readSmokeRow(database: D1Database): Promise<SmokeRow | null> {
  return database
    .prepare(
      `SELECT run_key AS runKey, provider, model, state, protocol_variant AS protocolVariant,
       input_tokens AS inputTokens, output_tokens AS outputTokens, cached_tokens AS cachedTokens,
       provider_reported_cost_micros AS providerReportedCostMicros,
       conservative_cost_micros AS conservativeCostMicros, latency_ms AS latencyMs,
       output_length AS outputLength, error_code AS errorCode, http_status AS httpStatus,
       response_started AS responseStarted,
       started_at AS startedAt, completed_at AS completedAt
       FROM provider_smoke_runs WHERE run_key = ?`,
    )
    .bind(RUN_KEY)
    .first<Omit<SmokeRow, 'responseStarted'> & { readonly responseStarted: number }>()
    .then((row) => (row ? { ...row, responseStarted: row.responseStarted === 1 } : null));
}
