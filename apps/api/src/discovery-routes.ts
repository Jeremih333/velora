import {
  AppError,
  characterGroupSizeSchema,
  characterGroupSizes,
  characterLanguageSchema,
  characterLanguages,
  nowMs,
  type CharacterGroupSize,
  type CharacterLanguageCode,
} from '@velora/shared';
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
  readonly avatarFocalX: number;
  readonly avatarFocalY: number;
  readonly contentRating: 'SAFE' | 'MATURE';
  readonly language: CharacterLanguageCode;
  readonly groupSize: CharacterGroupSize;
  readonly updatedAt: number;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly personality: string | null;
  readonly firstMessage: string;
  readonly alternateGreetingsJson: string;
  readonly creatorId: string;
  readonly creatorName: string;
  readonly creatorRole: string;
  readonly avatarBotUsername: string | null;
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

interface DiscoveryTagRow {
  readonly slug: string;
  readonly displayName: string;
  readonly usageCount: number;
}

interface DiscoveryLanguageCountRow {
  readonly code: CharacterLanguageCode;
  readonly usageCount: number;
}

interface DiscoveryGroupSizeCountRow {
  readonly code: CharacterGroupSize;
  readonly usageCount: number;
}

const querySchema = z.object({
  q: z.string().trim().max(80).default(''),
  language: characterLanguageSchema.optional(),
  languages: z.string().trim().max(180).default(''),
  groupSizes: z.string().trim().max(80).default(''),
  rating: z.enum(['SAFE', 'MATURE', 'ALL']).default('ALL'),
  tags: z.string().trim().max(240).default(''),
  includeTags: z.string().trim().max(640).default(''),
  excludeTags: z.string().trim().max(640).default(''),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  cursor: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(20),
});
const tagCatalogueQuerySchema = z.object({
  language: characterLanguageSchema.optional(),
  languages: z.string().trim().max(180).default(''),
  rating: z.enum(['SAFE', 'MATURE', 'ALL']).default('ALL'),
  groupSizes: z.string().trim().max(80).default(''),
  limit: z.coerce.number().int().min(1).max(200).default(200),
});
const languageCatalogueQuerySchema = z.object({
  rating: z.enum(['SAFE', 'MATURE', 'ALL']).default('ALL'),
  includeTags: z.string().trim().max(640).default(''),
  excludeTags: z.string().trim().max(640).default(''),
  groupSizes: z.string().trim().max(80).default(''),
});
const groupSizeCatalogueQuerySchema = z.object({
  language: characterLanguageSchema.optional(),
  languages: z.string().trim().max(180).default(''),
  rating: z.enum(['SAFE', 'MATURE', 'ALL']).default('ALL'),
  includeTags: z.string().trim().max(640).default(''),
  excludeTags: z.string().trim().max(640).default(''),
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
  const maturePreferences = await readMaturePreferences(
    context.env.DB,
    principal.userId,
    principal.ageGateAcceptedAt,
  );
  const publicReviews = await isFeatureEnabled(context.env.DB, 'public_reviews', principal.userId);
  const groupsEnabled = await isFeatureEnabled(context.env.DB, 'groups', principal.userId);
  if (query.rating === 'MATURE' && !maturePreferences.allowMature) {
    throw new AppError('MATURE_CONTENT_DISABLED', 'Mature-контент отключён в настройках.', 403);
  }
  const effectiveRating = effectiveDiscoveryRating(query.rating, maturePreferences.safeSearch);
  const conditions = [
    "c.publish_state = 'PUBLISHED'",
    "c.visibility = 'PUBLIC'",
    'c.deleted_at IS NULL',
    "u.moderation_state = 'ACTIVE'",
    'u.deleted_at IS NULL',
  ];
  const filterValues: (string | number)[] = [];
  conditions.push(
    `NOT EXISTS (SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = ? AND ub.blocked_user_id = c.owner_id)
         OR (ub.blocker_id = c.owner_id AND ub.blocked_user_id = ?))`,
  );
  filterValues.push(principal.userId, principal.userId);
  if (effectiveRating !== 'ALL') {
    conditions.push('c.content_rating = ?');
    filterValues.push(effectiveRating);
  }
  const languageFilters = resolveDiscoveryLanguageFilters(query.languages, query.language);
  if (languageFilters.length > 0) {
    conditions.push(`c.language_code IN (${languageFilters.map(() => '?').join(',')})`);
    filterValues.push(...languageFilters);
  }
  const groupSizeFilters = groupsEnabled ? resolveDiscoveryGroupSizeFilters(query.groupSizes) : [];
  if (groupSizeFilters.length > 0) {
    conditions.push(`c.group_size IN (${groupSizeFilters.map(() => '?').join(',')})`);
    filterValues.push(...groupSizeFilters);
  }
  if (query.q) {
    conditions.push(
      `(instr(v.name, ?) > 0 OR instr(v.tagline, ?) > 0 OR instr(v.description, ?) > 0
        OR instr(COALESCE(up.display_name, u.display_name), ?) > 0
        OR EXISTS (SELECT 1 FROM character_tags search_ct JOIN tags search_t ON search_t.id = search_ct.tag_id
          WHERE search_ct.character_id = c.id
            AND (instr(search_t.display_name, ?) > 0 OR instr(search_t.slug, ?) > 0)))`,
    );
    filterValues.push(query.q, query.q, query.q, query.q, query.q, query.q);
  }
  const tagFilters = resolveDiscoveryTagFilters(query.includeTags, query.excludeTags, query.tags);
  for (const slug of tagFilters.include) {
    conditions.push(
      `EXISTS (SELECT 1 FROM character_tags filter_ct JOIN tags filter_t ON filter_t.id = filter_ct.tag_id
       WHERE filter_ct.character_id = c.id AND filter_t.slug = ?)`,
    );
    filterValues.push(slug);
  }
  if (tagFilters.exclude.length > 0) {
    conditions.push(
      `NOT EXISTS (SELECT 1 FROM character_tags excluded_ct JOIN tags excluded_t ON excluded_t.id = excluded_ct.tag_id
       WHERE excluded_ct.character_id = c.id
         AND excluded_t.slug IN (${tagFilters.exclude.map(() => '?').join(',')}))`,
    );
    filterValues.push(...tagFilters.exclude);
  }
  const countConditions = [...conditions];
  const countValues = [...filterValues];
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor) {
    const comparison = query.sort === 'newest' ? '<' : '>';
    conditions.push(
      `(c.updated_at ${comparison} ? OR (c.updated_at = ? AND c.id ${comparison} ?))`,
    );
    filterValues.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
  }
  const direction = query.sort === 'newest' ? 'DESC' : 'ASC';
  const values: (string | number)[] = [
    principal.userId,
    principal.userId,
    principal.userId,
    principal.userId,
    ...filterValues,
    query.limit + 1,
  ];
  const total = await context.env.DB.prepare(
    `SELECT COUNT(*) AS totalCount
     FROM characters c JOIN character_versions v ON v.id = c.active_version_id
     JOIN users u ON u.id = c.owner_id
     LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE ${countConditions.join(' AND ')}`,
  )
    .bind(...countValues)
    .first<{ totalCount: number }>();
  const result = await context.env.DB.prepare(
    `SELECT c.id, c.avatar_file_id AS avatarFileId,
       c.avatar_focal_x AS avatarFocalX, c.avatar_focal_y AS avatarFocalY,
       c.content_rating AS contentRating,
       c.language_code AS language, c.group_size AS groupSize, c.updated_at AS updatedAt,
       v.name, v.tagline, v.description,
       CASE WHEN c.personality_visible = 1 THEN v.personality ELSE NULL END AS personality,
       v.first_message AS firstMessage, v.alternate_greetings_json AS alternateGreetingsJson,
       u.id AS creatorId, COALESCE(up.display_name, u.display_name) AS creatorName,
       u.role AS creatorRole,
       (SELECT cab.telegram_username FROM character_avatar_bots cab
        WHERE cab.character_id = c.id AND cab.status = 'ACTIVE'
        ORDER BY cab.updated_at DESC LIMIT 1) AS avatarBotUsername,
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
     WHERE ${conditions.join(' AND ')} ORDER BY c.updated_at ${direction}, c.id ${direction} LIMIT ?`,
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
    totalCount: total?.totalCount ?? 0,
    nextCursor: hasMore && last ? encodeCursor(last.updatedAt, last.id) : null,
    contentPreferences: {
      safeSearch: maturePreferences.safeSearch,
      matureImageBlur: maturePreferences.matureImageBlur,
    },
  });
});

