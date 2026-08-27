import { describe, expect, it, vi } from 'vitest';
import {
  commandMessage,
  parseBotCommand,
  parseProductionSmokeMarker,
  parseTelegramUpdate,
  secretsEqual,
  sendTelegramCommandReply,
} from './telegram-webhook';
import { normalizeTelegramLocale } from './telegram-user';

describe('Telegram webhook protocol', () => {
  it('parses addressed commands without accepting commands for another bot', () => {
    expect(parseBotCommand('/start payload', '@Velora_Bot')).toBe('start');
    expect(parseBotCommand('/HELP@velora_bot', 'velora_bot')).toBe('help');
    expect(parseBotCommand('/start@another_bot', 'velora_bot')).toBeNull();
    expect(parseBotCommand('hello', 'velora_bot')).toBeNull();
    for (const command of [
      'start',
      'help',
      'app',
      'support',
      'settings',
      'terms',
      'privacy',
      'premium',
      'report',
      'paysupport',
    ]) {
      expect(commandMessage(command), command).not.toBeNull();
    }
    expect(commandMessage('unknown')).toBeNull();
    expect(commandMessage('start', 'en')).toContain('Welcome to Velora');
  });

  it('accepts only bounded production smoke markers', () => {
    const marker = `velora_smoke_${'a'.repeat(32)}`;
    expect(parseProductionSmokeMarker(`/start ${marker}`)).toBe(marker);
    expect(parseProductionSmokeMarker(`/start@aivel0ra_bot ${marker}`)).toBe(marker);
    expect(parseProductionSmokeMarker('/start ordinary-referral')).toBeNull();
    expect(parseProductionSmokeMarker(`/help ${marker}`)).toBeNull();
    expect(parseProductionSmokeMarker(`/start velora_smoke_${'a'.repeat(31)}`)).toBeNull();
  });

  it('normalizes Telegram language variants for new users', () => {
    expect(normalizeTelegramLocale('en')).toBe('en');
    expect(normalizeTelegramLocale('en-US')).toBe('en');
    expect(normalizeTelegramLocale('EN_us')).toBe('en');
    expect(normalizeTelegramLocale('ru')).toBe('ru');
    expect(normalizeTelegramLocale(undefined)).toBe('ru');
  });

  it('validates the minimal private-message update and rejects malformed ids', () => {
    expect(
      parseTelegramUpdate({
        update_id: 1,
        message: {
          message_id: 2,
          from: { id: 42, first_name: 'Лея' },
          chat: { id: 42, type: 'private' },
          text: '/start',
        },
      }),
    ).toMatchObject({ update_id: 1 });
    expect(() => parseTelegramUpdate({ update_id: -1 })).toThrow();
  });

  it('compares webhook secrets without direct string comparison', async () => {
    await expect(secretsEqual('secret', 'secret')).resolves.toBe(true);
    await expect(secretsEqual('forged', 'secret')).resolves.toBe(false);
    await expect(secretsEqual(undefined, 'secret')).resolves.toBe(false);
  });

  it('sends one Mini App command response and rejects Telegram failures', async () => {
    const okFetch = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await expect(
      sendTelegramCommandReply(
        okFetch,
        'token',
        42,
        commandMessage('start') ?? '',
        'https://app.test',
      ),
    ).resolves.toBeUndefined();
    const body = okFetch.mock.calls[0]?.[1]?.body;
    if (typeof body !== 'string') throw new Error('Expected a JSON request body.');
    const request = JSON.parse(body) as {
      reply_markup: { inline_keyboard: readonly (readonly { web_app: { url: string } }[])[] };
    };
    expect(request.reply_markup.inline_keyboard[0]?.[0]?.web_app.url).toBe('https://app.test');

    await sendTelegramCommandReply(
      okFetch,
      'token',
      43,
      commandMessage('start', 'en') ?? '',
      'https://app.test',
      'https://api.telegram.org',
      'en',
    );
    const englishBody = okFetch.mock.calls[1]?.[1]?.body;
    if (typeof englishBody !== 'string') throw new Error('Expected an English JSON request body.');
    const englishRequest = JSON.parse(englishBody) as {
      reply_markup: { inline_keyboard: readonly (readonly { text: string }[])[] };
    };
    expect(englishRequest.reply_markup.inline_keyboard[0]?.[0]?.text).toBe('Open VeloraAI');

    const failedFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 400 }));
    await expect(
      sendTelegramCommandReply(failedFetch, 'token', 42, 'hello', 'https://app.test'),
    ).rejects.toMatchObject({ code: 'TELEGRAM_DELIVERY_FAILED' });
  });

  it('sends test-server replies only through the explicit test segment', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await sendTelegramCommandReply(
      fetcher,
      'test-token',
      42,
      'test',
      'https://app.test',
      'https://api.telegram.org',
      'ru',
      'test',
    );
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api.telegram.org/bottest-token/test/sendMessage',
    );
  });
});
