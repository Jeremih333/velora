import { describe, expect, it } from 'vitest';
import { isGenerationTierEnabled, isPaidAiEnabled, isPaidAiReady } from './paid-ai';

describe('paid AI deployment gate', () => {
  it('fails closed unless the environment explicitly enables paid roleplay', () => {
    expect(isPaidAiEnabled({})).toBe(false);
    expect(isPaidAiEnabled({ PAID_AI_ENABLED: 'false' })).toBe(false);
    expect(isPaidAiEnabled({ PAID_AI_ENABLED: 'TRUE' })).toBe(false);
    expect(isPaidAiEnabled({ PAID_AI_ENABLED: 'true' })).toBe(true);
  });

  it('keeps sponsored Free generation independent from paid generation', () => {
    expect(isGenerationTierEnabled({}, 'free')).toBe(false);
    expect(isGenerationTierEnabled({}, 'standard')).toBe(false);
    expect(isGenerationTierEnabled({ SPONSORED_FREE_AI_ENABLED: 'true' }, 'free')).toBe(true);
    expect(isGenerationTierEnabled({ SPONSORED_FREE_AI_ENABLED: 'true' }, 'standard')).toBe(false);
    expect(isGenerationTierEnabled({ PAID_AI_ENABLED: 'true' }, 'free')).toBe(false);
    expect(isGenerationTierEnabled({ PAID_AI_ENABLED: 'true' }, 'standard')).toBe(true);
    expect(isGenerationTierEnabled({ PAID_AI_ENABLED: 'true' }, 'premium')).toBe(true);
  });

  it('requires successful V3 and current model capability even after explicit enablement', async () => {
    let databaseReads = 0;
    const database = {
      prepare: () => {
        databaseReads += 1;
        return {
          bind: (...values: readonly unknown[]) => {
            expect(values).toEqual(['deepseek-chat-v3.1', 'deepseek-chat-v3.1']);
            return { first: () => Promise.resolve({ ready: 1 }) };
          },
        };
      },
    } as unknown as D1Database;
    await expect(
      isPaidAiReady({ enabled: 'false', database, model: 'deepseek-chat-v3.1' }),
    ).resolves.toBe(false);
    expect(databaseReads).toBe(0);
    await expect(
      isPaidAiReady({ enabled: 'true', database, model: 'deepseek-chat-v3.1' }),
    ).resolves.toBe(true);
    expect(databaseReads).toBe(1);
  });
});
