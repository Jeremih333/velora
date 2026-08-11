import { AppError } from '@velora/shared';
import { sha256 } from './telegram-auth';
import type { Env } from './types';

export interface SessionPrincipal {
  readonly sessionId: string;
  readonly userId: string;
  readonly telegramId: string;
  readonly username: string | null;
  readonly displayName: string;
  readonly avatarFileId: string | null;
  readonly locale: 'ru' | 'en';
  readonly role: 'USER' | 'CREATOR' | 'MODERATOR' | 'SENIOR_MODERATOR' | 'ADMIN' | 'OWNER';
  readonly moderationState: 'ACTIVE' | 'RESTRICTED' | 'SUSPENDED' | 'BANNED';
  readonly ageGateAcceptedAt: number | null;
  readonly csrfHash: string;
  readonly expiresAt: number;
}

interface SessionRow {
  readonly sessionId: string;
  readonly userId: string;
  readonly csrfHash: string;
  readonly expiresAt: number;
  readonly telegramId: string;
  readonly username: string | null;
  readonly displayName: string;
  readonly avatarFileId: string | null;
  readonly locale: 'ru' | 'en';
  readonly role: SessionPrincipal['role'];
  readonly moderationState: SessionPrincipal['moderationState'];
  readonly ageGateAcceptedAt: number | null;
}

export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export async function authenticateSession(
  env: Env,
  cookieHeader: string | undefined,
  now = Date.now(),
  allowInactive = false,
): Promise<SessionPrincipal> {
  if (!env.SESSION_SIGNING_KEY) {
    throw new AppError('SERVICE_NOT_CONFIGURED', 'Сессии пока не настроены.', 503);
  }
  const token = readCookie(cookieHeader, 'velora_session');
  if (!token) throw new AppError('UNAUTHENTICATED', 'Требуется вход через Telegram.', 401);
  const tokenHash = await sha256(`${env.SESSION_SIGNING_KEY}:${token}`);
  const row = await env.DB.prepare(
    `SELECT s.id AS sessionId, s.user_id AS userId, s.csrf_hash AS csrfHash,
       s.expires_at AS expiresAt, u.telegram_id AS telegramId, u.username,
       u.display_name AS displayName, u.avatar_file_id AS avatarFileId, u.locale,
       u.role, u.moderation_state AS moderationState,
       u.age_gate_accepted_at AS ageGateAcceptedAt
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND u.deleted_at IS NULL`,
  )
    .bind(tokenHash)
    .first<SessionRow>();
  if (!row || row.expiresAt <= now) {
    throw new AppError('SESSION_EXPIRED', 'Сессия истекла. Откройте приложение заново.', 401);
  }
  if (!allowInactive && row.moderationState === 'BANNED') {
    throw new AppError('ACCOUNT_BANNED', 'Аккаунт заблокирован.', 403);
  }
  if (!allowInactive && row.moderationState === 'SUSPENDED') {
    throw new AppError('ACCOUNT_SUSPENDED', 'Доступ к аккаунту временно ограничен.', 403);
  }
  return row;
}

export async function verifyCsrfToken(
  provided: string | undefined,
  expectedHash: string,
  signingKey: string | undefined,
): Promise<void> {
  if (!signingKey) throw new AppError('SERVICE_NOT_CONFIGURED', 'Сессии пока не настроены.', 503);
  if (!provided) throw new AppError('INVALID_CSRF', 'Защитный токен отсутствует.', 403);
  const actualHash = await sha256(`${signingKey}:${provided}`);
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actualHash)),
    crypto.subtle.digest('SHA-256', encoder.encode(expectedHash)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  if (difference !== 0) throw new AppError('INVALID_CSRF', 'Защитный токен недействителен.', 403);
}
