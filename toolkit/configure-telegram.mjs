const apply = process.argv.includes('--apply');
const required = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_BOT_USERNAME',
  'PUBLIC_APP_URL',
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(', ')}`);

const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const botUsername = process.env.TELEGRAM_BOT_USERNAME;
const appUrl = new URL(process.env.PUBLIC_APP_URL);
if (appUrl.protocol !== 'https:') throw new Error('PUBLIC_APP_URL must use HTTPS.');
if (!/^[A-Za-z0-9_]{5,32}$/u.test(botUsername)) throw new Error('Invalid Telegram bot username.');
if (webhookSecret.length < 16 || webhookSecret.length > 256) {
  throw new Error('TELEGRAM_WEBHOOK_SECRET must contain 16–256 characters.');
}

const commands = [
  { command: 'start', description: 'Начать работу с Velora' },
  { command: 'app', description: 'Открыть приложение' },
  { command: 'help', description: 'Помощь' },
  { command: 'settings', description: 'Настройки' },
  { command: 'support', description: 'Связаться с поддержкой' },
  { command: 'premium', description: 'Разовые пополнения' },
  { command: 'report', description: 'Сообщить о нарушении' },
  { command: 'paysupport', description: 'Поддержка по платежам' },
  { command: 'terms', description: 'Условия использования' },
  { command: 'privacy', description: 'Конфиденциальность' },
];
const englishCommands = [
  { command: 'start', description: 'Start using Velora' },
  { command: 'app', description: 'Open the app' },
  { command: 'help', description: 'Help' },
  { command: 'settings', description: 'Settings' },
  { command: 'support', description: 'Contact support' },
  { command: 'premium', description: 'One-time top-ups' },
  { command: 'report', description: 'Report a violation' },
  { command: 'paysupport', description: 'Payment support' },
  { command: 'terms', description: 'Terms of use' },
  { command: 'privacy', description: 'Privacy policy' },
];

const operations = [
  ['setMyCommands', { commands }],
  ['setMyCommands', { commands, language_code: 'ru' }],
  ['setMyCommands', { commands: englishCommands, language_code: 'en' }],
  [
    'setChatMenuButton',
    { menu_button: { type: 'web_app', text: 'Открыть', web_app: { url: appUrl.href } } },
  ],
  [
    'setMyDescription',
    {
      description:
        'Velora — пространство для AI roleplay: персонажи, personas, память, ветвление историй и полный контроль над контекстом.',
    },
  ],
  ['setMyShortDescription', { short_description: 'AI roleplay с персонажами и живой памятью.' }],
  [
    'setWebhook',
    {
      url: new URL('/telegram/webhook', appUrl).href,
      secret_token: webhookSecret,
      allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
      drop_pending_updates: false,
    },
  ],
];

if (!apply) {
  console.log(
    JSON.stringify(
      {
        mode: 'dry-run',
        botUsername,
        appOrigin: appUrl.origin,
        operations: operations.map(([method]) => method),
        note: 'Re-run with --apply to mutate Bot API settings.',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

async function call(method, body = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result || typeof result !== 'object' || result.ok !== true) {
    throw new Error(`Telegram operation ${method} failed.`);
  }
  return result.result;
}

const identity = await call('getMe');
if (!identity || typeof identity !== 'object' || identity.username !== botUsername) {
  throw new Error('The token owner does not match TELEGRAM_BOT_USERNAME.');
}
for (const [method, body] of operations) await call(method, body);
const webhook = await call('getWebhookInfo');
const menu = await call('getChatMenuButton');
const configuredCommands = await call('getMyCommands');
console.log(
  JSON.stringify(
    {
      configured: true,
      botUsername,
      webhookUrl:
        webhook && typeof webhook === 'object' && typeof webhook.url === 'string'
          ? webhook.url
          : null,
      menuType:
        menu && typeof menu === 'object' && typeof menu.type === 'string' ? menu.type : null,
      commandCount: Array.isArray(configuredCommands) ? configuredCommands.length : 0,
    },
    null,
    2,
  ),
);
