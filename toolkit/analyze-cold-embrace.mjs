import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const MOD_ROOT = 'C:\\Steam\\steamapps\\workshop\\content\\331470\\1666671085\\mods\\Cold embrace';
const OUTPUT_ROOT = new URL('./cold-embrace-analysis/', import.meta.url);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    }),
  );
  return nested.flat();
}

function decodeRenpyString(value) {
  return value
    .replaceAll('\\"', '"')
    .replaceAll('\\n', '\n')
    .replace(/\{[^}]*\}/g, '')
    .trim();
}

function currentLabelAt(labels, lineNumber) {
  let current = null;
  for (const label of labels) {
    if (label.line > lineNumber) break;
    current = label.name;
  }
  return current;
}

const paths = (await walk(MOD_ROOT)).filter((path) => extname(path).toLowerCase() === '.rpy');
const files = [];
const characterNames = new Map();

for (const path of paths) {
  const text = await readFile(path, 'utf8');
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*\$\s*([A-Za-z_][\w]*)\s*=\s*Character\(u?["']([^"']+)["']/);
    if (match) characterNames.set(match[1], match[2]);
  }
  files.push({ path, relativePath: relative(MOD_ROOT, path), lines });
}

const labels = [];
const dialogue = [];
const menus = [];
const scenes = [];
const katyaMentions = [];

for (const file of files) {
  const fileLabels = [];
  file.lines.forEach((line, index) => {
    const label = line.match(/^\s*label\s+([A-Za-z_][\w]*)(?:\([^)]*\))?\s*:/);
    if (label) {
      const item = { file: file.relativePath, line: index + 1, name: label[1] };
      labels.push(item);
      fileLabels.push(item);
    }
  });

  file.lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const label = currentLabelAt(fileLabels, lineNumber);
    const spoken = line.match(/^\s*([A-Za-z_][\w]*)\s+"((?:[^"\\]|\\.)*)"/);
    if (spoken && characterNames.has(spoken[1])) {
      dialogue.push({
        file: file.relativePath,
        line: lineNumber,
        label,
        speakerCode: spoken[1],
        speaker: characterNames.get(spoken[1]),
        text: decodeRenpyString(spoken[2]),
      });
    }

    const choice = line.match(/^\s*"((?:[^"\\]|\\.)*)"\s*(?:if\s+[^:]*)?:\s*$/);
    if (choice) {
      menus.push({
        file: file.relativePath,
        line: lineNumber,
        label,
        text: decodeRenpyString(choice[1]),
      });
    }

    const scene = line.match(/^\s*(?:scene|show)\s+(?:bg\s+)?([^\s:]+)/);
    if (scene) {
      scenes.push({ file: file.relativePath, line: lineNumber, label, asset: scene[1] });
    }

    if (/Кат(?:я|и|ю|ей|е|юш)/iu.test(line) || /\bCE_kt\b/u.test(line)) {
      const context = file.lines
        .slice(Math.max(0, index - 2), Math.min(file.lines.length, index + 3))
        .map((value) => value.trim())
        .filter(Boolean);
      katyaMentions.push({ file: file.relativePath, line: lineNumber, label, context });
    }
  });
}

const katyaDialogue = dialogue.filter((item) => item.speakerCode === 'CE_kt');
const speakerCounts = [
  ...dialogue.reduce((counts, item) => {
    counts.set(item.speaker, (counts.get(item.speaker) ?? 0) + 1);
    return counts;
  }, new Map()),
]
  .map(([speaker, count]) => ({ speaker, count }))
  .sort((left, right) => right.count - left.count);
const sceneCounts = [
  ...scenes.reduce((counts, item) => {
    counts.set(item.asset, (counts.get(item.asset) ?? 0) + 1);
    return counts;
  }, new Map()),
]
  .map(([asset, count]) => ({ asset, count }))
  .sort((left, right) => right.count - left.count);

const result = {
  source: MOD_ROOT,
  generatedAt: new Date().toISOString(),
  statistics: {
    files: files.length,
    sourceLines: files.reduce((total, file) => total + file.lines.length, 0),
    characters: characterNames.size,
    labels: labels.length,
    dialogue: dialogue.length,
    katyaDialogue: katyaDialogue.length,
    menus: menus.length,
    sceneStatements: scenes.length,
    katyaMentions: katyaMentions.length,
  },
  characters: Object.fromEntries(characterNames),
  speakerCounts,
  sceneCounts,
  labels,
  menus,
  katyaDialogue,
  katyaMentions,
};

await mkdir(OUTPUT_ROOT, { recursive: true });
await writeFile(new URL('corpus-index.json', OUTPUT_ROOT), `${JSON.stringify(result, null, 2)}\n`);

const katyaTranscript = katyaDialogue
  .map((item) => `## ${item.file}:${item.line} — ${item.label ?? 'без label'}\n\n${item.text}\n`)
  .join('\n');
await writeFile(new URL('katya-dialogue.md', OUTPUT_ROOT), katyaTranscript);

const summary = [
  '# Cold Embrace source inventory',
  '',
  `- RPY files: ${result.statistics.files}`,
  `- Source lines: ${result.statistics.sourceLines}`,
  `- Named speakers: ${result.statistics.characters}`,
  `- Labels: ${result.statistics.labels}`,
  `- Dialogue lines: ${result.statistics.dialogue}`,
  `- Katya dialogue lines: ${result.statistics.katyaDialogue}`,
  `- Menu choices: ${result.statistics.menus}`,
  `- Scene/show statements: ${result.statistics.sceneStatements}`,
  '',
  '## Most active speakers',
  '',
  ...speakerCounts.slice(0, 40).map((item) => `- ${item.speaker}: ${item.count}`),
  '',
  '## Most referenced scene assets',
  '',
  ...sceneCounts.slice(0, 80).map((item) => `- ${item.asset}: ${item.count}`),
  '',
];
await writeFile(new URL('inventory.md', OUTPUT_ROOT), summary.join('\n'));

process.stdout.write(`${JSON.stringify(result.statistics)}\n`);
