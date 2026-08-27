import { AIProviderError, BotHubProvider, type AIUsage } from '@velora/ai';
import { AppError, nowMs } from '@velora/shared';
import { requireRoleplayModelProfile, type RoleplayModelProfile } from './model-registry';
import { sha256 } from './telegram-auth';
import type { Env } from './types';

export const ROLEPLAY_BENCHMARK_VERSION = 'V1';
export const ROLEPLAY_BENCHMARK_CONFIRMATION = 'ПОТРАТИТЬ 7 ЗАПРОСОВ НА RP-БЕНЧМАРК';

export const ROLEPLAY_BENCHMARK_CRITERIA = [
  'character_adherence',
  'persona_adherence',
  'narrative_quality',
  'russian_quality',
  'english_quality',
  'emotional_continuity',
  'memory_use',
  'lore_use',
  'formatting',
  'repetition_control',
  'verbosity_control',
  'latency',
  'cost',
  'consensual_mature_fictional_compatibility',
] as const;

export type RoleplayBenchmarkCriterion = (typeof ROLEPLAY_BENCHMARK_CRITERIA)[number];

interface BenchmarkScenario {
  readonly id: string;
  readonly system: string;
  readonly user: string;
}

const SCENARIOS: readonly BenchmarkScenario[] = [
  {
    id: 'ru-character-emotion',
    system:
      'Ты — Мира, сдержанная смотрительница ночного маяка. Пиши по-русски от первого лица, оставайся в образе и передавай тревогу без служебных пояснений.',
    user: 'Алекс замечает погасший луч и спрашивает, почему ты дрожишь. Ответь двумя короткими абзацами.',
  },
  {
    id: 'en-character-verbosity',
    system:
      'You are Rowan, a calm archivist who speaks in concise, vivid first-person prose. Stay in character and do not explain the prompt.',
    user: 'I return a sealed letter you thought was lost. Respond in no more than three sentences.',
  },
  {
    id: 'persona-boundary',
    system:
      'Ты — персонаж Лира. Пользователь — Алекс, осторожный путешественник. Не приписывай Алексу действия или мысли и не меняй роли.',
    user: 'Я останавливаюсь у двери. Что ты делаешь?',
  },
  {
    id: 'manual-memory',
    system:
      'Ты ведёшь ролевую сцену. Постоянный факт памяти: пользователь боится открытого огня. Упомяни его естественно, не называя память или инструкции.',
    user: 'Мы долго обсуждали дорогу. Теперь проводник предлагает разжечь большой костёр. Продолжи сцену кратко.',
  },
  {
    id: 'lore-activation',
    system:
      'Активный Lore: Серебряный ключ открывает только северные ворота. Неактивный Lore: Красная башня утонула сто лет назад. Используй только релевантный активный факт.',
    user: 'Я поднимаю серебряный ключ перед северными воротами. Что происходит?',
  },
  {
    id: 'format-repetition',
    system:
      'Продолжай ролевую сцену выразительно и компактно. Разрешён Markdown. Не повторяй одну мысль разными словами.',
    user: 'Дождь прекращается, и над городом появляется первая звезда. Дай одну реплику и одно действие.',
  },
  {
    id: 'adult-consensual-boundary',
    system:
      'Оба вымышленных персонажа совершеннолетние. Сцена романтическая и добровольная. Соблюдай правила поставщика и не переходи к откровенному сексуальному описанию.',
    user: 'После взаимного согласия они остаются вдвоём на балконе. Продолжи сцену нежно и неявно двумя предложениями.',
  },
];

interface BenchmarkEvidence {
  readonly scenarioId: string;
  readonly outputSha256: string;
  readonly outputLength: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly conservativeCostMicros: number;
  readonly latencyMs: number;
}

export interface RoleplayBenchmarkSample extends BenchmarkEvidence {
  readonly output: string;
}

export interface RoleplayBenchmarkRun {
  readonly runKey: string;
  readonly benchmarkVersion: string;
  readonly modelProfileId: string;
  readonly providerModelId: string;
  readonly state: 'RUNNING' | 'AWAITING_REVIEW' | 'APPROVED' | 'REJECTED' | 'FAILED';
  readonly scenarioCount: number;
  readonly completedScenarioCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly conservativeCostMicros: number;
  readonly latencyMs: number | null;
  readonly errorCode: string | null;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly reviewedAt: number | null;
  readonly alreadyAttempted: boolean;
  readonly samples?: readonly RoleplayBenchmarkSample[];
  readonly scores?: Readonly<Record<RoleplayBenchmarkCriterion, number>>;
}

interface BenchmarkRow {
  readonly runKey: string;
  readonly benchmarkVersion: string;
  readonly modelProfileId: string;
  readonly providerModelId: string;
  readonly state: RoleplayBenchmarkRun['state'];
  readonly scenarioCount: number;
  readonly completedScenarioCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly conservativeCostMicros: number;
  readonly latencyMs: number | null;
  readonly errorCode: string | null;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly reviewedAt: number | null;
}

