import { AppError, asError, createId, nowMs } from '@velora/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { sha256 } from './telegram-auth';
import type { Env, Variables } from './types';
import { readEffectivePlan } from './plans';

interface AccountControlsEnvironment {
  Bindings: Env;
  Variables: Variables;
}

interface DeletionRow {
  readonly id: string;
  readonly userId: string;
  readonly state: 'PENDING' | 'PROCESSING' | 'CANCELLED' | 'COMPLETED' | 'FAILED';
  readonly requestedAt: number;
  readonly executeAfter: number;
  readonly cancelledAt: number | null;
  readonly completedAt: number | null;
  readonly attempts: number;
}

const deletionRequestSchema = z.object({
  confirmation: z.literal('УДАЛИТЬ'),
  idempotencyKey: z.uuid(),
});
const userIdSchema = z.uuid();
const deletionGraceMs = 7 * 24 * 60 * 60 * 1000;
const retention = {
  retained: ['financial ledger', 'payment records', 'moderation evidence', 'audit log'],
  reason: 'Disputes, fraud prevention and integrity of security decisions.',
  identity: 'Telegram identity and public profile are irreversibly pseudonymized.',
} as const;

export const accountControlRoutes = new Hono<AccountControlsEnvironment>();

accountControlRoutes.get('/data-controls', async (context) => {
  const principal = context.get('principal');
  const deletion = await readDeletion(context.env.DB, principal.userId);
  const counts = await readExportCounts(context.env.DB, principal.userId);
  return context.json({
    export: {
      formatVersion: 2,
      resources: [
        'profile',
        'planAccess',
        'conversations',
        'characters',
        'lorebooks',
        'supportRequests',
      ],
      counts,
    },
    deletion: deletion ? toDeletionResponse(deletion) : null,
    gracePeriodDays: 7,
    retention,
  });
});

accountControlRoutes.get('/data-export', async (context) => {
  const principal = context.get('principal');
  const onboarding = await context.env.DB.prepare(
    `SELECT mature_enabled AS matureEnabled, policy_accepted_at AS policyAcceptedAt,
        completed_at AS completedAt FROM onboarding_completions WHERE user_id = ?`,
  )
    .bind(principal.userId)
    .first<{ matureEnabled: number; policyAcceptedAt: number; completedAt: number }>();
  return context.json({
    formatVersion: 2,
    generatedAt: nowMs(),
    account: {
      id: principal.userId,
      username: principal.username,
      displayName: principal.displayName,
      locale: principal.locale,
      onboarding: onboarding
        ? {
            matureEnabled: onboarding.matureEnabled === 1,
            policyAcceptedAt: onboarding.policyAcceptedAt,
            completedAt: onboarding.completedAt,
          }
        : null,
    },
    profile: await readProfileExport(context.env.DB, principal.userId),
    planAccess: await readPlanAccessExport(context.env.DB, principal.userId),
    resources: await readExportCounts(context.env.DB, principal.userId),
    supportRequests: await readSupportRequests(context.env.DB, principal.userId),
    endpoints: {
      conversations: '/api/v1/conversations',
      characters: '/api/v1/characters',
      lorebooks: '/api/v1/lorebooks',
    },
  });
});

accountControlRoutes.post('/data-controls/account-deletion', async (context) => {
  const principal = context.get('principal');
  if (principal.role === 'OWNER') {
    throw new AppError(
      'OWNER_DELETION_REQUIRES_TRANSFER',
      'Сначала передайте владение и операционные обязанности.',
      409,
    );
  }
  const input = deletionRequestSchema.parse(await context.req.json());
  const current = await readDeletion(context.env.DB, principal.userId);
  if (current?.state === 'PENDING' || current?.state === 'PROCESSING') {
    return context.json(toDeletionResponse(current));
  }
  const timestamp = nowMs();
  const id = createId();
  await context.env.DB.prepare(
    `INSERT INTO account_deletion_requests
      (id, user_id, state, requested_at, execute_after, retention_json)
     VALUES (?, ?, 'PENDING', ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       id = excluded.id, state = 'PENDING', requested_at = excluded.requested_at,
       execute_after = excluded.execute_after, cancelled_at = NULL, completed_at = NULL,
       attempts = 0, lease_expires_at = NULL, last_error_code = NULL,
       retention_json = excluded.retention_json`,
  )
    .bind(
      id,
      principal.userId,
      timestamp,
      timestamp + deletionGraceMs,
      JSON.stringify({ ...retention, requestKey: input.idempotencyKey }),
    )
    .run();
  const created = await readDeletion(context.env.DB, principal.userId);
  if (!created) throw new Error('ACCOUNT_DELETION_REQUEST_NOT_PERSISTED');
  return context.json(toDeletionResponse(created), 201);
});

