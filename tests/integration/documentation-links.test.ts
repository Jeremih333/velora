import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  checkDocumentationLinks,
  extractLocalMarkdownTargets,
} from '../../toolkit/check-doc-links.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('documentation link checker', () => {
  it('extracts local file targets while ignoring URLs and page anchors', () => {
    expect(
      extractLocalMarkdownTargets(
        '[local](docs/guide.md) [web](https://example.com) [anchor](#part) ![asset](images/a.png)',
      ),
    ).toEqual(['docs/guide.md', 'images/a.png']);
  });

  it('accepts existing relative links and reports missing or escaping targets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'velora-doc-links-'));
    temporaryDirectories.push(root);
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'README.md'), '[valid](docs/guide.md) [missing](docs/no.md)');
    await writeFile(join(root, 'docs', 'guide.md'), '[escape](../../outside.md)');

    expect(await checkDocumentationLinks(root)).toEqual([
      { source: 'README.md', target: 'docs/no.md', reason: 'MISSING' },
      { source: 'docs/guide.md', target: '../../outside.md', reason: 'OUTSIDE_PROJECT' },
    ]);
  });

  it('finds no broken local links in the current Velora documentation', async () => {
    const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
    expect(await checkDocumentationLinks(projectRoot)).toEqual([]);
  });
});
