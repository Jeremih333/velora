import { describe, expect, it } from 'vitest';
import { memoryJobRetryDecision } from './memory-jobs';

describe('memory job retry policy', () => {
  it('uses bounded exponential backoff before the final attempt', () => {
    expect(memoryJobRetryDecision(1, 5)).toEqual({
      status: 'FAILED',
      delayMilliseconds: 60_000,
    });
    expect(memoryJobRetryDecision(4, 5)).toEqual({
      status: 'FAILED',
      delayMilliseconds: 480_000,
    });
  });

  it('moves an exhausted job to dead-letter state', () => {
    expect(memoryJobRetryDecision(5, 5).status).toBe('DEAD');
    expect(memoryJobRetryDecision(20, 20).delayMilliseconds).toBe(3_600_000);
  });
});
