import { request } from 'node:https';

const token = process.env.KATYA_CHARACTER_BOT_TOKEN?.trim();
if (!token) throw new Error('KATYA_CHARACTER_BOT_TOKEN is required.');

async function telegram(method, body = {}) {
  const serialized = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const call = request(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      family: 4,
      timeout: 30_000,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(serialized),
      },
    });
    call.on('response', (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode, payload: JSON.parse(Buffer.concat(chunks)) });
        } catch (error) {
          reject(error);
        }
      });
    });
    call.on('timeout', () => call.destroy(new Error('Telegram request timed out.')));
    call.on('error', reject);
    call.end(serialized);
  });
}

const [identity, commands, webhook, ownerChat] = await Promise.all([
  telegram('getMe'),
  telegram('getMyCommands'),
  telegram('getWebhookInfo'),
  telegram('getChat', { chat_id: 1040929628 }),
]);

if (!identity.payload.ok || identity.payload.result?.username !== 'katyaneyobot') {
  throw new Error('Telegram did not confirm @katyaneyobot.');
}
const commandNames = (commands.payload.result ?? []).map((entry) => entry.command);
const requiredCommands = ['start', 'help', 'info', 'memory', 'model', 'clear'];
const missingCommands = requiredCommands.filter((command) => !commandNames.includes(command));
if (!commands.payload.ok || missingCommands.length > 0) {
  throw new Error(`Katya commands are incomplete: ${missingCommands.join(', ')}`);
}
const expectedPath = '/telegram/character-bots/92ca981e-660d-4c4e-8c92-ed41de400dff';
if (!webhook.payload.ok || !webhook.payload.result?.url?.endsWith(expectedPath)) {
  throw new Error('Katya webhook URL is not configured.');
}

process.stdout.write(
  `${JSON.stringify({
    username: identity.payload.result.username,
    commands: commandNames,
    webhookConfigured: true,
    pendingUpdates: webhook.payload.result.pending_update_count ?? 0,
    lastWebhookError: webhook.payload.result.last_error_message ?? null,
    ownerChatAvailable: ownerChat.payload.ok === true,
  })}\n`,
);
