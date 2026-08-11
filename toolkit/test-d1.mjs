import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const toolkitDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(toolkitDir);
const apiRoot = path.join(projectRoot, 'apps', 'api');
const persistenceRoot = mkdtempSync(path.join(tmpdir(), 'velora-d1-test-'));
process.once('exit', () => {
  rmSync(persistenceRoot, { recursive: true, force: true });
});

function run(argumentsList) {
  const wranglerEntry = path.join(apiRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const result = spawnSync(
    process.execPath,
    [wranglerEntry, ...argumentsList, '--persist-to', persistenceRoot],
    {
      cwd: apiRoot,
      encoding: 'utf8',
      shell: false,
    },
  );
  if (result.status !== 0) {
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.stdout) process.stdout.write(result.stdout);
    process.exit(result.status ?? 1);
  }
  return `${result.stdout}\n${result.stderr}`;
}

run(['d1', 'migrations', 'apply', 'velora-local', '--local', '--env', 'local']);
const stagingSeedPath = path.join(toolkitDir, 'fixtures', 'staging-quality-seed.sql');
run(['d1', 'execute', 'velora-local', '--local', '--env', 'local', '--file', stagingSeedPath]);
run(['d1', 'execute', 'velora-local', '--local', '--env', 'local', '--file', stagingSeedPath]);
const seedAudit = run([
  'd1',
  'execute',
  'velora-local',
  '--local',
  '--env',
  'local',
  '--command',
  `SELECT
    (SELECT COUNT(*) FROM users WHERE id LIKE 'seed-user-%') AS users,
    (SELECT COUNT(*) FROM personas WHERE id LIKE 'seed-persona-%') AS personas,
    (SELECT COUNT(*) FROM characters WHERE id LIKE 'seed-character-%' AND id NOT LIKE 'seed-character-version-%') AS characters,
    (SELECT COUNT(*) FROM lorebooks WHERE id LIKE 'seed-lorebook-%') AS lorebooks,
    (SELECT COUNT(*) FROM messages WHERE conversation_id = 'seed-conversation-long') AS messages,
    (SELECT COUNT(*) FROM moderation_cases WHERE id LIKE 'seed-case-%') AS moderation_cases,
    (SELECT COUNT(*) FROM sessions WHERE user_id LIKE 'seed-user-%') AS sessions;`,
]);
for (const expected of [
  '"users": 4',
  '"personas": 4',
  '"characters": 12',
  '"lorebooks": 2',
  '"messages": 240',
  '"moderation_cases": 3',
  '"sessions": 0',
]) {
  if (!seedAudit.includes(expected)) {
    throw new Error(`Idempotent staging seed audit is missing ${expected}.`);
  }
}
const integrity = run([
  'd1',
  'execute',
  'velora-local',
  '--local',
  '--env',
  'local',
  '--command',
  'PRAGMA quick_check;',
]);
if (!integrity.includes('ok')) throw new Error('D1 quick_check did not return ok.');
const foreignKeys = run([
  'd1',
  'execute',
  'velora-local',
  '--local',
  '--env',
  'local',
  '--command',
  'PRAGMA foreign_key_check;',
]);
if (!foreignKeys.includes('results')) throw new Error('D1 foreign_key_check did not execute.');
const tables = run([
  'd1',
  'execute',
  'velora-local',
  '--local',
  '--env',
  'local',
  '--command',
  "SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%';",
]);
if (!tables.includes('table_count')) throw new Error('D1 schema table audit did not execute.');

process.stdout.write('Local D1 migration, idempotent quality seed and integrity checks passed.\n');
