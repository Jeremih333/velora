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
  it('keeps production Stars owner-enabled while non-production payment gates stay closed', async () => {
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
    expect(telegramTestVars['SPONSORED_FREE_AI_ENABLED']).toBe('false');
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

    expect(production['PAID_AI_ENABLED']).toBe('true');
    expect(Number(production['PER_USER_DAILY_AI_BUDGET_USD'])).toBeGreaterThan(0);
    expect(Number(production['PER_USER_DAILY_AI_BUDGET_USD'])).toBeLessThanOrEqual(
      Number(production['DAILY_AI_BUDGET_USD']),
    );
    expect(production['SPONSORED_FREE_AI_ENABLED']).toBe('true');
    expect(production['TELEGRAM_RECONCILIATION_ENABLED']).toBe('false');
    expect(production['OWNER_TELEGRAM_ID']).toBe('1040929628');
    expect(stagingVars['PAID_AI_ENABLED']).toBe('true');
    expect(Number(stagingVars['PER_USER_DAILY_AI_BUDGET_USD'])).toBeLessThanOrEqual(
      Number(stagingVars['DAILY_AI_BUDGET_USD']),
    );
    expect(stagingVars['SPONSORED_FREE_AI_ENABLED']).toBe('true');
    expect(stagingVars['TELEGRAM_RECONCILIATION_ENABLED']).toBe('false');
    expect(stagingVars['TELEGRAM_BOT_USERNAME']).toBe(production['TELEGRAM_BOT_USERNAME']);
    expect(localVars['PAID_AI_ENABLED']).toBe('false');
    expect(localVars['SPONSORED_FREE_AI_ENABLED']).toBe('true');
    expect(localVars['TELEGRAM_RECONCILIATION_ENABLED']).toBe('false');
    expect(telegramTestVars['TELEGRAM_RECONCILIATION_ENABLED']).toBe('false');
    expect(production['PAYMENTS_ENABLED']).toBe('true');
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

  it('keeps production phase 1 gated, atomic and separate from Telegram cutover', async () => {
    const source = await readFile(
      new URL('../../toolkit/deploy-production-phase1.ps1', import.meta.url),
      'utf8',
    );
    const confirmation = source.indexOf('if (-not $ConfirmProductionDeployment)');
    const preflight = source.indexOf('& node $preflight --remote');
    const qualityGate = source.indexOf('"verify.ps1"');
    const telegramIdentity = source.indexOf('& node $telegramConfigurator --check-identity');
    const bothubIdentity = source.indexOf('https://openai.bothub.chat/v1/models');
    const backup = source.indexOf('d1 export velora-production');
    const migration = source.indexOf('d1 migrations apply velora-production');
    const secretFile = source.indexOf('--secrets-file $secretFile');
    const deploy = source.indexOf('& node $wrangler deploy');
    const smoke = source.indexOf('Assert-HttpJson "$publicAppUrl/health"');

    expect(confirmation).toBeGreaterThan(-1);
    expect(preflight).toBeGreaterThan(confirmation);
    expect(qualityGate).toBeGreaterThan(preflight);
    expect(telegramIdentity).toBeGreaterThan(qualityGate);
    expect(bothubIdentity).toBeGreaterThan(telegramIdentity);
    expect(backup).toBeGreaterThan(bothubIdentity);
    expect(migration).toBeGreaterThan(backup);
    expect(deploy).toBeGreaterThan(migration);
    expect(secretFile).toBeGreaterThan(deploy);
    expect(smoke).toBeGreaterThan(secretFile);
    expect(source).toContain("& node $wrangler deploy '--env='");
    expect(source).toContain('$preflightState.remote.productionWorkerExists -ne $false');
    expect(source).toContain('@($preflightState.remote.pendingMigrationNames).Count -ne 28');
    expect(source).toContain('@($preflightState.remote.missingSecretNames).Count -ne 4');
    expect(source).toContain('$integrityOutput -notmatch');
    expect(source).toContain('"migrations"\\s*:\\s*28');
    expect(source).not.toContain('$env:PAID_AI_ENABLED');
    expect(source).not.toContain('$env:PAYMENTS_ENABLED');
    expect(source).not.toContain('--apply');
    expect(source).not.toContain('setWebhook');
  });

  it('keeps production Telegram cutover separate, verified and rollback-capable', async () => {
    const source = await readFile(
      new URL('../../toolkit/cutover-production-telegram.ps1', import.meta.url),
      'utf8',
    );
    const confirmation = source.indexOf('if (-not $ConfirmProductionWebhookCutover)');
    const preflight = source.indexOf('& node $preflight --remote');
    const qualityGate = source.indexOf('"verify.ps1"');
    const productionDeploy = source.indexOf("& node $wrangler deploy '--env='");
    const preDeployHealth = source.indexOf('Assert-ProductionEndpoints "pre-deploy"');
    const postDeployHealth = source.indexOf('Assert-ProductionEndpoints "post-deploy"');
    const identity = source.indexOf('& node $telegramConfigurator --check-identity');
    const productionSecrets = source.indexOf('secret bulk $productionSecretFile');
    const apply = source.indexOf('& node $telegramConfigurator --apply', productionSecrets);
    const verifyWebhook = source.indexOf('$configuration.webhookUrl -ne');
    const realSmoke = source.indexOf('& node $telegramSmoke --started-at');
    const rollback = source.indexOf('Restore-StagingWebhook');

    expect(confirmation).toBeGreaterThan(-1);
    expect(preflight).toBeGreaterThan(confirmation);
    expect(qualityGate).toBeGreaterThan(preflight);
    expect(identity).toBeGreaterThan(qualityGate);
    expect(preDeployHealth).toBeGreaterThan(qualityGate);
    expect(preDeployHealth).toBeLessThan(identity);
    expect(productionDeploy).toBeGreaterThan(identity);
    expect(postDeployHealth).toBeGreaterThan(productionDeploy);
    expect(productionSecrets).toBeGreaterThan(postDeployHealth);
    expect(productionSecrets).toBeGreaterThan(productionDeploy);
    expect(apply).toBeGreaterThan(productionSecrets);
    expect(verifyWebhook).toBeGreaterThan(apply);
    expect(realSmoke).toBeGreaterThan(verifyWebhook);
    expect(rollback).toBeGreaterThan(-1);
    expect(source).toContain('secret bulk $stagingSecretFile');
    expect(source).toContain('"$productionUrl/telegram/webhook"');
    expect(source).toContain('$configuration.exactConfigurationVerified -ne $true');
    expect(source).toContain(
      '$expectedMenuText = -join ([char[]](1054,1090,1082,1088,1099,1090,1100))',
    );
    expect(source).toContain('$configuration.menuText -ne $expectedMenuText');
    expect(source).not.toContain('$configuration.menuText -ne "Открыть"');
    expect(source).toContain('$configuration.menuUrl -ne "$productionUrl/"');
    expect(source).toContain('[int]$configuration.russianCommandCount -ne 10');
    expect(source).toContain('[int]$configuration.englishCommandCount -ne 10');
    expect(source).toContain('$configuration.allowedUpdates | Sort-Object');
    expect(source).toContain("'callback_query,message,pre_checkout_query'");
    expect(source).toContain('failed with HTTP [0-9]+');
    expect(source).toContain('failed after 3 network attempts');
    expect(source).toContain('configuration verification failed:');
    expect(source).toContain('without a public diagnostic');
    expect(source).toContain('$ErrorActionPreference = "Continue"');
    expect(source).toContain('$configurationExitCode = $LASTEXITCODE');
    expect(source).toContain('if ($configurationExitCode -ne 0)');
    expect(source).toContain('Get-VeloraStoredSecret "TELEGRAM_BOT_TOKEN"');
    expect(source).toContain('Production /start or Mini App authentication smoke failed.');
    expect(source).toContain('--marker $smokeMarker');
    expect(source).toContain('$attempt -le 12');
    expect(source).toContain('"$productionUrl/openapi.json"');
    expect(source).toContain('Write-CutoverStatus "AWAITING_TOKEN"');
    expect(source).toContain('Write-CutoverStatus "AWAITING_OWNER_SMOKE"');
    expect(source).toContain('/start $smokeMarker');
    expect(source).toContain('within fifteen minutes');
    expect(source).toContain('--timeout-seconds 900');
    expect(source).toContain('Write-CutoverStatus "COMPLETED"');
    expect(source).toContain('Write-CutoverStatus "FAILED" $originalFailure');
    expect(source).toContain('StatusFile must stay inside the Velora project.');
    expect(source).toContain('--apply --output-file $configurationFile');
    expect(source).toContain('[IO.File]::ReadAllText($configurationFile, [Text.Encoding]::UTF8)');
    expect(source).not.toContain('SESSION_SIGNING_KEY');
    expect(source).not.toContain('BOTHUB_API_KEY');
    expect(source).not.toContain('PAID_AI_ENABLED');
    expect(source).not.toContain('PAYMENTS_ENABLED');
  });

  it('stores reusable local credentials only through Windows DPAPI', async () => {
    const store = await readFile(
      new URL('../../toolkit/velora-secret-store.ps1', import.meta.url),
      'utf8',
    );
    const manager = await readFile(
      new URL('../../toolkit/manage-velora-secrets.ps1', import.meta.url),
      'utf8',
    );
    expect(store).toContain('ConvertFrom-SecureString $Value');
    expect(store).toContain('ConvertTo-SecureString $cipherText');
    expect(store).toContain('SetAccessRuleProtection($true, $false)');
    expect(store).toContain('LOCALAPPDATA');
    expect(store).not.toContain('Write-Host $plainText');
    expect(manager).toContain('Read-Host "Enter $Name (hidden input)" -AsSecureString');
    expect(manager).toContain('values are never displayed');
    const selfTest = await readFile(
      new URL('../../toolkit/test-velora-secret-store.ps1', import.meta.url),
      'utf8',
    );
    expect(selfTest).toContain('DPAPI round trip failed.');
    expect(selfTest).toContain('Plaintext leaked into the secret-store file.');
    expect(selfTest).toContain('Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force');
  });

  it('launches the production Telegram cutover through a boundary-checked status wrapper', async () => {
    const source = await readFile(
      new URL('../../toolkit/run-production-telegram-cutover.ps1', import.meta.url),
      'utf8',
    );
    expect(source).toContain('assert-boundary.ps1');
    expect(source).toContain('cutover-production-telegram.ps1');
    expect(source).toContain('-ConfirmProductionWebhookCutover');
    expect(source).toContain('-StatusFile $statusFile');
    expect(source).not.toContain('TELEGRAM_BOT_TOKEN');
  });

  it('serializes the full quality gate to prevent shared-output races', async () => {
    const source = await readFile(new URL('../../toolkit/verify.ps1', import.meta.url), 'utf8');
    const scanner = await readFile(
      new URL('../../toolkit/secret-scan.mjs', import.meta.url),
      'utf8',
    );
    expect(source).toContain('[IO.FileShare]::None');
    expect(source).toContain('Another Velora quality gate is already running.');
    expect(source).toContain('$lockStream.Dispose()');
    expect(source).toContain('Remove-Item -LiteralPath $lockPath -Force');
    expect(scanner).toContain("'.velora-verify.lock'");
  });
});
