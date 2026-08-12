import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const WEB_BUNDLE_LIMITS = Object.freeze({
  entryBytes: 350_000,
  chunkBytes: 350_000,
});

const REQUIRED_LAZY_ENTRIES = Object.freeze([
  'src/AuthenticatedApp.tsx',
  'src/ChatsView.tsx',
  'src/LorebooksView.tsx',
]);

export function assessWebBundle(manifest, fileSizes) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Vite manifest is missing or invalid.');
  }

  const records = Object.entries(manifest);
  const entry = records.find(([, value]) => value?.isEntry === true);
  if (!entry) throw new Error('Vite manifest does not contain an application entry.');

  const entryFile = requireJavaScriptFile(entry[1]?.file, 'application entry');
  const entryBytes = requireFileSize(fileSizes, entryFile);
  const javascriptFiles = new Set(
    records
      .map(([, value]) => value?.file)
      .filter((file) => typeof file === 'string' && file.endsWith('.js')),
  );
  if (javascriptFiles.size === 0) throw new Error('Vite manifest contains no JavaScript files.');

  const chunks = [...javascriptFiles].map((file) => ({
    file,
    bytes: requireFileSize(fileSizes, file),
  }));
  const oversizedChunks = chunks.filter(({ bytes }) => bytes > WEB_BUNDLE_LIMITS.chunkBytes);
  const missingLazyEntries = REQUIRED_LAZY_ENTRIES.filter((source) => {
    const record = manifest[source];
    return record?.isDynamicEntry !== true || typeof record.file !== 'string';
  });

  return {
    entryFile,
    entryBytes,
    chunks,
    oversizedEntry: entryBytes > WEB_BUNDLE_LIMITS.entryBytes,
    oversizedChunks,
    missingLazyEntries,
  };
}

export async function checkWebBundle(distDirectory) {
  const manifestPath = path.join(distDirectory, '.vite', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const fileSizes = {};
  for (const record of Object.values(manifest)) {
    if (typeof record?.file !== 'string' || !record.file.endsWith('.js')) continue;
    fileSizes[record.file] = (await stat(path.join(distDirectory, record.file))).size;
  }

  const report = assessWebBundle(manifest, fileSizes);
  if (report.oversizedEntry) {
    throw new Error(
      `Initial JS ${report.entryBytes} B exceeds the ${WEB_BUNDLE_LIMITS.entryBytes} B budget.`,
    );
  }
  if (report.oversizedChunks.length > 0) {
    const details = report.oversizedChunks
      .map(({ file, bytes }) => `${file}=${bytes} B`)
      .join(', ');
    throw new Error(`JavaScript chunk budget exceeded: ${details}.`);
  }
  if (report.missingLazyEntries.length > 0) {
    throw new Error(`Required lazy entries are missing: ${report.missingLazyEntries.join(', ')}.`);
  }
  return report;
}

function requireJavaScriptFile(value, name) {
  if (typeof value !== 'string' || !value.endsWith('.js')) {
    throw new Error(`The ${name} is not a JavaScript file.`);
  }
  return value;
}

function requireFileSize(fileSizes, file) {
  const value = fileSizes[file];
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`Built file size is missing: ${file}.`);
  return value;
}

async function main() {
  const projectRoot = fileURLToPath(new URL('..', import.meta.url));
  const distDirectory = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(projectRoot, 'apps', 'web', 'dist');
  const report = await checkWebBundle(distDirectory);
  const chunks = report.chunks.map(({ file, bytes }) => `${file}=${bytes} B`).join(', ');
  process.stdout.write(`Web bundle budget passed: initial=${report.entryBytes} B; ${chunks}.\n`);
}

const entryPath = process.argv[1];
if (
  entryPath &&
  fileURLToPath(import.meta.url).toLowerCase() === path.resolve(entryPath).toLowerCase()
) {
  main().catch((error) => {
    process.stderr.write(
      `Web bundle budget failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    );
    process.exitCode = 1;
  });
}