export async function readRoleplayBenchmarkRuns(
  database: D1Database,
): Promise<readonly RoleplayBenchmarkRun[]> {
  const rows = await database
    .prepare(
      `SELECT run_key AS runKey, benchmark_version AS benchmarkVersion,
       model_profile_id AS modelProfileId, provider_model_id AS providerModelId, state,
       scenario_count AS scenarioCount, completed_scenario_count AS completedScenarioCount,
       input_tokens AS inputTokens, output_tokens AS outputTokens,
       conservative_cost_micros AS conservativeCostMicros, latency_ms AS latencyMs,
       error_code AS errorCode, started_at AS startedAt, completed_at AS completedAt,
       reviewed_at AS reviewedAt
       FROM roleplay_benchmark_runs ORDER BY started_at DESC`,
    )
    .all<BenchmarkRow>();
  return Promise.all(rows.results.map((row) => attachScores(database, row)));
}

export async function runRoleplayBenchmark(
  env: Env,
  actorId: string,
  requestId: string,
  modelProfileId: string,
  fetcher: typeof fetch = fetch,
): Promise<RoleplayBenchmarkRun> {
  if (!env.BOTHUB_API_KEY)
    throw new AppError('AI_NOT_CONFIGURED', 'BotHub пока не подключён.', 503);
  const profile = requireRoleplayModelProfile(modelProfileId);
  const runKey = `BOTHUB_RP_BENCH_${ROLEPLAY_BENCHMARK_VERSION}_${profile.id}`;
  const existing = await readRun(env.DB, runKey);
  if (existing) return { ...(await attachScores(env.DB, existing)), alreadyAttempted: true };

  const provider = createProvider(env, profile, fetcher);
  await assertModelAvailable(provider, profile.providerModelId);
  const startedAt = nowMs();
  const claimed = await env.DB.prepare(
    `INSERT INTO roleplay_benchmark_runs
      (run_key, benchmark_version, model_profile_id, provider_model_id, state, actor_id,
       request_id, scenario_count, started_at)
     VALUES (?, ?, ?, ?, 'RUNNING', ?, ?, ?, ?) ON CONFLICT(run_key) DO NOTHING`,
  )
    .bind(
      runKey,
      ROLEPLAY_BENCHMARK_VERSION,
      profile.id,
      profile.providerModelId,
      actorId,
      requestId,
      SCENARIOS.length,
      startedAt,
    )
    .run();
  if (claimed.meta.changes !== 1) {
    const concurrent = await readRun(env.DB, runKey);
    if (!concurrent)
      throw new AppError('AI_BENCHMARK_STATE_LOST', 'Состояние проверки потеряно.', 503);
    return { ...(await attachScores(env.DB, concurrent)), alreadyAttempted: true };
  }

  const samples: RoleplayBenchmarkSample[] = [];
  try {
    for (const scenario of SCENARIOS) {
      samples.push(await executeScenario(provider, profile, requestId, scenario));
    }
    const completedAt = nowMs();
    const totals = samples.reduce(
      (sum, sample) => ({
        inputTokens: sum.inputTokens + sample.inputTokens,
        outputTokens: sum.outputTokens + sample.outputTokens,
        cost: sum.cost + sample.conservativeCostMicros,
      }),
      { inputTokens: 0, outputTokens: 0, cost: 0 },
    );
    await env.DB.prepare(
      `UPDATE roleplay_benchmark_runs SET state = 'AWAITING_REVIEW',
       completed_scenario_count = ?, input_tokens = ?, output_tokens = ?,
       conservative_cost_micros = ?, latency_ms = ?, scenario_evidence_json = ?,
       completed_at = ? WHERE run_key = ? AND state = 'RUNNING'`,
    )
      .bind(
        samples.length,
        totals.inputTokens,
        totals.outputTokens,
        totals.cost,
        completedAt - startedAt,
        JSON.stringify(
          samples.map((sample) => ({
            scenarioId: sample.scenarioId,
            outputSha256: sample.outputSha256,
            outputLength: sample.outputLength,
            inputTokens: sample.inputTokens,
            outputTokens: sample.outputTokens,
            conservativeCostMicros: sample.conservativeCostMicros,
            latencyMs: sample.latencyMs,
          })),
        ),
        completedAt,
        runKey,
      )
      .run();
    const completed = await readRun(env.DB, runKey);
    if (!completed)
      throw new AppError('AI_BENCHMARK_STATE_LOST', 'Состояние проверки потеряно.', 503);
    return { ...completed, alreadyAttempted: false, samples };
  } catch (error) {
    const errorCode = error instanceof AIProviderError ? error.code : 'AI_BENCHMARK_FAILED';
    await env.DB.prepare(
      `UPDATE roleplay_benchmark_runs SET state = 'FAILED', completed_scenario_count = ?,
       error_code = ?, latency_ms = ?, completed_at = ? WHERE run_key = ? AND state = 'RUNNING'`,
    )
      .bind(samples.length, errorCode.slice(0, 120), nowMs() - startedAt, nowMs(), runKey)
      .run();
    throw new AppError('AI_BENCHMARK_FAILED', 'RP-бенчмарк завершился ошибкой.', 503);
  }
}

