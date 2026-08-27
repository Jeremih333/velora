import { AppError, createId, nowMs } from '@velora/shared';
import { z } from 'zod';
import { encryptSecret } from './secret-envelope';
import { telegramBotApiUrl, type TelegramApiLocation } from './telegram-api';
import { fetchTelegramFile } from './telegram-media';

const tokenPattern = /^\d{6,12}:[A-Za-z0-9_-]{30,200}$/u;
const getMeSchema = z.object({
  ok: z.literal(true),
  result: z.object({
    id: z.number().int().positive(),
    is_bot: z.literal(true),
    username: z.string().min(5).max(32),
  }),
});
const telegramOkSchema = z.object({ ok: z.boolean(), description: z.string().optional() });

interface PendingSetupRow {
  readonly id: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly avatarProviderFileId: string | null;
}

export function looksLikeTelegramBotToken(value: string | undefined): value is string {
  return Boolean(value && tokenPattern.test(value.trim()));
}

export async function configurePendingCharacterBot(input: {
  readonly database: D1Database;
  readonly ownerId: string;
  readonly token: string;
  readonly encryptionKey: string;
  readonly mainBotToken: string;
  readonly mainBotUsername: string;
  readonly publicAppUrl: string;
  readonly telegramApiLocation?: TelegramApiLocation;
  readonly fetcher?: typeof fetch;
}): Promise<{ readonly username: string } | null> {
  const timestamp = nowMs();
  const pending = await input.database
    .prepare(
      `SELECT s.id, s.character_id AS characterId, v.name AS characterName,
       f.provider_file_id AS avatarProviderFileId
       FROM character_bot_setup_requests s
       JOIN characters c ON c.id = s.character_id AND c.owner_id = s.owner_id
       JOIN character_versions v ON v.id = c.active_version_id
       LEFT JOIN file_objects f ON f.id = c.avatar_file_id AND f.deleted_at IS NULL
       WHERE s.owner_id = ? AND s.state = 'AWAITING_TOKEN' AND s.expires_at > ?
       ORDER BY s.created_at DESC LIMIT 1`,
    )
    .bind(input.ownerId, timestamp)
    .first<PendingSetupRow>();
  if (!pending) return null;
  if (!looksLikeTelegramBotToken(input.token)) {
    throw new AppError('TELEGRAM_TOKEN_INVALID', 'Токен бота выглядит некорректно.', 400);
  }
  const claimed = await input.database
    .prepare(
      `UPDATE character_bot_setup_requests SET state = 'CONFIGURING', updated_at = ?
       WHERE id = ? AND owner_id = ? AND state = 'AWAITING_TOKEN'`,
    )
    .bind(timestamp, pending.id, input.ownerId)
    .run();
  if (claimed.meta.changes !== 1) return null;

  const fetcher = input.fetcher ?? fetch;
  try {
    const location = input.telegramApiLocation ?? {};
    const identityResponse = await fetcher(telegramBotApiUrl(input.token, 'getMe', location), {
      method: 'POST',
    });
    const identity = getMeSchema.safeParse(await identityResponse.json());
    if (!identityResponse.ok || !identity.success) {
      throw new AppError(
        'TELEGRAM_TOKEN_REJECTED',
        'Telegram не подтвердил токен этого бота.',
        400,
      );
    }
    const botId = createId();
    const webhookSecret = await deriveWebhookSecret(input.encryptionKey, botId);
    const webhookUrl = new URL(`/telegram/character-bots/${botId}`, input.publicAppUrl).toString();
    await Promise.all([
      callTelegram(fetcher, input.token, 'setMyName', { name: pending.characterName }, location),
      callTelegram(
        fetcher,
        input.token,
        'setMyDescription',
        {
          description:
            `${pending.characterName} — AI-персонаж для ролевого общения в группах. ` +
            `Создано в VeloraAI: https://t.me/${input.mainBotUsername}`,
        },
        location,
      ),
      callTelegram(
        fetcher,
        input.token,
        'setMyShortDescription',
        { short_description: `AI-персонаж ${pending.characterName} · VeloraAI` },
        location,
      ),
      callTelegram(
        fetcher,
        input.token,
        'setMyCommands',
        {
          commands: [
            { command: 'start', description: 'Запустить персонажа' },
            { command: 'help', description: 'Настройка и помощь' },
            { command: 'info', description: 'О персонаже и VeloraAI' },
            { command: 'memory', description: 'Память этого группового чата' },
            { command: 'model', description: 'Выбрать модель' },
            { command: 'clear', description: 'Очистить историю этого чата' },
          ],
        },
        location,
      ),
    ]);
    if (pending.avatarProviderFileId) {
      await setCharacterBotAvatar({
        fetcher,
        mainBotToken: input.mainBotToken,
        childBotToken: input.token,
        fileId: pending.avatarProviderFileId,
        location,
      });
    }
    await callTelegram(
      fetcher,
      input.token,
      'setWebhook',
      {
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true,
      },
      location,
    );
    const envelope = await encryptSecret(input.token, input.encryptionKey, `child-bot:${botId}`);
    await input.database.batch([
      input.database
        .prepare(
          `INSERT INTO character_avatar_bots
           (id, owner_id, character_id, telegram_bot_id, telegram_username,
            token_ciphertext, token_iv, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
           ON CONFLICT(owner_id, character_id) DO UPDATE SET
             telegram_bot_id = excluded.telegram_bot_id,
             telegram_username = excluded.telegram_username,
             token_ciphertext = excluded.token_ciphertext,
             token_iv = excluded.token_iv,
             status = 'ACTIVE', last_error_code = NULL, updated_at = excluded.updated_at`,
        )
        .bind(
          botId,
          input.ownerId,
          pending.characterId,
          String(identity.data.result.id),
          identity.data.result.username,
          envelope.ciphertext,
          envelope.iv,
          timestamp,
          timestamp,
        ),
      input.database
        .prepare(
          `UPDATE character_bot_setup_requests SET state = 'COMPLETED', updated_at = ?
           WHERE id = ? AND state = 'CONFIGURING'`,
        )
        .bind(timestamp, pending.id),
    ]);
    return { username: identity.data.result.username };
  } catch (error) {
    await input.database
      .prepare(
        `UPDATE character_bot_setup_requests SET state = 'FAILED', updated_at = ?
         WHERE id = ? AND state = 'CONFIGURING'`,
      )
      .bind(nowMs(), pending.id)
      .run();
    throw error;
  }
}

