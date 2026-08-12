import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
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
      paidAiEnabled: false,
      paymentsEnabled: false,
      sharedTelegramBotWithStaging: true,
      telegramWebhookCutoverRequired: true,
    });
  });

  it('rejects a production paid gate or shared D1 before any remote command', async () => {
    const source = await readFile(
      new URL('../../apps/api/wrangler.jsonc', import.meta.url),
      'utf8',
    );
    expect(() =>
      inspectProductionConfig(
        source.replace('"PAID_AI_ENABLED": "false"', '"PAID_AI_ENABLED": "true"'),
      ),
    ).toThrow(/paid gates/u);
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
    ).toBe(true);
  });

  it('does not require a pre-existing Worker but never ignores missing secrets', () => {
    const report = evaluateRemoteSnapshot({
      authenticated: true,
      productionWorkerExists: false,
      secretNames: [],
      pendingMigrationNames: ['0001_initial.sql'],
    });
    expect(report.productionWorkerExists).toBe(false);
    expect(report.missingSecretNames).toHaveLength(4);
    expect(report.readyForMigrationAndDeploy).toBe(false);
  });
});
