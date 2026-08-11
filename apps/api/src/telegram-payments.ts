import { starsPaymentMatches, type ReceivedStarsPayment } from '@velora/billing';
import { AppError, asError, createId, nowMs } from '@velora/shared';
import { z } from 'zod';

interface PaymentRow {
  readonly id: string;
  readonly userId: string;
  readonly telegramId: string;
  readonly currency: 'XTR';
  readonly amount: number;
  readonly state:
    | 'CREATED'
    | 'INVOICE_SENT'
    | 'PENDING'
    | 'PAID'
    | 'ENTITLEMENT_GRANTED'
    | 'CANCELLED'
    | 'FAILED'
    | 'EXPIRED'
    | 'REFUNDED';
  readonly invoicePayload: string;
  readonly creditAmountMicros: number | null;
  readonly accessPackCode: string | null;
  readonly planCode: string | null;
  readonly accessDurationDays: number | null;
  readonly telegramPaymentChargeId: string | null;
}

export interface SuccessfulStarsPayment extends ReceivedStarsPayment {
  readonly telegramPaymentChargeId: string;
  readonly providerPaymentChargeId: string;
}

export interface RefundedStarsPayment {
  readonly currency: 'XTR';
  readonly totalAmount: number;
  readonly invoicePayload: string;
  readonly telegramPaymentChargeId: string;
  readonly providerPaymentChargeId: string;
}

const telegramBooleanResponseSchema = z.object({
  ok: z.boolean(),
  result: z.boolean().optional(),
  description: z.string().optional(),
});
const telegramInvoiceLinkResponseSchema = z.object({
  ok: z.boolean(),
  result: z.url().optional(),
  description: z.string().optional(),
});

export async function createStarsInvoiceLink(
  fetcher: typeof fetch,
  input: {
    readonly apiBaseUrl?: string;
    readonly botToken: string;
    readonly title: string;
    readonly description: string;
    readonly payload: string;
    readonly starsAmount: number;
  },
): Promise<string> {
  const response = await fetcher(
    `${input.apiBaseUrl ?? 'https://api.telegram.org'}/bot${input.botToken}/createInvoiceLink`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: input.title,
        description: input.description,
        payload: input.payload,
        currency: 'XTR',
        prices: [{ label: input.title, amount: input.starsAmount }],
      }),
    },
  );
  const result = telegramInvoiceLinkResponseSchema.parse(await response.json());
  if (!response.ok || !result.ok || !result.result) {
    throw new AppError('TELEGRAM_INVOICE_FAILED', 'Telegram не создал ссылку на счёт.', 503);
  }
  const invoiceUrl = new URL(result.result);
  if (invoiceUrl.protocol !== 'https:' || invoiceUrl.hostname !== 't.me') {
    throw new AppError('TELEGRAM_INVOICE_INVALID', 'Telegram вернул недопустимую ссылку.', 503);
  }
  return invoiceUrl.toString();
}

export async function answerStarsPreCheckout(
  fetcher: typeof fetch,
  input: {
    readonly apiBaseUrl?: string;
    readonly botToken: string;
    readonly queryId: string;
    readonly ok: boolean;
    readonly errorMessage?: string;
  },
): Promise<void> {
  const response = await fetcher(
    `${input.apiBaseUrl ?? 'https://api.telegram.org'}/bot${input.botToken}/answerPreCheckoutQuery`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pre_checkout_query_id: input.queryId,
        ok: input.ok,
        ...(input.ok ? {} : { error_message: input.errorMessage ?? 'Счёт больше недоступен.' }),
      }),
    },
  );
  const result = telegramBooleanResponseSchema.parse(await response.json());
  if (!response.ok || !result.ok || result.result !== true) {
    throw new AppError(
      'TELEGRAM_PRECHECKOUT_RESPONSE_FAILED',
      'Telegram не принял ответ проверки платежа.',
      503,
    );
  }
}