discoveryRoutes.get('/tags/catalog', async (context) => {
  const principal = context.get('principal');
  const query = tagCatalogueQuerySchema.parse(context.req.query());
  const maturePreferences = await readMaturePreferences(
    context.env.DB,
    principal.userId,
    principal.ageGateAcceptedAt,
  );
  if (query.rating === 'MATURE' && !maturePreferences.allowMature) {
    throw new AppError('MATURE_CONTENT_DISABLED', 'Mature-контент отключён в настройках.', 403);
  }
  const effectiveRating = effectiveDiscoveryRating(query.rating, maturePreferences.safeSearch);
  const groupsEnabled = await isFeatureEnabled(context.env.DB, 'groups', principal.userId);
  const conditions = [
    "c.publish_state = 'PUBLISHED'",
    "c.visibility = 'PUBLIC'",
    'c.deleted_at IS NULL',
    "u.moderation_state = 'ACTIVE'",
    'u.deleted_at IS NULL',
    `NOT EXISTS (SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = ? AND ub.blocked_user_id = c.owner_id)
         OR (ub.blocker_id = c.owner_id AND ub.blocked_user_id = ?))`,
  ];
  const values: (string | number)[] = [principal.userId, principal.userId];
  if (effectiveRating !== 'ALL') {
    conditions.push('c.content_rating = ?');
    values.push(effectiveRating);
  }
  const languageFilters = resolveDiscoveryLanguageFilters(query.languages, query.language);
  if (languageFilters.length > 0) {
    conditions.push(`c.language_code IN (${languageFilters.map(() => '?').join(',')})`);
    values.push(...languageFilters);
  }
  const groupSizes = groupsEnabled ? resolveDiscoveryGroupSizeFilters(query.groupSizes) : [];
  if (groupSizes.length > 0) {
    conditions.push(`c.group_size IN (${groupSizes.map(() => '?').join(',')})`);
    values.push(...groupSizes);
  }
  const result = await context.env.DB.prepare(
    `SELECT t.slug, t.display_name AS displayName, COUNT(DISTINCT c.id) AS usageCount
     FROM tags t
     JOIN character_tags ct ON ct.tag_id = t.id
     JOIN characters c ON c.id = ct.character_id
     JOIN users u ON u.id = c.owner_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY t.id, t.slug, t.display_name
     ORDER BY usageCount DESC, t.display_name COLLATE NOCASE ASC, t.slug ASC
     LIMIT ?`,
  )
    .bind(...values, query.limit)
    .all<DiscoveryTagRow>();
  return context.json({ items: result.results });
});

