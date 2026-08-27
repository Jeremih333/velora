import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Telegram menu operator', () => {
  it('uses the protected token store and verifies the cache-busted menu without touching webhook', async () => {
    const source = await readFile(
      new URL('../../toolkit/update-telegram-menu.ps1', import.meta.url),
      'utf8',
    );

    expect(source).toContain("Get-VeloraStoredSecret 'TELEGRAM_BOT_TOKEN'");
    expect(source).toContain("'update-telegram-menu.mjs'");
    expect(source).toContain('$env:WEB_APP_CACHE_VERSION = $CacheVersion');
    expect(source).not.toContain('setWebhook');
    expect(source).not.toContain('TELEGRAM_WEBHOOK_SECRET');

    const implementation = await readFile(
      new URL('../../toolkit/update-telegram-menu.mjs', import.meta.url),
      'utf8',
    );
    expect(implementation).toContain("const identity = await call('getMe')");
    expect(implementation).toContain('setChatMenuButton');
    expect(implementation).toContain("const actual = await call('getChatMenuButton')");
    expect(implementation).toContain("text: 'Открыть'");
    expect(implementation).not.toContain('setWebhook');
  });
});
