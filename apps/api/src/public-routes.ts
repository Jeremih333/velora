import { AppError, type CharacterLanguageCode } from '@velora/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { readThroughPublicCache } from './public-cache';
import type { Env, Variables } from './types';

interface PublicEnvironment {
  Bindings: Env;
  Variables: Variables;
}

interface PublicCharacterRow {
  readonly id: string;
  readonly avatarFileId: string | null;
  readonly language: CharacterLanguageCode;
  readonly updatedAt: number;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly personality: string | null;
  readonly firstMessage: string;
  readonly alternateGreetingsJson: string;
  readonly creatorId: string;
  readonly creatorName: string;
  readonly likeCount: number;
  readonly bookmarkCount: number;
  readonly reviewCount: number;
  readonly averageRating: number | null;
}

interface TagRow {
  readonly slug: string;
  readonly displayName: string;
  readonly characterCount: number;
}

const idSchema = z.uuid();
const publicProjection = `c.id, c.avatar_file_id AS avatarFileId, c.language_code AS language,
  c.updated_at AS updatedAt, v.name, v.tagline, v.description,
  CASE WHEN c.personality_visible = 1 THEN v.personality ELSE NULL END AS personality,
  v.first_message AS firstMessage, v.alternate_greetings_json AS alternateGreetingsJson,
  u.id AS creatorId, COALESCE(up.display_name, u.display_name) AS creatorName,
  (SELECT COUNT(*) FROM character_likes cl WHERE cl.character_id = c.id) AS likeCount,
  (SELECT COUNT(*) FROM character_bookmarks cb WHERE cb.character_id = c.id) AS bookmarkCount,
  (SELECT COUNT(*) FROM character_reviews cr WHERE cr.character_id = c.id) AS reviewCount,
  (SELECT ROUND(AVG(cr.rating), 2) FROM character_reviews cr WHERE cr.character_id = c.id) AS averageRating`;
const publicConditions = `c.publish_state = 'PUBLISHED' AND c.visibility = 'PUBLIC'
  AND c.content_rating = 'SAFE' AND c.deleted_at IS NULL
  AND u.deleted_at IS NULL AND u.moderation_state = 'ACTIVE'`;

export const publicRoutes = new Hono<PublicEnvironment>();

publicRoutes.get('/tags', async (context) => {
  const result = await readThroughPublicCache(context, 'tags', 300, async () => {
    const rows = await context.env.DB.prepare(
      `SELECT t.slug, t.display_name AS displayName, COUNT(DISTINCT c.id) AS characterCount
       FROM tags t JOIN character_tags ct ON ct.tag_id = t.id
       JOIN characters c ON c.id = ct.character_id
       JOIN users u ON u.id = c.owner_id
       WHERE ${publicConditions}
       GROUP BY t.id, t.slug, t.display_name
       ORDER BY characterCount DESC, t.display_name ASC LIMIT 100`,
    ).all<TagRow>();
    return { items: rows.results };
  });
  context.header('x-velora-cache', result.status);
  context.header('cache-control', 'public, max-age=300');
  return context.json(result.value);
});

publicRoutes.get('/trending', async (context) => {
  const principal = context.get('principal');
  const result = await readThroughPublicCache(context, 'trending', 120, async () => {
    const rows = await context.env.DB.prepare(
      `SELECT ${publicProjection}
       FROM characters c JOIN character_versions v ON v.id = c.active_version_id
       JOIN users u ON u.id = c.owner_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE ${publicConditions}
       ORDER BY
         ((SELECT COUNT(*) FROM character_likes cl WHERE cl.character_id = c.id) * 3
          + (SELECT COUNT(*) FROM character_bookmarks cb WHERE cb.character_id = c.id) * 2
          + (SELECT COUNT(*) FROM character_reviews cr WHERE cr.character_id = c.id) * 4
          + (SELECT COUNT(*) FROM conversations conv
             WHERE conv.character_id = c.id AND conv.deleted_at IS NULL)) DESC,
         c.published_at DESC, c.id DESC LIMIT 20`,
    ).all<PublicCharacterRow>();
    return {
      items: await Promise.all(rows.results.map((row) => toPublicCharacter(context.env.DB, row))),
    };
  });
  context.header('x-velora-cache', result.status);
  context.header('cache-control', 'public, max-age=120');
  const blocked = await readBlockedUsers(context.env.DB, principal.userId);
  return context.json({
    items: result.value.items
      .filter((character) => !blocked.has(character.creatorId))
      .map(toClientPublicCharacter),
  });
});