export async function deriveWebhookSecret(keyBase64: string, botId: string): Promise<string> {
  const raw = Uint8Array.from(atob(keyBase64), (value) => value.charCodeAt(0));
  if (raw.byteLength !== 32) {
    throw new AppError('SECRET_KEY_INVALID', 'Ключ шифрования дочерних ботов не настроен.', 503);
  }
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`webhook:${botId}`)),
  );
  return btoa(String.fromCharCode(...signature))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/gu, '');
}

async function callTelegram(
  fetcher: typeof fetch,
  token: string,
  method: string,
  body: Readonly<Record<string, unknown>>,
  location: TelegramApiLocation,
): Promise<void> {
  const response = await fetcher(telegramBotApiUrl(token, method, location), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const parsed = telegramOkSchema.safeParse(await response.json());
  if (!response.ok || !parsed.success || !parsed.data.ok) {
    throw new AppError(
      'CHARACTER_BOT_CONFIGURATION_FAILED',
      'Telegram не настроил AI-аватара.',
      503,
    );
  }
}

async function setCharacterBotAvatar(input: {
  readonly fetcher: typeof fetch;
  readonly mainBotToken: string;
  readonly childBotToken: string;
  readonly fileId: string;
  readonly location: TelegramApiLocation;
}): Promise<void> {
  const response = await fetchTelegramFile(
    input.mainBotToken,
    input.fileId,
    input.fetcher,
    input.location.apiBaseUrl,
    input.location.apiEnvironment,
  );
  const blob = await response.blob();
  const form = new FormData();
  form.set('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }));
  form.set('avatar', blob, 'avatar.jpg');
  const configured = await input.fetcher(
    telegramBotApiUrl(input.childBotToken, 'setMyProfilePhoto', input.location),
    { method: 'POST', body: form },
  );
  const parsed = telegramOkSchema.safeParse(await configured.json());
  if (!configured.ok || !parsed.success || !parsed.data.ok) {
    throw new AppError(
      'CHARACTER_BOT_AVATAR_FAILED',
      'Telegram не установил аватар персонажа.',
      503,
    );
  }
}
