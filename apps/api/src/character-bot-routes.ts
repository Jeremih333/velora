import { AppError, createId, nowMs } from '@velora/shared';
import { Hono } from 'hono';
import { readEffectivePlan } from './plans';
import type { Env, Variables } from './types';

interface CharacterBotEnvironment {
  Bindings: Env;
  Variables: Variables;
}

interface CharacterBotRow {
  readonly id: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly telegramBotId: string;
  readonly telegramUsername: string;
  readonly status: string;
  readonly lastErrorCode: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export const characterBotRoutes = new Hono<CharacterBotEnvironment>();

characterBotRoutes.get('/character-bots', async (context) => {
  const principal = context.get('principal');
  const result = await context.env.DB.prepare(
    `SELECT b.id, b.character_id AS characterId, v.name AS characterName,
      b.telegram_bot_id AS telegramBotId, b.telegram_username AS telegramUsername,
      b.status, b.last_error_code AS lastErrorCode, b.created_at AS createdAt,
      b.updated_at AS updatedAt
     FROM character_avatar_bots b JOIN characters c ON c.id = b.character_id
     JOIN character_versions v ON v.id = c.active_version_id
     WHERE b.owner_id = ? ORDER BY b.updated_at DESC`,
  )
    .bind(principal.userId)
    .all<CharacterBotRow>();
  return context.json({ items: result.results });
});

characterBotRoutes.post('/characters/:characterId/avatar-bot/setup', async (context) => {
  const principal = context.get('principal');
  const plan = await readEffectivePlan(context.env.DB, principal.userId);
  if (plan.code !== 'PRO') {
    throw new AppError(
      'PRO_PLAN_REQUIRED',
      'AI-аватары персонажей для групп доступны только на тарифе Pro.',
      403,
    );
  }
  if (!context.env.CHILD_BOT_ENCRYPTION_KEY) {
    throw new AppError(
      'CHILD_BOT_SERVICE_UNAVAILABLE',
      'Создание AI-аватаров временно недоступно.',
      503,
    );
  }
  const characterId = context.req.param('characterId');
  const character = await context.env.DB.prepare(
    `SELECT c.id, v.name FROM characters c
     JOIN character_versions v ON v.id = c.active_version_id
     WHERE c.id = ? AND c.owner_id = ? AND c.deleted_at IS NULL`,
  )
    .bind(characterId, principal.userId)
    .first<{ readonly id: string; readonly name: string }>();
  if (!character) throw new AppError('CHARACTER_NOT_FOUND', 'Персонаж не найден.', 404);

  const timestamp = nowMs();
  const setupId = createId();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE character_bot_setup_requests
       SET state = 'CANCELLED', updated_at = ?
       WHERE owner_id = ? AND state IN ('AWAITING_TOKEN', 'CONFIGURING')`,
    ).bind(timestamp, principal.userId),
    context.env.DB.prepare(
      `INSERT INTO character_bot_setup_requests
       (id, owner_id, character_id, state, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, 'AWAITING_TOKEN', ?, ?, ?)`,
    ).bind(setupId, principal.userId, characterId, timestamp + 15 * 60_000, timestamp, timestamp),
  ]);
  return context.json(
    {
      id: setupId,
      state: 'AWAITING_TOKEN',
      expiresAt: timestamp + 15 * 60_000,
      instruction:
        `Перейдите в личный чат с @${context.env.TELEGRAM_BOT_USERNAME} и отправьте токен нового бота. ` +
        'Сообщение обработается как секрет и не попадёт в журналы.',
    },
    201,
  );
});

characterBotRoutes.delete('/character-bots/:botId', async (context) => {
  const principal = context.get('principal');
  const result = await context.env.DB.prepare(
    `UPDATE character_avatar_bots SET status = 'REVOKED', token_ciphertext = '', token_iv = '',
      updated_at = ? WHERE id = ? AND owner_id = ? AND status != 'REVOKED'`,
  )
    .bind(nowMs(), context.req.param('botId'), principal.userId)
    .run();
  if (result.meta.changes !== 1) {
    throw new AppError('CHARACTER_BOT_NOT_FOUND', 'AI-аватар не найден.', 404);
  }
  return context.json({ revoked: true });
});