accountControlRoutes.delete('/data-controls/account-deletion', async (context) => {
  const principal = context.get('principal');
  const result = await context.env.DB.prepare(
    `UPDATE account_deletion_requests SET state = 'CANCELLED', cancelled_at = ?,
       lease_expires_at = NULL WHERE user_id = ? AND state = 'PENDING'`,
  )
    .bind(nowMs(), principal.userId)
    .run();
  if (result.meta.changes !== 1) {
    throw new AppError('DELETION_NOT_CANCELLABLE', 'Активной заявки для отмены нет.', 409);
  }
  return context.json({ cancelled: true });
});

accountControlRoutes.get('/blocks', async (context) => {
  const principal = context.get('principal');
  const result = await context.env.DB.prepare(
    `SELECT b.blocked_user_id AS userId, u.display_name AS displayName,
       u.username, b.created_at AS createdAt
     FROM user_blocks b JOIN users u ON u.id = b.blocked_user_id
     WHERE b.blocker_id = ? AND u.deleted_at IS NULL ORDER BY b.created_at DESC LIMIT 200`,
  )
    .bind(principal.userId)
    .all<{ userId: string; displayName: string; username: string | null; createdAt: number }>();
  return context.json({ items: result.results });
});

accountControlRoutes.put('/blocks/:userId', async (context) => {
  const principal = context.get('principal');
  const targetId = userIdSchema.parse(context.req.param('userId'));
  if (targetId === principal.userId) {
    throw new AppError('SELF_BLOCK_FORBIDDEN', 'Нельзя заблокировать себя.', 409);
  }
  const target = await context.env.DB.prepare(
    'SELECT id FROM users WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(targetId)
    .first<{ id: string }>();
  if (!target) throw new AppError('USER_NOT_FOUND', 'Пользователь не найден.', 404);
  await context.env.DB.prepare(
    `INSERT INTO user_blocks (blocker_id, blocked_user_id, created_at)
     VALUES (?, ?, ?) ON CONFLICT(blocker_id, blocked_user_id) DO NOTHING`,
  )
    .bind(principal.userId, targetId, nowMs())
    .run();
  return context.json({ blocked: true, userId: targetId });
});

accountControlRoutes.delete('/blocks/:userId', async (context) => {
  const principal = context.get('principal');
  const targetId = userIdSchema.parse(context.req.param('userId'));
  await context.env.DB.prepare(
    'DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_user_id = ?',
  )
    .bind(principal.userId, targetId)
    .run();
  return context.json({ blocked: false, userId: targetId });
});

export async function hasUserBlock(
  database: D1Database,
  firstUserId: string,
  secondUserId: string,
): Promise<boolean> {
  if (firstUserId === secondUserId) return false;
  const row = await database
    .prepare(
      `SELECT 1 AS found FROM user_blocks
       WHERE (blocker_id = ? AND blocked_user_id = ?)
          OR (blocker_id = ? AND blocked_user_id = ?) LIMIT 1`,
    )
    .bind(firstUserId, secondUserId, secondUserId, firstUserId)
    .first<{ found: number }>();
  return row !== null;
}

export async function processDueAccountDeletions(
  database: D1Database,
  limit = 1,
  now = nowMs(),
): Promise<number> {
  let completed = 0;
  for (let index = 0; index < Math.max(0, Math.min(limit, 3)); index += 1) {
    const claim = await database
      .prepare(
        `UPDATE account_deletion_requests SET state = 'PROCESSING', attempts = attempts + 1,
           lease_expires_at = ?
         WHERE id = (SELECT id FROM account_deletion_requests
           WHERE ((state = 'PENDING' AND execute_after <= ?)
             OR (state = 'PROCESSING' AND lease_expires_at < ?)) AND attempts < 5
           ORDER BY execute_after, id LIMIT 1)
         RETURNING id, user_id AS userId, state, requested_at AS requestedAt,
           execute_after AS executeAfter, cancelled_at AS cancelledAt,
           completed_at AS completedAt, attempts`,
      )
      .bind(now + 60_000, now, now)
      .first<DeletionRow>();
    if (!claim) break;
    try {
      await eraseAccount(database, claim, now);
      completed += 1;
    } catch (error) {
      const failed = claim.attempts >= 5;
      await database
        .prepare(
          `UPDATE account_deletion_requests SET state = ?, execute_after = ?,
           lease_expires_at = NULL, last_error_code = ? WHERE id = ? AND state = 'PROCESSING'`,
        )
        .bind(
          failed ? 'FAILED' : 'PENDING',
          now + Math.min(60 * 60_000, 2 ** claim.attempts * 60_000),
          asError(error).name.slice(0, 80),
          claim.id,
        )
        .run();
    }
  }
  return completed;
}

async function eraseAccount(
  database: D1Database,
  request: DeletionRow,
  now: number,
): Promise<void> {
  const user = await database
    .prepare('SELECT telegram_id AS telegramId FROM users WHERE id = ? AND deleted_at IS NULL')
    .bind(request.userId)
    .first<{ telegramId: string }>();
  if (!user) {
    await database
      .prepare(
        `UPDATE account_deletion_requests SET state = 'COMPLETED', completed_at = ?,
         lease_expires_at = NULL WHERE id = ?`,
      )
      .bind(now, request.id)
      .run();
    return;
  }
  const tombstoneTelegramId = `deleted:${(await sha256(`velora-erasure:${request.userId}:${user.telegramId}`)).slice(0, 40)}`;
  await database.batch([
    database
      .prepare('UPDATE characters SET active_version_id = NULL WHERE owner_id = ?')
      .bind(request.userId),
    database
      .prepare(
        `DELETE FROM conversations WHERE user_id = ?
         OR character_id IN (SELECT id FROM characters WHERE owner_id = ?)`,
      )
      .bind(request.userId, request.userId),
    database.prepare('DELETE FROM characters WHERE owner_id = ?').bind(request.userId),
    database.prepare('DELETE FROM personas WHERE user_id = ?').bind(request.userId),
    database.prepare('DELETE FROM lorebooks WHERE owner_id = ?').bind(request.userId),
    database.prepare('DELETE FROM file_objects WHERE owner_id = ?').bind(request.userId),
    database.prepare('DELETE FROM character_likes WHERE user_id = ?').bind(request.userId),
    database.prepare('DELETE FROM character_bookmarks WHERE user_id = ?').bind(request.userId),
    database.prepare('DELETE FROM character_reviews WHERE user_id = ?').bind(request.userId),
    database
      .prepare('DELETE FROM user_blocks WHERE blocker_id = ? OR blocked_user_id = ?')
      .bind(request.userId, request.userId),
    database.prepare('DELETE FROM user_entitlements WHERE user_id = ?').bind(request.userId),
    database
      .prepare(
        'UPDATE plan_access_grants SET revoked_at = COALESCE(revoked_at, ?) WHERE user_id = ?',
      )
      .bind(now, request.userId),
    database.prepare('DELETE FROM usage_daily WHERE user_id = ?').bind(request.userId),
    database.prepare('DELETE FROM plan_operation_usage WHERE user_id = ?').bind(request.userId),
    database.prepare('DELETE FROM ai_requests WHERE user_id = ?').bind(request.userId),
    database
      .prepare('DELETE FROM mutation_idempotency_keys WHERE user_id = ?')
      .bind(request.userId),
    database
      .prepare("DELETE FROM jobs WHERE json_extract(payload_json, '$.userId') = ?")
      .bind(request.userId),
    database
      .prepare('UPDATE product_events SET user_id = NULL WHERE user_id = ?')
      .bind(request.userId),
    database.prepare('DELETE FROM sessions WHERE user_id = ?').bind(request.userId),
    database.prepare('DELETE FROM onboarding_completions WHERE user_id = ?').bind(request.userId),
    database.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(request.userId),
    database.prepare('DELETE FROM user_profiles WHERE user_id = ?').bind(request.userId),
    database.prepare('DELETE FROM support_requests WHERE user_id = ?').bind(request.userId),
    database
      .prepare(
        `UPDATE users SET telegram_id = ?, username = NULL,
         display_name = 'Удалённый пользователь', avatar_file_id = NULL, locale = 'ru',
         role = 'USER', age_gate_accepted_at = NULL, moderation_state = 'ACTIVE',
         updated_at = ?, deleted_at = ? WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(tombstoneTelegramId, now, now, request.userId),
    database
      .prepare(
        `UPDATE account_deletion_requests SET state = 'COMPLETED', completed_at = ?,
         lease_expires_at = NULL, last_error_code = NULL WHERE id = ? AND state = 'PROCESSING'`,
      )
      .bind(now, request.id),
  ]);
}

async function readDeletion(database: D1Database, userId: string): Promise<DeletionRow | null> {
  return database
    .prepare(
      `SELECT id, user_id AS userId, state, requested_at AS requestedAt,
       execute_after AS executeAfter, cancelled_at AS cancelledAt,
       completed_at AS completedAt, attempts
       FROM account_deletion_requests WHERE user_id = ?`,
    )
    .bind(userId)
    .first<DeletionRow>();
}

async function readExportCounts(database: D1Database, userId: string) {
  const row = await database
    .prepare(
      `SELECT
       (SELECT COUNT(*) FROM conversations WHERE user_id = ? AND deleted_at IS NULL) AS conversations,
       (SELECT COUNT(*) FROM characters WHERE owner_id = ? AND deleted_at IS NULL) AS characters,
       (SELECT COUNT(*) FROM lorebooks WHERE owner_id = ? AND deleted_at IS NULL) AS lorebooks,
       (SELECT COUNT(*) FROM support_requests WHERE user_id = ?) AS supportRequests`,
    )
    .bind(userId, userId, userId, userId)
    .first<{
      conversations: number;
      characters: number;
      lorebooks: number;
      supportRequests: number;
    }>();
  return row ?? { conversations: 0, characters: 0, lorebooks: 0, supportRequests: 0 };
}

async function readSupportRequests(database: D1Database, userId: string) {
  const result = await database
    .prepare(
      `SELECT id, category, subject, message, state, resolution_note AS resolutionNote,
       created_at AS createdAt, updated_at AS updatedAt, resolved_at AS resolvedAt
       FROM support_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 500`,
    )
    .bind(userId)
    .all();
  return result.results;
}

async function readProfileExport(database: D1Database, userId: string) {
  return database
    .prepare(
      `SELECT display_name AS displayName, bio, avatar_file_id AS avatarFileId, visibility,
       created_at AS createdAt, updated_at AS updatedAt FROM user_profiles WHERE user_id = ?`,
    )
    .bind(userId)
    .first();
}

async function readPlanAccessExport(database: D1Database, userId: string) {
  const [effective, grants] = await Promise.all([
    readEffectivePlan(database, userId),
    database
      .prepare(
        `SELECT plan_code AS planCode, starts_at AS startsAt, expires_at AS expiresAt,
         revoked_at AS revokedAt, refunded_at AS refundedAt, created_at AS createdAt
         FROM plan_access_grants WHERE user_id = ? ORDER BY created_at DESC LIMIT 500`,
      )
      .bind(userId)
      .all(),
  ]);
  return { effective, grants: grants.results };
}

function toDeletionResponse(row: DeletionRow) {
  return {
    id: row.id,
    state: row.state,
    requestedAt: row.requestedAt,
    executeAfter: row.executeAfter,
    cancellable: row.state === 'PENDING',
  };
}
