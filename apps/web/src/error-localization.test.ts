import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { localizedErrorMessage } from './error-localization';
import { getWebMessages } from './i18n';

describe('localized API errors', () => {
  it('uses the active locale for transport failures', () => {
    const offline = new ApiError('NETWORK_OFFLINE', 'internal fallback', 0);
    expect(localizedErrorMessage(offline, getWebMessages('ru'))).toBe(
      'Нет подключения к сети. Проверь соединение и повтори действие.',
    );
    expect(localizedErrorMessage(offline, getWebMessages('en'))).toBe(
      'No network connection. Check your connection and try again.',
    );
  });

  it('preserves safe domain errors that have no generic translation', () => {
    const domainError = new ApiError('CHARACTER_LIMIT_REACHED', 'Character limit reached.', 409);
    expect(localizedErrorMessage(domainError, getWebMessages('en'))).toBe(
      'Character limit reached.',
    );
  });

  it('localizes an explicit provider content restriction without exposing upstream text', () => {
    const restriction = new ApiError(
      'BOTHUB_CONTENT_RESTRICTED',
      'private upstream diagnostic',
      502,
    );
    const message = localizedErrorMessage(restriction, getWebMessages('ru'));
    expect(message).toContain('ограничений контента');
    expect(message).not.toContain('private upstream diagnostic');
  });

  it.each([
    ['UNAUTHENTICATED', 401, 'Сессия Telegram'],
    ['BOTHUB_RATE_LIMITED', 502, 'AI-провайдер'],
    ['IMAGE_ENCODING_FAILED', 400, 'медиафайл'],
    ['D1_LIMIT_EXCEEDED', 503, 'Хранилище'],
    ['REPORT_RATE_LIMITED', 429, 'Слишком много запросов'],
    ['PAYMENT_MISMATCH', 409, 'оплату'],
    ['INTERNAL_ERROR', 500, 'Сервис временно недоступен'],
  ])('localizes %s as a safe error category', (code, status, expected) => {
    const message = localizedErrorMessage(
      new ApiError(code, 'private infrastructure diagnostic', status),
      getWebMessages('ru'),
    );
    expect(message).toContain(expected);
    expect(message).not.toContain('private infrastructure diagnostic');
  });
});
