import { describe, expect, it } from 'vitest';
import { avatarGenerationDailyLimit } from './media-routes';
import { policyForRequest } from './reliability';

describe('generated character avatars', () => {
  it('keeps a strict plan-aware daily allowance', () => {
    expect(avatarGenerationDailyLimit('FREE')).toBe(1);
    expect(avatarGenerationDailyLimit('PLUS')).toBe(4);
    expect(avatarGenerationDailyLimit('PRO')).toBe(10);
    expect(avatarGenerationDailyLimit('UNKNOWN')).toBe(1);
  });

  it('does not double-charge the explicit generation limiter in global middleware', () => {
    expect(policyForRequest('POST', '/api/v1/media/generate-avatar')).toBeNull();
  });
});
