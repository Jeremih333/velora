import { writeFile } from 'node:fs/promises';

const apply = process.argv.includes('--apply');
const checkIdentity = process.argv.includes('--check-identity');
const outputFileIndex = process.argv.indexOf('--output-file');
const outputFile = outputFileIndex >= 0 ? process.argv[outputFileIndex + 1] : undefined;
if (outputFileIndex >= 0 && (!outputFile || outputFile.startsWith('--'))) {
  throw new Error('--output-file requires a path.');
}
if (apply && checkIdentity) {
  throw new Error('Choose either --apply or --check-identity.');
}
const apiEnvironment = process.env.TELEGRAM_API_ENVIRONMENT ?? 'production';
if (apiEnvironment !== 'production' && apiEnvironment !== 'test') {
  throw new Error('TELEGRAM_API_ENVIRONMENT must be production or test.');
}
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
const description =
  'Velora — пространство для AI roleplay: персонажи, personas, память, ветвление историй и полный контроль над контекстом.';
const shortDescription = 'AI roleplay с персонажами и живой памятью.';
const menuButton = { type: 'web_app', text: 'Открыть', web_app: { url: appUrl.href } };
const allowedUpdates = ['message', 'callback_query', 'pre_checkout_query'];

const operations = [
  ['setMyCommands', { commands }],
  ['setMyCommands', { commands, language_code: 'ru' }],
  ['setMyCommands', { commands: englishCommands, language_code: 'en' }],
  ['setChatMenuButton', { menu_button: menuButton }],
  ['setMyDescription', { description }],
  ['setMyShortDescription', { short_description: shortDescription }],
  [
    'setWebhook',
    {
      url: new URL('/telegram/webhook', appUrl).href,
      secret_token: webhookSecret,
      allowed_updates: allowedUpdates,
      drop_pending_updates: false,
    },
  ],
];

