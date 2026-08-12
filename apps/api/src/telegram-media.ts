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
const maxImageDimension = 8_192;
const maxImagePixels = 40_000_000;

export interface InspectedImage {
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly width: number;
  readonly height: number;
}

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
  apiBaseUrl?: string,
): Promise<{ readonly id: string; readonly mimeType: string; readonly byteSize: number }> {
  if (candidate.declaredSize > maxImageBytes) {
    throw new AppError('MEDIA_TOO_LARGE', 'Изображение превышает лимит 10 МБ.', 413);
  }
  const downloaded = await downloadTelegramFile(
    token,
    candidate.fileId,
    fetcher,
    maxImageBytes,
    apiBaseUrl,
  );
  const inspected = inspectImage(new Uint8Array(downloaded.bytes));
  if (!inspected) {
    throw new AppError('UNSUPPORTED_MEDIA', 'Поддерживаются JPEG, PNG и WebP.', 415);
  }
  assertSafeImageGeometry(inspected, candidate);
  const id = createId();
  const moderationCaseId = createId();
  const timestamp = nowMs();
  await database.batch([
    database
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
        inspected.mimeType,
        candidate.originalName,
        downloaded.bytes.byteLength,
        inspected.width,
        inspected.height,
        timestamp,
      ),
    database
      .prepare(
        `INSERT OR IGNORE INTO moderation_cases
         (id, report_id, target_type, target_id, priority, state, created_at, updated_at)
         SELECT ?, NULL, 'AVATAR', id, 30, 'OPEN', ?, ? FROM file_objects
         WHERE owner_id = ? AND storage_provider = 'TELEGRAM' AND provider_file_id = ?
           AND deleted_at IS NULL AND moderation_state = 'PENDING'`,
      )
      .bind(moderationCaseId, timestamp, timestamp, ownerId, candidate.fileId),
  ]);
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
  apiBaseUrl?: string,
): Promise<Response> {
  const file = await getTelegramFile(token, fileId, fetcher, apiBaseUrl);
  const response = await fetcher(
    `${apiBaseUrl ?? 'https://api.telegram.org'}/file/bot${token}/${file.filePath}`,
  );
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
  apiBaseUrl?: string,
): Promise<{ readonly bytes: ArrayBuffer }> {
  const file = await getTelegramFile(token, fileId, fetcher, apiBaseUrl);
  if (file.fileSize !== null && file.fileSize > maxBytes) {
    throw new AppError('MEDIA_TOO_LARGE', 'Изображение превышает лимит 10 МБ.', 413);
  }
  const response = await fetcher(
    `${apiBaseUrl ?? 'https://api.telegram.org'}/file/bot${token}/${file.filePath}`,
  );
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

async function getTelegramFile(
  token: string,
  fileId: string,
  fetcher: typeof fetch,
  apiBaseUrl?: string,
) {
  const response = await fetcher(
    `${apiBaseUrl ?? 'https://api.telegram.org'}/bot${token}/getFile`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    },
  );
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

export function inspectImage(bytes: Uint8Array): InspectedImage | null {
  const mimeType = detectImageType(bytes);
  if (!mimeType) return null;
  const dimensions =
    mimeType === 'image/png'
      ? inspectPng(bytes)
      : mimeType === 'image/jpeg'
        ? inspectJpeg(bytes)
        : inspectWebp(bytes);
  return dimensions ? { mimeType, ...dimensions } : null;
}

export function assertSafeImageGeometry(
  image: InspectedImage,
  candidate: TelegramImageCandidate,
): void {
  if (
    image.width > maxImageDimension ||
    image.height > maxImageDimension ||
    image.width * image.height > maxImagePixels
  ) {
    throw new AppError(
      'MEDIA_DIMENSIONS_TOO_LARGE',
      'Размеры изображения превышают безопасный лимит.',
      413,
    );
  }
  if (
    (candidate.width !== null && candidate.width !== image.width) ||
    (candidate.height !== null && candidate.height !== image.height)
  ) {
    throw new AppError(
      'MEDIA_DIMENSIONS_MISMATCH',
      'Фактические размеры изображения не совпадают с данными Telegram.',
      415,
    );
  }
}

function inspectPng(bytes: Uint8Array): { readonly width: number; readonly height: number } | null {
  if (bytes.length < 24 || imageAscii(bytes, 12, 16) !== 'IHDR') return null;
  return validDimensions(readUint32(bytes, 16), readUint32(bytes, 20));
}

function inspectJpeg(
  bytes: Uint8Array,
): { readonly width: number; readonly height: number } | null {
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return null;
    const length = (bytes[offset] ?? 0) * 256 + (bytes[offset + 1] ?? 0);
    if (length < 2 || offset + length > bytes.length) return null;
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame) {
      if (length < 7) return null;
      const height = (bytes[offset + 3] ?? 0) * 256 + (bytes[offset + 4] ?? 0);
      const width = (bytes[offset + 5] ?? 0) * 256 + (bytes[offset + 6] ?? 0);
      return validDimensions(width, height);
    }
    offset += length;
  }
  return null;
}

function inspectWebp(
  bytes: Uint8Array,
): { readonly width: number; readonly height: number } | null {
  if (bytes.length < 30) return null;
  const chunk = imageAscii(bytes, 12, 16);
  if (chunk === 'VP8X') {
    return validDimensions(
      1 + readUint24LittleEndian(bytes, 24),
      1 + readUint24LittleEndian(bytes, 27),
    );
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const first = bytes[21] ?? 0;
    const second = bytes[22] ?? 0;
    const third = bytes[23] ?? 0;
    const fourth = bytes[24] ?? 0;
    return validDimensions(
      1 + first + ((second & 0x3f) << 8),
      1 + (second >> 6) + (third << 2) + ((fourth & 0x0f) << 10),
    );
  }
  if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return validDimensions(
      ((bytes[26] ?? 0) + ((bytes[27] ?? 0) << 8)) & 0x3fff,
      ((bytes[28] ?? 0) + ((bytes[29] ?? 0) << 8)) & 0x3fff,
    );
  }
  return null;
}

function validDimensions(
  width: number,
  height: number,
): { readonly width: number; readonly height: number } | null {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) + ((bytes[offset + 1] ?? 0) << 8) + ((bytes[offset + 2] ?? 0) << 16);
}

function imageAscii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}
