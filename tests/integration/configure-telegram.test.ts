import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const productionUrl = 'https://velora-app.carreljeremih.workers.dev/';
const commands = [
  ['start', 'Начать работу с Velora'],
  ['app', 'Открыть приложение'],
  ['help', 'Помощь'],
  ['settings', 'Настройки'],
  ['support', 'Связаться с поддержкой'],
  ['premium', 'Разовые пополнения'],
  ['report', 'Сообщить о нарушении'],
  ['paysupport', 'Поддержка по платежам'],
  ['terms', 'Условия использования'],
  ['privacy', 'Конфиденциальность'],
].map(([command, description]) => ({ command, description }));
const englishCommands = [
  ['start', 'Start using Velora'],
  ['app', 'Open the app'],
  ['help', 'Help'],
  ['settings', 'Settings'],
  ['support', 'Contact support'],
  ['premium', 'One-time top-ups'],
  ['report', 'Report a violation'],
  ['paysupport', 'Payment support'],
  ['terms', 'Terms of use'],
  ['privacy', 'Privacy policy'],
].map(([command, description]) => ({ command, description }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Telegram production configurator', () => {
  it('applies and verifies the exact UTF-8 production configuration', async () => {
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value: unknown) => output.push(String(value)));
    installEnvironment();
    const methods: string[] = [];
    vi.stubGlobal('fetch', createTelegramFetch(methods));
    process.argv.push('--apply');
    try {
      vi.resetModules();
      await import('../../toolkit/configure-telegram.mjs');
    } finally {
      process.argv.splice(process.argv.lastIndexOf('--apply'), 1);
    }

    const result = JSON.parse(output.at(-1) ?? '{}') as Record<string, unknown>;
    expect(result).toMatchObject({
      configured: true,
      exactConfigurationVerified: true,
      botUsername: 'aivel0ra_bot',
      webhookUrl: `${productionUrl}telegram/webhook`,
      menuType: 'web_app',
      menuText: 'Открыть',
      menuUrl: productionUrl,
      commandCount: 10,
      russianCommandCount: 10,
      englishCommandCount: 10,
      allowedUpdates: ['pre_checkout_query', 'message', 'callback_query'],
    });
    expect(methods).toEqual([
      'getMe',
      'setMyCommands',
      'setMyCommands',
      'setMyCommands',
      'setChatMenuButton',
      'setMyDescription',
      'setMyShortDescription',
      'setWebhook',
      'getWebhookInfo',
      'getChatMenuButton',
      'getMyCommands',
      'getMyCommands',
      'getMyCommands',
      'getMyDescription',
      'getMyShortDescription',
    ]);
  });

  it('writes the verified result directly as UTF-8 for PowerShell cutover', async () => {
    installEnvironment();
    vi.stubGlobal('fetch', createTelegramFetch([]));
    const directory = await mkdtemp(join(tmpdir(), 'velora-telegram-config-'));
    const outputFile = join(directory, 'result.json');
    process.argv.push('--apply', '--output-file', outputFile);
    try {
      vi.resetModules();
      await import('../../toolkit/configure-telegram.mjs');
      const result = JSON.parse(await readFile(outputFile, 'utf8')) as Record<string, unknown>;
      expect(result).toMatchObject({
        configured: true,
        exactConfigurationVerified: true,
        menuText: 'Открыть',
        russianCommandCount: 10,
      });
    } finally {
      process.argv.splice(process.argv.lastIndexOf('--apply'), 3);
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('fails closed when Telegram reports a different menu target', async () => {
    installEnvironment();
    vi.stubGlobal('fetch', createTelegramFetch([], true));
    process.argv.push('--apply');
    try {
      vi.resetModules();
      await expect(import('../../toolkit/configure-telegram.mjs')).rejects.toThrow(
        'Telegram configuration verification failed: menuUrl.',
      );
    } finally {
      process.argv.splice(process.argv.lastIndexOf('--apply'), 1);
    }
  });

  it('distinguishes a rejected token from a token owned by another bot', async () => {
    installEnvironment();
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{"ok":false}', { status: 401 })));
    process.argv.push('--check-identity');
    try {
      vi.resetModules();
      await expect(import('../../toolkit/configure-telegram.mjs')).rejects.toThrow(
        'Telegram rejected the bot token (HTTP 401).',
      );
    } finally {
      process.argv.splice(process.argv.lastIndexOf('--check-identity'), 1);
    }

    installEnvironment();
    vi.stubGlobal('fetch', async () =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, result: { username: 'another_bot' } }), {
          status: 200,
        }),
      ),
    );
    process.argv.push('--check-identity');
    try {
      vi.resetModules();
      await expect(import('../../toolkit/configure-telegram.mjs')).rejects.toThrow(
        'The token belongs to @another_bot, not @aivel0ra_bot.',
      );
    } finally {
      process.argv.splice(process.argv.lastIndexOf('--check-identity'), 1);
    }
  });

  it('reports a safe Telegram operation diagnostic without exposing request data', async () => {
    installEnvironment();
    vi.stubGlobal('fetch', createTelegramFetch([], false, 'setWebhook'));
    process.argv.push('--apply');
    try {
      vi.resetModules();
      await expect(import('../../toolkit/configure-telegram.mjs')).rejects.toThrow(
        'Telegram operation setWebhook failed with HTTP 400 (error 400: Bad Request: bad webhook).',
      );
    } finally {
      process.argv.splice(process.argv.lastIndexOf('--apply'), 1);
    }
  });

  it('retries transient Telegram failures without retrying permanent 4xx responses', async () => {
    installEnvironment();
    const methods: string[] = [];
    let transientFailures = 0;
    const successfulFetch = createTelegramFetch(methods);
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      const method = url.pathname.split('/').at(-1) ?? '';
      if (method === 'setWebhook' && transientFailures < 2) {
        transientFailures += 1;
        methods.push(method);
        return new Response(
          JSON.stringify({ ok: false, error_code: 503, description: 'Service unavailable' }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        );
      }
      return successfulFetch(input, init);
    });
    process.argv.push('--apply');
    try {
      vi.resetModules();
      await import('../../toolkit/configure-telegram.mjs');
    } finally {
      process.argv.splice(process.argv.lastIndexOf('--apply'), 1);
    }
    expect(methods.filter((method) => method === 'setWebhook')).toHaveLength(3);
  });

  it('reports a bounded safe diagnostic after repeated network failures', async () => {
    installEnvironment();
    vi.stubGlobal('fetch', async () => {
      await Promise.resolve();
      throw new Error('socket temporarily unavailable\nsecret-like-noise');
    });
    process.argv.push('--check-identity');
    try {
      vi.resetModules();
      await expect(import('../../toolkit/configure-telegram.mjs')).rejects.toThrow(
        'Telegram operation getMe failed after 3 network attempts (socket temporarily unavailable secret-like-noise).',
      );
    } finally {
      process.argv.splice(process.argv.lastIndexOf('--check-identity'), 1);
    }
  });
});

