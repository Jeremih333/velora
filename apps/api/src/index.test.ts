import { describe, expect, it } from 'vitest';
import { app, isMaintenanceMode } from './index';
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
    APP_NAME: 'VeloraAI',
    TELEGRAM_BOT_USERNAME: 'velora_local_bot',
    PUBLIC_APP_URL: 'http://127.0.0.1:8787',
    MAX_INIT_DATA_AGE_SECONDS: '900',
    DAILY_AI_BUDGET_USD: '0.01',
    MONTHLY_AI_BUDGET_USD: '0.01',
    LIFETIME_AI_BUDGET_USD: '0.01',
  };
}

describe('foundation routes', () => {
  it('keeps framework-level contract requests safe without Worker bindings', () => {
    expect(isMaintenanceMode(undefined)).toBe(false);
  });

  it('serves liveness and D1 readiness', async () => {
    await expect(
      (await app.request('/health', undefined, createEnv())).json(),
    ).resolves.toMatchObject({ status: 'ok', service: 'velora-app' });
    await expect(
      (await app.request('/ready', undefined, createEnv())).json(),
    ).resolves.toMatchObject({ status: 'ready', dependencies: { d1: true } });
    await expect(
      (await app.request('/api/health', undefined, createEnv())).json(),
    ).resolves.toMatchObject({ status: 'ok', service: 'velora-app' });
    await expect(
      (await app.request('/api/ready', undefined, createEnv())).json(),
    ).resolves.toMatchObject({ status: 'ready', dependencies: { d1: true } });
  });

  it('does not expose budget or secret values in public config', async () => {
    const response = await app.request('/api/v1/config', undefined, createEnv());
    const json = await response.json();
    expect(json).toEqual({
      environment: 'local',
      appName: 'VeloraAI',
      telegramBotUsername: 'velora_local_bot',
    });
    expect(JSON.stringify(json)).not.toContain('0.01');
  });

  it('keeps health checks available while blocking application traffic in maintenance mode', async () => {
    const environment = {
      ...createEnv(),
      MAINTENANCE_MODE: 'true',
      MAINTENANCE_MESSAGE: 'Плановое обслуживание.',
    };
    const health = await app.request('/health', undefined, environment);
    expect(health.status).toBe(200);

    const response = await app.request('/api/v1/config', undefined, environment);
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('120');
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'MAINTENANCE_MODE', message: 'Плановое обслуживание.' },
    });
  });

  it('activates scheduled maintenance only inside a valid UTC window', () => {
    const environment = {
      MAINTENANCE_START_AT: '2026-08-26T00:00:00Z',
      MAINTENANCE_END_AT: '2026-08-26T00:30:00Z',
    };

    expect(isMaintenanceMode(environment, Date.parse('2026-08-25T23:59:59Z'))).toBe(false);
    expect(isMaintenanceMode(environment, Date.parse('2026-08-26T00:00:00Z'))).toBe(true);
    expect(isMaintenanceMode(environment, Date.parse('2026-08-26T00:29:59Z'))).toBe(true);
    expect(isMaintenanceMode(environment, Date.parse('2026-08-26T00:30:00Z'))).toBe(false);
  });

  it('fails open for incomplete or invalid maintenance schedules', () => {
    expect(
      isMaintenanceMode({ MAINTENANCE_START_AT: 'invalid', MAINTENANCE_END_AT: 'invalid' }),
    ).toBe(false);
    expect(
      isMaintenanceMode({
        MAINTENANCE_START_AT: '2026-08-26T01:00:00Z',
        MAINTENANCE_END_AT: '2026-08-26T00:00:00Z',
      }),
    ).toBe(false);
  });
});
