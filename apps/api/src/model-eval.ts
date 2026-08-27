import { AIProviderError, BotHubProvider, type AIUsage } from '@velora/ai';
import { AppError, createId, nowMs } from '@velora/shared';
import {
  ROLEPLAY_MODEL_REGISTRY,
  requireRoleplayModelProfile,
  type RoleplayModelProfile,
} from './model-registry';
import { sha256 } from './telegram-auth';
import type { Env } from './types';

// V3 invalidates the old profile-ID keyed evidence after the reviewed Free routes changed.
// A completed eval for a former provider model must never unlock its replacement.
const RUN_KEY_PREFIX = 'BOTHUB_ROLEPLAY_EVAL_V3_';
const PROTOCOL_VARIANT = 'BOTHUB_DOCUMENTED';
const MAX_OUTPUT_TOKENS = 64;
const MAX_COST_USD = 0.021;
const TIMEOUT_MS = 20_000;
const PREFLIGHT_TIMEOUT_MS = 8_000;

interface EvalRow {
  readonly runKey: string;
  readonly modelProfileId: string;
  readonly provider: 'BOTHUB';
  readonly model: string;
  readonly state: 'RUNNING' | 'COMPLETED' | 'FAILED';
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly providerReportedCostMicros: number;
  readonly conservativeCostMicros: number;
  readonly latencyMs: number | null;
  readonly outputLength: number;
  readonly errorCode: string | null;
  readonly httpStatus: number | null;
  readonly startedAt: number;
  readonly completedAt: number | null;
}

export interface ModelEvalResponse extends EvalRow {
  readonly displayName: string;
  readonly alreadyAttempted: boolean;
}

export function roleplayModelEvalCatalog() {
  return ROLEPLAY_MODEL_REGISTRY.map((profile) => ({
    modelProfileId: profile.id,
    displayName: profile.displayName,
    providerModelId: profile.providerModelId,
    tier: profile.tier,
    enabled: profile.enabled,
  }));
}

export async function readRoleplayModelEvals(
  database: D1Database,
): Promise<readonly ModelEvalResponse[]> {
  const result = await database
    .prepare(
      `SELECT run_key AS runKey, provider, model, state,
       input_tokens AS inputTokens, output_tokens AS outputTokens,
       provider_reported_cost_micros AS providerReportedCostMicros,
       conservative_cost_micros AS conservativeCostMicros, latency_ms AS latencyMs,
       output_length AS outputLength, error_code AS errorCode, http_status AS httpStatus,
       started_at AS startedAt, completed_at AS completedAt
       FROM provider_smoke_runs WHERE run_key LIKE ? ORDER BY started_at DESC`,
    )
    .bind(`${RUN_KEY_PREFIX}%`)
    .all<Omit<EvalRow, 'modelProfileId'>>();

  return result.results.flatMap((row) => {
    const profile = ROLEPLAY_MODEL_REGISTRY.find((item) => item.providerModelId === row.model);
    return profile
      ? [
          {
            ...row,
            modelProfileId: profile.id,
            displayName: profile.displayName,
            alreadyAttempted: true,
          },
        ]
      : [];
  });
}