publicRoutes.get('/characters/:characterId', async (context) => {
  const principal = context.get('principal');
  const characterId = idSchema.parse(context.req.param('characterId'));
  const result = await readThroughPublicCache(
    context,
    `character/${encodeURIComponent(characterId)}`,
    120,
    async () => {
      const row = await context.env.DB.prepare(
        `SELECT ${publicProjection}
         FROM characters c JOIN character_versions v ON v.id = c.active_version_id
         JOIN users u ON u.id = c.owner_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         WHERE c.id = ? AND ${publicConditions}`,
      )
        .bind(characterId)
        .first<PublicCharacterRow>();
      if (!row) throw new AppError('CHARACTER_NOT_FOUND', 'Персонаж не найден.', 404);
      return toPublicCharacter(context.env.DB, row);
    },
  );
  if (await usersBlockEachOther(context.env.DB, principal.userId, result.value.creatorId)) {
    throw new AppError('CHARACTER_NOT_FOUND', 'Персонаж не найден.', 404);
  }
  context.header('x-velora-cache', result.status);
  context.header('cache-control', 'public, max-age=120');
  return context.json(toClientPublicCharacter(result.value));
});

async function toPublicCharacter(database: D1Database, row: PublicCharacterRow) {
  const { alternateGreetingsJson, ...safe } = row;
  const tags = await database
    .prepare(
      `SELECT t.display_name AS displayName FROM character_tags ct
       JOIN tags t ON t.id = ct.tag_id WHERE ct.character_id = ? ORDER BY t.display_name`,
    )
    .bind(row.id)
    .all<{ displayName: string }>();
  let alternateGreetings: readonly string[] = [];
  try {
    alternateGreetings = z
      .array(z.string().min(1))
      .max(10)
      .parse(JSON.parse(alternateGreetingsJson));
  } catch {
    // Invalid legacy alternatives are omitted from the public response.
  }
  return {
    ...safe,
    alternateGreetings,
    tags: tags.results.map((tag) => tag.displayName),
  };
}

function toClientPublicCharacter(character: Awaited<ReturnType<typeof toPublicCharacter>>) {
  const { creatorId: _creatorId, ...safe } = character;
  void _creatorId;
  return safe;
}

async function usersBlockEachOther(
  database: D1Database,
  viewerId: string,
  creatorId: string,
): Promise<boolean> {
  if (viewerId === creatorId) return false;
  const row = await database
    .prepare(
      `SELECT 1 AS found FROM user_blocks
       WHERE (blocker_id = ? AND blocked_user_id = ?)
          OR (blocker_id = ? AND blocked_user_id = ?) LIMIT 1`,
    )
    .bind(viewerId, creatorId, creatorId, viewerId)
    .first<{ found: number }>();
  return row !== null;
}

async function readBlockedUsers(
  database: D1Database,
  viewerId: string,
): Promise<ReadonlySet<string>> {
  const rows = await database
    .prepare(
      `SELECT CASE WHEN blocker_id = ? THEN blocked_user_id ELSE blocker_id END AS userId
       FROM user_blocks WHERE blocker_id = ? OR blocked_user_id = ? LIMIT 400`,
    )
    .bind(viewerId, viewerId, viewerId)
    .all<{ userId: string }>();
  return new Set(rows.results.map((row) => row.userId));
}
