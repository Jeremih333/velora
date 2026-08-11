import { AppError, nowMs } from '@velora/shared';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { isFeatureEnabled } from './reliability';
import { invalidatePublicDiscovery } from './public-cache';
import type { Env, Variables } from './types';

interface DiscoveryEnvironment {
  Bindings: Env;
  Variables: Variables;
}

interface DiscoveryRow {
  readonly id: string;
  readonly avatarFileId: string | null;
  readonly contentRating: 'SAFE' | 'MATURE';
  readonly language: 'ru' | 'en';
  readonly updatedAt: number;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly firstMessage: string;
  readonly alternateGreetingsJson: string;
  readonly creatorId: string;
  readonly creatorName: string;
  readonly likeCount: number;
  readonly bookmarkCount: number;
  readonly reviewCount: number;
  readonly averageRating: number | null;
  readonly liked: number;
  readonly bookmarked: number;
  readonly myRating: number | null;
  readonly myReviewText: string | null;
}

interface ReviewRow {
  readonly userId: string;
  readonly displayName: string;
  readonly rating: number;
  readonly reviewText: string;
  readonly updatedAt: number;
}

const querySchema = z.object({
  q: z.string().trim().max(80).default(''),
  language: z.enum(['ru', 'en']).optional(),
  rating: z.enum(['SAFE', 'MATURE', 'ALL']).default('SAFE'),
  tags: z.string().trim().max(240).default(''),
  cursor: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});

const cursorSchema = z.object({ updatedAt: z.number().int().nonnegative(), id: z.string().min(1) });
const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().max(1000).default(''),
});

export const discoveryRoutes = new Hono<DiscoveryEnvironment>();

discoveryRoutes.get('/', async (context) => {
  const principal = context.get('principal');
  const query = querySchema.parse(context.req.query());
  const allowMature = await canViewMature(
    context.env.DB,
    principal.userId,
    principal.ageGateAcceptedAt,
  );
  const publicReviews = await isFeatureEnabled(context.env.DB, 'public_reviews', principal.userId);
  if ((query.rating === 'MATURE' || query.rating === 'ALL') && !allowMature) {
    throw new AppError('MATURE_CONTENT_DISABLED', 'Mature-контент отключён в настройках.', 403);
  }
  const conditions = [
    "c.publish_state = 'PUBLISHED'",
    "c.visibility = 'PUBLIC'",
    'c.deleted_at IS NULL',
    "u.moderation_state = 'ACTIVE'",
    'u.deleted_at IS NULL',
  ];
  const values: (string | number)[] = [
    principal.userId,
    principal.userId,
    principal.userId,
    principal.userId,
  ];
  conditions.push(
    `NOT EXISTS (SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = ? AND ub.blocked_user_id = c.owner_id)
         OR (ub.blocker_id = c.owner_id AND ub.blocked_user_id = ?))`,
  );
  values.push(principal.userId, principal.userId);
  if (query.rating !== 'ALL') {
    conditions.push('c.content_rating = ?');
    values.push(query.rating);
  }
  if (query.language) {
    conditions.push('c.language = ?');
    values.push(query.language);
  }
  if (query.q) {
    conditions.push(
      `(instr(v.name, ?) > 0 OR instr(v.tagline, ?) > 0 OR instr(v.description, ?) > 0
        OR instr(COALESCE(up.display_name, u.display_name), ?) > 0
        OR EXISTS (SELECT 1 FROM character_tags search_ct JOIN tags search_t ON search_t.id = search_ct.tag_id
          WHERE search_ct.character_id = c.id
            AND (instr(search_t.display_name, ?) > 0 OR instr(search_t.slug, ?) > 0)))`,
    );
    values.push(query.q, query.q, query.q, query.q, query.q, query.q);
  }
  const tagSlugs = parseTagFilter(query.tags);
  if (tagSlugs.length > 0) {
    conditions.push(
      `EXISTS (SELECT 1 FROM character_tags filter_ct JOIN tags filter_t ON filter_t.id = filter_ct.tag_id
       WHERE filter_ct.character_id = c.id AND filter_t.slug IN (${tagSlugs.map(() => '?').join(',')}))`,
    );
    values.push(...tagSlugs);
  }
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor) {
    conditions.push('(c.updated_at < ? OR (c.updated_at = ? AND c.id < ?))');
    values.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
  }
  values.push(query.limit + 1);
  const result = await context.env.DB.prepare(
    `SELECT c.id, c.avatar_file_id AS avatarFileId, c.content_rating AS contentRating,
       c.language, c.updated_at AS updatedAt, v.name, v.tagline, v.description,
       v.first_message AS firstMessage, v.alternate_greetings_json AS alternateGreetingsJson,
       u.id AS creatorId, COALESCE(up.display_name, u.display_name) AS creatorName,
       (SELECT COUNT(*) FROM character_likes cl WHERE cl.character_id = c.id) AS likeCount,
       (SELECT COUNT(*) FROM character_bookmarks cb WHERE cb.character_id = c.id) AS bookmarkCount,
       (SELECT COUNT(*) FROM character_reviews cr WHERE cr.character_id = c.id) AS reviewCount,
       (SELECT ROUND(AVG(cr.rating), 2) FROM character_reviews cr WHERE cr.character_id = c.id) AS averageRating,
       EXISTS (SELECT 1 FROM character_likes mine_l WHERE mine_l.character_id = c.id AND mine_l.user_id = ?) AS liked,
       EXISTS (SELECT 1 FROM character_bookmarks mine_b WHERE mine_b.character_id = c.id AND mine_b.user_id = ?) AS bookmarked,
       (SELECT mine_r.rating FROM character_reviews mine_r WHERE mine_r.character_id = c.id AND mine_r.user_id = ?) AS myRating,
       (SELECT mine_r.review_text FROM character_reviews mine_r WHERE mine_r.character_id = c.id AND mine_r.user_id = ?) AS myReviewText
     FROM characters c JOIN character_versions v ON v.id = c.active_version_id
     JOIN users u ON u.id = c.owner_id
     LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE ${conditions.join(' AND ')} ORDER BY c.updated_at DESC, c.id DESC LIMIT ?`,
  )
    .bind(...values)
    .all<DiscoveryRow>();
  const hasMore = result.results.length > query.limit;
  const rows = result.results.slice(0, query.limit);
  const items = await Promise.all(
    rows.map(async (row) => toDiscoveryResponse(context.env.DB, row, publicReviews)),
  );
  const last = rows.at(-1);
  return context.json({
    items,
    nextCursor: hasMore && last ? encodeCursor(last.updatedAt, last.id) : null,
  });
});