export async function runRoleplayModelEval(
  env: Env,
  actorId: string,
  requestId: string,
  modelProfileId: string,
  fetcher: typeof fetch = fetch,
): Promise<ModelEvalResponse> {
  if (!env.BOTHUB_API_KEY) {
    throw new AppError('AI_NOT_CONFIGURED', 'BotHub пока не подключён.', 503);
  }
  const profile = requireRoleplayModelProfile(modelProfileId);
  const runKey = `${RUN_KEY_PREFIX}${profile.id}`;
  const existing = await readEvalRow(env.DB, runKey, profile);
  if (existing) return { ...existing, displayName: profile.displayName, alreadyAttempted: true };

  const provider = createProvider(env, profile, fetcher);
  await assertModelAvailable(provider, profile.providerModelId);

  const startedAt = nowMs();
  const claimed = await env.DB.prepare(
    `INSERT INTO provider_smoke_runs
      (run_key, actor_id, provider, model, state, request_id, protocol_variant, started_at)
     VALUES (?, ?, 'BOTHUB', ?, 'RUNNING', ?, ?, ?)
     ON CONFLICT(run_key) DO NOTHING`,
  )
    .bind(runKey, actorId, profile.providerModelId, requestId, PROTOCOL_VARIANT, startedAt)
    .run();
  if (claimed.meta.changes !== 1) {
    const concurrent = await readEvalRow(env.DB, runKey, profile);
    if (!concurrent) throw new AppError('AI_EVAL_STATE_LOST', 'Состояние проверки потеряно.', 503);
    return { ...concurrent, displayName: profile.displayName, alreadyAttempted: true };
  }

  await writeEvalAudit(env.DB, actorId, requestId, runKey, 'AI_MODEL_EVAL_STARTED', {
    modelProfileId: profile.id,
    model: profile.providerModelId,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

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
        model: profile.providerModelId,
        messages: [
          {
            role: 'system',
            content:
              'Ты ведёшь безопасную ролевую сцену. Ответь по-русски от лица персонажа, без пояснений и служебных шаблонов.',
          },
          {
            role: 'user',
            content:
              'Лира входит в ночной сад и слышит шаги. Продолжи сцену двумя короткими выразительными предложениями.',
          },
        ],
        temperature: 0.75,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxCostUsd: MAX_COST_USD,
      },
      abortController.signal,
    )) {
      if (event.type === 'delta') output += event.text;
      else usage = event.usage;
    }
    assertValidRoleplayOutput(output, usage);
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
        runKey,
      ),
      auditStatement(env.DB, actorId, requestId, runKey, 'AI_MODEL_EVAL_COMPLETED', completedAt, {
        modelProfileId: profile.id,
        model: profile.providerModelId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        providerReportedCostMicros,
        conservativeCostMicros,
      }),
    ]);
    const completed = await readEvalRow(env.DB, runKey, profile);
    if (!completed) throw new AppError('AI_EVAL_STATE_LOST', 'Состояние проверки потеряно.', 503);
    return { ...completed, displayName: profile.displayName, alreadyAttempted: false };
  } catch (error) {
    const completedAt = nowMs();
    const errorCode = error instanceof AIProviderError ? error.code : 'AI_MODEL_EVAL_FAILED';
    const httpStatus = error instanceof AIProviderError ? (error.status ?? null) : null;
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE provider_smoke_runs SET state = 'FAILED', latency_ms = ?, error_code = ?,
         http_status = ?, response_started = ?, output_sha256 = ?, output_length = ?,
         completed_at = ? WHERE run_key = ? AND state = 'RUNNING'`,
      ).bind(
        completedAt - startedAt,
        errorCode.slice(0, 120),
        httpStatus,
        output.length > 0 ? 1 : 0,
        output.length > 0 ? await sha256(output) : null,
        output.length,
        completedAt,
        runKey,
      ),
      auditStatement(env.DB, actorId, requestId, runKey, 'AI_MODEL_EVAL_FAILED', completedAt, {
        modelProfileId: profile.id,
        model: profile.providerModelId,
        errorCode,
        httpStatus,
      }),
    ]);
    throw new AppError(
      'AI_MODEL_EVAL_FAILED',
      'Контрольная проверка модели завершилась ошибкой.',
      503,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function createProvider(env: Env, profile: RoleplayModelProfile, fetcher: typeof fetch) {
  return new BotHubProvider({
    apiKey: env.BOTHUB_API_KEY ?? '',
    prices: { [profile.providerModelId]: profile.price },
    fetcher: (input, init) => fetcher(input, init),
    streamProtocol: PROTOCOL_VARIANT,
    ...(env.ENVIRONMENT === 'local' && env.BOTHUB_BASE_URL
      ? { endpoint: env.BOTHUB_BASE_URL }
      : {}),
    ...(env.ENVIRONMENT === 'local' && env.BOTHUB_MODELS_URL
      ? { modelsEndpoint: env.BOTHUB_MODELS_URL }
      : {}),
  });
}

async function assertModelAvailable(provider: BotHubProvider, model: string): Promise<void> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, PREFLIGHT_TIMEOUT_MS);
  try {
    const modelIds = await provider.listModelIds(abortController.signal);
    if (!modelIds.includes(model)) {
      throw new AppError(
        'AI_MODEL_UNAVAILABLE',
        'Эта модель недоступна текущему ключу BotHub.',
        503,
      );
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      'AI_MODEL_PREFLIGHT_FAILED',
      'Не удалось проверить доступность модели.',
      503,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function assertValidRoleplayOutput(
  output: string,
  usage: AIUsage | null,
): asserts usage is AIUsage {
  if (
    !usage ||
    output.trim().length < 12 ||
    output.length > 4_000 ||
    /\{\{(?:char|user)\}\}/iu.test(output)
  ) {
    throw new AIProviderError(
      'AI_MODEL_EVAL_INVALID_RESPONSE',
      'Модель вернула некорректный контрольный ответ.',
      false,
    );
  }
}

async function readEvalRow(
  database: D1Database,
  runKey: string,
  profile: RoleplayModelProfile,
): Promise<EvalRow | null> {
  return database
    .prepare(
      `SELECT run_key AS runKey, provider, model, state,
       input_tokens AS inputTokens, output_tokens AS outputTokens,
       provider_reported_cost_micros AS providerReportedCostMicros,
       conservative_cost_micros AS conservativeCostMicros, latency_ms AS latencyMs,
       output_length AS outputLength, error_code AS errorCode, http_status AS httpStatus,
       started_at AS startedAt, completed_at AS completedAt
       FROM provider_smoke_runs WHERE run_key = ?`,
    )
    .bind(runKey)
    .first<Omit<EvalRow, 'modelProfileId'>>()
    .then((row) => (row ? { ...row, modelProfileId: profile.id } : null));
}

async function writeEvalAudit(
  database: D1Database,
  actorId: string,
  requestId: string,
  runKey: string,
  action: string,
  metadata: Readonly<Record<string, unknown>>,
): Promise<void> {
  await auditStatement(database, actorId, requestId, runKey, action, nowMs(), metadata).run();
}

function auditStatement(
  database: D1Database,
  actorId: string,
  requestId: string,
  runKey: string,
  action: string,
  createdAt: number,
  metadata: Readonly<Record<string, unknown>>,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO audit_logs
       (id, actor_id, action, target_type, target_id, request_id, metadata_json, created_at)
       VALUES (?, ?, ?, 'PROVIDER', ?, ?, ?, ?)`,
    )
    .bind(createId(), actorId, action, runKey, requestId, JSON.stringify(metadata), createdAt);
}