export async function validateAndMarkPreCheckout(
  database: D1Database,
  input: {
    readonly telegramId: string;
    readonly invoicePayload: string;
    readonly currency: string;
    readonly totalAmount: number;
  },
): Promise<boolean> {
  const payment = await readPayment(database, input.invoicePayload);
  if (!payment) return false;
  if (
    payment.telegramId !== input.telegramId ||
    !hasExactlyOnePurchaseKind(payment) ||
    !['CREATED', 'INVOICE_SENT', 'PENDING'].includes(payment.state) ||
    !starsPaymentMatches(
      { invoicePayload: payment.invoicePayload, starsAmount: payment.amount },
      {
        invoicePayload: input.invoicePayload,
        currency: input.currency,
        totalAmount: input.totalAmount,
      },
    )
  ) {
    return false;
  }
  const result = await database
    .prepare(
      `UPDATE payments SET state = 'PENDING', updated_at = ?
       WHERE id = ? AND state IN ('CREATED', 'INVOICE_SENT', 'PENDING')`,
    )
    .bind(nowMs(), payment.id)
    .run();
  return result.meta.changes === 1;
}

export async function grantSuccessfulStarsPayment(
  database: D1Database,
  telegramId: string,
  payment: SuccessfulStarsPayment,
): Promise<'granted' | 'granted_access' | 'duplicate'> {
  const expected = await readPayment(database, payment.invoicePayload);
  if (!expected) {
    throw new AppError('PAYMENT_NOT_FOUND', 'Платёж не относится к этому пользователю.', 409);
  }
  if (expected.telegramId !== telegramId) {
    throw new AppError('PAYMENT_NOT_FOUND', 'Платёж не относится к этому пользователю.', 409);
  }
  if (!hasExactlyOnePurchaseKind(expected)) {
    throw new AppError('PAYMENT_PACK_MISSING', 'Пакет этого платежа больше недоступен.', 409);
  }
  if (
    !starsPaymentMatches(
      { invoicePayload: expected.invoicePayload, starsAmount: expected.amount },
      payment,
    )
  ) {
    throw new AppError('PAYMENT_MISMATCH', 'Параметры платежа не совпадают со счётом.', 409);
  }
  const alreadyGranted = await database
    .prepare(
      `SELECT id FROM payments WHERE invoice_payload = ? AND user_id = ?
       AND telegram_payment_charge_id = ? AND state = 'ENTITLEMENT_GRANTED'`,
    )
    .bind(payment.invoicePayload, expected.userId, payment.telegramPaymentChargeId)
    .first<{ id: string }>();
  if (alreadyGranted) return 'duplicate';
  const timestamp = nowMs();
  try {
    const accessPurchase = expected.accessPackCode !== null;
    const grantStatement = accessPurchase
      ? database
          .prepare(
            `INSERT INTO plan_access_grants
             (id, user_id, plan_code, starts_at, expires_at, source_payment_id, created_at)
             SELECT ?, user_id, plan_code,
               CASE WHEN COALESCE((SELECT MAX(g.expires_at) FROM plan_access_grants g
                 WHERE g.user_id = payments.user_id AND g.plan_code = payments.plan_code
                   AND g.revoked_at IS NULL AND g.refunded_at IS NULL), 0) > ?
                 THEN (SELECT MAX(g.expires_at) FROM plan_access_grants g
                   WHERE g.user_id = payments.user_id AND g.plan_code = payments.plan_code
                     AND g.revoked_at IS NULL AND g.refunded_at IS NULL)
                 ELSE ? END,
               (CASE WHEN COALESCE((SELECT MAX(g.expires_at) FROM plan_access_grants g
                 WHERE g.user_id = payments.user_id AND g.plan_code = payments.plan_code
                   AND g.revoked_at IS NULL AND g.refunded_at IS NULL), 0) > ?
                 THEN (SELECT MAX(g.expires_at) FROM plan_access_grants g
                   WHERE g.user_id = payments.user_id AND g.plan_code = payments.plan_code
                     AND g.revoked_at IS NULL AND g.refunded_at IS NULL)
                 ELSE ? END) + access_duration_days * 86400000,
               id, ? FROM payments WHERE id = ? AND state = 'PAID'
                 AND plan_code IS NOT NULL AND access_duration_days IS NOT NULL
                 AND access_pack_code IS NOT NULL`,
          )
          .bind(createId(), timestamp, timestamp, timestamp, timestamp, timestamp, expected.id)
      : database
          .prepare(
            `INSERT INTO credit_transactions
             (id, user_id, type, amount_micros, idempotency_key, reference_type,
              reference_id, metadata_json, created_at)
             SELECT ?, user_id, 'PURCHASE', credit_amount_micros, ?, 'PAYMENT', id,
               json_object('provider', 'TELEGRAM_STARS', 'starsAmount', amount), ?
             FROM payments WHERE id = ? AND state = 'PAID'
               AND telegram_payment_charge_id = ? AND credit_amount_micros IS NOT NULL`,
          )
          .bind(
            createId(),
            `telegram-stars:${payment.telegramPaymentChargeId}`,
            timestamp,
            expected.id,
            payment.telegramPaymentChargeId,
          );
    const results = await database.batch([
      database
        .prepare(
          `UPDATE payments SET state = 'PAID', telegram_payment_charge_id = ?,
           provider_payment_charge_id = ?, paid_at = ?, updated_at = ?
           WHERE id = ? AND user_id = ? AND state IN ('CREATED', 'INVOICE_SENT', 'PENDING')
           AND currency = 'XTR' AND amount = ? AND invoice_payload = ?
           AND (credit_amount_micros IS NOT NULL OR
             (access_pack_code IS NOT NULL AND plan_code IS NOT NULL
              AND access_duration_days IS NOT NULL))`,
        )
        .bind(
          payment.telegramPaymentChargeId,
          payment.providerPaymentChargeId,
          timestamp,
          timestamp,
          expected.id,
          expected.userId,
          payment.totalAmount,
          payment.invoicePayload,
        ),
      grantStatement,
      database
        .prepare(
          `UPDATE payments SET state = 'ENTITLEMENT_GRANTED', updated_at = ?
           WHERE id = ? AND state = 'PAID' AND telegram_payment_charge_id = ?`,
        )
        .bind(timestamp, expected.id, payment.telegramPaymentChargeId),
      database
        .prepare(
          `INSERT INTO product_events
           (id, source_key, user_id, event_name, route_group, created_at)
           SELECT ?, ?, user_id, 'PAYMENT_COMPLETED', 'billing', ?
           FROM payments WHERE id = ? AND state = 'ENTITLEMENT_GRANTED'
           ON CONFLICT(source_key) DO NOTHING`,
        )
        .bind(createId(), `payment:${expected.id}`, timestamp, expected.id),
    ]);
    if (
      results[0]?.meta.changes !== 1 ||
      results[1]?.meta.changes !== 1 ||
      results[2]?.meta.changes !== 1 ||
      results[3]?.meta.changes !== 1
    ) {
      throw new Error('PAYMENT_GRANT_TRANSACTION_INCOMPLETE');
    }
    return accessPurchase ? 'granted_access' : 'granted';
  } catch (error) {
    const replay = await database
      .prepare(
        `SELECT id FROM payments WHERE invoice_payload = ? AND user_id = ?
         AND telegram_payment_charge_id = ? AND state = 'ENTITLEMENT_GRANTED'`,
      )
      .bind(payment.invoicePayload, expected.userId, payment.telegramPaymentChargeId)
      .first<{ id: string }>();
    if (replay) return 'duplicate';
    if (/UNIQUE|constraint/iu.test(asError(error).message)) {
      throw new AppError('PAYMENT_CHARGE_REUSED', 'Идентификатор платежа уже использован.', 409);
    }
    throw error;
  }
}

