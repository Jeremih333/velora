import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const executeFile = promisify(execFile);
const toolkitDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(toolkitDirectory, '..');
const apiRoot = resolve(projectRoot, 'apps/api');
const configPath = resolve(apiRoot, 'wrangler.jsonc');
const wranglerPath = resolve(apiRoot, 'node_modules/wrangler/bin/wrangler.js');
const requiredSecretNames = Object.freeze([
  'BOTHUB_API_KEY',
  'SESSION_SIGNING_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
]);
const cloudflareAccountId = '9d1b271d6aec48ab5d8f595d1d3fac61';

function requireRecord(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is missing.`);
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

export function inspectProductionConfig(source) {
  const parsed = requireRecord(JSON.parse(source.replace(/,\s*([}\]])/gu, '$1')), 'config');
  const vars = requireRecord(parsed.vars, 'production vars');
  const environments = requireRecord(parsed.env, 'environments');
  const staging = requireRecord(environments.staging, 'staging environment');
  const stagingVars = requireRecord(staging.vars, 'staging vars');
  const productionD1 = requireRecord(requireArray(parsed.d1_databases, 'production D1')[0], 'D1');
  const stagingD1 = requireRecord(requireArray(staging.d1_databases, 'staging D1')[0], 'D1');
  const workerName = requireString(parsed.name, 'production Worker name');
  const publicAppUrl = requireString(vars.PUBLIC_APP_URL, 'production URL');
  const databaseName = requireString(productionD1.database_name, 'production D1 name');
  const databaseId = requireString(productionD1.database_id, 'production D1 ID');
  const ownerTelegramId = requireString(vars.OWNER_TELEGRAM_ID, 'production owner ID');
  const productionBot = requireString(vars.TELEGRAM_BOT_USERNAME, 'production bot username');
  const stagingBot = requireString(stagingVars.TELEGRAM_BOT_USERNAME, 'staging bot username');

  if (workerName !== 'velora-app') throw new Error('Unexpected production Worker name.');
  if (publicAppUrl !== 'https://velora-app.carreljeremih.workers.dev') {
    throw new Error('Unexpected production URL.');
  }
  if (databaseName !== 'velora-production') throw new Error('Unexpected production D1 name.');
  if (databaseId === requireString(stagingD1.database_id, 'staging D1 ID')) {
    throw new Error('Production and staging must not share D1.');
  }
  if (ownerTelegramId !== '1040929628') throw new Error('Production owner ID is not confirmed.');
  if (vars.PAID_AI_ENABLED !== 'false' || vars.PAYMENTS_ENABLED !== 'false') {
    throw new Error('Production paid gates must remain disabled before cutover.');
  }

  const sharedTelegramBotWithStaging = productionBot === stagingBot;
  return {
    workerName,
    publicAppUrl,
    databaseName,
    databaseId,
    ownerTelegramId,
    paidAiEnabled: false,
    paymentsEnabled: false,
    sharedTelegramBotWithStaging,
    telegramWebhookCutoverRequired: sharedTelegramBotWithStaging,
  };
}

export function listMigrationNames(names) {
  const migrations = names.filter((name) => /^\d{4}_.+\.sql$/u.test(name)).sort();
  migrations.forEach((name, index) => {
    const expectedPrefix = String(index + 1).padStart(4, '0');
    if (!name.startsWith(`${expectedPrefix}_`)) {
      throw new Error(`Migration sequence is not contiguous at ${name}.`);
    }
  });
  return migrations;
}

export function evaluateRemoteSnapshot(snapshot) {
  const secretNames = [...new Set(snapshot.secretNames)].sort();
  const missingSecretNames = requiredSecretNames.filter((name) => !secretNames.includes(name));
  return {
    ...snapshot,
    secretNames,
    requiredSecretNames,
    missingSecretNames,
    readyForMigrationAndDeploy: snapshot.authenticated && missingSecretNames.length === 0,
  };
}

async function runWrangler(argumentsList) {
  try {
    const result = await executeFile(process.execPath, [wranglerPath, ...argumentsList], {
      cwd: apiRoot,
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: '',
        CLOUDFLARE_ACCOUNT_ID: cloudflareAccountId,
      },
      timeout: 30_000,
      windowsHide: true,
      maxBuffer: 2_000_000,
    });
    return { ok: true, stdout: result.stdout };
  } catch (error) {
    const stderr =
      error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string'
        ? error.stderr
        : '';
    return {
      ok: false,
      error: /Worker .+ not found|does not exist on your account|code:\s*10007/iu.test(stderr)
        ? 'WORKER_NOT_FOUND'
        : error && typeof error === 'object' && 'code' in error && error.code === 'ETIMEDOUT'
          ? 'TIMEOUT'
          : 'COMMAND_FAILED',
    };
  }
}

async function inspectRemote(migrationNames) {
  const identity = await runWrangler(['whoami']);
  if (!identity.ok) {
    return {
      authenticated: false,
      productionWorkerExists: false,
      secretNames: [],
      pendingMigrationNames: migrationNames,
      remoteError: 'CLOUDFLARE_AUTH_REQUIRED',
    };
  }
  const deployments = await runWrangler(['deployments', 'list', '--name', 'velora-app', '--json']);
  const secrets = await runWrangler(['secret', 'list', '--name', 'velora-app', '--format', 'json']);
  const pending = await runWrangler(['d1', 'migrations', 'list', 'velora-production', '--remote']);
  const workerAbsent =
    deployments.error === 'WORKER_NOT_FOUND' && secrets.error === 'WORKER_NOT_FOUND';
  const productionWorkerExists = deployments.ok && parseJsonArray(deployments.stdout).length > 0;
  const secretNames = secrets.ok
    ? parseJsonArray(secrets.stdout)
        .map((entry) => (typeof entry?.name === 'string' ? entry.name : ''))
        .filter(Boolean)
    : [];
  const pendingMigrationNames = pending.ok
    ? migrationNames.filter((name) => pending.stdout.includes(name))
    : migrationNames;
  return {
    authenticated: true,
    productionWorkerExists,
    secretNames,
    pendingMigrationNames,
    ...((!workerAbsent && (!deployments.ok || !secrets.ok)) || !pending.ok
      ? { remoteError: 'REMOTE_CHECK_INCOMPLETE' }
      : {}),
  };
}

function parseJsonArray(source) {
  try {
    const value = JSON.parse(source);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function main() {
  const config = inspectProductionConfig(await readFile(configPath, 'utf8'));
  const migrationNames = listMigrationNames(await readdir(resolve(projectRoot, 'migrations')));
  const remoteRequested = process.argv.includes('--remote');
  const remoteSnapshot = remoteRequested ? await inspectRemote(migrationNames) : null;
  const report = {
    schemaVersion: 1,
    mode: remoteRequested ? 'remote-read-only' : 'local-only',
    config,
    migrationCount: migrationNames.length,
    migrationNames,
    remote: remoteSnapshot ? evaluateRemoteSnapshot(remoteSnapshot) : null,
    blockers: [
      ...(config.telegramWebhookCutoverRequired ? ['TELEGRAM_WEBHOOK_CUTOVER_REQUIRED'] : []),
      ...(remoteSnapshot?.remoteError ? [remoteSnapshot.remoteError] : []),
      ...(remoteSnapshot && evaluateRemoteSnapshot(remoteSnapshot).missingSecretNames.length > 0
        ? ['PRODUCTION_SECRETS_MISSING']
        : []),
      'PRODUCTION_OWNER_DEPLOY_AUTHORIZATION_REQUIRED',
    ],
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (remoteRequested && remoteSnapshot?.remoteError) process.exitCode = 2;
}

const entryPath = process.argv[1];
if (
  entryPath &&
  fileURLToPath(import.meta.url).toLowerCase() === resolve(entryPath).toLowerCase()
) {
  main().catch((error) => {
    process.stderr.write(
      `Production preflight failed closed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    );
    process.exitCode = 2;
  });
}
