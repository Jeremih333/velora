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
});