discoveryRoutes.get('/creator-stats/me', async (context) => {
  const principal = context.get('principal');
  const stats = await context.env.DB.prepare(
    `SELECT COUNT(DISTINCT c.id) AS characterCount,
       COUNT(DISTINCT CASE WHEN c.publish_state = 'PUBLISHED' THEN c.id END) AS publishedCount,
       (SELECT COUNT(*) FROM conversations conv JOIN characters own_c ON own_c.id = conv.character_id
         WHERE own_c.owner_id = ? AND own_c.deleted_at IS NULL AND conv.deleted_at IS NULL
           AND conv.is_preview = 0) AS chatsStarted,
       (SELECT COUNT(*) FROM character_likes cl JOIN characters own_c ON own_c.id = cl.character_id
         WHERE own_c.owner_id = ? AND own_c.deleted_at IS NULL) AS likes,
       (SELECT COUNT(*) FROM character_bookmarks cb JOIN characters own_c ON own_c.id = cb.character_id
         WHERE own_c.owner_id = ? AND own_c.deleted_at IS NULL) AS bookmarks,
       (SELECT COUNT(*) FROM character_reviews cr JOIN characters own_c ON own_c.id = cr.character_id
         WHERE own_c.owner_id = ? AND own_c.deleted_at IS NULL) AS reviews,
       (SELECT ROUND(AVG(cr.rating), 2) FROM character_reviews cr
         JOIN characters own_c ON own_c.id = cr.character_id
         WHERE own_c.owner_id = ? AND own_c.deleted_at IS NULL) AS averageRating
     FROM characters c
     WHERE c.owner_id = ? AND c.deleted_at IS NULL`,
  )
    .bind(
      principal.userId,
      principal.userId,
      principal.userId,
      principal.userId,
      principal.userId,
      principal.userId,
    )
    .first<{
      characterCount: number;
      publishedCount: number;
      chatsStarted: number;
      likes: number;
      bookmarks: number;
      reviews: number;
      averageRating: number | null;
    }>();
  return context.json(
    stats ?? {
      characterCount: 0,
      publishedCount: 0,
      chatsStarted: 0,
      likes: 0,
      bookmarks: 0,
      reviews: 0,
      averageRating: null,
    },
  );
});

