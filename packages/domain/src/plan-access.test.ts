import { describe, expect, it } from 'vitest';
import {
  accessPackInputSchema,
  ownerUserGrantInputSchema,
  planEntitlementsInputSchema,
  planPatchSchema,
  starsAccessInvoiceInputSchema,
} from './index';

describe('plan access contracts', () => {
  it('accepts only explicit one-time access invoices', () => {
    expect(
      starsAccessInvoiceInputSchema.parse({
        packCode: 'plus-30',
        termsAccepted: true,
        idempotencyKey: 'f7853f72-2d42-443d-9444-3187fe018893',
      }),
    ).toMatchObject({ packCode: 'plus-30', termsAccepted: true });
    expect(() =>
      starsAccessInvoiceInputSchema.parse({
        packCode: 'plus-30',
        termsAccepted: false,
        idempotencyKey: 'f7853f72-2d42-443d-9444-3187fe018893',
      }),
    ).toThrow();
  });

  it('validates bounded plan packs and complete entitlements', () => {
    expect(
      accessPackInputSchema.parse({
        code: 'pro-90',
        displayName: 'Pro на 90 дней',
        description: 'Разовый доступ без продления.',
        starsAmount: 500,
        planCode: 'PRO',
        durationDays: 90,
      }),
    ).toMatchObject({ active: false, durationDays: 90 });
    const entitlements = planEntitlementsInputSchema.parse({
      rateLimitMultiplier: 4,
      characterLimit: 200,
      personaLimit: 30,
      memoryTokenBudget: 10_000,
      loreTokenBudget: 8_000,
      advancedOperationsDaily: 40,
      modelProfiles: ['BALANCED', 'CREATIVE', 'PREMIUM'],
    });
    expect(planPatchSchema.parse({ entitlements })).toEqual({ entitlements });
    expect(() =>
      accessPackInputSchema.parse({
        code: 'pro-forever',
        displayName: 'Навсегда',
        description: 'Недопустимый срок.',
        starsAmount: 1,
        planCode: 'PRO',
        durationDays: 367,
      }),
    ).toThrow();
  });

  it('requires an explicit bounded plan or credit amount for an owner grant', () => {
    expect(
      ownerUserGrantInputSchema.parse({
        targetId: '1040929628',
        planCode: 'PRO',
        durationDays: 30,
        creditAmountMicros: 1_000_000,
        reason: 'Staging owner verification',
        idempotencyKey: 'f7853f72-2d42-443d-9444-3187fe018893',
      }),
    ).toMatchObject({ planCode: 'PRO', durationDays: 30, creditAmountMicros: 1_000_000 });
    expect(() =>
      ownerUserGrantInputSchema.parse({
        targetId: '1040929628',
        planCode: 'PRO',
        creditAmountMicros: 0,
        reason: 'Missing duration',
        idempotencyKey: 'f7853f72-2d42-443d-9444-3187fe018893',
      }),
    ).toThrow();
    expect(() =>
      ownerUserGrantInputSchema.parse({
        targetId: '1040929628',
        creditAmountMicros: 0,
        reason: 'Empty grant',
        idempotencyKey: 'f7853f72-2d42-443d-9444-3187fe018893',
      }),
    ).toThrow();
  });
});