discoveryRoutes.get('/languages/catalog', async (context) => {
  const principal = context.get('principal');
  const query = languageCatalogueQuerySchema.parse(context.req.query());
  const maturePreferences = await readMaturePreferences(
    context.env.DB,
    principal.userId,
    principal.ageGateAcceptedAt,
  );
  if (query.rating === 'MATURE' && !maturePreferences.allowMature) {
    throw new AppError('MATURE_CONTENT_DISABLED', 'Mature-контент отключён в настройках.', 403);
  }
  const effectiveRating = effectiveDiscoveryRating(query.rating, maturePreferences.safeSearch);
  const groupsEnabled = await isFeatureEnabled(context.env.DB, 'groups', principal.userId);
  const conditions = [
    "c.publish_state = 'PUBLISHED'",
    "c.visibility = 'PUBLIC'",
    'c.deleted_at IS NULL',
    "u.moderation_state = 'ACTIVE'",
    'u.deleted_at IS NULL',
    `NOT EXISTS (SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = ? AND ub.blocked_user_id = c.owner_id)
         OR (ub.blocker_id = c.owner_id AND ub.blocked_user_id = ?))`,
  ];
  const values: (string | number)[] = [principal.userId, principal.userId];
  if (effectiveRating !== 'ALL') {
    conditions.push('c.content_rating = ?');
    values.push(effectiveRating);
  }
  const tagFilters = resolveDiscoveryTagFilters(query.includeTags, query.excludeTags, '');
  for (const slug of tagFilters.include) {
    conditions.push(
      `EXISTS (SELECT 1 FROM character_tags filter_ct JOIN tags filter_t ON filter_t.id = filter_ct.tag_id
       WHERE filter_ct.character_id = c.id AND filter_t.slug = ?)`,
    );
    values.push(slug);
  }
  if (tagFilters.exclude.length > 0) {
    conditions.push(
      `NOT EXISTS (SELECT 1 FROM character_tags excluded_ct JOIN tags excluded_t ON excluded_t.id = excluded_ct.tag_id
       WHERE excluded_ct.character_id = c.id
         AND excluded_t.slug IN (${tagFilters.exclude.map(() => '?').join(',')}))`,
    );
    values.push(...tagFilters.exclude);
  }
  const groupSizes = groupsEnabled ? resolveDiscoveryGroupSizeFilters(query.groupSizes) : [];
  if (groupSizes.length > 0) {
    conditions.push(`c.group_size IN (${groupSizes.map(() => '?').join(',')})`);
    values.push(...groupSizes);
  }
  const result = await context.env.DB.prepare(
    `SELECT c.language_code AS code, COUNT(*) AS usageCount
     FROM characters c JOIN users u ON u.id = c.owner_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY c.language_code`,
  )
    .bind(...values)
    .all<DiscoveryLanguageCountRow>();
  const counts = new Map(result.results.map((row) => [row.code, row.usageCount]));
  const catalogueOrder = new Map(
    characterLanguages.map((language, index) => [language.code, index]),
  );
  const items = characterLanguages
    .map((language) => ({ ...language, usageCount: counts.get(language.code) ?? 0 }))
    .sort(
      (left, right) =>
        right.usageCount - left.usageCount ||
        (catalogueOrder.get(left.code) ?? 0) - (catalogueOrder.get(right.code) ?? 0),
    );
  return context.json({ items });
});

