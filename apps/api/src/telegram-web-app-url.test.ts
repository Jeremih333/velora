import { describe, expect, it } from 'vitest';
import { telegramWebAppUrl } from './telegram-web-app-url';

describe('Telegram Web App release URL', () => {
  it('adds a bounded release query without changing the application origin', () => {
    expect(
      telegramWebAppUrl({
        PUBLIC_APP_URL: 'https://velora.example/',
        WEB_APP_CACHE_VERSION: '20260821-2',
      }),
    ).toBe('https://velora.example/?v=20260821-2');
  });

  it('keeps the canonical URL when no release version is configured', () => {
    expect(
      telegramWebAppUrl({ PUBLIC_APP_URL: 'https://velora.example/', WEB_APP_CACHE_VERSION: '' }),
    ).toBe('https://velora.example/');
  });
});
