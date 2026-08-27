import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT =
  'C:\\Steam\\steamapps\\workshop\\content\\331470\\1666671085\\mods\\Cold embrace\\sprites\\kt\\normal';
const OUTPUT = new URL('./cold-embrace-analysis/katya-sprite-reference.png', import.meta.url);

await mkdir(new URL('./cold-embrace-analysis/', import.meta.url), { recursive: true });

await sharp({
  create: { width: 900, height: 1080, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([
    { input: `${ROOT}\\kt_1_body.png`, left: 0, top: 0 },
    { input: `${ROOT}\\kt_smile.png`, left: 0, top: 0 },
    { input: `${ROOT}\\kt_lokon.png`, left: 0, top: 0 },
  ])
  .png()
  .toFile(fileURLToPath(OUTPUT));

process.stdout.write(`${OUTPUT.pathname}\n`);
