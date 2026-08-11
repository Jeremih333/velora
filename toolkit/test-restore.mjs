import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolkitDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(toolkitDir);
const apiRoot = path.join(projectRoot, 'apps', 'api');
const backupsRoot = path.join(toolkitDir, 'backups');
const marker = path.join(projectRoot, '.velora-project');
if (
  !existsSync(marker) ||
  !readFileSync(marker, 'utf8').startsWith('Velora isolated workspace marker.')
) {
  throw new Error('Velora workspace boundary marker is missing or invalid.');
}

const requested = process.argv[2];
if (!requested) {
  throw new Error('Usage: node toolkit/test-restore.mjs toolkit/backups/<backup>.sql');
}
const backupPath = path.resolve(projectRoot, requested);
const relativeBackup = path.relative(backupsRoot, backupPath);
if (
  relativeBackup.startsWith('..') ||
  path.isAbsolute(relativeBackup) ||
  path.extname(backupPath).toLowerCase() !== '.sql' ||
  !existsSync(backupPath)
) {
  throw new Error('Restore drill accepts an existing .sql file only from toolkit/backups.');
}

const persistenceRoot = mkdtempSync(path.join(tmpdir(), 'velora-restore-drill-'));
const wranglerEntry = path.join(apiRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const port = 8893;
let worker;
let workerOutput = '';

function runWrangler(argumentsList) {
  const result = spawnSync(
    process.execPath,
    [wranglerEntry, ...argumentsList, '--persist-to', persistenceRoot],
    { cwd: apiRoot, encoding: 'utf8', shell: false },
  );
  if (result.status !== 0) {
    throw new Error(`Wrangler restore command failed.\n${result.stdout}\n${result.stderr}`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

try {
  // Recreate the reviewed schema first, then restore only data from Cloudflare's export. D1
  // exports may place child rows before the referenced table definition, which local Wrangler
  // cannot import directly. A deferred transaction preserves every FK and is checked below.
  runWrangler(['d1', 'migrations', 'apply', 'velora-local', '--local', '--env', 'local']);
  const importPath = path.join(persistenceRoot, 'restore-import.sql');
  const dataStatements = readFileSync(backupPath, 'utf8')
    .split(/\r?\n/u)
    .filter((line) => /^INSERT INTO /u.test(line) && !/^INSERT INTO "d1_migrations"/u.test(line))
    .map((line) => line.replace(/^INSERT INTO /u, 'INSERT OR REPLACE INTO '))
    .join('\n');
  writeFileSync(
    importPath,
    `PRAGMA defer_foreign_keys=TRUE;\nBEGIN TRANSACTION;\n${dataStatements}\nCOMMIT;\n`,
    'utf8',
  );
  runWrangler(['d1', 'execute', 'velora-local', '--local', '--env', 'local', '--file', importPath]);

  const audit = runWrangler([
    'd1',
    'execute',
    'velora-local',
    '--local',
    '--env',
    'local',
    '--command',
    `PRAGMA quick_check;
     PRAGMA foreign_key_check;
     SELECT COUNT(*) AS table_count FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE '_cf_%';
     SELECT COUNT(*) AS migration_count FROM d1_migrations;
     SELECT COUNT(*) AS account_control_tables FROM sqlite_master
       WHERE type = 'table' AND name IN ('user_blocks', 'account_deletion_requests');`,
  ]);
  for (const expected of [
    '"quick_check": "ok"',
    '"table_count": 63',
    '"migration_count": 25',
    '"account_control_tables": 2',
  ]) {
    if (!audit.includes(expected)) throw new Error(`Restore audit is missing ${expected}.`);
  }

  worker = spawn(
    process.execPath,
    [
      wranglerEntry,
      'dev',
      '--env',
      'local',
      '--port',
      String(port),
      '--log-level',
      'error',
      '--persist-to',
      persistenceRoot,
    ],
    { cwd: apiRoot, stdio: ['ignore', 'pipe', 'pipe'], shell: false },
  );
  worker.stdout.on('data', (chunk) => {
    workerOutput = `${workerOutput}${String(chunk)}`.slice(-8_000);
  });
  worker.stderr.on('data', (chunk) => {
    workerOutput = `${workerOutput}${String(chunk)}`.slice(-8_000);
  });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (worker.exitCode !== null) throw new Error(`Restored Worker exited early.\n${workerOutput}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      const body = await response.json();
      if (response.ok && body?.status === 'ready' && body.dependencies?.d1 === true) {
        ready = true;
        break;
      }
    } catch {
      // The local Worker is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error(`Restored Worker did not become ready.\n${workerOutput}`);
  process.stdout.write(
    `Restore drill passed for ${path.basename(backupPath)}: 25 migrations, 63 tables, D1 ready.\n`,
  );
} finally {
  if (worker) {
    worker.kill();
    if (worker.exitCode === null) {
      await new Promise((resolve) => {
        worker.once('exit', resolve);
      });
    }
  }
  rmSync(persistenceRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