discoveryRoutes.get('/:characterId/reviews', async (context) => {
  const principal = context.get('principal');
  await requirePublicReviews(context.env.DB, principal.userId);
  await requireInteractableCharacter(
    context.env.DB,
    context.req.param('characterId'),
    principal.userId,
    principal.ageGateAcceptedAt,
    true,
  );
  const result = await context.env.DB.prepare(
    `SELECT cr.user_id AS userId, COALESCE(up.display_name, u.display_name) AS displayName, cr.rating,
       cr.review_text AS reviewText, cr.updated_at AS updatedAt
     FROM character_reviews cr JOIN users u ON u.id = cr.user_id
     LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE cr.character_id = ? AND u.deleted_at IS NULL AND u.moderation_state = 'ACTIVE'
       AND NOT EXISTS (SELECT 1 FROM user_blocks ub
         WHERE (ub.blocker_id = ? AND ub.blocked_user_id = cr.user_id)
            OR (ub.blocker_id = cr.user_id AND ub.blocked_user_id = ?))
     ORDER BY cr.updated_at DESC LIMIT 50`,
  )
    .bind(context.req.param('characterId'), principal.userId, principal.userId)
    .all<ReviewRow>();
  return context.json({ items: result.results });
});

discoveryRoutes.put('/:characterId/like', async (context) => {
  return setBinaryInteraction(context, 'character_likes', true);
});

discoveryRoutes.delete('/:characterId/like', async (context) => {
  return setBinaryInteraction(context, 'character_likes', false);
});

discoveryRoutes.put('/:characterId/bookmark', async (context) => {
  return setBinaryInteraction(context, 'character_bookmarks', true);
});

discoveryRoutes.delete('/:characterId/bookmark', async (context) => {
  return setBinaryInteraction(context, 'character_bookmarks', false);
});

discoveryRoutes.put('/:characterId/review', async (context) => {
  const principal = context.get('principal');
  await requirePublicReviews(context.env.DB, principal.userId);
  const characterId = z.string().min(1).parse(context.req.param('characterId'));
  await requireInteractableCharacter(
    context.env.DB,
    characterId,
    principal.userId,
    principal.ageGateAcceptedAt,
  );
  const body = reviewSchema.parse(await context.req.json());
  const timestamp = nowMs();
  await context.env.DB.prepare(
    `INSERT INTO character_reviews (user_id, character_id, rating, review_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, character_id) DO UPDATE SET
       rating = excluded.rating, review_text = excluded.review_text, updated_at = excluded.updated_at`,
  )
    .bind(principal.userId, characterId, body.rating, body.text, timestamp, timestamp)
    .run();
  invalidatePublicDiscovery(context, characterId);
  return context.json({ rating: body.rating, text: body.text, updatedAt: timestamp });
});

discoveryRoutes.delete('/:characterId/review', async (context) => {
  const principal = context.get('principal');
  await context.env.DB.prepare(
    'DELETE FROM character_reviews WHERE user_id = ? AND character_id = ?',
  )
    .bind(principal.userId, context.req.param('characterId'))
    .run();
  invalidatePublicDiscovery(context, context.req.param('characterId'));
  return context.json({ deleted: true });
});

