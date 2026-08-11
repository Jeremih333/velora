import { AppError, createId, nowMs } from '@velora/shared';

export interface TelegramIdentity {
  readonly id: string;
  readonly firstName: string;
  readonly lastName?: string | undefined;
  readonly username?: string | undefined;
  readonly languageCode?: string | undefined;
}

export interface PersistedTelegramUser {
  readonly id: string;
  readonly displayName: string;
  readonly role: 'USER' | 'OWNER';
}

export async function upsertTelegramUser(
  database: D1Database,
  identity: TelegramIdentity,
  ownerTelegramId: string | undefined,
): Promise<PersistedTelegramUser> {
  const candidateId = createId();
  const timestamp = nowMs();
  const displayName = [identity.firstName, identity.lastName]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join(' ');
  const role = ownerTelegramId === identity.id ? 'OWNER' : 'USER';

  await database
    .prepare(
      `INSERT INTO users (id, telegram_id, username, display_name, locale, role, moderation_state, created_at, updated_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
       ON CONFLICT(telegram_id) DO UPDATE SET
         username = excluded.username,
         display_name = excluded.display_name,
         locale = excluded.locale,
         role = CASE WHEN users.role = 'OWNER' THEN users.role ELSE excluded.role END,
         updated_at = excluded.updated_at,
         last_seen_at = excluded.last_seen_at`,
    )
    .bind(
      candidateId,
      identity.id,
      identity.username ?? null,
      displayName,
      identity.languageCode === 'en' ? 'en' : 'ru',
      role,
      timestamp,
      timestamp,
      timestamp,
    )
    .run();

  const persisted = await database
    .prepare('SELECT id, display_name AS displayName, role FROM users WHERE telegram_id = ?')
    .bind(identity.id)
    .first<{ id: string; displayName: string; role: 'USER' | 'OWNER' }>();
  if (!persisted) {
    throw new AppError('USER_INITIALIZATION_FAILED', 'Не удалось создать профиль.', 503);
  }

  await database
    .prepare(
      `INSERT INTO user_settings (user_id, updated_at) VALUES (?, ?)
       ON CONFLICT(user_id) DO NOTHING`,
    )
    .bind(persisted.id, timestamp)
    .run();
  await database
    .prepare(
      `INSERT INTO user_profiles (user_id, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING`,
    )
    .bind(persisted.id, persisted.displayName.slice(0, 80), timestamp, timestamp)
    .run();
  return persisted;
}
