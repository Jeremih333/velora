import { readFile } from 'node:fs/promises';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('Use: build-d1-count-query.mjs export.sql');
const sql = await readFile(inputPath, 'utf8');
const tables = [
  ...sql.matchAll(/^CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:["`]|\[)?([^"`\]\s(]+)["`\]]?/gim),
].map((match) => match[1]);
const query = tables
  .sort((left, right) => left.localeCompare(right))
  .map(
    (table) =>
      `SELECT '${table.replaceAll("'", "''")}' AS table_name,COUNT(*) AS row_count FROM "${table.replaceAll('"', '""')}"`,
  )
  .join(' UNION ALL ');
process.stdout.write(`${query};`);
