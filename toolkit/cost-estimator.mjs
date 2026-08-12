const models = {
  balanced: { input: 24.75, output: 93.11, hardOutputTokens: 800 },
  creative: { input: 35.36, output: 294.64, hardOutputTokens: 1000 },
  premium: { input: 117.86, output: 589.29, hardOutputTokens: 1200 },
};
const attemptChains = {
  balanced: ['balanced', 'balanced'],
  creative: ['creative', 'creative', 'balanced'],
  premium: ['premium', 'premium', 'creative', 'balanced'],
};

const repliesPerDay = Number(process.argv[2] ?? 300);
const inputTokens = Number(process.argv[3] ?? 8000);
const outputTokens = Number(process.argv[4] ?? 600);
const safetyMargin = 1.15;
const hardContextTokens = 32_000;
const elitePackRub = 5_500;
const elitePackCaps = 35_000_000;
// BotHub documents the LLM API request surcharge in USD, while model-token prices are in RUB.
// The exchange-rate assumption must therefore be explicit and conservative.
const requestFeeUsd = 0.01;
const usdRub = Number(process.argv[5] ?? 120);
const requestFeeRub = requestFeeUsd * usdRub;
if (
  ![repliesPerDay, inputTokens, outputTokens, usdRub].every(
    (value) => Number.isFinite(value) && value >= 0,
  )
) {
  throw new Error(
    'Usage: node toolkit/cost-estimator.mjs [replies/day] [input tokens] [output tokens] [USD/RUB]',
  );
}

console.log(
  `Assumptions: ${requestFeeUsd.toFixed(2)} USD/request at ${usdRub.toFixed(2)} RUB/USD = ` +
    `${requestFeeRub.toFixed(2)} RUB/request; Elite ${elitePackCaps.toLocaleString('en-US')} CAPS / ` +
    `${elitePackRub} RUB; prices and FX are not guaranteed.`,
);

for (const [name, price] of Object.entries(models)) {
  const expectedPerReply =
    requestFeeRub + (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  const expectedAnnual = expectedPerReply * repliesPerDay * 365;
  const guardedExpectedAnnual = expectedAnnual * safetyMargin;
  const expectedElitePacks = Math.ceil(guardedExpectedAnnual / elitePackRub);
  const maximumInputTokens = hardContextTokens - price.hardOutputTokens;
  const ceilingPerReply =
    requestFeeRub +
    (maximumInputTokens * price.input + price.hardOutputTokens * price.output) / 1_000_000;
  const guardedAnnual = ceilingPerReply * repliesPerDay * 365 * safetyMargin;
  const elitePacks = Math.ceil(guardedAnnual / elitePackRub);
  console.log(
    `${name}: expected ${expectedPerReply.toFixed(3)} RUB/reply and ${expectedAnnual.toFixed(0)} RUB/year; ` +
      `expected with 15% reserve ${guardedExpectedAnnual.toFixed(0)} RUB, ` +
      `${expectedElitePacks} Elite pack(s) = ${expectedElitePacks * elitePackRub} RUB; ` +
      `guarded ceiling ${ceilingPerReply.toFixed(3)} RUB/reply, ${guardedAnnual.toFixed(0)} RUB/year, ` +
      `${elitePacks} Elite pack(s) = ${elitePacks * elitePackRub} RUB`,
  );
}

for (const [name, chain] of Object.entries(attemptChains)) {
  const chainCeilingPerReply = chain.reduce((total, modelName) => {
    const price = models[modelName];
    const maximumInputTokens = hardContextTokens - price.hardOutputTokens;
    return (
      total +
      requestFeeRub +
      (maximumInputTokens * price.input + price.hardOutputTokens * price.output) / 1_000_000
    );
  }, 0);
  const guardedAnnual = chainCeilingPerReply * repliesPerDay * 365 * safetyMargin;
  const elitePacks = Math.ceil(guardedAnnual / elitePackRub);
  console.log(
    `${name} retry/fallback chain: ceiling ${chainCeilingPerReply.toFixed(3)} RUB/reply, ` +
      `${guardedAnnual.toFixed(0)} RUB/year, ${elitePacks} Elite pack(s) = ${elitePacks * elitePackRub} RUB`,
  );
}