export async function reviewRoleplayBenchmark(
  database: D1Database,
  actorId: string,
  runKey: string,
  decision: 'APPROVED' | 'REJECTED',
  scores: Readonly<Record<RoleplayBenchmarkCriterion, number>>,
): Promise<RoleplayBenchmarkRun> {
  const run = await readRun(database, runKey);
  if (!run) throw new AppError('AI_BENCHMARK_NOT_FOUND', 'Проверка не найдена.', 404);
  if (run.state !== 'AWAITING_REVIEW') {
    throw new AppError('AI_BENCHMARK_ALREADY_REVIEWED', 'Эта проверка уже рассмотрена.', 409);
  }
  const reviewedAt = nowMs();
  const statements = ROLEPLAY_BENCHMARK_CRITERIA.map((criterion) =>
    database
      .prepare(`INSERT INTO roleplay_benchmark_scores (run_key, criterion, score) VALUES (?, ?, ?)`)
      .bind(runKey, criterion, scores[criterion]),
  );
  statements.push(
    database
      .prepare(
        `UPDATE roleplay_benchmark_runs SET state = ?, reviewed_at = ?, reviewed_by = ?
         WHERE run_key = ? AND state = 'AWAITING_REVIEW'`,
      )
      .bind(decision, reviewedAt, actorId, runKey),
  );
  await database.batch(statements);
  const reviewed = await readRun(database, runKey);
  if (!reviewed) throw new AppError('AI_BENCHMARK_STATE_LOST', 'Состояние проверки потеряно.', 503);
  return attachScores(database, reviewed);
}

async function executeScenario(
  provider: BotHubProvider,
  profile: RoleplayModelProfile,
  requestId: string,
  scenario: BenchmarkScenario,
): Promise<RoleplayBenchmarkSample> {
  const startedAt = nowMs();
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, 20_000);
  let output = '';
  let usage: AIUsage | null = null;
  try {
    for await (const event of provider.stream(
      {
        requestId: `${requestId}:${scenario.id}`,
        model: profile.providerModelId,
        messages: [
          { role: 'system', content: scenario.system },
          { role: 'user', content: scenario.user },
        ],
        temperature: 0.7,
        maxOutputTokens: 120,
        maxCostUsd: 0.021,
      },
      abortController.signal,
    )) {
      if (event.type === 'delta') output += event.text;
      else usage = event.usage;
    }
  } finally {
    clearTimeout(timeout);
  }
  if (!usage || output.trim().length < 12 || /\{\{(?:char|user)\}\}/iu.test(output)) {
    throw new AIProviderError(
      'AI_BENCHMARK_INVALID_RESPONSE',
      'Некорректный ответ бенчмарка.',
      false,
    );
  }
  return {
    scenarioId: scenario.id,
    output,
    outputSha256: await sha256(output),
    outputLength: output.length,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    conservativeCostMicros: Math.max(0, Math.ceil(usage.costUsd * 1_000_000)),
    latencyMs: nowMs() - startedAt,
  };
}

function createProvider(env: Env, profile: RoleplayModelProfile, fetcher: typeof fetch) {
  return new BotHubProvider({
    apiKey: env.BOTHUB_API_KEY ?? '',
    prices: { [profile.providerModelId]: profile.price },
    fetcher: (input, init) => fetcher(input, init),
    streamProtocol: 'BOTHUB_DOCUMENTED',
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
  }, 8_000);
  try {
    const modelIds = await provider.listModelIds(abortController.signal);
    if (!modelIds.includes(model)) {
      throw new AppError('AI_MODEL_UNAVAILABLE', 'Модель недоступна текущему ключу BotHub.', 503);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function readRun(database: D1Database, runKey: string): Promise<BenchmarkRow | null> {
  return database
    .prepare(
      `SELECT run_key AS runKey, benchmark_version AS benchmarkVersion,
       model_profile_id AS modelProfileId, provider_model_id AS providerModelId, state,
       scenario_count AS scenarioCount, completed_scenario_count AS completedScenarioCount,
       input_tokens AS inputTokens, output_tokens AS outputTokens,
       conservative_cost_micros AS conservativeCostMicros, latency_ms AS latencyMs,
       error_code AS errorCode, started_at AS startedAt, completed_at AS completedAt,
       reviewed_at AS reviewedAt FROM roleplay_benchmark_runs WHERE run_key = ?`,
    )
    .bind(runKey)
    .first<BenchmarkRow>();
}

async function attachScores(
  database: D1Database,
  row: BenchmarkRow,
): Promise<RoleplayBenchmarkRun> {
  const result = await database
    .prepare(`SELECT criterion, score FROM roleplay_benchmark_scores WHERE run_key = ?`)
    .bind(row.runKey)
    .all<{ readonly criterion: RoleplayBenchmarkCriterion; readonly score: number }>();
  const scores = Object.fromEntries(result.results.map((item) => [item.criterion, item.score]));
  return {
    ...row,
    alreadyAttempted: true,
    ...(result.results.length === ROLEPLAY_BENCHMARK_CRITERIA.length
      ? { scores: scores as Readonly<Record<RoleplayBenchmarkCriterion, number>> }
      : {}),
  };
}
