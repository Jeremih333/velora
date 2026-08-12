import { AppError } from '@velora/shared';

export type TelegramApiEnvironment = 'production' | 'test';

export interface TelegramApiLocation {
  readonly apiBaseUrl?: string;
  readonly apiEnvironment?: TelegramApiEnvironment;
}

interface TelegramApiEnvironmentConfig {
  readonly ENVIRONMENT: 'local' | 'telegram-test' | 'staging' | 'production';
  readonly TELEGRAM_API_BASE_URL?: string;
  readonly TELEGRAM_API_ENVIRONMENT?: TelegramApiEnvironment;
}

const officialApiBaseUrl = 'https://api.telegram.org';
const methodPattern = /^[A-Za-z][A-Za-z0-9]*$/u;

export function telegramApiLocation(env: TelegramApiEnvironmentConfig): TelegramApiLocation {
  const apiEnvironment = env.TELEGRAM_API_ENVIRONMENT ?? 'production';
  if (apiEnvironment === 'test' && env.ENVIRONMENT !== 'telegram-test') {
    throw new AppError(
      'TELEGRAM_TEST_ENVIRONMENT_MISMATCH',
      'Telegram Test Server требует изолированную среду telegram-test.',
      500,
    );
  }
  if (env.ENVIRONMENT === 'telegram-test' && apiEnvironment !== 'test') {
    throw new AppError(
      'TELEGRAM_TEST_ENVIRONMENT_MISMATCH',
      'Среда telegram-test обязана использовать Telegram Test Server.',
      500,
    );
  }
  return {
    apiEnvironment,
    ...(env.ENVIRONMENT === 'local' && env.TELEGRAM_API_BASE_URL
      ? { apiBaseUrl: env.TELEGRAM_API_BASE_URL }
      : {}),
  };
}

export function telegramBotApiUrl(
  token: string,
  method: string,
  location: TelegramApiLocation = {},
): string {
  assertToken(token);
  if (!methodPattern.test(method)) {
    throw new AppError('TELEGRAM_METHOD_INVALID', 'Некорректный метод Telegram Bot API.', 500);
  }
  const baseUrl = safeBaseUrl(location.apiBaseUrl);
  const environmentPath = location.apiEnvironment === 'test' ? '/test' : '';
  return `${baseUrl}/bot${token}${environmentPath}/${method}`;
}

export function telegramFileApiUrl(
  token: string,
  filePath: string,
  location: TelegramApiLocation = {},
): string {
  assertToken(token);
  if (
    !filePath ||
    filePath.startsWith('/') ||
    filePath.includes('..') ||
    filePath.includes('\\') ||
    filePath.includes('?') ||
    filePath.includes('#')
  ) {
    throw new AppError('MEDIA_UNAVAILABLE', 'Telegram вернул небезопасный путь.', 503);
  }
  const baseUrl = safeBaseUrl(location.apiBaseUrl);
  if (location.apiEnvironment === 'test') {
    throw new AppError(
      'TELEGRAM_TEST_MEDIA_UNVERIFIED',
      'Загрузка файлов из Telegram Test Server ещё не подтверждена.',
      503,
    );
  }
  return `${baseUrl}/file/bot${token}/${filePath}`;
}

export function telegramApiLocationFromOptions(
  apiBaseUrl?: string,
  apiEnvironment?: TelegramApiEnvironment,
): TelegramApiLocation {
  return {
    ...(apiBaseUrl ? { apiBaseUrl } : {}),
    ...(apiEnvironment ? { apiEnvironment } : {}),
  };
}

function safeBaseUrl(value: string | undefined): string {
  const url = new URL(value ?? officialApiBaseUrl);
  const localHttp =
    url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  if (url.protocol !== 'https:' && !localHttp) {
    throw new AppError('TELEGRAM_API_URL_INVALID', 'Telegram API должен использовать HTTPS.', 500);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new AppError('TELEGRAM_API_URL_INVALID', 'Некорректный адрес Telegram API.', 500);
  }
  return url.href.replace(/\/$/u, '');
}

function assertToken(token: string): void {
  if (!token || token.length > 256 || /[\s/?#]/u.test(token)) {
    throw new AppError('TELEGRAM_TOKEN_INVALID', 'Некорректный токен Telegram-бота.', 500);
  }
}
