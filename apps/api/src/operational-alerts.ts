import { createId, nowMs } from '@velora/shared';
import { sendTelegramCommandReply } from './telegram-webhook';
import { telegramApiLocation } from './telegram-api';
import type { Env } from './types';

export type OperationalSeverity = 'WARNING' | 'CRITICAL';

export interface OperationalSignal {
  readonly key: string;
  readonly severity: OperationalSeverity;
  readonly summary: string;
  readonly details: Readonly<Record<string, number | string>>;
}

interface SignalMetrics {
  readonly deadJobs: number;
  readonly failedDeletions: number;
  readonly repeatedTelegramFailures: number;
  readonly stuckPayments: number;
  readonly aiTotal15m: number;
  readonly aiFailed15m: number;
  readonly dailySpend: number;
  readonly monthlySpend: number;
  readonly lifetimeSpend: number;
}

interface AlertRow {
  readonly id: string;
  readonly alertKey: string;
  readonly severity: OperationalSeverity;
  readonly summary: string;
  readonly lastNotifiedAt: number | null;
}

const MIN_AI_SAMPLE = 20;
const WARNING_RATIO = 0.8;
const CRITICAL_RATIO = 0.95;
const WARNING_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const CRITICAL_COOLDOWN_MS = 60 * 60 * 1000;
const LEASE_MS = 2 * 60 * 1000;

export function deriveOperationalSignals(
  metrics: SignalMetrics,
  limits: { readonly daily: number; readonly monthly: number; readonly lifetime: number },
): readonly OperationalSignal[] {
  const signals: OperationalSignal[] = [];
  addCountSignal(signals, 'jobs.dead', metrics.deadJobs, 'Фоновые задания перешли в DEAD');
  addCountSignal(
    signals,
    'accounts.deletion_failed',
    metrics.failedDeletions,
    'Удаление аккаунтов завершилось ошибкой',
  );
  addCountSignal(
    signals,
    'telegram.repeated_failures',
    metrics.repeatedTelegramFailures,
    'Telegram updates повторно завершаются ошибкой',
  );
  addCountSignal(
    signals,
    'payments.stuck',
    metrics.stuckPayments,
    'Платёж или начисление прав зависли',
  );
  if (metrics.aiTotal15m >= MIN_AI_SAMPLE && metrics.aiFailed15m / metrics.aiTotal15m >= 0.25) {
    signals.push({
      key: 'ai.failure_rate',
      severity: metrics.aiFailed15m / metrics.aiTotal15m >= 0.5 ? 'CRITICAL' : 'WARNING',
      summary: 'Повышенная доля ошибок AI за 15 минут',
      details: { failed: metrics.aiFailed15m, total: metrics.aiTotal15m },
    });
  }
  addBudgetSignal(signals, 'budget.daily', metrics.dailySpend, limits.daily, 'Дневной AI-бюджет');
  addBudgetSignal(
    signals,
    'budget.monthly',
    metrics.monthlySpend,
    limits.monthly,
    'Месячный AI-бюджет',
  );
  addBudgetSignal(
    signals,
    'budget.lifetime',
    metrics.lifetimeSpend,
    limits.lifetime,
    'Общий AI-бюджет',
  );
  return signals;
}

export function shouldNotifyAlert(
  severity: OperationalSeverity,
  lastNotifiedAt: number | null,
  timestamp: number,
): boolean {
  if (lastNotifiedAt === null) return true;
  const cooldown = severity === 'CRITICAL' ? CRITICAL_COOLDOWN_MS : WARNING_COOLDOWN_MS;
  return timestamp - lastNotifiedAt >= cooldown;
}

export async function runOperationalAlertCycle(env: Env, timestamp = nowMs()): Promise<void> {
  const metrics = await readMetrics(env.DB, timestamp);
  const signals = deriveOperationalSignals(metrics, {
    daily: usdToMicros(env.DAILY_AI_BUDGET_USD),
    monthly: usdToMicros(env.MONTHLY_AI_BUDGET_USD),
    lifetime: usdToMicros(env.LIFETIME_AI_BUDGET_USD),
  });
  const activeKeys = new Set(signals.map((signal) => signal.key));
  for (const signal of signals) await upsertAndNotify(env, signal, timestamp);
  await resolveMissingSignals(env, activeKeys, timestamp);
}

function addCountSignal(
  signals: OperationalSignal[],
  key: string,
  count: number,
  summary: string,
): void {
  if (count <= 0) return;
  signals.push({ key, severity: count >= 5 ? 'CRITICAL' : 'WARNING', summary, details: { count } });
}

function addBudgetSignal(
  signals: OperationalSignal[],
  key: string,
  spent: number,
  limit: number,
  summary: string,
): void {
  if (limit <= 0) return;
  const ratio = spent / limit;
  if (ratio < WARNING_RATIO) return;
  signals.push({
    key,
    severity: ratio >= CRITICAL_RATIO ? 'CRITICAL' : 'WARNING',
    summary: `${summary} использован на ${String(Math.min(999, Math.round(ratio * 100)))}%`,
    details: { spentMicros: spent, limitMicros: limit },
  });
}