discoveryRoutes.get('/:characterId', async (context) => {
  const principal = context.get('principal');
  const row = await context.env.DB.prepare(
    `SELECT c.id, c.avatar_file_id AS avatarFileId, c.content_rating AS contentRating,
       c.language, c.updated_at AS updatedAt, v.name, v.tagline, v.description,
       v.first_message AS firstMessage, v.alternate_greetings_json AS alternateGreetingsJson,
        u.id AS creatorId, COALESCE(up.display_name, u.display_name) AS creatorName,
       (SELECT COUNT(*) FROM character_likes cl WHERE cl.character_id = c.id) AS likeCount,
       (SELECT COUNT(*) FROM character_bookmarks cb WHERE cb.character_id = c.id) AS bookmarkCount,
       (SELECT COUNT(*) FROM character_reviews cr WHERE cr.character_id = c.id) AS reviewCount,
       (SELECT ROUND(AVG(cr.rating), 2) FROM character_reviews cr WHERE cr.character_id = c.id) AS averageRating,
       EXISTS (SELECT 1 FROM character_likes mine_l WHERE mine_l.character_id = c.id AND mine_l.user_id = ?) AS liked,
       EXISTS (SELECT 1 FROM character_bookmarks mine_b WHERE mine_b.character_id = c.id AND mine_b.user_id = ?) AS bookmarked,
       (SELECT mine_r.rating FROM character_reviews mine_r WHERE mine_r.character_id = c.id AND mine_r.user_id = ?) AS myRating,
       (SELECT mine_r.review_text FROM character_reviews mine_r WHERE mine_r.character_id = c.id AND mine_r.user_id = ?) AS myReviewText
     FROM characters c JOIN character_versions v ON v.id = c.active_version_id
     JOIN users u ON u.id = c.owner_id
     LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE c.id = ? AND c.publish_state = 'PUBLISHED'
       AND c.visibility IN ('PUBLIC', 'UNLISTED') AND c.deleted_at IS NULL
       AND u.moderation_state = 'ACTIVE' AND u.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM user_blocks ub
         WHERE (ub.blocker_id = ? AND ub.blocked_user_id = c.owner_id)
            OR (ub.blocker_id = c.owner_id AND ub.blocked_user_id = ?))`,
  )
    .bind(
      principal.userId,
      principal.userId,
      principal.userId,
      principal.userId,
      context.req.param('characterId'),
      principal.userId,
      principal.userId,
    )
    .first<DiscoveryRow>();
  if (!row) throw new AppError('CHARACTER_NOT_FOUND', 'Персонаж не найден.', 404);
  if (
    row.contentRating === 'MATURE' &&
    !(await canViewMature(context.env.DB, principal.userId, principal.ageGateAcceptedAt))
  ) {
    throw new AppError('MATURE_CONTENT_DISABLED', 'Mature-контент отключён в настройках.', 403);
  }
  return context.json(
    await toDiscoveryResponse(
      context.env.DB,
      row,
      await isFeatureEnabled(context.env.DB, 'public_reviews', principal.userId),
    ),
  );
});

async function toDiscoveryResponse(
  database: D1Database,
  row: DiscoveryRow,
  publicReviews: boolean,
) {
  const { alternateGreetingsJson, ...safe } = row;
  let alternateGreetings: readonly string[];
  try {
    alternateGreetings = z
      .array(z.string().min(1))
      .max(10)
      .parse(JSON.parse(alternateGreetingsJson));
  } catch {
    alternateGreetings = [];
  }
  return {
    ...safe,
    reviewCount: publicReviews ? row.reviewCount : 0,
    averageRating: publicReviews ? row.averageRating : null,
    myRating: publicReviews ? row.myRating : null,
    myReviewText: publicReviews ? row.myReviewText : null,
    liked: row.liked === 1,
    bookmarked: row.bookmarked === 1,
    alternateGreetings,
    tags: await readTags(database, row.id),
  };
}

async function requirePublicReviews(database: D1Database, userId: string): Promise<void> {
  if (!(await isFeatureEnabled(database, 'public_reviews', userId))) {
    throw new AppError('FEATURE_DISABLED', 'Отзывы временно недоступны.', 403);
  }
}

type InteractionTable = 'character_likes' | 'character_bookmarks';