discoveryRoutes.get('/group-sizes/catalog', async (context) => {
  const principal = context.get('principal');
  const enabled = await isFeatureEnabled(context.env.DB, 'groups', principal.userId);
  if (!enabled) return context.json({ enabled: false, items: [] });

  const query = groupSizeCatalogueQuerySchema.parse(context.req.query());
  const maturePreferences = await readMaturePreferences(
    context.env.DB,
    principal.userId,
    principal.ageGateAcceptedAt,
  );
  if (query.rating === 'MATURE' && !maturePreferences.allowMature) {
    throw new AppError('MATURE_CONTENT_DISABLED', 'Mature-контент отключён в настройках.', 403);
  }
  const effectiveRating = effectiveDiscoveryRating(query.rating, maturePreferences.safeSearch);
  const conditions = [
    "c.publish_state = 'PUBLISHED'",
    "c.visibility = 'PUBLIC'",
    'c.deleted_at IS NULL',
    "u.moderation_state = 'ACTIVE'",
    'u.deleted_at IS NULL',
    `NOT EXISTS (SELECT 1 FROM user_blocks ub
      WHERE (ub.blocker_id = ? AND ub.blocked_user_id = c.owner_id)
         OR (ub.blocker_id = c.owner_id AND ub.blocked_user_id = ?))`,
  ];
  const values: (string | number)[] = [principal.userId, principal.userId];
  if (effectiveRating !== 'ALL') {
    conditions.push('c.content_rating = ?');
    values.push(effectiveRating);
  }
  const languages = resolveDiscoveryLanguageFilters(query.languages, query.language);
  if (languages.length > 0) {
    conditions.push(`c.language_code IN (${languages.map(() => '?').join(',')})`);
    values.push(...languages);
  }
  const tags = resolveDiscoveryTagFilters(query.includeTags, query.excludeTags, '');
  for (const slug of tags.include) {
    conditions.push(
      `EXISTS (SELECT 1 FROM character_tags filter_ct JOIN tags filter_t ON filter_t.id = filter_ct.tag_id
       WHERE filter_ct.character_id = c.id AND filter_t.slug = ?)`,
    );
    values.push(slug);
  }
  if (tags.exclude.length > 0) {
    conditions.push(
      `NOT EXISTS (SELECT 1 FROM character_tags excluded_ct JOIN tags excluded_t ON excluded_t.id = excluded_ct.tag_id
       WHERE excluded_ct.character_id = c.id
         AND excluded_t.slug IN (${tags.exclude.map(() => '?').join(',')}))`,
    );
    values.push(...tags.exclude);
  }
  const result = await context.env.DB.prepare(
    `SELECT c.group_size AS code, COUNT(*) AS usageCount
     FROM characters c JOIN users u ON u.id = c.owner_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY c.group_size`,
  )
    .bind(...values)
    .all<DiscoveryGroupSizeCountRow>();
  const counts = new Map(result.results.map((row) => [row.code, row.usageCount]));
  return context.json({
    enabled: true,
    items: characterGroupSizes.map((definition) => ({
      ...definition,
      usageCount: counts.get(definition.code) ?? 0,
    })),
  });
});

