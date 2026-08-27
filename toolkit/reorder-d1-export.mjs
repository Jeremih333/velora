import { readFile, writeFile } from 'node:fs/promises';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error('Use: reorder-d1-export.mjs input.sql output.sql');

const lines = (await readFile(inputPath, 'utf8')).split(/\r?\n/);
const consumed = new Set();
const pragmas = [];
const tables = [];
const insertsByTable = new Map();
const tableDependencies = new Map();

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  if (/^PRAGMA\s+/i.test(line)) {
    pragmas.push(line);
    consumed.add(index);
    continue;
  }
  if (/^INSERT\s+INTO\s+/i.test(line)) {
    const match = line.match(/^INSERT\s+INTO\s+(?:["`]|\[)?([^"`\]\s(]+)["`\]]?/i);
    if (!match) throw new Error(`Could not parse INSERT table: ${line.slice(0, 80)}`);
    const table = match[1];
    const inserts = insertsByTable.get(table) ?? [];
    inserts.push(line);
    insertsByTable.set(table, inserts);
    consumed.add(index);
    continue;
  }
  if (!/^CREATE\s+TABLE\s+/i.test(line)) continue;
  const block = [line];
  consumed.add(index);
  while (!block.at(-1).trimEnd().endsWith(';')) {
    index += 1;
    if (index >= lines.length) throw new Error('Unterminated CREATE TABLE statement.');
    block.push(lines[index]);
    consumed.add(index);
  }
  const statement = block.join('\n');
  const nameMatch = statement.match(
    /^CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:["`]|\[)?([^"`\]\s(]+)["`\]]?/i,
  );
  if (!nameMatch) throw new Error(`Could not parse CREATE TABLE: ${line}`);
  const dependencies = new Set(
    [...statement.matchAll(/REFERENCES\s+(?:["`]|\[)?([^"`\]\s(]+)["`\]]?/gi)].map(
      (match) => match[1],
    ),
  );
  dependencies.delete(nameMatch[1]);
  tableDependencies.set(nameMatch[1], dependencies);
  tables.push(statement);
}

const remainder = lines
  .filter((_, index) => !consumed.has(index))
  .join('\n')
  .trim();
const pending = new Set(insertsByTable.keys());
const inserted = new Set();
const orderedTables = [];
while (pending.size > 0) {
  const ready = [...pending].filter((table) =>
    [...(tableDependencies.get(table) ?? [])].every(
      (dependency) => !insertsByTable.has(dependency) || inserted.has(dependency),
    ),
  );
  if (ready.length === 0) {
    throw new Error(`Cyclic insert dependencies: ${[...pending].join(', ')}`);
  }
  for (const table of ready) {
    orderedTables.push(table);
    inserted.add(table);
    pending.delete(table);
  }
}
const inserts = orderedTables.flatMap((table) => insertsByTable.get(table) ?? []);
const output = [...pragmas, ...tables, ...inserts, remainder, ''].join('\n');
await writeFile(outputPath, output, 'utf8');
process.stdout.write(
  `${JSON.stringify({ tables: tables.length, inserts: inserts.length, insertOrder: orderedTables, pragmas: pragmas.length, bytes: Buffer.byteLength(output) })}\n`,
);
