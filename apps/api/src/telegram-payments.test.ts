import { describe, expect, it, vi } from 'vitest';
import { answerStarsPreCheckout, createStarsInvoiceLink } from './telegram-payments';

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

  it('answers rejected pre-checkout explicitly', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, result: true }), { status: 200 }));
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
});