export async function reverseRefundedStarsPayment(
  database: D1Database,
  telegramId: string,
  refund: RefundedStarsPayment,
): Promise<'reversed' | 'duplicate'> {
  const payment = await database
    .prepare(
      `SELECT p.id, p.user_id AS userId, u.telegram_id AS telegramId,
       p.currency, p.amount, p.state, p.invoice_payload AS invoicePayload,
       p.credit_amount_micros AS creditAmountMicros,
       p.access_pack_code AS accessPackCode, p.plan_code AS planCode,
       p.access_duration_days AS accessDurationDays,
       p.telegram_payment_charge_id AS telegramPaymentChargeId
       FROM payments p JOIN users u ON u.id = p.user_id
       WHERE p.telegram_payment_charge_id = ?`,
    )
    .bind(refund.telegramPaymentChargeId)
    .first<PaymentRow>();
  if (!payment) {
    throw new AppError('REFUND_MISMATCH', 'Возврат не совпадает с исходным платежом.', 409);
  }
  if (
    payment.telegramId !== telegramId ||
    payment.invoicePayload !== refund.invoicePayload ||
    payment.amount !== refund.totalAmount
  ) {
    throw new AppError('REFUND_MISMATCH', 'Возврат не совпадает с исходным платежом.', 409);
  }
  if (!hasExactlyOnePurchaseKind(payment)) {
    throw new AppError('PAYMENT_PACK_MISSING', 'У исходного платежа нет доступного пакета.', 409);
  }
  if (payment.state === 'REFUNDED') return 'duplicate';
  if (payment.state !== 'ENTITLEMENT_GRANTED') {
    throw new AppError('PAYMENT_NOT_REFUNDABLE', 'Платёж ещё не был начислен.', 409);
  }
  const timestamp = nowMs();
  try {
    const accessGrant =
      payment.accessPackCode === null
        ? null
        : await database
            .prepare(
              `SELECT starts_at AS startsAt, expires_at AS expiresAt
               FROM plan_access_grants WHERE source_payment_id = ? AND refunded_at IS NULL`,
            )
            .bind(payment.id)
            .first<{ startsAt: number; expiresAt: number }>();
    if (payment.accessPackCode !== null && !accessGrant) {
      throw new Error('PAYMENT_ACCESS_GRANT_MISSING');
    }
    const reversal =
      payment.accessPackCode === null
        ? database
            .prepare(
              `INSERT INTO credit_transactions
               (id, user_id, type, amount_micros, idempotency_key, reference_type,
                reference_id, metadata_json, created_at)
               VALUES (?, ?, 'REVERSAL', ?, ?, 'PAYMENT', ?, ?, ?)`,
            )
            .bind(
              createId(),
              payment.userId,
              -(payment.creditAmountMicros ?? 0),
              `telegram-stars-refund:${refund.telegramPaymentChargeId}`,
              payment.id,
              JSON.stringify({ provider: 'TELEGRAM_STARS', starsAmount: refund.totalAmount }),
              timestamp,
            )
        : database
            .prepare(
              `UPDATE plan_access_grants SET revoked_at = ?, refunded_at = ?
             WHERE source_payment_id = ? AND refunded_at IS NULL`,
            )
            .bind(timestamp, timestamp, payment.id);
    const statements: D1PreparedStatement[] = [reversal];
    if (accessGrant && payment.planCode) {
      const duration = accessGrant.expiresAt - accessGrant.startsAt;
      statements.push(
        database
          .prepare(
            `UPDATE plan_access_grants
             SET starts_at = starts_at - ?, expires_at = expires_at - ?
             WHERE user_id = ? AND plan_code = ? AND starts_at >= ?
               AND source_payment_id != ? AND revoked_at IS NULL AND refunded_at IS NULL`,
          )
          .bind(
            duration,
            duration,
            payment.userId,
            payment.planCode,
            accessGrant.expiresAt,
            payment.id,
          ),
      );
    }
    statements.push(
      database
        .prepare(
          `UPDATE payments SET state = 'REFUNDED', updated_at = ?
           WHERE id = ? AND state = 'ENTITLEMENT_GRANTED'`,
        )
        .bind(timestamp, payment.id),
    );
    const results = await database.batch(statements);
    if (results[0]?.meta.changes !== 1 || results.at(-1)?.meta.changes !== 1) {
      throw new Error('PAYMENT_REFUND_TRANSACTION_INCOMPLETE');
    }
    return 'reversed';
  } catch (error) {
    const replay = await database
      .prepare('SELECT state FROM payments WHERE id = ?')
      .bind(payment.id)
      .first<{ state: string }>();
    if (replay?.state === 'REFUNDED') return 'duplicate';
    throw error;
  }
}

async function readPayment(
  database: D1Database,
  invoicePayload: string,
): Promise<PaymentRow | null> {
  return database
    .prepare(
      `SELECT p.id, p.user_id AS userId, u.telegram_id AS telegramId,
       p.currency, p.amount, p.state, p.invoice_payload AS invoicePayload,
       p.credit_amount_micros AS creditAmountMicros,
       p.access_pack_code AS accessPackCode, p.plan_code AS planCode,
       p.access_duration_days AS accessDurationDays,
       p.telegram_payment_charge_id AS telegramPaymentChargeId
       FROM payments p JOIN users u ON u.id = p.user_id
       WHERE p.invoice_payload = ?`,
    )
    .bind(invoicePayload)
    .first<PaymentRow>();
}

function hasExactlyOnePurchaseKind(payment: PaymentRow): boolean {
  const credits = payment.creditAmountMicros !== null && payment.accessPackCode === null;
  const access =
    payment.creditAmountMicros === null &&
    payment.accessPackCode !== null &&
    payment.planCode !== null &&
    payment.accessDurationDays !== null;
  return credits !== access;
}
