import { createHmac, randomUUID } from 'node:crypto';

const baseUrl = process.env.VELORA_EVAL_BASE_URL?.replace(/\/$/u, '');
const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!baseUrl || !botToken) {
  throw new Error('VELORA_EVAL_BASE_URL and TELEGRAM_BOT_TOKEN are required.');
}

const ownerTelegramId = 1_040_929_628;
const parameters = new URLSearchParams({
  auth_date: String(Math.floor(Date.now() / 1_000)),
  query_id: `owner-model-eval-${randomUUID()}`,
  user: JSON.stringify({
    id: ownerTelegramId,
    first_name: 'Owner',
    language_code: 'ru',
  }),
});
const checkString = [...parameters.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');
const telegramSecret = createHmac('sha256', 'WebAppData').update(botToken).digest();
parameters.set('hash', createHmac('sha256', telegramSecret).update(checkString).digest('hex'));

const authentication = await fetch(`${baseUrl}/api/v1/auth/telegram`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ initData: parameters.toString() }),
});
const authBody = await authentication.json();
const cookie = authentication.headers.get('set-cookie')?.split(';', 1)[0];
if (
  ![200, 201].includes(authentication.status) ||
  !cookie ||
  typeof authBody.csrfToken !== 'string'
) {
  throw new Error(`Owner authentication failed with HTTP ${String(authentication.status)}.`);
}

const requestedProfiles = process.argv.slice(2);
const profiles =
  requestedProfiles.length > 0
    ? requestedProfiles
    : ['velora-free-roleplay', 'velora-free-context'];
if (profiles.some((profile) => !/^velora-[a-z0-9-]+$/u.test(profile))) {
  throw new Error('Every model profile argument must be a valid Velora profile ID.');
}
const results = [];
for (const modelProfileId of profiles) {
  const response = await fetch(`${baseUrl}/api/v1/admin/operations/model-evals`, {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/json',
      'x-csrf-token': authBody.csrfToken,
    },
    body: JSON.stringify({
      modelProfileId,
      confirmation: 'ПОТРАТИТЬ 1 ЗАПРОС НА ПРОВЕРКУ МОДЕЛИ',
    }),
  });
  const body = await response.json();
  if (response.status !== 201 || body.run?.state !== 'COMPLETED') {
    throw new Error(`${modelProfileId} eval failed with HTTP ${String(response.status)}.`);
  }
  results.push({
    modelProfileId,
    state: body.run.state,
    model: body.run.model,
    inputTokens: body.run.inputTokens,
    outputTokens: body.run.outputTokens,
    conservativeCostMicros: body.run.conservativeCostMicros,
    alreadyAttempted: body.run.alreadyAttempted,
  });
}

process.stdout.write(`${JSON.stringify({ baseUrl, results }, null, 2)}\n`);
