import { AppError, createId, nowMs, ru } from '@velora/shared';
import { canModerateRole, isModeratorRole, type ModerationRole } from '@velora/moderation';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  assertSafeImageGeometry,
  fetchTelegramFile,
  inspectImage,
  maxImageBytes,
  storeTelegramImage,
  uploadTelegramImage,
} from './telegram-media';
import { telegramApiLocation } from './telegram-api';
import { readEffectivePlan } from './plans';
import { enforceRateLimit } from './reliability';
import type { Env, Variables } from './types';

interface MediaEnvironment {
  Bindings: Env;
  Variables: Variables;
}

interface MediaRow {
  readonly id: string;
  readonly ownerId: string;
  readonly storageProvider: 'TELEGRAM' | 'R2';
  readonly providerFileId: string;
  readonly objectKey: string | null;
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

const mediaProjection = `f.id, f.owner_id AS ownerId, f.storage_provider AS storageProvider,
  f.provider_file_id AS providerFileId, f.object_key AS objectKey,
  f.mime_type AS mimeType, f.original_name AS originalName, f.byte_size AS byteSize,
  f.width, f.height, f.moderation_state AS moderationState, f.created_at AS createdAt`;

export const mediaRoutes = new Hono<MediaEnvironment>();

const acceptedImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
const generatedAvatarSchema = z.object({
  prompt: z.string().trim().min(3).max(600),
});
const generatedAvatarResponseSchema = z.object({ image: z.string().min(64).max(8_000_000) });

export function avatarGenerationDailyLimit(planCode: string): number {
  if (planCode === 'PRO') return 10;
  if (planCode === 'PLUS') return 4;
  return 1;
}

mediaRoutes.post('/generate-avatar', async (context) => {
  const principal = context.get('principal');
  const ai = context.env.AI;
  if (!ai) {
    throw new AppError(
      'AVATAR_GENERATION_UNAVAILABLE',
      ru.character.avatarGenerationUnavailable,
      503,
    );
  }
  const input = generatedAvatarSchema.parse(await context.req.json());
  const plan = await readEffectivePlan(context.env.DB, principal.userId);
  const userLimit = avatarGenerationDailyLimit(plan.code);
  await enforceRateLimit(context.env.DB, {
    policy: { scope: 'AVATAR_GENERATION', limit: userLimit, windowMs: 24 * 60 * 60_000 },
    subject: principal.userId,
  });
  await enforceRateLimit(context.env.DB, {
    policy: { scope: 'AVATAR_GENERATION', limit: 120, windowMs: 24 * 60 * 60_000 },
    subject: 'global-free-neuron-budget',
  });
  let generated: unknown;
  try {
    generated = await ai.run('@cf/black-forest-labs/flux-1-schnell', {
      prompt: `Square portrait of one fictional roleplay character. No text, logos or frames. ${input.prompt}`,
      steps: 4,
    });
  } catch {
    throw new AppError('AVATAR_GENERATION_FAILED', ru.character.avatarGenerationFailed, 503);
  }
  const result = generatedAvatarResponseSchema.safeParse(generated);
  if (!result.success) {
    throw new AppError('AVATAR_GENERATION_FAILED', ru.character.avatarGenerationInvalid, 503);
  }
  return context.json({ mimeType: 'image/jpeg', imageBase64: result.data.image });
});

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
    capabilities: {
      directUpload:
        context.env.MEDIA_BUCKET !== undefined || context.env.TELEGRAM_BOT_TOKEN !== undefined,
      acceptedMimeTypes: acceptedImageMimeTypes,
      maxBytes: maxImageBytes,
      maxOutputDimension: 1_600,
    },
  });
});

