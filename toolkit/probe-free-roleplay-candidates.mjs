const apiKey = process.env.BOTHUB_API_KEY;
if (!apiKey) throw new Error('BOTHUB_API_KEY is required.');

const endpoint = 'https://openai.bothub.chat/v1';
const candidates = ['mistral-nemo', 'l3-lunaris-8b', 'ling-3.0-flash', 'mythomax-l2-13b'];
const scenarios = [
  {
    id: 'voice-and-action',
    messages: [
      {
        role: 'system',
        content:
          'Ты Алиса, дерзкая рыжая гитаристка. Отвечай по-русски от первого лица персонажа. Дай 2–3 абзаца, обязательно добавь естественное действие между одинарными звёздочками и продвинь сцену вперёд. Не объясняй правила.',
      },
      {
        role: 'user',
        content: 'Я опоздал к костру и протянул тебе сломанную струну. Что ты сделаешь?',
      },
    ],
  },
  {
    id: 'character-trigger',
    messages: [
      {
        role: 'system',
        content:
          'Ты Алиса Двачевская, вспыльчивая, живая и ироничная гитаристка. Обращение «ДваЧе» тебя явно злит. Отвечай по-русски в роли, с репликой, эмоцией, действием между одинарными звёздочками и новым сюжетным крючком. 2–3 абзаца.',
      },
      { role: 'user', content: 'Эй, ДваЧе, сыграешь нам что-нибудь?' },
    ],
  },
];

const catalogResponse = await fetchWithRetry(`${endpoint}/models`, {
  headers: { authorization: `Bearer ${apiKey}` },
});
if (!catalogResponse.ok) throw new Error(`BotHub catalog HTTP ${catalogResponse.status}.`);
const catalog = await catalogResponse.json();
const listed = new Set(
  Array.isArray(catalog?.data)
    ? catalog.data.flatMap((entry) => (typeof entry?.id === 'string' ? [entry.id] : []))
    : [],
);

const results = [];
for (const model of candidates) {
  const scenariosResult = [];
  for (const scenario of scenarios) {
    const startedAt = Date.now();
    const response = await fetchWithRetry(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: scenario.messages,
        max_tokens: 320,
        temperature: 0.75,
        stream: false,
      }),
    });
    const body = await response.json().catch(() => null);
    const content =
      typeof body?.choices?.[0]?.message?.content === 'string'
        ? body.choices[0].message.content.trim()
        : '';
    scenariosResult.push({
      id: scenario.id,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      finishReason:
        typeof body?.choices?.[0]?.finish_reason === 'string'
          ? body.choices[0].finish_reason
          : null,
      promptTokens: numberOrNull(body?.usage?.prompt_tokens),
      completionTokens: numberOrNull(body?.usage?.completion_tokens),
      hasAction: /\*[^*\n]{2,}\*/u.test(content),
      paragraphCount: content === '' ? 0 : content.split(/\n\s*\n/u).filter(Boolean).length,
      characterCount: content.length,
      excerpt: content.slice(0, 280),
    });
  }
  results.push({ model, listedForKey: listed.has(model), scenarios: scenariosResult });
}

process.stdout.write(
  `${JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)}\n`,
);

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function fetchWithRetry(url, init, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
      if (response.status < 500 || attempt === attempts) return response;
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw lastError ?? new Error('BotHub request failed.');
}
