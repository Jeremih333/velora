import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const toolkitDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(toolkitDirectory);
const apiRoot = path.join(projectRoot, 'apps', 'api');
const marker = path.join(projectRoot, '.velora-project');
const configPath = path.join(apiRoot, 'wrangler.jsonc');
const seedPath = path.join(toolkitDirectory, 'fixtures', 'staging-quality-seed.sql');
const expectedDatabaseName = 'velora-staging';
const expectedDatabaseId = '1069c0c8-ec14-441e-a208-dfe64e494b26';
const exactConfirmation = 'SEED_VELORA_STAGING';

if (!existsSync(marker)) throw new Error('Velora boundary marker is missing.');
const config = readFileSync(configPath, 'utf8');
if (!config.includes(`"database_name": "${expectedDatabaseName}"`)) {
  throw new Error('The configured staging D1 name does not match the allowlist.');
}
if (!config.includes(`"database_id": "${expectedDatabaseId}"`)) {
  throw new Error('The configured staging D1 ID does not match the allowlist.');
}
if (!existsSync(seedPath)) throw new Error('The staging seed SQL file is missing.');

const argumentsSet = new Set(process.argv.slice(2));
if (!argumentsSet.has('--apply') || !argumentsSet.has(`--confirm=${exactConfirmation}`)) {
  process.stderr.write(
    `Refusing to mutate D1. Re-run with --apply --confirm=${exactConfirmation}.\n`,
  );
  process.exit(2);
}

const wranglerEntry = path.join(apiRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const childEnvironment = { ...process.env };
delete childEnvironment.CLOUDFLARE_API_TOKEN;
childEnvironment.CLOUDFLARE_ACCOUNT_ID = '9d1b271d6aec48ab5d8f595d1d3fac61';

function runWrangler(argumentsList) {
  const result = spawnSync(process.execPath, [wranglerEntry, ...argumentsList], {
    cwd: apiRoot,
    encoding: 'utf8',
    env: childEnvironment,
    shell: false,
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status !== 0) throw new Error(output.trim());
  process.stdout.write(output);
  return output;
}

const preflight = runWrangler([
  'd1',
  'execute',
  expectedDatabaseName,
  '--remote',
  '--env',
  'staging',
  '--command',
  'SELECT COUNT(*) AS migrations FROM d1_migrations; PRAGMA quick_check;',
]);
if (!preflight.includes('"migrations": 25') || !preflight.includes('"quick_check": "ok"')) {
  throw new Error('Staging D1 is not at the expected 25-migration healthy baseline.');
}

const backupDirectory = path.join(toolkitDirectory, 'backups');
mkdirSync(backupDirectory, { recursive: true });
const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
const backupPath = path.join(backupDirectory, `velora-staging-pre-quality-seed-${timestamp}.sql`);
runWrangler([
  'd1',
  'export',
  expectedDatabaseName,
  '--remote',
  '--env',
  'staging',
  '--output',
  backupPath,
]);

runWrangler([
  'd1',
  'execute',
  expectedDatabaseName,
  '--remote',
  '--env',
  'staging',
  '--file',
  seedPath,
]);

const verification = runWrangler([
  'd1',
  'execute',
  expectedDatabaseName,
  '--remote',
  '--env',
  'staging',
  '--command',
  `SELECT
    (SELECT COUNT(*) FROM users WHERE id LIKE 'seed-user-%') AS users,
    (SELECT COUNT(*) FROM personas WHERE id LIKE 'seed-persona-%' AND deleted_at IS NULL) AS personas,
    (SELECT COUNT(*) FROM characters WHERE id LIKE 'seed-character-%' AND id NOT LIKE 'seed-character-version-%' AND publish_state = 'PUBLISHED') AS characters,
    (SELECT COUNT(*) FROM lorebooks WHERE id LIKE 'seed-lorebook-%' AND deleted_at IS NULL) AS lorebooks,
    (SELECT COUNT(*) FROM messages WHERE conversation_id = 'seed-conversation-long' AND deleted_at IS NULL) AS messages,
    (SELECT COUNT(*) FROM moderation_cases WHERE id LIKE 'seed-case-%') AS moderationCases,
    (SELECT COUNT(*) FROM sessions WHERE user_id LIKE 'seed-user-%') AS sessions;
   PRAGMA quick_check;
   PRAGMA foreign_key_check;`,
]);
const requiredFragments = [
  '"users": 4',
  '"personas": 4',
  '"characters": 12',
  '"lorebooks": 2',
  '"messages": 240',
  '"moderationCases": 3',
  '"sessions": 0',
  '"quick_check": "ok"',
];
for (const fragment of requiredFragments) {
  if (!verification.includes(fragment)) {
    throw new Error(`Staging quality seed verification is missing ${fragment}.`);
  }
}
process.stdout.write(`Staging quality seed applied and verified. Backup: ${backupPath}\n`);