export function effectiveDiscoveryRating(
  requested: 'SAFE' | 'MATURE' | 'ALL',
  safeSearch: boolean,
): 'SAFE' | 'MATURE' | 'ALL' {
  return safeSearch ? 'SAFE' : requested;
}

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
    `SELECT c.id, c.avatar_file_id AS avatarFileId,
       c.avatar_focal_x AS avatarFocalX, c.avatar_focal_y AS avatarFocalY,
       c.content_rating AS contentRating,
       c.language_code AS language, c.group_size AS groupSize, c.updated_at AS updatedAt,
       v.name, v.tagline, v.description,
       CASE WHEN c.personality_visible = 1 THEN v.personality ELSE NULL END AS personality,
       v.first_message AS firstMessage, v.alternate_greetings_json AS alternateGreetingsJson,
        u.id AS creatorId, COALESCE(up.display_name, u.display_name) AS creatorName,
       u.role AS creatorRole,
       (SELECT cab.telegram_username FROM character_avatar_bots cab
        WHERE cab.character_id = c.id AND cab.status = 'ACTIVE'
        ORDER BY cab.updated_at DESC LIMIT 1) AS avatarBotUsername,
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

interface MaturePreferences {
  readonly allowMature: boolean;
  readonly safeSearch: boolean;
  readonly matureImageBlur: boolean;
}

async function readMaturePreferences(
  database: D1Database,
  userId: string,
  ageGateAcceptedAt: number | null,
): Promise<MaturePreferences> {
  const row = await database
    .prepare(
      `SELECT nsfw_visible AS nsfwVisible, safe_search AS safeSearch,
       mature_image_blur AS matureImageBlur FROM user_settings WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{ nsfwVisible: number; safeSearch: number; matureImageBlur: number }>();
  if (!row) throw new AppError('SETTINGS_NOT_FOUND', 'Настройки не найдены.', 404);
  const allowMature = ageGateAcceptedAt !== null && row.nsfwVisible === 1;
  return {
    allowMature,
    safeSearch: !allowMature || row.safeSearch !== 0,
    matureImageBlur: row.matureImageBlur !== 0,
  };
}

async function canViewMature(
  database: D1Database,
  userId: string,
  ageGateAcceptedAt: number | null,
): Promise<boolean> {
  return (await readMaturePreferences(database, userId, ageGateAcceptedAt)).allowMature;
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
  ].slice(0, 20);
}

export function resolveDiscoveryLanguageFilters(
  value: string,
  legacyLanguage?: CharacterLanguageCode,
): readonly CharacterLanguageCode[] {
  const candidates = [
    ...new Set([
      ...(legacyLanguage ? [legacyLanguage] : []),
      ...value
        .split(',')
        .map((candidate) => candidate.trim().toLocaleLowerCase())
        .filter((candidate) => candidate.length > 0),
    ]),
  ];
  if (candidates.length > characterLanguages.length) {
    throw new AppError('TOO_MANY_LANGUAGE_FILTERS', 'Выбрано слишком много языков.', 400);
  }
  return candidates.map((candidate) => {
    const parsed = characterLanguageSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new AppError('INVALID_LANGUAGE_FILTER', `Неизвестный язык «${candidate}».`, 400);
    }
    return parsed.data;
  });
}

export function resolveDiscoveryGroupSizeFilters(value: string): readonly CharacterGroupSize[] {
  const candidates = [
    ...new Set(
      value
        .split(',')
        .map((candidate) => candidate.trim().toLocaleLowerCase())
        .filter((candidate) => candidate.length > 0),
    ),
  ];
  if (candidates.length > characterGroupSizes.length) {
    throw new AppError(
      'TOO_MANY_GROUP_SIZE_FILTERS',
      'Выбрано слишком много размеров группы.',
      400,
    );
  }
  return candidates.map((candidate) => {
    const parsed = characterGroupSizeSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new AppError(
        'INVALID_GROUP_SIZE_FILTER',
        `Неизвестный размер группы «${candidate}».`,
        400,
      );
    }
    return parsed.data;
  });
}

export function resolveDiscoveryTagFilters(
  includeValue: string,
  excludeValue: string,
  legacyIncludeValue = '',
): { readonly include: readonly string[]; readonly exclude: readonly string[] } {
  const include = [
    ...new Set([...parseTagFilter(legacyIncludeValue), ...parseTagFilter(includeValue)]),
  ];
  const exclude = parseTagFilter(excludeValue);
  const conflict = include.find((slug) => exclude.includes(slug));
  if (conflict) {
    throw new AppError(
      'TAG_FILTER_CONFLICT',
      `Тег «${conflict}» нельзя одновременно включить и исключить.`,
      400,
    );
  }
  return { include, exclude };
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
