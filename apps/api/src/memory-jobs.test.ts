import { describe, expect, it } from 'vitest';
import {
  memoryJobRetryDecision,
  shouldCompleteMemoryJobWithoutRetry,
  shouldEnqueueAutomaticMemory,
} from './memory-jobs';

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

  it('completes empty-history jobs as harmless no-ops', () => {
    expect(shouldCompleteMemoryJobWithoutRetry('MEMORY_EMPTY_HISTORY')).toBe(true);
    expect(shouldCompleteMemoryJobWithoutRetry('DATABASE_UNAVAILABLE')).toBe(false);
  });
});

describe('automatic memory threshold', () => {
  it('does not enqueue after every message and triggers on either bounded threshold', () => {
    expect(shouldEnqueueAutomaticMemory(1, 400)).toBe(false);
    expect(shouldEnqueueAutomaticMemory(19, 11_999)).toBe(false);
    expect(shouldEnqueueAutomaticMemory(20, 200)).toBe(true);
    expect(shouldEnqueueAutomaticMemory(2, 12_000)).toBe(true);
  });

  it('rejects invalid counters', () => {
    expect(() => shouldEnqueueAutomaticMemory(-1, 0)).toThrow(RangeError);
  });
});
