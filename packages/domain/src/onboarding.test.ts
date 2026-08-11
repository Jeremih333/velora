import { describe, expect, it } from 'vitest';
import { onboardingCompleteSchema } from './index';

describe('onboardingCompleteSchema', () => {
  it('keeps a safe-mode completion compact and explicit', () => {
    expect(
      onboardingCompleteSchema.parse({
        idempotencyKey: '671f43d6-dbe3-44b9-acd3-e928860d3a7d',
        policyAccepted: true,
      }),
    ).toEqual({
      idempotencyKey: '671f43d6-dbe3-44b9-acd3-e928860d3a7d',
      policyAccepted: true,
      matureEnabled: false,
      persona: null,
    });
  });

  it('normalizes an optional private persona', () => {
    const value = onboardingCompleteSchema.parse({
      idempotencyKey: '671f43d6-dbe3-44b9-acd3-e928860d3a7d',
      policyAccepted: true,
      matureEnabled: true,
      persona: { name: '  Странница  ', shortDescription: '  Ищет старые истории.  ' },
    });
    expect(value.persona).toEqual({
      name: 'Странница',
      shortDescription: 'Ищет старые истории.',
    });
  });

  it('rejects implicit policy acceptance', () => {
    expect(() =>
      onboardingCompleteSchema.parse({
        idempotencyKey: '671f43d6-dbe3-44b9-acd3-e928860d3a7d',
        policyAccepted: false,
      }),
    ).toThrow();
  });
});
