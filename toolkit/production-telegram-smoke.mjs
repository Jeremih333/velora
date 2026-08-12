import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const apiRoot = path.join(projectRoot, 'apps', 'api');
const wranglerEntry = path.join(apiRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const databaseName = 'velora-production';
const ownerTelegramId = '1040929628';
const productionUrl = 'https://velora-app.carreljeremih.workers.dev';

export function evaluateProductionTelegramSmoke(row, startedAt) {
  if (!row || typeof row !== 'object') return { startVerified: false, miniAppVerified: false };
  const updateCount = Number(row.owner_smoke_events ?? 0);
  const ownerCount = Number(row.owner_users ?? 0);
  const ownerLastSeen = Number(row.owner_last_seen_at ?? 0);
  const sessionCount = Number(row.active_sessions ?? 0);
  return {
    startVerified: updateCount > 0 && ownerCount === 1 && ownerLastSeen >= startedAt,
    miniAppVerified: sessionCount > 0,
  };
}

export function buildProductionTelegramSmokeQueryForMarker(startedAt, marker) {
  if (!Number.isSafeInteger(startedAt) || startedAt <= 0)
    throw new Error('Invalid smoke start time.');
  if (!/^velora_smoke_[A-Za-z0-9_-]{32,96}$/u.test(marker)) {
    throw new Error('Invalid production smoke marker.');
  }
  const markerHash = createHash('sha256').update(marker).digest('hex');
  return `SELECT
    (SELECT COUNT(*) FROM audit_logs a JOIN users marker_user ON marker_user.id = a.actor_id
      WHERE a.action = 'TELEGRAM_PRODUCTION_SMOKE'
        AND a.target_type = 'TELEGRAM_WEBHOOK' AND a.target_id = '${markerHash}'
        AND a.created_at >= ${startedAt} AND marker_user.telegram_id = '${ownerTelegramId}'
        AND marker_user.role = 'OWNER' AND marker_user.deleted_at IS NULL) AS owner_smoke_events,
    (SELECT COUNT(*) FROM users
      WHERE telegram_id = '${ownerTelegramId}' AND role = 'OWNER'
        AND deleted_at IS NULL) AS owner_users,
    COALESCE((SELECT last_seen_at FROM users
      WHERE telegram_id = '${ownerTelegramId}' AND deleted_at IS NULL), 0) AS owner_last_seen_at,
    (SELECT COUNT(*) FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE u.telegram_id = '${ownerTelegramId}' AND s.created_at >= ${startedAt}
        AND s.revoked_at IS NULL AND s.expires_at > ${Date.now()}) AS active_sessions;`;
}

export function parseWranglerD1Rows(output) {
  const payload = JSON.parse(output);
  if (!Array.isArray(payload) || payload.length !== 1 || payload[0]?.success !== true) {
    throw new Error('Wrangler returned an unexpected D1 response.');
  }
  return Array.isArray(payload[0].results) ? payload[0].results : [];
}

async function main() {
  const startedAt = readIntegerArgument('--started-at', Date.now());
  const timeoutSeconds = readIntegerArgument('--timeout-seconds', 300);
  const marker = readStringArgument('--marker');
  if (timeoutSeconds < 30 || timeoutSeconds > 900) {
    throw new Error('Smoke timeout must be between 30 and 900 seconds.');
  }

  await assertProductionHealth();
  process.stdout.write(
    [
      '',
      'REAL TELEGRAM SMOKE REQUIRED',
      `1. Open @aivel0ra_bot and send exactly: /start ${marker}`,
      '2. Press the «Открыть» Mini App button from that new reply.',
      '3. Wait here; only new production D1 evidence is accepted.',
      '',
    ].join('\n'),
  );

  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastState = { startVerified: false, miniAppVerified: false };
  while (Date.now() < deadline) {
    const rows = queryProduction(buildProductionTelegramSmokeQueryForMarker(startedAt, marker));
    lastState = evaluateProductionTelegramSmoke(rows[0], startedAt);
    process.stdout.write(
      `\r/start=${lastState.startVerified ? 'verified' : 'waiting'}; MiniApp=${lastState.miniAppVerified ? 'verified' : 'waiting'}   `,
    );
    if (lastState.startVerified && lastState.miniAppVerified) {
      process.stdout.write('\nProduction Telegram and Mini App smoke passed.\n');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  process.stdout.write('\n');
  throw new Error(
    `Production Telegram smoke timed out: start=${lastState.startVerified}, miniApp=${lastState.miniAppVerified}.`,
  );
}

function readIntegerArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${name} value.`);
  return value;
}

function readStringArgument(name) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? '' : (process.argv[index + 1] ?? '');
  if (!value) throw new Error(`Missing ${name} value.`);
  return value;
}

function queryProduction(sql) {
  const result = spawnSync(
    process.execPath,
    [wranglerEntry, 'd1', 'execute', databaseName, '--remote', '--json', '--command', sql],
    { cwd: apiRoot, encoding: 'utf8', shell: false },
  );
  if (result.status !== 0) {
    throw new Error('Read-only production D1 smoke query failed.');
  }
  return parseWranglerD1Rows(result.stdout);
}

async function assertProductionHealth() {
  for (const pathName of ['/health', '/ready']) {
    const response = await fetch(`${productionUrl}${pathName}`);
    if (!response.ok) throw new Error(`Production ${pathName} returned HTTP ${response.status}.`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
