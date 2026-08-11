import { describe, expect, it } from 'vitest';
import { requireModelProfile, type EffectivePlan } from './plans';

const plus: EffectivePlan = {
  code: 'PLUS',
  displayName: 'Plus',
  accessUntil: 1_800_000_000_000,
  entitlements: {
    rateLimitMultiplier: 2,
    characterLimit: 50,
    personaLimit: 10,
    memoryTokenBudget: 5_000,
    loreTokenBudget: 4_000,
    advancedOperationsDaily: 12,
    modelProfiles: ['BALANCED', 'CREATIVE'],
  },
};

describe('plan entitlements', () => {
  it('allows only model profiles explicitly assigned to the effective plan', () => {
    expect(() => {
      requireModelProfile(plus, 'CREATIVE');
    }).not.toThrow();
    expect(() => {
      requireModelProfile(plus, 'PREMIUM');
    }).toThrow(expect.objectContaining({ code: 'PLAN_ENTITLEMENT_REQUIRED' }));
  });
});
