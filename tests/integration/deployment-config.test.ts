import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

describe('deployment paid-feature boundaries', () => {
  it('enables paid roleplay only in staging while payments stay disabled everywhere', async () => {
    const source = await readFile(
      new URL('../../apps/api/wrangler.jsonc', import.meta.url),
      'utf8',
    );
    const parsed: unknown = JSON.parse(source.replace(/,\s*([}\]])/gu, '$1'));
    const config = requireRecord(parsed, 'wrangler config');
    const production = requireRecord(config['vars'], 'production vars');
    const environments = requireRecord(config['env'], 'environments');
    const staging = requireRecord(environments['staging'], 'staging environment');
    const telegramTest = requireRecord(environments['telegram-test'], 'telegram-test environment');
    const stagingVars = requireRecord(staging['vars'], 'staging vars');
    const productionD1 = requireRecord(
      requireArray(config['d1_databases'], 'production D1')[0],
      'production D1 binding',
    );
    const stagingD1 = requireRecord(
      requireArray(staging['d1_databases'], 'staging D1')[0],
      'staging D1 binding',
    );
    const local = requireRecord(environments['local'], 'local environment');
    const telegramTestVars = requireRecord(telegramTest['vars'], 'telegram-test vars');
    expect(telegramTestVars['ENVIRONMENT']).toBe('telegram-test');
    expect(telegramTestVars['TELEGRAM_API_ENVIRONMENT']).toBe('test');
    expect(telegramTestVars['PAID_AI_ENABLED']).toBe('false');
    expect(telegramTestVars['PAYMENTS_ENABLED']).toBe('false');
    expect(telegramTestVars['TELEGRAM_BOT_USERNAME']).not.toBe(
      stagingVars['TELEGRAM_BOT_USERNAME'],
    );
    const telegramTestD1 = requireRecord(
      requireArray(telegramTest['d1_databases'], 'telegram-test D1')[0],
      'telegram-test D1 binding',
    );
    expect(telegramTestD1['database_name']).toBe('velora-telegram-test');
    expect(telegramTestD1['database_id']).not.toBe(stagingD1['database_id']);
    expect(telegramTestD1['database_id']).not.toBe(productionD1['database_id']);
    const localVars = requireRecord(local['vars'], 'local vars');

    expect(production['PAID_AI_ENABLED']).toBe('false');
    expect(production['OWNER_TELEGRAM_ID']).toBe('1040929628');
    expect(stagingVars['PAID_AI_ENABLED']).toBe('true');
    expect(localVars['PAID_AI_ENABLED']).toBe('false');
    expect(production['PAYMENTS_ENABLED']).toBe('false');
    expect(stagingVars['PAYMENTS_ENABLED']).toBe('false');
    expect(localVars['PAYMENTS_ENABLED']).toBe('false');
  });

  it('keeps the secure test-bot setup ordered and isolated', async () => {
    const source = await readFile(
      new URL('../../toolkit/configure-telegram-secure.ps1', import.meta.url),
      'utf8',
    );
    const identityCheck = source.indexOf('& node $configureScript --check-identity');
    const firstSecretWrite = source.indexOf('secret put TELEGRAM_WEBHOOK_SECRET');
    const sessionSecretWrite = source.indexOf('secret put SESSION_SIGNING_KEY');
    const tokenSecretWrite = source.indexOf('secret put TELEGRAM_BOT_TOKEN');
    const deploy = source.indexOf('& node $wrangler deploy $wranglerEnvironmentArgument');
    const apply = source.indexOf('& node $configureScript --apply');

    expect(source).toContain('[ValidateSet("staging", "telegram-test", "production")]');
    expect(source).toContain('$apiEnvironment = if ($Environment -eq "telegram-test")');
    expect(source).toContain('$BotUsername -eq "aivel0ra_bot"');
    expect(source).toContain('$BotUsername -eq "velora_test_pending_bot"');
    expect(source).toContain('$env:TELEGRAM_API_ENVIRONMENT = $apiEnvironment');
    expect(source).toContain('if (-not $ConfirmProductionCutover)');
    expect(source).toContain('The bot has one webhook and staging will stop receiving updates.');
    expect(source).toContain(
      `$wranglerEnvironmentArgument = if ($Environment -eq "production") { '--env=' }`,
    );
    expect(source).not.toContain('--env $Environment');
    expect(identityCheck).toBeGreaterThan(-1);
    expect(firstSecretWrite).toBeGreaterThan(identityCheck);
    expect(sessionSecretWrite).toBeGreaterThan(firstSecretWrite);
    expect(tokenSecretWrite).toBeGreaterThan(sessionSecretWrite);
    expect(deploy).toBeGreaterThan(tokenSecretWrite);
    expect(apply).toBeGreaterThan(deploy);
  });

  it('requires explicit confirmation before installing a production Telegram token', async () => {
    const source = await readFile(
      new URL('../../toolkit/set-telegram-token.ps1', import.meta.url),
      'utf8',
    );
    expect(source).toContain('[ValidateSet("staging", "production")]');
    expect(source).toContain('if ($Environment -eq "production" -and -not $ConfirmProduction)');
    expect(source).toContain(
      `$wranglerEnvironmentArgument = if ($Environment -eq "production") { '--env=' }`,
    );
    expect(source).not.toContain('--env $Environment');
    expect(source.indexOf('throw "Production requires')).toBeLessThan(source.indexOf('Read-Host'));
  });

  it('routes the production BotHub secret to the root Wrangler environment', async () => {
    const source = await readFile(
      new URL('../../toolkit/set-bothub-key.ps1', import.meta.url),
      'utf8',
    );
    expect(source).toContain(
      `$wranglerEnvironmentArgument = if ($Environment -eq "production") { '--env=' }`,
    );
    expect(source).toContain('secret put BOTHUB_API_KEY $wranglerEnvironmentArgument');
    expect(source).not.toContain('--env $Environment');
  });
});
