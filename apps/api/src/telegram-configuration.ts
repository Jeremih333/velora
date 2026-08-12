import { asError, nowMs } from '@velora/shared';
import { z } from 'zod';
import { sha256 } from './telegram-auth';
import { telegramApiLocation, telegramBotApiUrl } from './telegram-api';
import type { Env } from './types';

const INTEGRATION_KEY = 'telegram_bot';
const LEASE_MS = 2 * 60 * 1000;
const VERIFY_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RETRY_BASE_MS = 5 * 60 * 1000;

const russianCommands = [
  { command: 'start', description: 'Начать работу с Velora' },
  { command: 'app', description: 'Открыть приложение' },
  { command: 'help', description: 'Помощь' },
  { command: 'settings', description: 'Настройки' },
  { command: 'support', description: 'Связаться с поддержкой' },
  { command: 'premium', description: 'Разовые пополнения' },
  { command: 'report', description: 'Сообщить о нарушении' },
  { command: 'paysupport', description: 'Поддержка по платежам' },
  { command: 'terms', description: 'Условия использования' },
  { command: 'privacy', description: 'Конфиденциальность' },
] as const;

const englishCommands = [
  { command: 'start', description: 'Start using Velora' },
  { command: 'app', description: 'Open the app' },
  { command: 'help', description: 'Help' },
  { command: 'settings', description: 'Settings' },
  { command: 'support', description: 'Contact support' },
  { command: 'premium', description: 'One-time top-ups' },
  { command: 'report', description: 'Report a violation' },
  { command: 'paysupport', description: 'Payment support' },
  { command: 'terms', description: 'Terms of use' },
  { command: 'privacy', description: 'Privacy policy' },
] as const;

const commandSchema = z.object({ command: z.string(), description: z.string() });
const botSchema = z.object({ username: z.string() }).loose();
const webhookSchema = z
  .object({ url: z.string(), allowed_updates: z.array(z.string()).optional() })
  .loose();
const menuSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
    web_app: z.object({ url: z.string() }).optional(),
  })
  .loose();
const descriptionSchema = z.object({ description: z.string() }).loose();
const shortDescriptionSchema = z.object({ short_description: z.string() }).loose();

const description =
  'Velora — пространство для AI roleplay: персонажи, personas, память, ветвление историй и полный контроль над контекстом.';
const shortDescription = 'AI roleplay с персонажами и живой памятью.';

interface ReconciliationRow {
  readonly desiredHash: string;
  readonly state: 'APPLYING' | 'READY' | 'FAILED';
  readonly attempts: number;
  readonly nextAttemptAt: number;
}

export type TelegramReconciliationResult = 'not_configured' | 'skipped' | 'ready' | 'failed';

export async function reconcileTelegramConfiguration(
  env: Env,
  timestamp = nowMs(),
  fetcher: typeof fetch = fetch,
): Promise<TelegramReconciliationResult> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) return 'not_configured';
  const webhookUrl = new URL('/telegram/webhook', env.PUBLIC_APP_URL).href;
  const apiEnvironment = env.TELEGRAM_API_ENVIRONMENT ?? 'production';
  const desiredHash = await sha256(
    `telegram-config-v2:${apiEnvironment}:${env.TELEGRAM_BOT_USERNAME}:${webhookUrl}:${env.TELEGRAM_WEBHOOK_SECRET}`,
  );
  const current = await env.DB.prepare(
    `SELECT desired_hash AS desiredHash, state, attempts, next_attempt_at AS nextAttemptAt
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

  try {
    const call = createTelegramCaller(fetcher, env.TELEGRAM_BOT_TOKEN, telegramApiLocation(env));
    const identity = botSchema.parse(await call('getMe'));
    if (identity.username.toLowerCase() !== env.TELEGRAM_BOT_USERNAME.toLowerCase()) {
      throw new Error('TELEGRAM_BOT_IDENTITY_MISMATCH');
    }

    const allowedUpdates = ['message', 'callback_query', 'pre_checkout_query'];
    const webhook = webhookSchema.parse(await call('getWebhookInfo'));
    if (webhook.url !== webhookUrl || !sameStrings(webhook.allowed_updates ?? [], allowedUpdates)) {
      await call('setWebhook', {
        url: webhookUrl,
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: allowedUpdates,
        drop_pending_updates: false,
      });
    }

    await reconcileCommands(call, russianCommands);
    await reconcileCommands(call, russianCommands, 'ru');
    await reconcileCommands(call, englishCommands, 'en');

    const desiredMenu = {
      type: 'web_app',
      text: 'Открыть',
      web_app: { url: env.PUBLIC_APP_URL },
    };
    const menu = menuSchema.parse(await call('getChatMenuButton'));
    if (JSON.stringify(menu) !== JSON.stringify(desiredMenu)) {
      await call('setChatMenuButton', { menu_button: desiredMenu });
    }

    const currentDescription = descriptionSchema.parse(await call('getMyDescription'));
    if (currentDescription.description !== description) {
      await call('setMyDescription', { description });
    }
    const currentShort = shortDescriptionSchema.parse(await call('getMyShortDescription'));
    if (currentShort.short_description !== shortDescription) {
      await call('setMyShortDescription', { short_description: shortDescription });
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
    const errorCode = sanitizeErrorCode(asError(error).message);
    const retryDelay = Math.min(VERIFY_INTERVAL_MS, RETRY_BASE_MS * 2 ** (lease.attempts - 1));
    await env.DB.prepare(
      `UPDATE integration_reconciliations SET state = 'FAILED', next_attempt_at = ?,
       last_error_code = ?, updated_at = ?
       WHERE integration_key = ? AND desired_hash = ? AND state = 'APPLYING'`,
    )
      .bind(timestamp + retryDelay, errorCode, timestamp, INTEGRATION_KEY, desiredHash)
      .run();
    return 'failed';
  }
}

function createTelegramCaller(
  fetcher: typeof fetch,
  token: string,
  location: ReturnType<typeof telegramApiLocation>,
) {
  return async (method: string, body: Readonly<Record<string, unknown>> = {}): Promise<unknown> => {
    const response = await fetcher(telegramBotApiUrl(token, method, location), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload: unknown = await response.json();
    const result = z
      .object({ ok: z.boolean(), result: z.unknown().optional() })
      .loose()
      .parse(payload);
    if (!response.ok || !result.ok) {
      throw new Error(`TELEGRAM_CONFIG_${method}_${String(response.status)}`);
    }
    return result.result;
  };
}

async function reconcileCommands(
  call: ReturnType<typeof createTelegramCaller>,
  desired: readonly { readonly command: string; readonly description: string }[],
  languageCode?: string,
): Promise<void> {
  const scope = languageCode ? { language_code: languageCode } : {};
  const current = z.array(commandSchema).parse(await call('getMyCommands', scope));
  if (JSON.stringify(current) !== JSON.stringify(desired)) {
    await call('setMyCommands', { commands: desired, ...scope });
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join('\n') === [...right].sort().join('\n');
}

function sanitizeErrorCode(value: string): string {
  const normalized = value
    .toUpperCase()
    .replaceAll(/[^A-Z0-9_:-]/gu, '_')
    .slice(0, 120);
  return normalized || 'TELEGRAM_CONFIG_FAILED';
}