mediaRoutes.post('/', async (context) => {
  const principal = context.get('principal');
  const bucket = context.env.MEDIA_BUCKET;
  if (!bucket && !context.env.TELEGRAM_BOT_TOKEN) {
    throw new AppError(
      'MEDIA_STORAGE_UNAVAILABLE',
      'Прямая загрузка временно недоступна. Отправьте изображение в чат с ботом.',
      503,
    );
  }
  const declaredMimeType = context.req.header('content-type')?.split(';', 1)[0]?.trim() ?? '';
  if (!acceptedImageMimeTypes.some((value) => value === declaredMimeType)) {
    throw new AppError('UNSUPPORTED_MEDIA', 'Поддерживаются JPEG, PNG и WebP.', 415);
  }
  const declaredLength = Number(context.req.header('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxImageBytes) {
    throw new AppError('MEDIA_TOO_LARGE', 'Изображение превышает лимит 10 МБ.', 413);
  }
  const bytes = await context.req.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > maxImageBytes) {
    throw new AppError('MEDIA_TOO_LARGE', 'Некорректный размер изображения.', 413);
  }
  const inspected = inspectImage(new Uint8Array(bytes));
  if (inspected?.mimeType !== declaredMimeType) {
    throw new AppError(
      'MEDIA_MIME_MISMATCH',
      'Содержимое файла не соответствует заявленному типу изображения.',
      415,
    );
  }
  assertSafeImageGeometry(inspected, {
    fileId: '',
    uniqueId: '',
    declaredSize: bytes.byteLength,
    width: null,
    height: null,
    originalName: null,
  });

  const id = createId();
  const extension = inspected.mimeType === 'image/jpeg' ? 'jpg' : inspected.mimeType.slice(6);
  const objectKey = `images/${principal.userId}/${id}.${extension}`;
  const checksum = await crypto.subtle.digest('SHA-256', bytes);
  const checksumHex = [...new Uint8Array(checksum)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  const originalName = normalizeOriginalName(context.req.header('x-upload-name'));
  const safeOriginalName = originalName ?? `avatar.${extension}`;
  if (!bucket && context.env.TELEGRAM_BOT_TOKEN) {
    const telegramLocation = telegramApiLocation(context.env);
    const candidate = await uploadTelegramImage(
      context.env.TELEGRAM_BOT_TOKEN,
      principal.telegramId,
      bytes,
      inspected.mimeType,
      safeOriginalName,
      fetch,
      telegramLocation.apiBaseUrl,
      telegramLocation.apiEnvironment,
    );
    const stored = await storeTelegramImage(
      context.env.DB,
      principal.userId,
      candidate,
      context.env.TELEGRAM_BOT_TOKEN,
      fetch,
      telegramLocation.apiBaseUrl,
      telegramLocation.apiEnvironment,
    );
    return context.json(
      {
        id: stored.id,
        ownerId: principal.userId,
        storageProvider: 'TELEGRAM',
        mimeType: stored.mimeType,
        originalName: candidate.originalName,
        byteSize: stored.byteSize,
        width: inspected.width,
        height: inspected.height,
        moderationState: 'PENDING',
        createdAt: nowMs(),
        contentUrl: `/api/v1/media/${stored.id}/content`,
      },
      201,
    );
  }
  if (!bucket) {
    throw new AppError('MEDIA_STORAGE_UNAVAILABLE', 'Хранилище изображений недоступно.', 503);
  }
  await bucket.put(objectKey, bytes, {
    httpMetadata: {
      contentType: inspected.mimeType,
      cacheControl: 'private, no-store',
    },
    customMetadata: { mediaId: id },
    sha256: checksum,
  });
  const timestamp = nowMs();
  const moderationCaseId = createId();
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO file_objects (
          id, owner_id, storage_provider, provider_file_id, provider_unique_id, object_key,
          mime_type, original_name, byte_size, width, height, moderation_state, created_at
        ) VALUES (?, ?, 'R2', ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      ).bind(
        id,
        principal.userId,
        objectKey,
        checksumHex,
        objectKey,
        inspected.mimeType,
        originalName,
        bytes.byteLength,
        inspected.width,
        inspected.height,
        timestamp,
      ),
      context.env.DB.prepare(
        `INSERT INTO moderation_cases
          (id, report_id, target_type, target_id, priority, state, created_at, updated_at)
         VALUES (?, NULL, 'AVATAR', ?, 30, 'OPEN', ?, ?)`,
      ).bind(moderationCaseId, id, timestamp, timestamp),
    ]);
  } catch (error) {
    await bucket.delete(objectKey).catch(() => undefined);
    const cause = error instanceof Error ? error.name : 'UnknownError';
    throw new AppError(
      'MEDIA_STORAGE_FAILED',
      'Не удалось сохранить метаданные изображения.',
      503,
      [{ cause }],
    );
  }
  return context.json(
    {
      id,
      ownerId: principal.userId,
      storageProvider: 'R2',
      mimeType: inspected.mimeType,
      originalName,
      byteSize: bytes.byteLength,
      width: inspected.width,
      height: inspected.height,
      moderationState: 'PENDING',
      createdAt: timestamp,
      contentUrl: `/api/v1/media/${id}/content`,
    },
    201,
  );
});