async function readMetrics(database: D1Database, timestamp: number): Promise<SignalMetrics> {
  const since = timestamp - 15 * 60 * 1000;
  const stuckSince = timestamp - 30 * 60 * 1000;
  const dayStart = Date.UTC(
    new Date(timestamp).getUTCFullYear(),
    new Date(timestamp).getUTCMonth(),
    new Date(timestamp).getUTCDate(),
  );
  const monthStart = Date.UTC(
    new Date(timestamp).getUTCFullYear(),
    new Date(timestamp).getUTCMonth(),
    1,
  );
  const row = await database
    .prepare(
      `SELECT
      (SELECT COUNT(*) FROM jobs WHERE status = 'DEAD') AS deadJobs,
      (SELECT COUNT(*) FROM account_deletion_requests WHERE state = 'FAILED') AS failedDeletions,
      (SELECT COUNT(*) FROM telegram_updates WHERE status = 'FAILED' AND attempts >= 3 AND received_at >= ?) AS repeatedTelegramFailures,
      (SELECT COUNT(*) FROM payments WHERE state IN ('PAID', 'PENDING') AND updated_at <= ?) AS stuckPayments,
      (SELECT COUNT(*) FROM ai_requests WHERE created_at >= ?) AS aiTotal15m,
      (SELECT COUNT(*) FROM ai_requests WHERE created_at >= ? AND status = 'FAILED') AS aiFailed15m,
      (SELECT COALESCE(SUM(CASE WHEN provider_actual_cost_micros > 0 THEN provider_actual_cost_micros WHEN status IN ('RESERVED','STREAMING') THEN provider_estimated_cost_micros ELSE 0 END), 0) FROM ai_requests WHERE purpose = 'ROLEPLAY' AND created_at >= ?) AS dailySpend,
      (SELECT COALESCE(SUM(CASE WHEN provider_actual_cost_micros > 0 THEN provider_actual_cost_micros WHEN status IN ('RESERVED','STREAMING') THEN provider_estimated_cost_micros ELSE 0 END), 0) FROM ai_requests WHERE purpose = 'ROLEPLAY' AND created_at >= ?) AS monthlySpend,
      (SELECT COALESCE(SUM(CASE WHEN provider_actual_cost_micros > 0 THEN provider_actual_cost_micros WHEN status IN ('RESERVED','STREAMING') THEN provider_estimated_cost_micros ELSE 0 END), 0) FROM ai_requests WHERE purpose = 'ROLEPLAY') AS lifetimeSpend`,
    )
    .bind(since, stuckSince, since, since, dayStart, monthStart)
    .first<SignalMetrics>();
  return (
    row ?? {
      deadJobs: 0,
      failedDeletions: 0,
      repeatedTelegramFailures: 0,
      stuckPayments: 0,
      aiTotal15m: 0,
      aiFailed15m: 0,
      dailySpend: 0,
      monthlySpend: 0,
      lifetimeSpend: 0,
    }
  );
}

async function upsertAndNotify(
  env: Env,
  signal: OperationalSignal,
  timestamp: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO operational_alerts
      (id, alert_key, severity, summary, details_json, first_detected_at, last_detected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(alert_key) WHERE state = 'OPEN' DO UPDATE SET
       severity = excluded.severity, summary = excluded.summary,
       details_json = excluded.details_json, occurrences = occurrences + 1,
       last_detected_at = excluded.last_detected_at`,
  )
    .bind(
      createId(),
      signal.key,
      signal.severity,
      signal.summary,
      JSON.stringify(signal.details),
      timestamp,
      timestamp,
    )
    .run();
  const row = await env.DB.prepare(
    `SELECT id, alert_key AS alertKey, severity, summary, last_notified_at AS lastNotifiedAt
     FROM operational_alerts WHERE alert_key = ? AND state = 'OPEN'`,
  )
    .bind(signal.key)
    .first<AlertRow>();
  if (!row || !shouldNotifyAlert(row.severity, row.lastNotifiedAt, timestamp)) return;
  if (!env.TELEGRAM_BOT_TOKEN || !env.OWNER_TELEGRAM_ID) return;
  const leased = await env.DB.prepare(
    `UPDATE operational_alerts SET notification_lease_until = ?
     WHERE id = ? AND (notification_lease_until IS NULL OR notification_lease_until < ?)`,
  )
    .bind(timestamp + LEASE_MS, row.id, timestamp)
    .run();
  if (leased.meta.changes !== 1) return;
  try {
    const icon = row.severity === 'CRITICAL' ? '🚨' : '⚠️';
    const telegramLocation = telegramApiLocation(env);
    await sendTelegramCommandReply(
      fetch,
      env.TELEGRAM_BOT_TOKEN,
      env.OWNER_TELEGRAM_ID,
      `${icon} *Velora: ${row.severity}*\n${row.summary}`,
      env.PUBLIC_APP_URL,
      telegramLocation.apiBaseUrl,
      'ru',
      telegramLocation.apiEnvironment,
    );
    await env.DB.prepare(
      `UPDATE operational_alerts SET last_notified_at = ?, notification_lease_until = NULL WHERE id = ?`,
    )
      .bind(timestamp, row.id)
      .run();
  } catch (error) {
    await env.DB.prepare(
      `UPDATE operational_alerts SET notification_lease_until = NULL WHERE id = ?`,
    )
      .bind(row.id)
      .run();
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'operational_alert_delivery_failed',
        alertKey: signal.key,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }),
    );
  }
}

async function resolveMissingSignals(
  env: Env,
  activeKeys: ReadonlySet<string>,
  timestamp: number,
): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT id, alert_key AS alertKey FROM operational_alerts WHERE state = 'OPEN'`,
  ).all<{ id: string; alertKey: string }>();
  const resolved = rows.results.filter((row) => !activeKeys.has(row.alertKey));
  if (resolved.length === 0) return;
  await env.DB.batch(
    resolved.map((row) =>
      env.DB.prepare(
        `UPDATE operational_alerts SET state = 'RESOLVED', resolved_at = ?, notification_lease_until = NULL WHERE id = ? AND state = 'OPEN'`,
      ).bind(timestamp, row.id),
    ),
  );
}

function usdToMicros(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed * 1_000_000) : 0;
}
