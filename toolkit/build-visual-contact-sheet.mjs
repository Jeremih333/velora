import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve('docs/ui/evidence');
const mode = process.argv[2] === 'expected' ? 'expected' : 'actual-iphone';
const sourceName = mode === 'expected' ? 'expected.jpg' : 'actual-iphone.png';
const output = path.join(root, `${mode}-contact-sheet.jpg`);
const columns = 6;
const tileWidth = 180;
const tileHeight = 332;
const labelHeight = 24;
const gap = 8;

const folders = (await readdir(root, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^ui-\d{2}$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

const tiles = await Promise.all(
  folders.map(async (folder) => {
    const source = path.join(root, folder, sourceName);
    const image = await sharp(source)
      .resize(tileWidth, tileHeight - labelHeight, { fit: 'contain', background: '#090a0c' })
      .extend({
        top: labelHeight,
        bottom: 0,
        left: 0,
        right: 0,
        background: '#090a0c',
      })
      .composite([
        {
          input: Buffer.from(
            `<svg width="${tileWidth}" height="${labelHeight}"><text x="8" y="17" fill="#f7f7f7" font-family="Arial" font-size="13" font-weight="700">${folder}</text></svg>`,
          ),
          top: 0,
          left: 0,
        },
      ])
      .jpeg({ quality: 84 })
      .toBuffer();
    return image;
  }),
);

const rows = Math.ceil(tiles.length / columns);
await mkdir(root, { recursive: true });
await sharp({
  create: {
    width: columns * tileWidth + (columns + 1) * gap,
    height: rows * tileHeight + (rows + 1) * gap,
    channels: 3,
    background: '#050608',
  },
})
  .composite(
    tiles.map((input, index) => ({
      input,
      left: gap + (index % columns) * (tileWidth + gap),
      top: gap + Math.floor(index / columns) * (tileHeight + gap),
    })),
  )
  .jpeg({ quality: 88 })
  .toFile(output);

console.log(`Wrote ${folders.length} ${mode} states to ${output}`);
