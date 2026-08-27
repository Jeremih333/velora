import { ApiError } from './api';
import type { WebMessages } from './i18n';

function belongsTo(code: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => code === prefix || code.startsWith(`${prefix}_`));
}

export function localizedErrorMessage(error: Error, messages: WebMessages): string {
  if (!(error instanceof ApiError)) return error.message;
  const directMessage = {
    REQUEST_FAILED: messages.common.requestFailed,
    EMPTY_STREAM: messages.common.emptyStream,
    NETWORK_OFFLINE: messages.common.networkOffline,
    NETWORK_ERROR: messages.common.networkError,
    BOTHUB_CONTENT_RESTRICTED: messages.common.contentRestricted,
  }[error.code];
  if (directMessage) return directMessage;

  if (
    belongsTo(error.code, [
      'UNAUTHENTICATED',
      'SESSION_EXPIRED',
      'INVALID_INIT_DATA',
      'INVALID_CSRF',
    ])
  ) {
    return messages.common.authError;
  }
  if (
    belongsTo(error.code, [
      'BOTHUB',
      'MODEL_PROVIDER_UNAVAILABLE',
      'AI_MODEL_UNAVAILABLE',
      'AI_NOT_CONFIGURED',
      'AI_SMOKE_FAILED',
      'PAID_AI_NOT_READY',
      'AI_PROVIDER_COST_LIMIT_EXCEEDED',
    ])
  ) {
    return messages.common.providerError;
  }
  if (
    belongsTo(error.code, [
      'IMAGE',
      'MEDIA_STORAGE_FAILED',
      'MEDIA_STORAGE_UNAVAILABLE',
      'MEDIA_UNAVAILABLE',
      'MEDIA_TOO_LARGE',
      'UNSUPPORTED_MEDIA',
      'PROFILE_AVATAR_INVALID',
    ])
  ) {
    return messages.common.imageError;
  }
  if (
    belongsTo(error.code, [
      'D1',
      'DATABASE_LIMIT',
      'DATABASE_CAPACITY',
      'STORAGE_CAPACITY',
      'CLOUDFLARE_CAPACITY',
    ])
  ) {
    return messages.common.databaseLimitError;
  }
  if (error.status === 429 || error.code.includes('RATE_LIMITED')) {
    return messages.common.rateLimitError;
  }
  if (
    belongsTo(error.code, ['PAYMENT', 'PAYMENTS', 'TELEGRAM_INVOICE', 'REFUND']) ||
    error.code === 'AI_CREDITS_REQUIRED'
  ) {
    return messages.common.paymentError;
  }
  if (
    error.status >= 500 ||
    belongsTo(error.code, ['INTERNAL_ERROR', 'DEPENDENCY_UNAVAILABLE', 'SERVICE_NOT_CONFIGURED'])
  ) {
    return messages.common.serverError;
  }
  return error.message;
}
