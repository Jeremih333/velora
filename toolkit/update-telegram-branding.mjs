import { readFile } from 'node:fs/promises';

const token = process.env.TELEGRAM_BOT_TOKEN;
const expectedUsername = process.env.TELEGRAM_BOT_USERNAME ?? 'aivel0ra_bot';
const avatarPath = process.env.TELEGRAM_AVATAR_PATH;

if (!token || !avatarPath) throw new Error('Telegram branding inputs are missing.');

const call = async (method, body, multipart = false) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    ...(multipart
      ? { body }
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    throw new Error(`Telegram operation ${method} failed; credentials were suppressed.`);
  }
  return payload.result;
};

const identity = await call('getMe', {});
if (identity.username?.toLowerCase() !== expectedUsername.toLowerCase()) {
  throw new Error('Stored token belongs to another Telegram bot.');
}

for (const language_code of ['', 'ru', 'en']) {
  await call('setMyName', { name: 'VeloraAI', language_code });
}

const descriptions = [
  ['', 'VeloraAI — создавай персонажей и истории с памятью прямо внутри Telegram.'],
  ['ru', 'VeloraAI — создавай персонажей и истории с памятью прямо внутри Telegram.'],
  ['en', 'VeloraAI — create characters and stories with memory inside Telegram.'],
];
for (const [language_code, description] of descriptions) {
  await call('setMyDescription', { description, language_code });
}

const avatar = await readFile(avatarPath);
const form = new FormData();
form.set('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }));
form.set('avatar', new Blob([avatar], { type: 'image/jpeg' }), 'veloraai-avatar.jpg');
await call('setMyProfilePhoto', form, true);

const verified = await call('getMyName', {});
if (verified.name !== 'VeloraAI') throw new Error('Telegram bot name verification failed.');
process.stdout.write(`Telegram branding verified for @${expectedUsername}.\n`);