function installEnvironment(): void {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', ['123456789', 'abcdefghijklmnopqrstuvwxyzABCDEFGH'].join(':'));
  vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', 'abcdefghijklmnopqrstuvwxyz_0123456789-ABCDE');
  vi.stubEnv('TELEGRAM_BOT_USERNAME', 'aivel0ra_bot');
  vi.stubEnv('TELEGRAM_API_ENVIRONMENT', 'production');
  vi.stubEnv('PUBLIC_APP_URL', productionUrl);
}

function createTelegramFetch(
  methods: string[],
  wrongMenu = false,
  rejectedMethod?: string,
): typeof fetch {
  return async (input: string | URL | Request, init?: RequestInit) => {
    await Promise.resolve();
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = url.pathname.split('/').at(-1) ?? '';
    methods.push(method);
    if (method === rejectedMethod) {
      return new Response(
        JSON.stringify({ ok: false, error_code: 400, description: 'Bad Request:\nbad webhook' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }
    const bodyText = typeof init?.body === 'string' ? init.body : '{}';
    const body = JSON.parse(bodyText) as { language_code?: string };
    let result: unknown = true;
    if (method === 'getMe') result = { username: 'aivel0ra_bot' };
    if (method === 'getWebhookInfo') {
      result = {
        url: `${productionUrl}telegram/webhook`,
        // Telegram does not guarantee that set-like values preserve request order.
        allowed_updates: ['pre_checkout_query', 'message', 'callback_query'],
      };
    }
    if (method === 'getChatMenuButton') {
      result = {
        type: 'web_app',
        text: 'Открыть',
        web_app: { url: wrongMenu ? 'https://wrong.example/' : productionUrl },
      };
    }
    if (method === 'getMyCommands') {
      result = body.language_code === 'en' ? englishCommands : commands;
    }
    if (method === 'getMyDescription') {
      result = {
        description:
          'Velora — пространство для AI roleplay: персонажи, personas, память, ветвление историй и полный контроль над контекстом.',
      };
    }
    if (method === 'getMyShortDescription') {
      result = { short_description: 'AI roleplay с персонажами и живой памятью.' };
    }
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
}
