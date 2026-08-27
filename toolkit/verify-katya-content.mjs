import { readFile } from 'node:fs/promises';
import {
  katyaCharacter,
  katyaLorebook,
  worldLorebook,
} from './cold-embrace-analysis/katya-content.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateEntries(entries, label) {
  const titles = new Set();
  for (const [title, keys, priority, content] of entries) {
    assert(typeof title === 'string' && title.length >= 3, `${label}: invalid title.`);
    assert(!titles.has(title), `${label}: duplicate title ${title}.`);
    titles.add(title);
    assert(Array.isArray(keys) && keys.length >= 2, `${label}: ${title} has too few keys.`);
    assert(new Set(keys).size === keys.length, `${label}: ${title} has duplicate keys.`);
    assert(
      Number.isInteger(priority) && priority >= 100 && priority <= 250,
      `${label}: invalid priority.`,
    );
    assert(
      typeof content === 'string' && content.length >= 100,
      `${label}: ${title} is too short.`,
    );
  }
}

validateEntries(worldLorebook.entries, 'world');
validateEntries(katyaLorebook.entries, 'katya');
assert(worldLorebook.entries.length >= 40, 'World lorebook is incomplete.');
assert(katyaLorebook.entries.length >= 12, 'Katya lorebook is incomplete.');

const worldCorpus = JSON.stringify(worldLorebook.entries);
for (const required of [
  'Дима',
  'Гриша',
  'Катя',
  'Марина Владимировна',
  'Денис',
  'Вика',
  'Саша',
  'Роза',
  'Настя',
  'Маша',
  'Ваня',
  'Жанна Адамовна',
  'Женя',
  'Рома',
  'Олег',
  'Толик',
  'Наталья',
  'Макс',
  'Александра',
  'Юрий',
  'Сеня',
  'Кирилл',
  'Артём',
  'Кира',
  'Лёня',
  'Максим',
  'Алина Викторовна',
  'Ольга Дмитриевна',
  'Миша',
]) {
  assert(worldCorpus.includes(required), `World lorebook misses ${required}.`);
}
for (const required of [
  'Совёнок',
  'пристань',
  'медпункт',
  'библиотек',
  'остров',
  'катакомб',
  'райцентр',
  'Дофенизм',
  'Истовость',
  'Эрос',
]) {
  assert(worldCorpus.includes(required), `World lorebook misses setting term ${required}.`);
}

const requiredNamedCast = [
  'Дима',
  'Гриша',
  'Катя',
  'Марина Владимировна',
  'Денис',
  'Вика',
  'Саша',
  'Роза',
  'Настя',
  'Маша',
  'Ваня',
  'Жанна Адамовна',
  'Женя',
  'Рома',
  'Олег',
  'Толик',
  'Наталья',
  'Сеня',
  'Кирилл',
  'Артём',
  'Кира',
  'Лёня',
  'Максим',
  'Алина Викторовна',
  'Ольга Дмитриевна',
  'Миша',
  'дядя Витя',
  'тётя Нина',
  'мать Маши',
  'врач',
  'доктор',
  'водитель',
];
const missingNamedCast = requiredNamedCast.filter((name) => !worldCorpus.includes(name));
assert(
  missingNamedCast.length === 0,
  `World lorebook misses named cast: ${missingNamedCast.join(', ')}.`,
);

const requiredStoryCoverage = [
  'Хронология пяти дней',
  'Ветки и последствия',
  'Ключевые места Совёнка',
  'География за пределами центра',
  'Дофенизм, Истовость и Эрос',
  'Прошлогодний инцидент',
  'Туман и новая угроза',
  'Повседневный распорядок лагеря',
  'Домики и центральная площадь',
  'Столовая и кухня',
  'Клубы, библиотека и музыка',
  'Спортплощадка, пляж и пристань',
  'Медпункт, больница и семья Маши',
  'Подземный маршрут и старая территория',
  'Дорога, автобус и внешний мир',
  'Эпизодические взрослые и очевидцы',
  'Внутренний голос и условные говорящие роли',
];
const worldTitles = new Set(worldLorebook.entries.map(([title]) => title));
const missingStoryCoverage = requiredStoryCoverage.filter((title) => !worldTitles.has(title));
assert(
  missingStoryCoverage.length === 0,
  `World lorebook misses story coverage: ${missingStoryCoverage.join(', ')}.`,
);

for (const field of [
  'description',
  'personality',
  'scenario',
  'firstMessage',
  'speechStyle',
  'appearance',
  'background',
  'goals',
  'behaviourRules',
  'systemInstructions',
  'postHistoryInstructions',
]) {
  assert(
    typeof katyaCharacter[field] === 'string' && katyaCharacter[field].length >= 80,
    `Katya ${field} is incomplete.`,
  );
}
assert(katyaCharacter.name === 'Катя', 'An unverified surname was added.');
assert(katyaCharacter.appearance.includes('аквамарин'), 'Katya hair color is missing.');
assert(katyaCharacter.examples.split('{{user}}:').length - 1 >= 6, 'Not enough dialogue examples.');
assert(katyaCharacter.alternateGreetings.length >= 6, 'Not enough alternate greetings.');
assert(
  new Set(katyaCharacter.alternateGreetings).size === katyaCharacter.alternateGreetings.length,
  'Duplicate greetings.',
);
for (const greeting of katyaCharacter.alternateGreetings) {
  assert(greeting.length >= 180, 'An alternate greeting is too short.');
  assert(greeting.includes('*'), 'An alternate greeting has no actions.');
}

const png = await readFile(new URL('./cold-embrace-analysis/katya-avatar.png', import.meta.url));
assert(png.subarray(1, 4).toString('ascii') === 'PNG', 'Katya avatar is not a PNG.');
assert(png.length >= 100_000, 'Katya avatar is unexpectedly small.');

process.stdout.write(
  `${JSON.stringify({
    character: katyaCharacter.id,
    examples: katyaCharacter.examples.split('{{user}}:').length - 1,
    alternateGreetings: katyaCharacter.alternateGreetings.length,
    worldEntries: worldLorebook.entries.length,
    personalEntries: katyaLorebook.entries.length,
    namedCastCovered: requiredNamedCast.length,
    storyCoverageSections: requiredStoryCoverage.length,
    avatarBytes: png.length,
  })}\n`,
);
