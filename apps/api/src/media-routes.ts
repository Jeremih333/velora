import { AppError, nowMs } from '@velora/shared';
import { canModerateRole, isModeratorRole, type ModerationRole } from '@velora/moderation';
import { Hono } from 'hono';
import { fetchTelegramFile } from './telegram-media';
import { telegramApiLocation } from './telegram-api';
import type { Env, Variables } from './types';

interface MediaEnvironment {
  Bindings: Env;
  Variables: Variables;
}

interface MediaRow {
  readonly id: string;
  readonly ownerId: string;
  readonly providerFileId: string;
  readonly mimeType: string;
  readonly originalName: string | null;
  readonly byteSize: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly moderationState: 'PENDING' | 'APPROVED' | 'REJECTED';
  readonly createdAt: number;
}

interface MediaContentRow extends MediaRow {
  readonly ownerRole: ModerationRole;
}

const mediaProjection = `f.id, f.owner_id AS ownerId, f.provider_file_id AS providerFileId,
  f.mime_type AS mimeType, f.original_name AS originalName, f.byte_size AS byteSize,
  f.width, f.height, f.moderation_state AS moderationState, f.created_at AS createdAt`;

export const mediaRoutes = new Hono<MediaEnvironment>();

mediaRoutes.get('/', async (context) => {
  const principal = context.get('principal');
  const result = await context.env.DB.prepare(
    `SELECT ${mediaProjection} FROM file_objects f
     WHERE f.owner_id = ? AND f.deleted_at IS NULL ORDER BY f.created_at DESC LIMIT 100`,
  )
    .bind(principal.userId)
    .all<MediaRow>();
  return context.json({
    items: result.results.map((row) => ({
      ...row,
      contentUrl: `/api/v1/media/${row.id}/content`,
    })),
  });
});

mediaRoutes.get('/:mediaId/content', async (context) => {
  const principal = context.get('principal');
  if (!context.env.TELEGRAM_BOT_TOKEN) {
    throw new AppError('SERVICE_NOT_CONFIGURED', 'Telegram media adapter пока не настроен.', 503);
  }
  const row = await context.env.DB.prepare(
    `SELECT ${mediaProjection}, u.role AS ownerRole
     FROM file_objects f JOIN users u ON u.id = f.owner_id
     WHERE f.id = ? AND f.deleted_at IS NULL`,
  )
    .bind(context.req.param('mediaId'))
    .first<MediaContentRow>();
  if (!row) throw new AppError('MEDIA_NOT_FOUND', 'Медиафайл не найден.', 404);
  const owned = row.ownerId === principal.userId;
  const staffAuthorized =
    !owned && isModeratorRole(principal.role) && canModerateRole(principal.role, row.ownerRole);
  const publiclyReferenced =
    owned || staffAuthorized ? false : await isPubliclyReferenced(context.env.DB, row.id);
  if (!owned && !staffAuthorized && (!publiclyReferenced || row.moderationState !== 'APPROVED')) {
    throw new AppError('MEDIA_NOT_FOUND', 'Медиафайл не найден.', 404);
  }
  const telegramLocation = telegramApiLocation(context.env);
  const upstream = await fetchTelegramFile(
    context.env.TELEGRAM_BOT_TOKEN,
    row.providerFileId,
    fetch,
    telegramLocation.apiBaseUrl,
    telegramLocation.apiEnvironment,
  );
  const headers = new Headers({
    'content-type': row.mimeType,
    'cache-control': publiclyReferenced ? 'public, max-age=300' : 'private, no-store',
    'content-disposition': 'inline',
    'x-content-type-options': 'nosniff',
  });
  return new Response(upstream.body, { status: 200, headers });
});

mediaRoutes.delete('/:mediaId', async (context) => {
  const principal = context.get('principal');
  const id = context.req.param('mediaId');
  const owned = await context.env.DB.prepare(
    'SELECT 1 AS found FROM file_objects WHERE id = ? AND owner_id = ? AND deleted_at IS NULL',
  )
    .bind(id, principal.userId)
    .first<{ found: number }>();
  if (!owned) throw new AppError('MEDIA_NOT_FOUND', 'Медиафайл не найден.', 404);
  const timestamp = nowMs();
  await context.env.DB.batch([
    context.env.DB.prepare(
      'UPDATE users SET avatar_file_id = NULL, updated_at = ? WHERE id = ? AND avatar_file_id = ?',
    ).bind(timestamp, principal.userId, id),
    context.env.DB.prepare(
      'UPDATE personas SET avatar_file_id = NULL, updated_at = ? WHERE user_id = ? AND avatar_file_id = ?',
    ).bind(timestamp, principal.userId, id),
    context.env.DB.prepare(
      'UPDATE characters SET avatar_file_id = NULL, updated_at = ? WHERE owner_id = ? AND avatar_file_id = ?',
    ).bind(timestamp, principal.userId, id),
    context.env.DB.prepare(
      'UPDATE user_profiles SET avatar_file_id = NULL, updated_at = ? WHERE user_id = ? AND avatar_file_id = ?',
    ).bind(timestamp, principal.userId, id),
    context.env.DB.prepare(
      'UPDATE file_objects SET deleted_at = ? WHERE id = ? AND owner_id = ?',
    ).bind(timestamp, id, principal.userId),
    context.env.DB.prepare(
      `UPDATE moderation_cases SET state = 'CLOSED', updated_at = ?, resolved_at = ?
       WHERE target_type = 'AVATAR' AND target_id = ? AND report_id IS NULL
         AND state IN ('OPEN', 'TRIAGED', 'IN_REVIEW')`,
    ).bind(timestamp, timestamp, id),
  ]);
  return context.json({ deleted: true });
});

async function isPubliclyReferenced(database: D1Database, mediaId: string): Promise<boolean> {
  const row = await database
    .prepare(
      `SELECT 1 AS found WHERE EXISTS (
         SELECT 1 FROM characters c JOIN users u ON u.id = c.owner_id
         WHERE c.avatar_file_id = ? AND c.publish_state = 'PUBLISHED'
           AND c.visibility IN ('PUBLIC', 'UNLISTED') AND c.deleted_at IS NULL
           AND u.deleted_at IS NULL AND u.moderation_state = 'ACTIVE'
       ) OR EXISTS (
         SELECT 1 FROM personas p JOIN users u ON u.id = p.user_id
         WHERE p.avatar_file_id = ? AND p.visibility = 'PUBLIC' AND p.deleted_at IS NULL
           AND u.deleted_at IS NULL AND u.moderation_state = 'ACTIVE'
       ) OR EXISTS (
         SELECT 1 FROM user_profiles p JOIN users u ON u.id = p.user_id
         WHERE p.avatar_file_id = ? AND p.visibility = 'PUBLIC'
           AND u.deleted_at IS NULL AND u.moderation_state = 'ACTIVE'
       )`,
    )
    .bind(mediaId, mediaId, mediaId)
    .first<{ found: number }>();
  return row !== null;
}
