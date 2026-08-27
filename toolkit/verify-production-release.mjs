import { createHmac, randomUUID } from 'node:crypto';

const baseUrl = 'https://velora-app.carreljeremih.workers.dev';
const mainToken = process.env.TELEGRAM_BOT_TOKEN;
const aliceToken = process.env.ALICE_CHARACTER_BOT_TOKEN;
if (!mainToken || !aliceToken) throw new Error('Telegram tokens are required.');

const ownerTelegramId = 1_040_929_628;
const parameters = new URLSearchParams({
  auth_date: String(Math.floor(Date.now() / 1_000)),
  query_id: `release-${randomUUID()}`,
  user: JSON.stringify({ id: ownerTelegramId, first_name: 'Owner', language_code: 'ru' }),
});
const checkString = [...parameters.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');
const telegramSecret = createHmac('sha256', 'WebAppData').update(mainToken).digest();
parameters.set('hash', createHmac('sha256', telegramSecret).update(checkString).digest('hex'));
const authentication = await fetch(`${baseUrl}/api/v1/auth/telegram`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ initData: parameters.toString() }),
});
const cookie = authentication.headers.get('set-cookie')?.split(';', 1)[0];
if (![200, 201].includes(authentication.status) || !cookie) {
  throw new Error(`Production authentication HTTP ${authentication.status}.`);
}
const catalogResponse = await fetch(`${baseUrl}/api/v1/conversations/models/catalog`, {
  headers: { cookie },
});
const catalog = await catalogResponse.json();
const expected = ['velora-free-context', 'velora-free-roleplay', 'velora-deepseek-v3-0324'];
const verifiedModels = expected.map((id) => {
  const model = catalog?.items?.find((item) => item?.id === id);
  return {
    id,
    present: Boolean(model),
    available: model?.available === true,
    tier: model?.tier ?? null,
  };
});
if (
  catalogResponse.status !== 200 ||
  verifiedModels.some((model) => !model.present || !model.available)
) {
  throw new Error(
    `Production model catalog did not expose every verified DeepSeek model: ${JSON.stringify(verifiedModels)}.`,
  );
}

const webhookResults = [];
for (const [name, token] of [
  ['main', mainToken],
  ['alice', aliceToken],
]) {
  const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const body = await response.json();
  if (!response.ok || body?.ok !== true) throw new Error(`${name} webhook inspection failed.`);
  webhookResults.push({
    name,
    urlMatchesProduction: body.result?.url?.startsWith(`${baseUrl}/telegram/`) === true,
    pendingUpdateCount: body.result?.pending_update_count ?? null,
    lastErrorPresent: typeof body.result?.last_error_message === 'string',
  });
}
if (webhookResults.some((item) => !item.urlMatchesProduction || item.lastErrorPresent)) {
  throw new Error('A Telegram webhook is not healthy on production.');
}
process.stdout.write(`${JSON.stringify({ verifiedModels, webhookResults }, null, 2)}\n`);
