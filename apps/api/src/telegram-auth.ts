import { AppError, telegramIdSchema } from '@velora/shared';
import { z } from 'zod';

const telegramUserSchema = z.object({
  id: z.union([z.number().int().positive(), telegramIdSchema]).transform(String),
  first_name: z.string().min(1).max(128),
  last_name: z.string().max(128).optional(),
  username: z.string().max(64).optional(),
  language_code: z.string().max(16).optional(),
  is_premium: z.boolean().optional(),
});

export interface VerifiedTelegramData {
  readonly hash: string;
  readonly authDate: number;
  readonly queryId: string | null;
  readonly user: z.infer<typeof telegramUserSchema>;
}

const encoder = new TextEncoder();

async function hmac(key: ArrayBuffer | string, value: string): Promise<ArrayBuffer> {
  const keyBytes = typeof key === 'string' ? encoder.encode(key) : new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value));
}

function toHex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyTelegramInitData(
  initData: string,
  botToken: string,
  options: { readonly nowSeconds: number; readonly maxAgeSeconds: number },
): Promise<VerifiedTelegramData> {
  if (initData.length === 0 || initData.length > 16_384) {
    throw new AppError('INVALID_INIT_DATA', 'Некорректные данные Telegram.', 401);
  }
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash') ?? '';
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = await hmac('WebAppData', botToken);
  const expectedHash = toHex(await hmac(secretKey, dataCheckString));
  if (!constantTimeEqual(receivedHash, expectedHash)) {
    throw new AppError('INVALID_INIT_DATA', 'Не удалось подтвердить вход через Telegram.', 401);
  }
  const authDate = Number(params.get('auth_date'));
  if (
    !Number.isSafeInteger(authDate) ||
    authDate <= 0 ||
    authDate > options.nowSeconds + 30 ||
    options.nowSeconds - authDate > options.maxAgeSeconds
  ) {
    throw new AppError(
      'EXPIRED_INIT_DATA',
      'Сессия Telegram устарела. Откройте приложение заново.',
      401,
    );
  }
  const rawUser = params.get('user');
  if (rawUser === null)
    throw new AppError('INVALID_INIT_DATA', 'Telegram не передал пользователя.', 401);
  let parsedUser: unknown;
  try {
    parsedUser = JSON.parse(rawUser);
  } catch {
    throw new AppError('INVALID_INIT_DATA', 'Некорректный профиль Telegram.', 401);
  }
  const user = telegramUserSchema.parse(parsedUser);
  return { hash: receivedHash, authDate, queryId: params.get('query_id'), user };
}

export async function sha256(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}
