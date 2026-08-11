export type CreditTransactionType =
  | 'PURCHASE'
  | 'BONUS'
  | 'PROMOTION'
  | 'ADMIN_GRANT'
  | 'GENERATION_USAGE'
  | 'REFUND'
  | 'REVERSAL'
  | 'EXPIRATION';

export interface CreditTransaction {
  readonly id: string;
  readonly type: CreditTransactionType;
  readonly amountMicros: bigint;
}

export function calculateBalance(transactions: readonly CreditTransaction[]): bigint {
  const ids = new Set<string>();
  return transactions.reduce((balance, transaction) => {
    if (ids.has(transaction.id)) throw new Error(`Duplicate ledger transaction: ${transaction.id}`);
    ids.add(transaction.id);
    return balance + transaction.amountMicros;
  }, 0n);
}

export function starsInvoiceIsOneTime(subscriptionPeriod: number | undefined): boolean {
  return subscriptionPeriod === undefined;
}

export interface ExpectedStarsPayment {
  readonly invoicePayload: string;
  readonly starsAmount: number;
}

export interface ReceivedStarsPayment {
  readonly invoicePayload: string;
  readonly currency: string;
  readonly totalAmount: number;
  readonly isRecurring?: true | undefined;
  readonly subscriptionExpirationDate?: number | undefined;
}

export function starsPaymentMatches(
  expected: ExpectedStarsPayment,
  received: ReceivedStarsPayment,
): boolean {
  return (
    received.currency === 'XTR' &&
    received.invoicePayload === expected.invoicePayload &&
    received.totalAmount === expected.starsAmount &&
    received.isRecurring === undefined &&
    received.subscriptionExpirationDate === undefined
  );
}
