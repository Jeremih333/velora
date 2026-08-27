import { readdir, readFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

const root = process.argv[2];
if (!root) throw new Error('Pass the Cold embrace directory.');

const cast = new Map([
  ['CE_mv', 'Марина Владимировна'],
  ['CE_den', 'Денис'],
  ['CE_vk', 'Вика'],
  ['CE_ss', 'Саша'],
  ['CE_rz', 'Роза'],
  ['CE_sn', 'Настя'],
  ['CE_gr', 'Гриша'],
  ['CE_mash', 'Маша'],
  ['CE_vn', 'Ваня'],
  ['CE_sz', 'Жанна Адамовна'],
  ['CE_zm', 'Женя'],
  ['CE_rm', 'Рома'],
  ['CE_ol', 'Олег'],
  ['CE_senya', 'Сеня'],
  ['CE_kirill', 'Кирилл'],
  ['CE_art', 'Артём'],
  ['CE_diary_kira', 'Кира'],
  ['CE_ln', 'Лёня'],
  ['CE_mx', 'Максим'],
  ['CE_dev_a', 'Алина Викторовна'],
  ['CE_mt', 'Ольга Дмитриевна'],
  ['CE_mish', 'Миша'],
  ['CE_vitya', 'дядя Витя'],
]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      return entry.name.endsWith('.rpy') ? [path] : [];
    }),
  );
  return nested.flat();
}

const files = await walk(root);
for (const [code, name] of cast) {
  const matches = [];
  const matcher = new RegExp(`^\\s*${code}\\s+"`);
  for (const file of files) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/u);
    for (const [index, line] of lines.entries()) {
      if (matcher.test(line)) {
        matches.push({ file: relative(root, file), line: index + 1, text: line.trim() });
      }
    }
  }
  console.log(`\n## ${name} (${matches.length})`);
  const indexes = [0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 0.97].map((fraction) =>
    Math.min(matches.length - 1, Math.floor(matches.length * fraction)),
  );
  for (const index of [...new Set(indexes)]) {
    const match = matches[index];
    if (match) console.log(`${basename(match.file)}:${match.line} ${match.text}`);
  }
}
