import {
  accessPackInputSchema,
  accessPackPatchSchema,
  creditPackInputSchema,
  creditPackPatchSchema,
  planPatchSchema,
  starsAccessInvoiceInputSchema,
  starsInvoiceInputSchema,
} from '@velora/domain';
import { AppError, asError, createId, nowMs, ru } from '@velora/shared';
import { Hono } from 'hono';
import { createStarsInvoiceLink } from './telegram-payments';
import { readPlanEntitlements, type PlanEntitlements } from './plans';
import type { Env, Variables } from './types';

interface BillingEnvironment {
  Bindings: Env;
  Variables: Variables;
}

interface CreditPackRow {
  readonly code: string;
  readonly displayName: string;
  readonly description: string;
  readonly starsAmount: number;
  readonly creditAmountMicros: number;
  readonly active: number;
  readonly sortOrder: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface PaymentInvoiceRow {
  readonly id: string;
  readonly packCode: string | null;
  readonly accessPackCode: string | null;
  readonly planCode: string | null;
  readonly accessDurationDays: number | null;
  readonly amount: number;
  readonly creditAmountMicros: number | null;
  readonly state: string;
  readonly invoicePayload: string;
  readonly invoiceUrl: string | null;
  readonly createdAt: number;
}

interface AccessPackRow {
  readonly code: string;
  readonly displayName: string;
  readonly description: string;
  readonly starsAmount: number;
  readonly planCode: string;
  readonly durationDays: number;
  readonly active: number;
  readonly sortOrder: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface PlanRow {
  readonly id: string;
  readonly code: string;
  readonly displayName: string;
  readonly active: number;
  readonly rank: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const packProjection = `code, display_name AS displayName, description,
  stars_amount AS starsAmount, credit_amount_micros AS creditAmountMicros,
  active, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt`;
const accessPackProjection = `ap.code, ap.display_name AS displayName, ap.description,
  ap.stars_amount AS starsAmount, ap.plan_code AS planCode, ap.duration_days AS durationDays,
  ap.active, ap.sort_order AS sortOrder, ap.created_at AS createdAt, ap.updated_at AS updatedAt`;
const planProjection = `p.id, p.code, p.display_name AS displayName, p.active, p.rank,
  p.created_at AS createdAt, p.updated_at AS updatedAt`;

export const billingRoutes = new Hono<BillingEnvironment>();

billingRoutes.get('/billing/packs', async (context) => {
  const result = await context.env.DB.prepare(
    `SELECT ${packProjection} FROM credit_packs WHERE active = 1
     ORDER BY sort_order, stars_amount, code`,
  ).all<CreditPackRow>();
  return context.json({
    paymentsEnabled: context.env.PAYMENTS_ENABLED === 'true',
    recurringPayments: false,
    currency: 'XTR',
    items: result.results.map(toPackResponse),
  });
});

billingRoutes.get('/billing/access-packs', async (context) => {
  const result = await context.env.DB.prepare(
    `SELECT ${accessPackProjection} FROM access_packs ap WHERE ap.active = 1
     ORDER BY ap.sort_order, ap.stars_amount, ap.code`,
  ).all<AccessPackRow>();
  return context.json({
    paymentsEnabled: context.env.PAYMENTS_ENABLED === 'true',
    recurringPayments: false,
    currency: 'XTR',
    items: result.results.map(toAccessPackResponse),
  });
});

billingRoutes.get('/billing/plans', async (context) => {
  const rows = await context.env.DB.prepare(
    `SELECT ${planProjection} FROM plans p WHERE p.active = 1 ORDER BY p.rank, p.code`,
  ).all<PlanRow>();
  return context.json({
    items: await Promise.all(rows.results.map((row) => toPlanResponse(context.env.DB, row))),
  });
});

billingRoutes.get('/billing/payments', async (context) => {
  const principal = context.get('principal');
  const result = await context.env.DB.prepare(
    `SELECT id, pack_code AS packCode, access_pack_code AS accessPackCode,
     plan_code AS planCode, access_duration_days AS accessDurationDays, amount,
     credit_amount_micros AS creditAmountMicros, state,
     created_at AS createdAt, paid_at AS paidAt
     FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(principal.userId)
    .all();
  return context.json({ items: result.results });
});

billingRoutes.post('/billing/invoices', async (context) => {
  if (context.env.PAYMENTS_ENABLED !== 'true') {
    throw new AppError(
      'PAYMENTS_DISABLED',
      'Покупки ещё не включены владельцем. Реальные счета не создаются.',
      503,
    );
  }
  if (!context.env.TELEGRAM_BOT_TOKEN) {
    throw new AppError('SERVICE_NOT_CONFIGURED', 'Telegram-платежи пока не настроены.', 503);
  }
  const principal = context.get('principal');
  const input = starsInvoiceInputSchema.parse(await context.req.json());
  const pack = await context.env.DB.prepare(
    `SELECT ${packProjection} FROM credit_packs WHERE code = ? AND active = 1`,
  )
    .bind(input.packCode)
    .first<CreditPackRow>();
  if (!pack) throw new AppError('CREDIT_PACK_NOT_FOUND', 'Пакет кредитов недоступен.', 404);
  let payment = await findPaymentByClientKey(
    context.env.DB,
    principal.userId,
    input.idempotencyKey,
  );
  if (payment && payment.packCode !== pack.code) {
    throw new AppError(
      'IDEMPOTENCY_CONFLICT',
      'Этот ключ уже использован для другого пакета.',
      409,
    );
  }
  if (payment?.invoiceUrl && payment.state === 'INVOICE_SENT') {
    return context.json(toInvoiceResponse(payment));
  }
  if (payment && !['CREATED', 'FAILED'].includes(payment.state)) {
    throw new AppError('PAYMENT_ALREADY_PROCESSED', 'Этот счёт уже обрабатывается.', 409);
  }
  if (!payment) {
    const timestamp = nowMs();
    const paymentId = createId();
    const payload = `velora:${createId()}`;
    try {
      await context.env.DB.prepare(
        `INSERT INTO payments
         (id, user_id, amount, state, invoice_payload, created_at, updated_at,
          pack_code, credit_amount_micros, terms_accepted_at, client_idempotency_key)
         VALUES (?, ?, ?, 'CREATED', ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          paymentId,
          principal.userId,
          pack.starsAmount,
          payload,
          timestamp,
          timestamp,
          pack.code,
          pack.creditAmountMicros,
          timestamp,
          input.idempotencyKey,
        )
        .run();
    } catch (error) {
      if (!/UNIQUE|constraint/iu.test(asError(error).message)) throw error;
    }
    payment = await findPaymentByClientKey(context.env.DB, principal.userId, input.idempotencyKey);
    if (!payment) throw new Error('PAYMENT_CREATE_FAILED');
  }
  try {
    const invoiceUrl = await createStarsInvoiceLink((request, init) => fetch(request, init), {
      ...(context.env.ENVIRONMENT === 'local' && context.env.TELEGRAM_API_BASE_URL
        ? { apiBaseUrl: context.env.TELEGRAM_API_BASE_URL }
        : {}),
      botToken: context.env.TELEGRAM_BOT_TOKEN,
      title: pack.displayName,
      description: pack.description,
      payload: payment.invoicePayload,
      starsAmount: pack.starsAmount,
    });
    await context.env.DB.prepare(
      `UPDATE payments SET state = 'INVOICE_SENT', invoice_url = ?, updated_at = ?
       WHERE id = ? AND state IN ('CREATED', 'FAILED')`,
    )
      .bind(invoiceUrl, nowMs(), payment.id)
      .run();
    return context.json(toInvoiceResponse({ ...payment, invoiceUrl, state: 'INVOICE_SENT' }), 201);
  } catch (error) {
    await context.env.DB.prepare(
      `UPDATE payments SET state = 'FAILED', updated_at = ? WHERE id = ? AND state = 'CREATED'`,
    )
      .bind(nowMs(), payment.id)
      .run();
    throw error;
  }
});

billingRoutes.post('/billing/access-invoices', async (context) => {
  if (context.env.PAYMENTS_ENABLED !== 'true') {
    throw new AppError('PAYMENTS_DISABLED', ru.billing.paymentsDisabled, 503);
  }
  if (!context.env.TELEGRAM_BOT_TOKEN) {
    throw new AppError('SERVICE_NOT_CONFIGURED', ru.billing.telegramUnavailable, 503);
  }
  const principal = context.get('principal');
  const input = starsAccessInvoiceInputSchema.parse(await context.req.json());
  const pack = await context.env.DB.prepare(
    `SELECT ${accessPackProjection} FROM access_packs ap
     JOIN plans p ON p.code = ap.plan_code
     WHERE ap.code = ? AND ap.active = 1 AND p.active = 1`,
  )
    .bind(input.packCode)
    .first<AccessPackRow>();
  if (!pack) throw new AppError('ACCESS_PACK_NOT_FOUND', ru.billing.accessPackNotFound, 404);
  let payment = await findPaymentByClientKey(
    context.env.DB,
    principal.userId,
    input.idempotencyKey,
  );
  if (payment && payment.accessPackCode !== pack.code) {
    throw new AppError('IDEMPOTENCY_CONFLICT', ru.billing.idempotencyConflict, 409);
  }
  if (payment?.invoiceUrl && payment.state === 'INVOICE_SENT') {
    return context.json(toInvoiceResponse(payment));
  }
  if (payment && !['CREATED', 'FAILED'].includes(payment.state)) {
    throw new AppError('PAYMENT_ALREADY_PROCESSED', ru.billing.paymentAlreadyProcessed, 409);
  }
  if (!payment) {
    const timestamp = nowMs();
    const paymentId = createId();
    const payload = `velora:${createId()}`;
    try {
      await context.env.DB.prepare(
        `INSERT INTO payments
         (id, user_id, amount, state, invoice_payload, created_at, updated_at,
          access_pack_code, plan_code, access_duration_days, terms_accepted_at,
          client_idempotency_key)
         VALUES (?, ?, ?, 'CREATED', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          paymentId,
          principal.userId,
          pack.starsAmount,
          payload,
          timestamp,
          timestamp,
          pack.code,
          pack.planCode,
          pack.durationDays,
          timestamp,
          input.idempotencyKey,
        )
        .run();
    } catch (error) {
      if (!/UNIQUE|constraint/iu.test(asError(error).message)) throw error;
    }
    payment = await findPaymentByClientKey(context.env.DB, principal.userId, input.idempotencyKey);
    if (!payment) throw new Error('PAYMENT_CREATE_FAILED');
  }
  try {
    const invoiceUrl = await createStarsInvoiceLink((request, init) => fetch(request, init), {
      ...(context.env.ENVIRONMENT === 'local' && context.env.TELEGRAM_API_BASE_URL
        ? { apiBaseUrl: context.env.TELEGRAM_API_BASE_URL }
        : {}),
      botToken: context.env.TELEGRAM_BOT_TOKEN,
      title: pack.displayName,
      description: pack.description,
      payload: payment.invoicePayload,
      starsAmount: pack.starsAmount,
    });
    await context.env.DB.prepare(
      `UPDATE payments SET state = 'INVOICE_SENT', invoice_url = ?, updated_at = ?
       WHERE id = ? AND state IN ('CREATED', 'FAILED')`,
    )
      .bind(invoiceUrl, nowMs(), payment.id)
      .run();
    return context.json(toInvoiceResponse({ ...payment, invoiceUrl, state: 'INVOICE_SENT' }), 201);
  } catch (error) {
    await context.env.DB.prepare(
      `UPDATE payments SET state = 'FAILED', updated_at = ? WHERE id = ? AND state = 'CREATED'`,
    )
      .bind(nowMs(), payment.id)
      .run();
    throw error;
  }
});

billingRoutes.use('/admin/billing/*', async (context, next) => {
  if (context.get('principal').role !== 'OWNER') {
    throw new AppError('FORBIDDEN', 'Настройка цен доступна только владельцу.', 403);
  }
  await next();
});

billingRoutes.get('/admin/billing/packs', async (context) => {
  const result = await context.env.DB.prepare(
    `SELECT ${packProjection} FROM credit_packs ORDER BY sort_order, stars_amount, code`,
  ).all<CreditPackRow>();
  return context.json({ items: result.results.map(toPackResponse) });
});

billingRoutes.post('/admin/billing/packs', async (context) => {
  const input = creditPackInputSchema.parse(await context.req.json());
  const timestamp = nowMs();
  try {
    await context.env.DB.prepare(
      `INSERT INTO credit_packs
       (code, display_name, description, stars_amount, credit_amount_micros,
        active, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        input.code,
        input.displayName,
        input.description,
        input.starsAmount,
        input.creditAmountMicros,
        input.active ? 1 : 0,
        input.sortOrder,
        timestamp,
        timestamp,
      )
      .run();
  } catch (error) {
    if (/UNIQUE|constraint/iu.test(asError(error).message)) {
      throw new AppError('CREDIT_PACK_EXISTS', 'Код пакета уже используется.', 409);
    }
    throw error;
  }
  const pack = await requirePack(context.env.DB, input.code);
  return context.json(toPackResponse(pack), 201);
});

billingRoutes.patch('/admin/billing/packs/:code', async (context) => {
  const current = await requirePack(context.env.DB, context.req.param('code'));
  const input = creditPackPatchSchema.parse(await context.req.json());
  await context.env.DB.prepare(
    `UPDATE credit_packs SET display_name = ?, description = ?, stars_amount = ?,
     credit_amount_micros = ?, active = ?, sort_order = ?, updated_at = ? WHERE code = ?`,
  )
    .bind(
      input.displayName ?? current.displayName,
      input.description ?? current.description,
      input.starsAmount ?? current.starsAmount,
      input.creditAmountMicros ?? current.creditAmountMicros,
      input.active === undefined ? current.active : input.active ? 1 : 0,
      input.sortOrder ?? current.sortOrder,
      nowMs(),
      current.code,
    )
    .run();
  return context.json(toPackResponse(await requirePack(context.env.DB, current.code)));
});

billingRoutes.get('/admin/billing/access-packs', async (context) => {
  const rows = await context.env.DB.prepare(
    `SELECT ${accessPackProjection} FROM access_packs ap
     ORDER BY ap.sort_order, ap.stars_amount, ap.code`,
  ).all<AccessPackRow>();
  return context.json({ items: rows.results.map(toAccessPackResponse) });
});

billingRoutes.post('/admin/billing/access-packs', async (context) => {
  const principal = context.get('principal');
  const input = accessPackInputSchema.parse(await context.req.json());
  await requirePlan(context.env.DB, input.planCode);
  const timestamp = nowMs();
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO access_packs
           (code, display_name, description, stars_amount, plan_code, duration_days,
            active, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        input.code,
        input.displayName,
        input.description,
        input.starsAmount,
        input.planCode,
        input.durationDays,
        input.active ? 1 : 0,
        input.sortOrder,
        timestamp,
        timestamp,
      ),
      billingAuditStatement(context.env.DB, {
        actorId: principal.userId,
        action: 'ACCESS_PACK_CREATED',
        targetId: input.code,
        requestId: context.get('requestId'),
        timestamp,
      }),
    ]);
  } catch (error) {
    if (/UNIQUE|constraint/iu.test(asError(error).message)) {
      throw new AppError('ACCESS_PACK_EXISTS', ru.billing.accessPackExists, 409);
    }
    throw error;
  }
  return context.json(
    toAccessPackResponse(await requireAccessPack(context.env.DB, input.code)),
    201,
  );
});

billingRoutes.patch('/admin/billing/access-packs/:code', async (context) => {
  const principal = context.get('principal');
  const current = await requireAccessPack(context.env.DB, context.req.param('code'));
  const input = accessPackPatchSchema.parse(await context.req.json());
  const planCode = input.planCode ?? current.planCode;
  await requirePlan(context.env.DB, planCode);
  const timestamp = nowMs();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE access_packs SET display_name = ?, description = ?, stars_amount = ?,
         plan_code = ?, duration_days = ?, active = ?, sort_order = ?, updated_at = ?
         WHERE code = ?`,
    ).bind(
      input.displayName ?? current.displayName,
      input.description ?? current.description,
      input.starsAmount ?? current.starsAmount,
      planCode,
      input.durationDays ?? current.durationDays,
      input.active === undefined ? current.active : input.active ? 1 : 0,
      input.sortOrder ?? current.sortOrder,
      timestamp,
      current.code,
    ),
    billingAuditStatement(context.env.DB, {
      actorId: principal.userId,
      action: 'ACCESS_PACK_UPDATED',
      targetId: current.code,
      requestId: context.get('requestId'),
      timestamp,
    }),
  ]);
  return context.json(toAccessPackResponse(await requireAccessPack(context.env.DB, current.code)));
});

billingRoutes.get('/admin/billing/plans', async (context) => {
  const rows = await context.env.DB.prepare(
    `SELECT ${planProjection} FROM plans p ORDER BY p.rank, p.code`,
  ).all<PlanRow>();
  return context.json({
    items: await Promise.all(rows.results.map((row) => toPlanResponse(context.env.DB, row))),
  });
});

billingRoutes.patch('/admin/billing/plans/:code', async (context) => {
  const principal = context.get('principal');
  const current = await requirePlan(context.env.DB, context.req.param('code'));
  const input = planPatchSchema.parse(await context.req.json());
  if (current.code === 'FREE' && input.active === false) {
    throw new AppError('FREE_PLAN_REQUIRED', ru.billing.freePlanRequired, 409);
  }
  const timestamp = nowMs();
  const statements: D1PreparedStatement[] = [
    context.env.DB.prepare(
      `UPDATE plans SET display_name = ?, active = ?, rank = ?, updated_at = ? WHERE code = ?`,
    ).bind(
      input.displayName ?? current.displayName,
      input.active === undefined ? current.active : input.active ? 1 : 0,
      input.rank ?? current.rank,
      timestamp,
      current.code,
    ),
  ];
  if (input.entitlements) {
    for (const [entitlement, value] of entitlementEntries(input.entitlements)) {
      statements.push(
        context.env.DB.prepare(
          `INSERT INTO plan_entitlements (plan_id, entitlement, value_json)
             VALUES (?, ?, ?) ON CONFLICT(plan_id, entitlement)
             DO UPDATE SET value_json = excluded.value_json`,
        ).bind(current.id, entitlement, JSON.stringify(value)),
      );
    }
  }
  statements.push(
    billingAuditStatement(context.env.DB, {
      actorId: principal.userId,
      action: 'PLAN_CONFIGURATION_UPDATED',
      targetId: current.code,
      requestId: context.get('requestId'),
      timestamp,
    }),
  );
  await context.env.DB.batch(statements);
  return context.json(
    await toPlanResponse(context.env.DB, await requirePlan(context.env.DB, current.code)),
  );
});

async function requirePack(database: D1Database, code: string): Promise<CreditPackRow> {
  const pack = await database
    .prepare(`SELECT ${packProjection} FROM credit_packs WHERE code = ?`)
    .bind(code)
    .first<CreditPackRow>();
  if (!pack) throw new AppError('CREDIT_PACK_NOT_FOUND', 'Пакет кредитов не найден.', 404);
  return pack;
}

async function requireAccessPack(database: D1Database, code: string): Promise<AccessPackRow> {
  const pack = await database
    .prepare(`SELECT ${accessPackProjection} FROM access_packs ap WHERE ap.code = ?`)
    .bind(code)
    .first<AccessPackRow>();
  if (!pack) throw new AppError('ACCESS_PACK_NOT_FOUND', ru.billing.accessPackNotFound, 404);
  return pack;
}

async function requirePlan(database: D1Database, code: string): Promise<PlanRow> {
  const plan = await database
    .prepare(`SELECT ${planProjection} FROM plans p WHERE p.code = ?`)
    .bind(code)
    .first<PlanRow>();
  if (!plan) throw new AppError('PLAN_NOT_FOUND', ru.billing.planUnavailable, 404);
  return plan;
}

async function findPaymentByClientKey(
  database: D1Database,
  userId: string,
  clientKey: string,
): Promise<PaymentInvoiceRow | null> {
  return database
    .prepare(
      `SELECT id, pack_code AS packCode, access_pack_code AS accessPackCode,
       plan_code AS planCode, access_duration_days AS accessDurationDays, amount,
       credit_amount_micros AS creditAmountMicros, state,
       invoice_payload AS invoicePayload, invoice_url AS invoiceUrl,
       created_at AS createdAt FROM payments
       WHERE user_id = ? AND client_idempotency_key = ?`,
    )
    .bind(userId, clientKey)
    .first<PaymentInvoiceRow>();
}

function toPackResponse(row: CreditPackRow) {
  return { ...row, active: row.active === 1 };
}

function toAccessPackResponse(row: AccessPackRow) {
  return { ...row, active: row.active === 1, recurring: false };
}

async function toPlanResponse(database: D1Database, row: PlanRow) {
  return {
    ...row,
    active: row.active === 1,
    entitlements: await readPlanEntitlements(database, row.id),
  };
}

function toInvoiceResponse(payment: PaymentInvoiceRow) {
  return {
    id: payment.id,
    kind: payment.accessPackCode ? 'PLAN_ACCESS' : 'CREDITS',
    packCode: payment.accessPackCode ?? payment.packCode,
    starsAmount: payment.amount,
    creditAmountMicros: payment.creditAmountMicros,
    planCode: payment.planCode,
    accessDurationDays: payment.accessDurationDays,
    state: payment.state,
    invoiceUrl: payment.invoiceUrl,
    recurring: false,
    createdAt: payment.createdAt,
  };
}

function entitlementEntries(
  entitlements: PlanEntitlements,
): readonly (readonly [string, unknown])[] {
  return [
    ['rate_limit_multiplier', entitlements.rateLimitMultiplier],
    ['character_limit', entitlements.characterLimit],
    ['persona_limit', entitlements.personaLimit],
    ['memory_token_budget', entitlements.memoryTokenBudget],
    ['lore_token_budget', entitlements.loreTokenBudget],
    ['advanced_operations_daily', entitlements.advancedOperationsDaily],
    ['model_profiles', entitlements.modelProfiles],
  ];
}

function billingAuditStatement(
  database: D1Database,
  input: {
    readonly actorId: string;
    readonly action: string;
    readonly targetId: string;
    readonly requestId: string;
    readonly timestamp: number;
  },
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO audit_logs
       (id, actor_id, action, target_type, target_id, request_id, metadata_json, created_at)
       VALUES (?, ?, ?, 'BILLING_CONFIGURATION', ?, ?, '{}', ?)`,
    )
    .bind(
      createId(),
      input.actorId,
      input.action,
      input.targetId,
      input.requestId,
      input.timestamp,
    );
}
