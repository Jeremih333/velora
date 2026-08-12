import { describe, expect, it } from 'vitest';

import { assessWebBundle, WEB_BUNDLE_LIMITS } from '../../toolkit/check-web-bundle.mjs';

describe('web bundle budget', () => {
  it('accepts a bounded entry with all required lazy workspaces', () => {
    const report = assessWebBundle(
      {
        'index.html': { file: 'assets/index.js', isEntry: true },
        'src/AuthenticatedApp.tsx': {
          file: 'assets/authenticated.js',
          isDynamicEntry: true,
        },
        'src/ChatsView.tsx': { file: 'assets/chats.js', isDynamicEntry: true },
        'src/LorebooksView.tsx': { file: 'assets/lorebooks.js', isDynamicEntry: true },
      },
      {
        'assets/index.js': 306_635,
        'assets/authenticated.js': 148_982,
        'assets/chats.js': 183_811,
        'assets/lorebooks.js': 13_225,
      },
    );

    expect(report.entryBytes).toBeLessThanOrEqual(WEB_BUNDLE_LIMITS.entryBytes);
    expect(report.oversizedChunks).toEqual([]);
    expect(report.missingLazyEntries).toEqual([]);
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