if (!apply && !checkIdentity) {
  console.log(
    JSON.stringify(
      {
        mode: 'dry-run',
        apiEnvironment,
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
  const environmentPath = apiEnvironment === 'test' ? '/test' : '';
  const url = `https://api.telegram.org/bot${token}${environmentPath}/${method}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (attempt < 3) {
        await retryDelay(attempt);
        continue;
      }
      const cause = error instanceof Error ? sanitizeTelegramDescription(error.message) : 'unknown';
      throw new Error(`Telegram operation ${method} failed after 3 network attempts (${cause}).`, {
        cause: error,
      });
    }
    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await retryDelay(attempt);
        continue;
      }
      throw new Error(`Telegram operation ${method} returned non-JSON HTTP ${response.status}.`);
    }
    if (response.ok && result && typeof result === 'object' && result.ok === true) {
      return result.result;
    }
    if (method === 'getMe' && response.status === 401) {
      throw new Error('Telegram rejected the bot token (HTTP 401).');
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const retryAfter =
        result &&
        typeof result === 'object' &&
        result.parameters &&
        typeof result.parameters === 'object' &&
        Number.isFinite(result.parameters.retry_after)
          ? Math.min(Math.max(Number(result.parameters.retry_after), 0), 5) * 1000
          : undefined;
      await retryDelay(attempt, retryAfter);
      continue;
    }
    const errorCode =
      result && typeof result === 'object' && Number.isInteger(result.error_code)
        ? result.error_code
        : response.status;
    const publicDescription =
      result && typeof result === 'object' && typeof result.description === 'string'
        ? sanitizeTelegramDescription(result.description)
        : 'no public description';
    throw new Error(
      `Telegram operation ${method} failed with HTTP ${response.status} ` +
        `(error ${errorCode}: ${publicDescription}).`,
    );
  }
  throw new Error(`Telegram operation ${method} exhausted its retry policy.`);
}

async function retryDelay(attempt, explicitDelay) {
  const baseDelay = process.env.VITEST ? 1 : 500;
  const delay = explicitDelay ?? baseDelay * attempt;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

const identity = await call('getMe');
if (
  !identity ||
  typeof identity !== 'object' ||
  typeof identity.username !== 'string' ||
  identity.username.toLowerCase() !== botUsername.toLowerCase()
) {
  const actualUsername =
    identity && typeof identity === 'object' && typeof identity.username === 'string'
      ? `@${identity.username}`
      : 'a bot without a public username';
  throw new Error(`The token belongs to ${actualUsername}, not @${botUsername}.`);
}
if (checkIdentity) {
  console.log(JSON.stringify({ identityVerified: true, apiEnvironment, botUsername }, null, 2));
  process.exit(0);
}
for (const [method, body] of operations) await call(method, body);
const webhook = await call('getWebhookInfo');
const menu = await call('getChatMenuButton');
const configuredCommands = await call('getMyCommands');
const configuredRussianCommands = await call('getMyCommands', { language_code: 'ru' });
const configuredEnglishCommands = await call('getMyCommands', { language_code: 'en' });
const configuredDescription = await call('getMyDescription');
const configuredShortDescription = await call('getMyShortDescription');
const webhookUrl =
  webhook && typeof webhook === 'object' && typeof webhook.url === 'string' ? webhook.url : null;
const webhookAllowedUpdates =
  webhook && typeof webhook === 'object' && Array.isArray(webhook.allowed_updates)
    ? webhook.allowed_updates
    : [];
const expectedWebhookUrl = new URL('/telegram/webhook', appUrl).href;
const verificationChecks = {
  webhookUrl: webhookUrl === expectedWebhookUrl,
  allowedUpdates: sameStrings(webhookAllowedUpdates, allowedUpdates),
  menuType: Boolean(menu && typeof menu === 'object' && menu.type === menuButton.type),
  menuText: Boolean(menu && typeof menu === 'object' && menu.text === menuButton.text),
  menuUrl: Boolean(
    menu &&
    typeof menu === 'object' &&
    menu.web_app &&
    typeof menu.web_app === 'object' &&
    menu.web_app.url === menuButton.web_app.url,
  ),
  commandsDefault: sameCommands(configuredCommands, commands),
  commandsRu: sameCommands(configuredRussianCommands, commands),
  commandsEn: sameCommands(configuredEnglishCommands, englishCommands),
  description: Boolean(
    configuredDescription &&
    typeof configuredDescription === 'object' &&
    configuredDescription.description === description,
  ),
  shortDescription: Boolean(
    configuredShortDescription &&
    typeof configuredShortDescription === 'object' &&
    configuredShortDescription.short_description === shortDescription,
  ),
};
const failedChecks = Object.entries(verificationChecks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const exactConfigurationVerified = failedChecks.length === 0;
if (!exactConfigurationVerified) {
  throw new Error(`Telegram configuration verification failed: ${failedChecks.join(', ')}.`);
}
const configurationResult = JSON.stringify(
  {
    configured: true,
    exactConfigurationVerified,
    apiEnvironment,
    botUsername,
    webhookUrl,
    menuType: menu && typeof menu === 'object' && typeof menu.type === 'string' ? menu.type : null,
    menuText: menu && typeof menu === 'object' && typeof menu.text === 'string' ? menu.text : null,
    menuUrl:
      menu &&
      typeof menu === 'object' &&
      menu.web_app &&
      typeof menu.web_app === 'object' &&
      typeof menu.web_app.url === 'string'
        ? menu.web_app.url
        : null,
    commandCount: Array.isArray(configuredCommands) ? configuredCommands.length : 0,
    russianCommandCount: Array.isArray(configuredRussianCommands)
      ? configuredRussianCommands.length
      : 0,
    englishCommandCount: Array.isArray(configuredEnglishCommands)
      ? configuredEnglishCommands.length
      : 0,
    allowedUpdates: webhookAllowedUpdates,
  },
  null,
  2,
);
if (outputFile) await writeFile(outputFile, configurationResult, { encoding: 'utf8', flag: 'wx' });
else console.log(configurationResult);

function sameCommands(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  return expected.every(
    (command, index) =>
      actual[index] &&
      typeof actual[index] === 'object' &&
      actual[index].command === command.command &&
      actual[index].description === command.description,
  );
}

function sameStrings(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  return [...left].sort().join('\n') === [...right].sort().join('\n');
}

function sanitizeTelegramDescription(value) {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 ? ' ' : character;
  })
    .join('')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 300);
}