mediaRoutes.get('/:mediaId/content', async (context) => {
  const principal = context.get('principal');
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
  const headers = new Headers({
    'content-type': row.mimeType,
    'cache-control': publiclyReferenced ? 'public, max-age=300' : 'private, no-store',
    'content-disposition': 'inline',
    'x-content-type-options': 'nosniff',
  });
  if (row.storageProvider === 'R2') {
    const bucket = context.env.MEDIA_BUCKET;
    if (!bucket || !row.objectKey) {
      throw new AppError('MEDIA_STORAGE_UNAVAILABLE', 'R2 media adapter is unavailable.', 503);
    }
    const object = await bucket.get(row.objectKey);
    if (!object) throw new AppError('MEDIA_NOT_FOUND', 'Media file was not found.', 404);
    headers.set('etag', object.httpEtag);
    return new Response(object.body, { status: 200, headers });
  }
  if (!context.env.TELEGRAM_BOT_TOKEN) {
    throw new AppError('SERVICE_NOT_CONFIGURED', 'Telegram media adapter is unavailable.', 503);
  }
  const telegramLocation = telegramApiLocation(context.env);
  const upstream = await fetchTelegramFile(
    context.env.TELEGRAM_BOT_TOKEN,
    row.providerFileId,
    fetch,
    telegramLocation.apiBaseUrl,
    telegramLocation.apiEnvironment,
  );
  return new Response(upstream.body, { status: 200, headers });
});

mediaRoutes.delete('/:mediaId', async (context) => {
  const principal = context.get('principal');
  const id = context.req.param('mediaId');
  const owned = await context.env.DB.prepare(
    `SELECT storage_provider AS storageProvider, object_key AS objectKey
     FROM file_objects WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
  )
    .bind(id, principal.userId)
    .first<Pick<MediaRow, 'storageProvider' | 'objectKey'>>();
  if (!owned) throw new AppError('MEDIA_NOT_FOUND', 'Медиафайл не найден.', 404);
  if (owned.storageProvider === 'R2') {
    if (!context.env.MEDIA_BUCKET || !owned.objectKey) {
      throw new AppError('MEDIA_STORAGE_UNAVAILABLE', 'R2 media adapter is unavailable.', 503);
    }
    await context.env.MEDIA_BUCKET.delete(owned.objectKey);
  }
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
      'UPDATE lorebooks SET cover_media_file_id = NULL, updated_at = ? WHERE owner_id = ? AND cover_media_file_id = ?',
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

function normalizeOriginalName(value: string | undefined): string | null {
  if (!value) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Keep the supplied display label if it was not URI-encoded.
  }
  const basename = decoded.split(/[\\/]/u).at(-1) ?? '';
  const normalized = basename
    .replace(/[\p{Cc}]/gu, '')
    .trim()
    .slice(0, 160);
  return normalized.length > 0 ? normalized : null;
}

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
