import { describe, expect, it, vi } from 'vitest';
import { reconcileTelegramConfiguration } from './telegram-configuration';
import type { Env } from './types';

describe('Telegram configuration reconciliation gate', () => {
  it('performs no D1 or Bot API work when reconciliation is disabled', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const env = {
      TELEGRAM_RECONCILIATION_ENABLED: 'false',
    } as unknown as Env;

    await expect(reconcileTelegramConfiguration(env, 1, fetcher)).resolves.toBe('skipped');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
