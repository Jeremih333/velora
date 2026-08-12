import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const toolkitRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.dirname(toolkitRoot);
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

export function extractLocalMarkdownTargets(source) {
  const targets = [];
  const expression = /!?(?:\[[^\]]*\])\((?<destination>[^)]+)\)/gu;
  for (const match of source.matchAll(expression)) {
    const raw = match.groups?.destination?.trim();
    if (!raw) continue;
    const destination = raw.startsWith('<')
      ? raw.slice(1, raw.indexOf('>')).trim()
      : raw.split(/\s+["']/u, 1)[0]?.trim();
    if (
      !destination ||
      destination.startsWith('#') ||
      destination.startsWith('/') ||
      /^[a-z][a-z0-9+.-]*:/iu.test(destination)
    ) {
      continue;
    }
    targets.push(destination);
  }
  return targets;
}

export async function checkDocumentationLinks(projectRoot) {
  const normalizedRoot = path.resolve(projectRoot);
  const markdownFiles = await listMarkdownFiles(normalizedRoot);
  const findings = [];
  for (const sourcePath of markdownFiles) {
    const source = await readFile(sourcePath, 'utf8');
    for (const rawTarget of extractLocalMarkdownTargets(source)) {
      const withoutFragment = rawTarget.split('#', 1)[0] ?? '';
      if (!withoutFragment) continue;
      let decodedTarget;
      try {
        decodedTarget = decodeURIComponent(withoutFragment);
      } catch {
        findings.push(toFinding(normalizedRoot, sourcePath, rawTarget, 'INVALID_ENCODING'));
        continue;
      }
      const resolvedTarget = path.resolve(path.dirname(sourcePath), decodedTarget);
      const relativeTarget = path.relative(normalizedRoot, resolvedTarget);
      if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
        findings.push(toFinding(normalizedRoot, sourcePath, rawTarget, 'OUTSIDE_PROJECT'));
        continue;
      }
      try {
        await stat(resolvedTarget);
      } catch {
        findings.push(toFinding(normalizedRoot, sourcePath, rawTarget, 'MISSING'));
      }
    }
  }
  return findings.sort((left, right) => {
    const sourceComparison = compareText(left.source, right.source);
    return sourceComparison !== 0 ? sourceComparison : compareText(left.target, right.target);
  });
}

async function listMarkdownFiles(directory) {
  const files = [];
  const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    compareText(left.name, right.name),
  );
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) {
        files.push(...(await listMarkdownFiles(path.join(directory, entry.name))));
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function toFinding(projectRoot, sourcePath, target, reason) {
  return {
    source: path.relative(projectRoot, sourcePath).replaceAll(path.sep, '/'),
    target,
    reason,
  };
}

async function main() {
  const findings = await checkDocumentationLinks(defaultProjectRoot);
  if (findings.length > 0) {
    for (const finding of findings) {
      process.stderr.write(`${finding.reason}: ${finding.source} -> ${finding.target}\n`);
    }
    process.exitCode = 1;
  } else {
    process.stdout.write('Documentation link check passed.\n');
  }
}

const entryPath = process.argv[1];
if (
  entryPath &&
  fileURLToPath(import.meta.url).toLowerCase() === path.resolve(entryPath).toLowerCase()
) {
  main().catch((error) => {
    process.stderr.write(
      `Documentation link check failed closed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    );
    process.exitCode = 1;
  });
}
