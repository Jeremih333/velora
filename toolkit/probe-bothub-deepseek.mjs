const apiKey = process.env.BOTHUB_API_KEY;
if (!apiKey) throw new Error('BOTHUB_API_KEY is required.');

const endpoint = 'https://openai.bothub.chat/v1';
const defaultModels = [
  'deepseek-r1',
  'deepseek-chat-v3-0324',
  'deepseek-v4-pro',
  'deepseek-r1-0528',
];
const requested = process.argv.length > 2 ? process.argv.slice(2) : defaultModels;
if (requested.some((model) => !defaultModels.includes(model))) {
  throw new Error('Only the reviewed DeepSeek probe candidates are accepted.');
}
const catalogResponse = await fetch(`${endpoint}/models`, {
  headers: { authorization: `Bearer ${apiKey}` },
});
if (!catalogResponse.ok) throw new Error(`BotHub catalog HTTP ${catalogResponse.status}.`);
const catalogBody = await catalogResponse.json();
const catalogIds = new Set(
  Array.isArray(catalogBody?.data)
    ? catalogBody.data.flatMap((entry) => (typeof entry?.id === 'string' ? [entry.id] : []))
    : [],
);

const results = [];
for (const model of requested) {
  const attempts = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const startedAt = Date.now();
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Ответь только словом: готово' }],
        max_tokens: 96,
        temperature: 0,
        stream: false,
      }),
    });
    let body;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const message = body?.choices?.[0]?.message;
    const outputPresent = typeof message?.content === 'string' && message.content.trim() !== '';
    const reasoningPresent =
      typeof message?.reasoning_content === 'string' && message.reasoning_content.trim() !== '';
    attempts.push({
      attempt,
      ok: response.ok && outputPresent,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      errorCode: typeof body?.error?.code === 'string' ? body.error.code : null,
      errorType: typeof body?.error?.type === 'string' ? body.error.type : null,
      outputPresent,
      reasoningPresent,
      finishReason:
        typeof body?.choices?.[0]?.finish_reason === 'string'
          ? body.choices[0].finish_reason
          : null,
    });
  }
  results.push({ model, listedForKey: catalogIds.has(model), attempts });
}

process.stdout.write(
  `${JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)}\n`,
);
