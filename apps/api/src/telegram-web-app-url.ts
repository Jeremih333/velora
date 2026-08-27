import type { Env } from './types';

export function telegramWebAppUrl(
  env: Pick<Env, 'PUBLIC_APP_URL' | 'WEB_APP_CACHE_VERSION'>,
): string {
  const url = new URL(env.PUBLIC_APP_URL);
  const version = env.WEB_APP_CACHE_VERSION?.trim();
  if (version) url.searchParams.set('v', version);
  return url.href;
}
