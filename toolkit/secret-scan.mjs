import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolkitRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(toolkitRoot);
const markerPath = path.join(projectRoot, '.velora-project');
const marker = await readFile(markerPath, 'utf8');
if (!marker.startsWith('Velora isolated workspace marker.')) {
  throw new Error('Velora workspace boundary marker is missing or invalid.');
}

const excludedDirectories = new Set([
  '.git',
  '.wrangler',
  'backups',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);
const excludedFiles = new Set(['.env.example']);
const patterns = [
  { name: 'private key', expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
  { name: 'generic provider key', expression: /sk-[A-Za-z0-9_-]{20,}/u },
  { name: 'Northflank key', expression: /nf-[A-Za-z0-9._-]{20,}/u },
  { name: 'Telegram bot token', expression: /[0-9]{8,12}:[A-Za-z0-9_-]{30,}/u },
  { name: 'GitHub token', expression: /gh[pousr]_[A-Za-z0-9]{20,}/u },
];
const findings = [];

async function visit(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name) && !entry.name.startsWith('dist-worker')) {
        await visit(absolutePath);
      }
      continue;
    }
    if (!entry.isFile() || excludedFiles.has(entry.name)) continue;
    const metadata = await lstat(absolutePath);
    if (metadata.size > 8 * 1024 * 1024) continue;
    const bytes = await readFile(absolutePath);
    if (bytes.includes(0)) continue;
    const content = bytes.toString('utf8');
    for (const pattern of patterns) {
      if (pattern.expression.test(content)) {
        findings.push({
          file: path.relative(projectRoot, absolutePath).replaceAll(path.sep, '/'),
          category: pattern.name,
        });
      }
    }
  }
}

await visit(projectRoot);
if (findings.length > 0) {
  for (const finding of findings) {
    process.stderr.write(`Potential ${finding.category} detected in ${finding.file}.\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write('Secret scan passed.\n');
}
