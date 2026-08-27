import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const [leftPath, rightPath] = process.argv.slice(2);
if (!leftPath || !rightPath) throw new Error('Use: compare-d1-exports.mjs left.sql right.sql');

async function inventory(path) {
  const lines = (await readFile(path, 'utf8')).split(/\r?\n/);
  const grouped = new Map();
  for (const line of lines) {
    const match = line.match(/^INSERT\s+INTO\s+(?:["`]|\[)?([^"`\]\s(]+)["`\]]?/i);
    if (!match) continue;
    const values = grouped.get(match[1]) ?? [];
    values.push(line);
    grouped.set(match[1], values);
  }
  return new Map(
    [...grouped].map(([table, rows]) => [
      table,
      {
        count: rows.length,
        hash: createHash('sha256').update(rows.sort().join('\n')).digest('hex'),
      },
    ]),
  );
}

const left = await inventory(leftPath);
const right = await inventory(rightPath);
const tables = [...new Set([...left.keys(), ...right.keys()])].sort();
const differences = tables.flatMap((table) => {
  const leftValue = left.get(table) ?? { count: 0, hash: null };
  const rightValue = right.get(table) ?? { count: 0, hash: null };
  return leftValue.count === rightValue.count && leftValue.hash === rightValue.hash
    ? []
    : [{ table, left: leftValue, right: rightValue }];
});
process.stdout.write(
  `${JSON.stringify({ equal: differences.length === 0, tables: tables.length, rows: [...left.values()].reduce((sum, item) => sum + item.count, 0), differences }, null, 2)}\n`,
);
if (differences.length > 0) process.exitCode = 1;
