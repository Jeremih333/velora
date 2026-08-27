import { createHmac, randomUUID } from 'node:crypto';

const baseUrl = process.env.VELORA_EVAL_BASE_URL?.replace(/\/$/u, '');
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const modelProfileId = process.argv[2];
if (!baseUrl || !botToken || !modelProfileId || !/^velora-[a-z0-9-]+$/u.test(modelProfileId)) {
  throw new Error('VELORA_EVAL_BASE_URL, TELEGRAM_BOT_TOKEN and one profile ID are required.');
}

const parameters = new URLSearchParams({
  auth_date: String(Math.floor(Date.now() / 1_000)),
  query_id: `owner-rp-benchmark-${randomUUID()}`,
  user: JSON.stringify({ id: 1_040_929_628, first_name: 'Owner', language_code: 'ru' }),
});
const checkString = [...parameters.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');
const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
parameters.set('hash', createHmac('sha256', secret).update(checkString).digest('hex'));

const authentication = await fetch(`${baseUrl}/api/v1/auth/telegram`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ initData: parameters.toString() }),
});
const authBody = await authentication.json();
const cookie = authentication.headers.get('set-cookie')?.split(';', 1)[0];
if (!cookie || typeof authBody.csrfToken !== 'string') {
  throw new Error(`Owner authentication failed with HTTP ${String(authentication.status)}.`);
}

const response = await fetch(`${baseUrl}/api/v1/admin/operations/model-benchmarks`, {
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': authBody.csrfToken },
  body: JSON.stringify({
    modelProfileId,
    confirmation: 'ПОТРАТИТЬ 7 ЗАПРОСОВ НА RP-БЕНЧМАРК',
  }),
});
const body = await response.json();
if (![200, 201].includes(response.status) || body.run?.state !== 'AWAITING_REVIEW') {
  throw new Error(`Benchmark failed with HTTP ${String(response.status)}.`);
}
process.stdout.write(
  `${JSON.stringify(
    {
      modelProfileId,
      state: body.run.state,
      completedScenarioCount: body.run.completedScenarioCount,
      scenarioCount: body.run.scenarioCount,
      inputTokens: body.run.inputTokens,
      outputTokens: body.run.outputTokens,
      conservativeCostMicros: body.run.conservativeCostMicros,
      samples: Array.isArray(body.run.samples)
        ? body.run.samples.map((sample) => ({
            scenarioId: sample.scenarioId,
            outputLength: sample.outputLength,
            latencyMs: sample.latencyMs,
          }))
        : [],
    },
    null,
    2,
  )}\n`,
);
