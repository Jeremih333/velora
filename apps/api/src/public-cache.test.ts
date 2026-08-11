import { describe, expect, it } from 'vitest';
import { publicCacheRequest } from './public-cache';

describe('public cache key boundary', () => {
  it('uses an isolated Velora origin and versioned key', () => {
    expect(publicCacheRequest('/character/123/').url).toBe(
      'https://public-cache.velora.internal/v1/character/123',
    );
  });

  it('rejects empty and traversal-like keys', () => {
    expect(() => publicCacheRequest('/')).toThrow('Invalid public cache key');
    expect(() => publicCacheRequest('../private/conversation')).toThrow('Invalid public cache key');
  });
});
