import { ApiError } from './api';
import type { WebMessages } from './i18n';

export function localizedErrorMessage(error: Error, messages: WebMessages): string {
  if (!(error instanceof ApiError)) return error.message;
  return (
    {
      REQUEST_FAILED: messages.common.requestFailed,
      EMPTY_STREAM: messages.common.emptyStream,
      NETWORK_OFFLINE: messages.common.networkOffline,
      NETWORK_ERROR: messages.common.networkError,
    }[error.code] ?? error.message
  );
}
