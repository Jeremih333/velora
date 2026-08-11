import { describe, expect, it } from 'vitest';
import { calculateBalance, starsInvoiceIsOneTime, starsPaymentMatches } from './index';

describe('credit ledger', () => {
  it('calculates from immutable transactions and detects duplicate IDs', () => {
    expect(
      calculateBalance([
        { id: 'a', type: 'PURCHASE', amountMicros: 10n },
        { id: 'b', type: 'GENERATION_USAGE', amountMicros: -3n },
      ]),
    ).toBe(7n);
    expect(() =>
      calculateBalance([
        { id: 'a', type: 'PURCHASE', amountMicros: 1n },
        { id: 'a', type: 'PURCHASE', amountMicros: 1n },
      ]),
    ).toThrow();
  });

  it('forbids recurring invoice configuration', () => {
    expect(starsInvoiceIsOneTime(undefined)).toBe(true);
    expect(starsInvoiceIsOneTime(2_592_000)).toBe(false);
  });

  it('accepts only an exact one-time XTR payment', () => {
    const expected = { invoicePayload: 'opaque-order', starsAmount: 50 };
    expect(
      starsPaymentMatches(expected, {
        invoicePayload: 'opaque-order',
        currency: 'XTR',
        totalAmount: 50,
      }),
    ).toBe(true);
    expect(
      starsPaymentMatches(expected, {
        invoicePayload: 'opaque-order',
        currency: 'XTR',
        totalAmount: 50,
        isRecurring: true,
      }),
    ).toBe(false);
    expect(
      starsPaymentMatches(expected, {
        invoicePayload: 'opaque-order',
        currency: 'USD',
        totalAmount: 50,
      }),
    ).toBe(false);
  });
});
