import { describe, expect, it } from 'vitest';
import { telegramApiLocation, telegramBotApiUrl, telegramFileApiUrl } from './telegram-api';

const token = 'synthetic-token';

describe('Telegram API location', () => {
  it('keeps production and test-server method paths strictly separate', () => {
    expect(telegramBotApiUrl(token, 'createInvoiceLink')).toBe(
      `https://api.telegram.org/bot${token}/createInvoiceLink`,
    );
    expect(telegramBotApiUrl(token, 'createInvoiceLink', { apiEnvironment: 'test' })).toBe(
      `https://api.telegram.org/bot${token}/test/createInvoiceLink`,
    );
  });

  it('keeps production file paths and fails closed for undocumented test-server downloads', () => {
    expect(telegramFileApiUrl(token, 'photos/avatar.png')).toBe(
      `https://api.telegram.org/file/bot${token}/photos/avatar.png`,
    );
    expect(() =>
      telegramFileApiUrl(token, 'photos/avatar.png', { apiEnvironment: 'test' }),
    ).toThrow();
  });

  it('allows a local HTTP fixture but rejects unsafe endpoints and paths', () => {
    expect(telegramBotApiUrl(token, 'getMe', { apiBaseUrl: 'http://127.0.0.1:8788/' })).toBe(
      `http://127.0.0.1:8788/bot${token}/getMe`,
    );
    expect(() =>
      telegramBotApiUrl(token, 'getMe', { apiBaseUrl: 'http://external.example' }),
    ).toThrow();
    expect(() => telegramFileApiUrl(token, '../secret')).toThrow();
    expect(() => telegramBotApiUrl('token with spaces', 'getMe')).toThrow();
  });

  it('fails closed when Telegram test mode and the isolated runtime disagree', () => {
    expect(
      telegramApiLocation({ ENVIRONMENT: 'telegram-test', TELEGRAM_API_ENVIRONMENT: 'test' }),
    ).toEqual({ apiEnvironment: 'test' });
    expect(() =>
      telegramApiLocation({ ENVIRONMENT: 'staging', TELEGRAM_API_ENVIRONMENT: 'test' }),
    ).toThrow();
    expect(() => telegramApiLocation({ ENVIRONMENT: 'telegram-test' })).toThrow();
    expect(
      telegramApiLocation({
        ENVIRONMENT: 'local',
        TELEGRAM_API_BASE_URL: 'http://127.0.0.1:8788',
      }),
    ).toEqual({ apiEnvironment: 'production', apiBaseUrl: 'http://127.0.0.1:8788' });
  });
});
