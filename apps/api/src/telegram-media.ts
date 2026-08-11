import { AppError, createId, nowMs } from '@velora/shared';
import { z } from 'zod';

export const telegramPhotoSchema = z.object({
  file_id: z.string().min(1).max(512),
  file_unique_id: z.string().min(1).max(512),
  width: z.number().int().positive().max(16_384),
  height: z.number().int().positive().max(16_384),
  file_size: z.number().int().nonnegative().max(20_000_000).optional(),
});

export const telegramDocumentSchema = z.object({
  file_id: z.string().min(1).max(512),
  file_unique_id: z.string().min(1).max(512),
  file_name: z.string().max(255).optional(),
  mime_type: z.string().max(128).optional(),
  file_size: z.number().int().nonnegative().max(20_000_000).optional(),
});

export type TelegramPhoto = z.infer<typeof telegramPhotoSchema>;
export type TelegramDocument = z.infer<typeof telegramDocumentSchema>;

export interface TelegramImageCandidate {
  readonly fileId: string;
  readonly uniqueId: string;
  readonly declaredSize: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly originalName: string | null;
}

const getFileResponseSchema = z.object({
  ok: z.literal(true),
  result: z.object({ file_path: z.string().min(1).max(1_024), file_size: z.number().optional() }),
});

const maxImageBytes = 10_000_000;

export function selectTelegramImage(
  photos: readonly TelegramPhoto[] | undefined,
  document: TelegramDocument | undefined,
): TelegramImageCandidate | null {
  if (photos && photos.length > 0) {
    const selected = [...photos].sort(
      (left, right) =>
        (right.file_size ?? right.width * right.height) -
        (left.file_size ?? left.width * left.height),
    )[0];
    if (!selected) return null;
    return {
      fileId: selected.file_id,
      uniqueId: selected.file_unique_id,
      declaredSize: selected.file_size ?? 0,
      width: selected.width,
      height: selected.height,
      originalName: null,
    };
  }
  if (!document?.mime_type?.startsWith('image/')) return null;
  return {
    fileId: document.file_id,
    uniqueId: document.file_unique_id,
    declaredSize: document.file_size ?? 0,
    width: null,
    height: null,
    originalName: document.file_name ?? null,
  };
}

export async function storeTelegramImage(
  database: D1Database,
  ownerId: string,
  candidate: TelegramImageCandidate,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<{ readonly id: string; readonly mimeType: string; readonly byteSize: number }> {
  if (candidate.declaredSize > maxImageBytes) {
    throw new AppError('MEDIA_TOO_LARGE', 'Изображение превышает лимит 10 МБ.', 413);
  }
  const downloaded = await downloadTelegramFile(token, candidate.fileId, fetcher, maxImageBytes);
  const mimeType = detectImageType(new Uint8Array(downloaded.bytes));
  if (!mimeType) {
    throw new AppError('UNSUPPORTED_MEDIA', 'Поддерживаются JPEG, PNG и WebP.', 415);
  }
  const id = createId();
  const timestamp = nowMs();
  await database
    .prepare(
      `INSERT INTO file_objects (
        id, owner_id, storage_provider, provider_file_id, provider_unique_id, mime_type,
        original_name, byte_size, width, height, moderation_state, created_at
      ) VALUES (?, ?, 'TELEGRAM', ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
      ON CONFLICT(owner_id, storage_provider, provider_file_id) DO UPDATE SET
        provider_unique_id = excluded.provider_unique_id, mime_type = excluded.mime_type,
        original_name = excluded.original_name, byte_size = excluded.byte_size,
        width = excluded.width, height = excluded.height, moderation_state = 'PENDING',
        deleted_at = NULL`,
    )
    .bind(
      id,
      ownerId,
      candidate.fileId,
      candidate.uniqueId,
      mimeType,
      candidate.originalName,
      downloaded.bytes.byteLength,
      candidate.width,
      candidate.height,
      timestamp,
    )
    .run();
  const stored = await database
    .prepare(
      `SELECT id, mime_type AS mimeType, byte_size AS byteSize FROM file_objects
       WHERE owner_id = ? AND storage_provider = 'TELEGRAM' AND provider_file_id = ?`,
    )
    .bind(ownerId, candidate.fileId)
    .first<{ id: string; mimeType: string; byteSize: number }>();
  if (!stored) throw new AppError('MEDIA_STORAGE_FAILED', 'Не удалось сохранить медиафайл.', 503);
  return stored;
}

export async function fetchTelegramFile(
  token: string,
  fileId: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const file = await getTelegramFile(token, fileId, fetcher);
  const response = await fetcher(`https://api.telegram.org/file/bot${token}/${file.filePath}`);
  if (!response.ok || !response.body) {
    throw new AppError('MEDIA_UNAVAILABLE', 'Telegram временно не отдал медиафайл.', 503);
  }
  return response;
}

async function downloadTelegramFile(
  token: string,
  fileId: string,
  fetcher: typeof fetch,
  maxBytes: number,
): Promise<{ readonly bytes: ArrayBuffer }> {
  const file = await getTelegramFile(token, fileId, fetcher);
  if (file.fileSize !== null && file.fileSize > maxBytes) {
    throw new AppError('MEDIA_TOO_LARGE', 'Изображение превышает лимит 10 МБ.', 413);
  }
  const response = await fetcher(`https://api.telegram.org/file/bot${token}/${file.filePath}`);
  if (!response.ok) throw new AppError('MEDIA_UNAVAILABLE', 'Не удалось скачать медиафайл.', 503);
  const contentLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new AppError('MEDIA_TOO_LARGE', 'Изображение превышает лимит 10 МБ.', 413);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    throw new AppError('MEDIA_TOO_LARGE', 'Некорректный размер изображения.', 413);
  }
  return { bytes };
}

async function getTelegramFile(token: string, fileId: string, fetcher: typeof fetch) {
  const response = await fetcher(`https://api.telegram.org/bot${token}/getFile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!response.ok) throw new AppError('MEDIA_UNAVAILABLE', 'Telegram не нашёл медиафайл.', 503);
  const parsed = getFileResponseSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new AppError('MEDIA_UNAVAILABLE', 'Telegram вернул неверные данные.', 503);
  if (parsed.data.result.file_path.includes('..')) {
    throw new AppError('MEDIA_UNAVAILABLE', 'Telegram вернул небезопасный путь.', 503);
  }
  return {
    filePath: parsed.data.result.file_path,
    fileSize: parsed.data.result.file_size ?? null,
  };
}

export function detectImageType(
  bytes: Uint8Array,
): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}
