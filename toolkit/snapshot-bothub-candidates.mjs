const publicCatalogUrl = 'https://bothub.ru/models';
const apiCatalogUrl = 'https://openai.bothub.chat/v1/models';
const candidates = [
  'mistral-nemo',
  'l3-lunaris-8b',
  'ling-3.0-flash',
  'nex-n2-mini',
  'gemini-2.5-flash-lite',
  'mythomax-l2-13b',
];

const publicResponse = await fetch(publicCatalogUrl);
if (!publicResponse.ok) throw new Error(`BotHub public catalog HTTP ${publicResponse.status}.`);
const html = await publicResponse.text();

let keyScopedIds = null;
if (process.env.BOTHUB_API_KEY) {
  const privateResponse = await fetch(apiCatalogUrl, {
    headers: { authorization: `Bearer ${process.env.BOTHUB_API_KEY}` },
  });
  if (!privateResponse.ok) {
    throw new Error(`BotHub key-scoped catalog HTTP ${privateResponse.status}.`);
  }
  const body = await privateResponse.json();
  keyScopedIds = new Set(
    Array.isArray(body?.data)
      ? body.data.flatMap((item) => (typeof item?.id === 'string' ? [item.id] : []))
      : [],
  );
}

const result = candidates.map((id) => {
  const start = html.indexOf(`href="/${id}"`);
  const end = start < 0 ? -1 : html.indexOf('</article></a>', start);
  const text = start < 0 || end < 0 ? '' : visibleText(html.slice(start, end));
  const input = priceAfter(text, 'Ввод (за 1M токенов)');
  const output = priceAfter(text, 'Вывод (за 1M токенов)');
  const context = integerAfter(text, 'Контекст');
  const maximumOutput = integerAfter(text, 'Макс. вывод');
  if (start >= 0 && [input, output, context, maximumOutput].some((value) => value === null)) {
    throw new Error(`BotHub card parser could not read all fields for ${id}.`);
  }
  return {
    id,
    publicListed: start >= 0,
    keyScopedListed: keyScopedIds?.has(id) ?? null,
    context,
    maximumOutput,
    inputRubPerMillion: input,
    outputRubPerMillion: output,
  };
});

process.stdout.write(
  `${JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      publicCatalogUrl,
      keyScopedCount: keyScopedIds?.size ?? null,
      candidates: result,
    },
    null,
    2,
  )}\n`,
);

function visibleText(value) {
  return value
    .replaceAll(/<[^>]+>/gu, ' ')
    .replaceAll(/&nbsp;|&#160;|\u00a0/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}

function priceAfter(value, label) {
  const labelIndex = value.indexOf(label);
  if (labelIndex < 0) return null;
  const suffix = value.slice(labelIndex + label.length);
  const match = suffix.match(/([\d\s]+(?:,\d+)?)\s*₽/u);
  return match?.[1] ? Number(match[1].replaceAll(' ', '').replace(',', '.')) : null;
}

function integerAfter(value, label) {
  const labelIndex = value.indexOf(label);
  if (labelIndex < 0) return null;
  const suffix = value.slice(labelIndex + label.length);
  const match = suffix.match(/([\d\s]+)/u);
  return match?.[1] ? Number(match[1].replaceAll(' ', '')) : null;
}