async function setBinaryInteraction(
  context: Context<DiscoveryEnvironment>,
  table: InteractionTable,
  enabled: boolean,
): Promise<Response> {
  const principal = context.get('principal');
  const characterId = z.string().min(1).parse(context.req.param('characterId'));
  await requireInteractableCharacter(
    context.env.DB,
    characterId,
    principal.userId,
    principal.ageGateAcceptedAt,
  );
  if (table === 'character_likes') {
    if (enabled) {
      await context.env.DB.prepare(
        'INSERT INTO character_likes (user_id, character_id, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, character_id) DO NOTHING',
      )
        .bind(principal.userId, characterId, nowMs())
        .run();
    } else {
      await context.env.DB.prepare(
        'DELETE FROM character_likes WHERE user_id = ? AND character_id = ?',
      )
        .bind(principal.userId, characterId)
        .run();
    }
    const count = await context.env.DB.prepare(
      'SELECT COUNT(*) AS count FROM character_likes WHERE character_id = ?',
    )
      .bind(characterId)
      .first<{ count: number }>();
    invalidatePublicDiscovery(context, characterId);
    return context.json({ liked: enabled, likeCount: count?.count ?? 0 });
  }
  if (enabled) {
    await context.env.DB.prepare(
      'INSERT INTO character_bookmarks (user_id, character_id, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, character_id) DO NOTHING',
    )
      .bind(principal.userId, characterId, nowMs())
      .run();
  } else {
    await context.env.DB.prepare(
      'DELETE FROM character_bookmarks WHERE user_id = ? AND character_id = ?',
    )
      .bind(principal.userId, characterId)
      .run();
  }
  const count = await context.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM character_bookmarks WHERE character_id = ?',
  )
    .bind(characterId)
    .first<{ count: number }>();
  invalidatePublicDiscovery(context, characterId);
  return context.json({ bookmarked: enabled, bookmarkCount: count?.count ?? 0 });
}

async function requireInteractableCharacter(
  database: D1Database,
  characterId: string,
  userId: string,
  ageGateAcceptedAt: number | null,
  allowOwner = false,
): Promise<void> {
  const character = await database
    .prepare(
      `SELECT c.owner_id AS ownerId, c.content_rating AS contentRating
       FROM characters c JOIN users u ON u.id = c.owner_id
       WHERE c.id = ? AND c.publish_state = 'PUBLISHED'
         AND c.visibility IN ('PUBLIC', 'UNLISTED') AND c.deleted_at IS NULL
         AND u.deleted_at IS NULL AND u.moderation_state = 'ACTIVE'
         AND NOT EXISTS (SELECT 1 FROM user_blocks ub
           WHERE (ub.blocker_id = ? AND ub.blocked_user_id = c.owner_id)
              OR (ub.blocker_id = c.owner_id AND ub.blocked_user_id = ?))`,
    )
    .bind(characterId, userId, userId)
    .first<{ ownerId: string; contentRating: 'SAFE' | 'MATURE' }>();
  if (!character) {
    throw new AppError('CHARACTER_NOT_FOUND', 'Персонаж не найден.', 404);
  }
  if (!allowOwner && character.ownerId === userId) {
    throw new AppError(
      'SELF_INTERACTION_FORBIDDEN',
      'Нельзя оценивать или сохранять собственного персонажа.',
      409,
    );
  }
  if (
    character.contentRating === 'MATURE' &&
    !(await canViewMature(database, userId, ageGateAcceptedAt))
  ) {
    throw new AppError('MATURE_CONTENT_DISABLED', 'Mature-контент отключён в настройках.', 403);
  }
}

async function canViewMature(
  database: D1Database,
  userId: string,
  ageGateAcceptedAt: number | null,
): Promise<boolean> {
  if (ageGateAcceptedAt === null) return false;
  const row = await database
    .prepare('SELECT nsfw_visible AS nsfwVisible FROM user_settings WHERE user_id = ?')
    .bind(userId)
    .first<{ nsfwVisible: number }>();
  return row?.nsfwVisible === 1;
}

async function readTags(database: D1Database, characterId: string): Promise<string[]> {
  const result = await database
    .prepare(
      `SELECT t.display_name AS displayName FROM character_tags ct JOIN tags t ON t.id = ct.tag_id
       WHERE ct.character_id = ? ORDER BY t.display_name`,
    )
    .bind(characterId)
    .all<{ displayName: string }>();
  return result.results.map((row) => row.displayName);
}

function parseTagFilter(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map(toTagSlug)
        .filter((tag) => tag.length > 0),
    ),
  ].slice(0, 5);
}

function toTagSlug(value: string): string {
  return value
    .trim()
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 64);
}

function encodeCursor(updatedAt: number, id: string): string {
  return btoa(JSON.stringify({ updatedAt, id }));
}

function decodeCursor(value: string) {
  try {
    return cursorSchema.parse(JSON.parse(atob(value)));
  } catch {
    throw new AppError('INVALID_CURSOR', 'Курсор выдачи недействителен.', 400);
  }
}
