import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assessWebBundle,
  checkWebBundle,
  WEB_BUNDLE_LIMITS,
  type ViteManifestRecord,
} from '../../toolkit/check-web-bundle.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const distDirectory = path.join(projectRoot, 'apps', 'web', 'dist');

describe('web bundle budget', () => {
  it('keeps the built initial entry bounded and heavy workspaces lazy', async () => {
    const report = await checkWebBundle(distDirectory);
    expect(report.entryBytes).toBeLessThanOrEqual(WEB_BUNDLE_LIMITS.entryBytes);
    expect(report.oversizedChunks).toEqual([]);
    expect(report.missingLazyEntries).toEqual([]);

    const manifest = JSON.parse(
      await readFile(path.join(distDirectory, '.vite', 'manifest.json'), 'utf8'),
    ) as Record<string, ViteManifestRecord>;
    const chatFile = manifest['src/ChatsView.tsx']?.file;
    expect(chatFile).toBeDefined();
    expect((await stat(path.join(distDirectory, chatFile ?? 'missing'))).size).toBeGreaterThan(0);
  });

  it('rejects a regressed monolithic entry and missing lazy workspace', () => {
    const report = assessWebBundle(
      {
        'index.html': { file: 'assets/index.js', isEntry: true },
        'src/AuthenticatedApp.tsx': {
          file: 'assets/authenticated.js',
          isDynamicEntry: true,
        },
        'src/ChatsView.tsx': { file: 'assets/chats.js', isDynamicEntry: true },
      },
      {
        'assets/index.js': WEB_BUNDLE_LIMITS.entryBytes + 1,
        'assets/authenticated.js': 100,
        'assets/chats.js': 100,
      },
    );

    expect(report.oversizedEntry).toBe(true);
    expect(report.missingLazyEntries).toEqual(['src/LorebooksView.tsx']);
  });
});
