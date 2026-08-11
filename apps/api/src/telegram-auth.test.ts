import { describe, expect, it } from 'vitest';
import { verifyTelegramInitData } from './telegram-auth';

const encoder = new TextEncoder();

async function signInitData(
  values: Readonly<Record<string, string>>,
  token: string,
): Promise<string> {
  const params = new URLSearchParams(values);
  const data = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const rootKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const secret = await crypto.subtle.sign('HMAC', rootKey, encoder.encode(token));
  const dataKey = await crypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', dataKey, encoder.encode(data));
  const hash = [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  params.set('hash', hash);
  return params.toString();
}

describe('Telegram initData verification', () => {
  it('accepts a valid recent signed user', async () => {
    const initData = await signInitData(
      { auth_date: '1000', query_id: 'query', user: JSON.stringify({ id: 42, first_name: 'Лея' }) },
      'test-token',
    );
    await expect(
      verifyTelegramInitData(initData, 'test-token', { nowSeconds: 1100, maxAgeSeconds: 900 }),
    ).resolves.toMatchObject({ authDate: 1000, user: { id: '42', first_name: 'Лея' } });
  });

  it('rejects forgery and replay-age data', async () => {
    const initData = await signInitData(
      { auth_date: '1000', user: JSON.stringify({ id: 42, first_name: 'A' }) },
      'test-token',
    );
    await expect(
      verifyTelegramInitData(initData, 'wrong-token', { nowSeconds: 1100, maxAgeSeconds: 900 }),
    ).rejects.toMatchObject({ code: 'INVALID_INIT_DATA' });
    await expect(
      verifyTelegramInitData(initData, 'test-token', { nowSeconds: 2000, maxAgeSeconds: 900 }),
    ).rejects.toMatchObject({ code: 'EXPIRED_INIT_DATA' });
  });
});
