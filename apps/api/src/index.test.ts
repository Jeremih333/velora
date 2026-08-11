import { describe, expect, it } from 'vitest';
import { app } from './index';
import type { Env } from './types';

function createEnv(): Env {
  const db = {
    prepare: () => ({ first: () => Promise.resolve({ ok: 1 }) }),
  } as unknown as D1Database;
  const assets = { fetch: () => Promise.resolve(new Response('asset')) } as unknown as Fetcher;
  return {
    DB: db,
    ASSETS: assets,
    ENVIRONMENT: 'local',
    APP_NAME: 'Velora',
    TELEGRAM_BOT_USERNAME: 'velora_local_bot',
    PUBLIC_APP_URL: 'http://127.0.0.1:8787',
    MAX_INIT_DATA_AGE_SECONDS: '900',
    DAILY_AI_BUDGET_USD: '0.01',
    MONTHLY_AI_BUDGET_USD: '0.01',
    LIFETIME_AI_BUDGET_USD: '0.01',
  };
}

describe('foundation routes', () => {
  it('serves liveness and D1 readiness', async () => {
    await expect(
      (await app.request('/health', undefined, createEnv())).json(),
    ).resolves.toMatchObject({ status: 'ok', service: 'velora-app' });
    await expect(
      (await app.request('/ready', undefined, createEnv())).json(),
    ).resolves.toMatchObject({ status: 'ready', dependencies: { d1: true } });
  });

  it('does not expose budget or secret values in public config', async () => {
    const response = await app.request('/api/v1/config', undefined, createEnv());
    const json = await response.json();
    expect(json).toEqual({
      environment: 'local',
      appName: 'Velora',
      telegramBotUsername: 'velora_local_bot',
    });
    expect(JSON.stringify(json)).not.toContain('0.01');
  });
});
