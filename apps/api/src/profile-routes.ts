import { userProfilePatchSchema } from '@velora/domain';
import { AppError, nowMs, ru } from '@velora/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { invalidatePublicDiscovery } from './public-cache';
import type { Env, Variables } from './types';

interface ProfileEnvironment {
  Bindings: Env;
  Variables: Variables;
}

interface ProfileRow {
  readonly userId: string;
  readonly displayName: string;
  readonly bio: string;
  readonly avatarFileId: string | null;
  readonly avatarModerationState: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  readonly visibility: 'PUBLIC' | 'PRIVATE';
  readonly role: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const userIdSchema = z.uuid();
const profileProjection = `u.id AS userId,
  COALESCE(p.display_name, u.display_name) AS displayName,
  COALESCE(p.bio, '') AS bio, p.avatar_file_id AS avatarFileId,
  f.moderation_state AS avatarModerationState,
  COALESCE(p.visibility, 'PUBLIC') AS visibility, u.role,
  COALESCE(p.created_at, u.created_at) AS createdAt,
  COALESCE(p.updated_at, u.updated_at) AS updatedAt`;

export const profileRoutes = new Hono<ProfileEnvironment>();

profileRoutes.get('/profiles/me', async (context) => {
  const principal = context.get('principal');
  return context.json(await readProfile(context.env.DB, principal.userId, principal.userId));
});

profileRoutes.patch('/profiles/me', async (context) => {
  const principal = context.get('principal');
  const input = userProfilePatchSchema.parse(await context.req.json());
  if (input.avatarFileId) {
    const avatar = await context.env.DB.prepare(
      `SELECT mime_type AS mimeType FROM file_objects
       WHERE id = ? AND owner_id = ? AND deleted_at IS NULL AND moderation_state != 'REJECTED'`,
    )
      .bind(input.avatarFileId, principal.userId)
      .first<{ mimeType: string }>();
    if (!avatar?.mimeType.startsWith('image/')) {
      throw new AppError('PROFILE_AVATAR_INVALID', ru.profile.avatarInvalid, 400);
    }
  }
  const timestamp = nowMs();
  await context.env.DB.prepare(
    `INSERT INTO user_profiles
      (user_id, display_name, bio, avatar_file_id, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name,
       bio = excluded.bio, avatar_file_id = excluded.avatar_file_id,
       visibility = excluded.visibility, updated_at = excluded.updated_at`,
  )
    .bind(
      principal.userId,
      input.displayName,
      input.bio,
      input.avatarFileId,
      input.visibility,
      timestamp,
      timestamp,
    )
    .run();
  const publicCharacters = await context.env.DB.prepare(
    `SELECT id FROM characters WHERE owner_id = ? AND publish_state = 'PUBLISHED'
     AND visibility = 'PUBLIC' AND deleted_at IS NULL`,
  )
    .bind(principal.userId)
    .all<{ id: string }>();
  invalidatePublicDiscovery(context);
  for (const character of publicCharacters.results) {
    invalidatePublicDiscovery(context, character.id);
  }
  return context.json(await readProfile(context.env.DB, principal.userId, principal.userId));
});

profileRoutes.get('/profiles/:userId', async (context) => {
  const principal = context.get('principal');
  const targetId = userIdSchema.parse(context.req.param('userId'));
  return context.json(await readProfile(context.env.DB, targetId, principal.userId));
});

async function readProfile(database: D1Database, targetId: string, viewerId: string) {
  const row = await database
    .prepare(
      `SELECT ${profileProjection} FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       LEFT JOIN file_objects f ON f.id = p.avatar_file_id AND f.deleted_at IS NULL
       WHERE u.id = ? AND u.deleted_at IS NULL AND u.moderation_state = 'ACTIVE'`,
    )
    .bind(targetId)
    .first<ProfileRow>();
  if (!row) throw new AppError('PROFILE_NOT_FOUND', ru.profile.unavailable, 404);
  const isOwn = targetId === viewerId;
  if (!isOwn) {
    const blocked = await database
      .prepare(
        `SELECT 1 AS found FROM user_blocks WHERE
         (blocker_id = ? AND blocked_user_id = ?) OR
         (blocker_id = ? AND blocked_user_id = ?) LIMIT 1`,
      )
      .bind(viewerId, targetId, targetId, viewerId)
      .first<{ found: number }>();
    if (blocked || row.visibility !== 'PUBLIC') {
      throw new AppError('PROFILE_NOT_FOUND', ru.profile.unavailable, 404);
    }
  }
  const characters = await database
    .prepare(
      `SELECT c.id, c.avatar_file_id AS avatarFileId, v.name, v.tagline,
       c.content_rating AS contentRating, c.updated_at AS updatedAt
       FROM characters c JOIN character_versions v ON v.id = c.active_version_id
       WHERE c.owner_id = ? AND c.publish_state = 'PUBLISHED' AND c.visibility = 'PUBLIC'
         AND c.deleted_at IS NULL ORDER BY c.updated_at DESC LIMIT 20`,
    )
    .bind(targetId)
    .all<{
      id: string;
      avatarFileId: string | null;
      name: string;
      tagline: string;
      contentRating: 'SAFE' | 'MATURE';
      updatedAt: number;
    }>();
  const stats = await database
    .prepare(
      `SELECT
       (SELECT COUNT(*) FROM characters WHERE owner_id = ? AND publish_state = 'PUBLISHED'
         AND visibility = 'PUBLIC' AND deleted_at IS NULL) AS characters,
       (SELECT COUNT(*) FROM character_likes l JOIN characters c ON c.id = l.character_id
         WHERE c.owner_id = ? AND c.deleted_at IS NULL) AS likes,
       (SELECT COUNT(*) FROM conversations v JOIN characters c ON c.id = v.character_id
         WHERE c.owner_id = ? AND c.deleted_at IS NULL AND v.deleted_at IS NULL
           AND v.is_preview = 0) AS chats`,
    )
    .bind(targetId, targetId, targetId)
    .first<{ characters: number; likes: number; chats: number }>();
  return {
    userId: row.userId,
    displayName: row.displayName,
    bio: row.bio,
    avatarFileId: isOwn || row.avatarModerationState === 'APPROVED' ? row.avatarFileId : null,
    avatarPending: row.avatarFileId !== null && row.avatarModerationState === 'PENDING',
    visibility: row.visibility,
    role: row.role,
    isOwn,
    stats: stats ?? { characters: 0, likes: 0, chats: 0 },
    characters: characters.results,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
