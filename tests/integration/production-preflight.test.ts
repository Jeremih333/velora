import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  buildProductionBlockers,
  evaluateRemoteSnapshot,
  inspectProductionConfig,
  listMigrationNames,
} from '../../toolkit/production-preflight.mjs';

describe('production preflight', () => {
  it('recognizes the isolated production binding and mandatory webhook cutover', async () => {
    const source = await readFile(
      new URL('../../apps/api/wrangler.jsonc', import.meta.url),
      'utf8',
    );
    expect(inspectProductionConfig(source)).toMatchObject({
      workerName: 'velora-app',
      databaseName: 'velora-production',
      ownerTelegramId: '1040929628',
      paidAiEnabled: true,
      sponsoredFreeAiEnabled: true,
      paymentsEnabled: true,
      sharedTelegramBotWithStaging: true,
      telegramWebhookCutoverRequired: true,
    });
  });

  it('rejects disabled production AI access, a reverted Stars cutover, or shared D1', async () => {
    const source = await readFile(
      new URL('../../apps/api/wrangler.jsonc', import.meta.url),
      'utf8',
    );
    expect(() =>
      inspectProductionConfig(
        source.replace('"PAID_AI_ENABLED": "true"', '"PAID_AI_ENABLED": "false"'),
      ),
    ).toThrow(/AI access/u);
    expect(() =>
      inspectProductionConfig(
        source.replace(
          '"SPONSORED_FREE_AI_ENABLED": "true"',
          '"SPONSORED_FREE_AI_ENABLED": "false"',
        ),
      ),
    ).toThrow(/AI access/u);
    expect(() =>
      inspectProductionConfig(
        source.replace('"PAYMENTS_ENABLED": "true"', '"PAYMENTS_ENABLED": "false"'),
      ),
    ).toThrow(/Stars cutover/u);
    const stagingId = '1069c0c8-ec14-441e-a208-dfe64e494b26';
    expect(() =>
      inspectProductionConfig(source.replace('aa0f89b4-2ba7-4717-9d24-36ce49bf3897', stagingId)),
    ).toThrow(/must not share D1/u);
  });

  it('requires a contiguous immutable migration sequence', () => {
    expect(listMigrationNames(['0002_second.sql', 'README.md', '0001_first.sql'])).toEqual([
      '0001_first.sql',
      '0002_second.sql',
    ]);
    expect(() => listMigrationNames(['0001_first.sql', '0003_third.sql'])).toThrow(/contiguous/u);
  });

  it('fails readiness until authentication and every required secret are evidenced', () => {
    const unauthenticated = evaluateRemoteSnapshot({
      authenticated: false,
      productionWorkerExists: false,
      secretNames: [],
      pendingMigrationNames: ['0001_initial.sql'],
    });
    expect(unauthenticated.readyForMigrationAndDeploy).toBe(false);
    expect(unauthenticated.readyForCutover).toBe(false);
    expect(unauthenticated.missingSecretNames).toHaveLength(4);
    expect(
      evaluateRemoteSnapshot({
        authenticated: true,
        productionWorkerExists: false,
        secretNames: [
          'TELEGRAM_WEBHOOK_SECRET',
          'BOTHUB_API_KEY',
          'SESSION_SIGNING_KEY',
          'TELEGRAM_BOT_TOKEN',
        ],
        pendingMigrationNames: ['0001_initial.sql'],
      }).readyForMigrationAndDeploy,
    ).toBe(false);
  });

  it('recognizes the reviewed first-deploy state with atomic secret upload', () => {
    const report = evaluateRemoteSnapshot({
      authenticated: true,
      productionWorkerExists: false,
      secretNames: [],
      pendingMigrationNames: ['0001_initial.sql'],
    });
    expect(report.productionWorkerExists).toBe(false);
    expect(report.missingSecretNames).toHaveLength(4);
    expect(report.readyForMigrationAndDeploy).toBe(true);
    expect(report.readyForCutover).toBe(false);
  });

  it('recognizes completed phase 1 and removes the obsolete deploy authorization blocker', async () => {
    const source = await readFile(
      new URL('../../apps/api/wrangler.jsonc', import.meta.url),
      'utf8',
    );
    const config = inspectProductionConfig(source);
    const snapshot = {
      authenticated: true,
      productionWorkerExists: true,
      secretNames: [
        'BOTHUB_API_KEY',
        'SESSION_SIGNING_KEY',
        'TELEGRAM_BOT_TOKEN',
        'TELEGRAM_WEBHOOK_SECRET',
      ],
      pendingMigrationNames: [],
    };
    expect(evaluateRemoteSnapshot(snapshot).readyForCutover).toBe(true);
    expect(buildProductionBlockers(config, snapshot)).toEqual([
      'TELEGRAM_WEBHOOK_CUTOVER_REQUIRED',
    ]);
  });
});
