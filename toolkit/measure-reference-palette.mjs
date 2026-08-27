import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import sharp from 'sharp';

const referenceDirectory = resolve('docs/ui/reference');
const outputPath = resolve('docs/ui/REFERENCE_PALETTE_MEASUREMENT.md');
const references = readdirSync(referenceDirectory)
  .filter((name) => /\.(?:jpe?g|png|webp)$/iu.test(name))
  .sort((left, right) => left.localeCompare(right, 'en'));

if (references.length !== 46) {
  throw new Error(`Expected 46 controlled references, found ${references.length}.`);
}

const aggregate = new Map();
const perReference = [];
let sampledPixels = 0;

const quantize = (channel) => Math.min(255, Math.floor(channel / 16) * 16 + 8);
const toHex = (red, green, blue) =>
  `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

for (const reference of references) {
  const path = join(referenceDirectory, reference);
  const source = readFileSync(path);
  const { data, info } = await sharp(source)
    .resize({ width: 96, height: 192, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const local = new Map();

  for (let offset = 0; offset < data.length; offset += info.channels) {
    const red = quantize(data[offset] ?? 0);
    const green = quantize(data[offset + 1] ?? 0);
    const blue = quantize(data[offset + 2] ?? 0);
    const color = toHex(red, green, blue);
    aggregate.set(color, (aggregate.get(color) ?? 0) + 1);
    local.set(color, (local.get(color) ?? 0) + 1);
    sampledPixels += 1;
  }

  const [dominant = '#000000', count = 0] =
    [...local.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )[0] ?? [];
  perReference.push({
    file: reference,
    dominant,
    share:
      count /
      Math.max(
        1,
        [...local.values()].reduce((sum, value) => sum + value, 0),
      ),
    sha256: createHash('sha256').update(source).digest('hex'),
  });
}

const dominantColors = [...aggregate.entries()]
  .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  .slice(0, 32);

const lines = [
  '# Reference palette measurement',
  '',
  'Generated deterministically by `node toolkit/measure-reference-palette.mjs` from the 46 controlled UI references. Images are downsampled, RGB channels are quantized to 16-value buckets, and the result is used as directional evidence—not copied as product branding.',
  '',
  `Sampled pixels: ${sampledPixels.toLocaleString('en-US')}.`,
  '',
  '## Aggregate dominant buckets',
  '',
  '| Rank | Quantized RGB | Sample share |',
  '| ---: | ------------- | -----------: |',
  ...dominantColors.map(
    ([color, count], index) =>
      `| ${index + 1} | \`${color}\` | ${((count / sampledPixels) * 100).toFixed(2)}% |`,
  ),
  '',
  '## Per-reference dominant bucket and integrity hash',
  '',
  '| Reference | Dominant bucket | Share | SHA-256 |',
  '| --------- | --------------- | ----: | ------- |',
  ...perReference.map(
    ({ file, dominant, share, sha256 }) =>
      `| \`${basename(file)}\` | \`${dominant}\` | ${(share * 100).toFixed(2)}% | \`${sha256}\` |`,
  ),
  '',
  '## Normalization decision',
  '',
  '- References consistently establish near-black/navy backgrounds, layered dark neutral surfaces, white/gray text, saturated blue action accents, blue-purple premium accents, cyan roleplay accents, red danger and green success.',
  '- Velora keeps its own purple identity while mapping those measured roles to semantic tokens. Theme-specific literal values live only in the token declarations; components consume semantic variables and `color-mix()` derivatives.',
  '- JPEG compression and illustrated media produce many low-frequency buckets, so aggregate rank is evidence for direction and contrast hierarchy, not a license to duplicate every sampled color.',
  '',
];

writeFileSync(outputPath, `${lines.join('\n')}\n`);
process.stdout.write(`Measured ${references.length} references into ${outputPath}.\n`);
