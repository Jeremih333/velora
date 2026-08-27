const apiKey = process.env.BOTHUB_API_KEY;
if (!apiKey) throw new Error('BOTHUB_API_KEY is required.');
const allowed = new Set(['deepseek-chat-v3-0324', 'deepseek-v4-pro']);
const models = process.argv.slice(2);
if (models.length === 0 || models.some((model) => !allowed.has(model))) {
  throw new Error('Pass only reviewed stream candidates.');
}

const results = [];
for (const model of models) {
  const attempts = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const startedAt = Date.now();
    const response = await fetch('https://openai.bothub.chat/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Ответь только словом: готово' }],
        max_tokens: 64,
        temperature: 0,
        stream: true,
      }),
    });
    const body = await response.text();
    let contentLength = 0;
    let usagePresent = false;
    let invalidChunks = 0;
    for (const line of body.split(/\r?\n/u)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '' || data === '[DONE]') continue;
      try {
        const chunk = JSON.parse(data);
        const content = chunk?.choices?.[0]?.delta?.content;
        if (typeof content === 'string') contentLength += content.length;
        if (chunk?.usage && typeof chunk.usage === 'object') usagePresent = true;
      } catch {
        invalidChunks += 1;
      }
    }
    attempts.push({
      attempt,
      ok: response.ok && contentLength > 0 && usagePresent && invalidChunks === 0,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      contentPresent: contentLength > 0,
      usagePresent,
      invalidChunks,
    });
  }
  results.push({ model, attempts });
}
process.stdout.write(
  `${JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)}\n`,
);
