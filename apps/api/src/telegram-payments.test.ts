import { describe, expect, it, vi } from 'vitest';
import {
  answerStarsPreCheckout,
  createStarsInvoiceLink,
  requestStarsRefund,
} from './telegram-payments';

describe('Telegram Stars transport', () => {
  it('creates only a one-time XTR invoice and omits provider/subscription fields', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: 'https://t.me/$invoice-fixture' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(
      createStarsInvoiceLink(fetcher, {
        apiBaseUrl: 'https://api.telegram.test',
        botToken: 'token',
        title: 'Пакет',
        description: 'Разовые AI-кредиты',
        payload: 'opaque',
        starsAmount: 50,
      }),
    ).resolves.toBe('https://t.me/$invoice-fixture');
    const rawBody = fetcher.mock.calls[0]?.[1]?.body;
    if (typeof rawBody !== 'string') throw new Error('Invoice request body is missing.');
    const body = JSON.parse(rawBody) as Readonly<Record<string, unknown>>;
    expect(body['currency']).toBe('XTR');
    expect(body['provider_token']).toBeUndefined();
    expect(body['subscription_period']).toBeUndefined();
  });

  it('routes a one-time XTR invoice through Telegram Test Server without changing its body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: 'https://t.me/$test-invoice' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await createStarsInvoiceLink(fetcher, {
      apiEnvironment: 'test',
      botToken: 'test-token',
      title: 'Test Plus',
      description: 'One-time test access',
      payload: 'test-payload',
      starsAmount: 1,
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api.telegram.org/bottest-token/test/createInvoiceLink',
    );
    const rawBody = fetcher.mock.calls[0]?.[1]?.body;
    if (typeof rawBody !== 'string') throw new Error('Test invoice request body is missing.');
    expect(JSON.parse(rawBody)).toMatchObject({
      currency: 'XTR',
      prices: [{ label: 'Test Plus', amount: 1 }],
    });
  });

  it('answers rejected pre-checkout explicitly', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })),
      );
    await answerStarsPreCheckout(fetcher, {
      botToken: 'token',
      queryId: 'query',
      ok: false,
      errorMessage: 'Счёт недействителен.',
    });
    const rawBody = fetcher.mock.calls[0]?.[1]?.body;
    if (typeof rawBody !== 'string') throw new Error('Pre-checkout request body is missing.');
    expect(JSON.parse(rawBody)).toMatchObject({
      pre_checkout_query_id: 'query',
      ok: false,
      error_message: 'Счёт недействителен.',
    });
  });

  it('routes pre-checkout and refund through the same Telegram test segment', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })),
      );
    await answerStarsPreCheckout(fetcher, {
      apiEnvironment: 'test',
      botToken: 'test-token',
      queryId: 'test-query',
      ok: true,
    });
    await requestStarsRefund(fetcher, {
      apiEnvironment: 'test',
      botToken: 'test-token',
      userTelegramId: '42',
      telegramPaymentChargeId: 'test-charge',
    });
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      'https://api.telegram.org/bottest-token/test/answerPreCheckoutQuery',
      'https://api.telegram.org/bottest-token/test/refundStarPayment',
    ]);
  });

  it('submits an exact Stars refund without exposing the token in the body', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, result: true }), { status: 200 }));
    await expect(
      requestStarsRefund(fetcher, {
        apiBaseUrl: 'https://api.telegram.test',
        botToken: 'secret-token',
        userTelegramId: '1040929628',
        telegramPaymentChargeId: 'charge-1',
      }),
    ).resolves.toBe('submitted');
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api.telegram.test/botsecret-token/refundStarPayment',
    );
    const rawBody = fetcher.mock.calls[0]?.[1]?.body;
    if (typeof rawBody !== 'string') throw new Error('Refund request body is missing.');
    expect(JSON.parse(rawBody)).toEqual({
      user_id: 1040929628,
      telegram_payment_charge_id: 'charge-1',
    });
    expect(rawBody).not.toContain('secret-token');
  });

  it('classifies Telegram already-refunded response as a safe reconciliation', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: false, description: 'Bad Request: CHARGE_ALREADY_REFUNDED' }),
          { status: 400 },
        ),
      );
    await expect(
      requestStarsRefund(fetcher, {
        botToken: 'secret-token',
        userTelegramId: '1',
        telegramPaymentChargeId: 'charge-1',
      }),
    ).resolves.toBe('already_refunded');
  });
});
