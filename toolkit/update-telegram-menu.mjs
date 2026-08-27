const token = process.env.TELEGRAM_BOT_TOKEN;
const expectedUsername = process.env.TELEGRAM_BOT_USERNAME ?? 'aivel0ra_bot';
const publicAppUrl = process.env.PUBLIC_APP_URL;
const cacheVersion = process.env.WEB_APP_CACHE_VERSION;
if (!token || !publicAppUrl || !cacheVersion) throw new Error('Telegram menu inputs are missing.');

const appUrl = new URL(publicAppUrl);
appUrl.searchParams.set('v', cacheVersion);
const call = async (method, body = {}) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    throw new Error(`Telegram operation ${method} failed; credentials were suppressed.`);
  }
  return payload.result;
};
const identity = await call('getMe');
if (identity.username?.toLowerCase() !== expectedUsername.toLowerCase()) {
  throw new Error('Stored token belongs to another Telegram bot.');
}
const menuForm = new URLSearchParams();
menuForm.set(
  'menu_button',
  JSON.stringify({ type: 'web_app', text: 'Открыть', web_app: { url: appUrl.href } }),
);
const menuResponse = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
  method: 'POST',
  body: menuForm,
});
const menuPayload = await menuResponse.json().catch(() => null);
if (!menuResponse.ok || menuPayload?.ok !== true) {
  throw new Error('Telegram operation setChatMenuButton failed; credentials were suppressed.');
}
const actual = await call('getChatMenuButton');
if (actual.type !== 'web_app' || actual.text !== 'Открыть' || actual.web_app?.url !== appUrl.href) {
  throw new Error(
    `Telegram menu verification failed: type=${String(actual.type)}, text=${JSON.stringify(actual.text)}, url=${String(actual.web_app?.url)}.`,
  );
}
process.stdout.write(`Telegram menu verified for @${expectedUsername}: ${appUrl.href}\n`);
