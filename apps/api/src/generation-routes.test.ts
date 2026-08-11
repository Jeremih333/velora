import { describe, expect, it } from 'vitest';
import { estimateMaximumCostMicros, resolveGenerationCandidates } from './generation-routes';

describe('generation fallback policy', () => {
  it('keeps a unique, bounded and explicitly priced fallback order', () => {
    const candidates = resolveGenerationCandidates(
      {
        provider: 'BOTHUB',
        model: 'primary',
        fallbackModelsJson: JSON.stringify([
          {
            provider: 'BOTHUB',
            model: 'primary',
            maxInputUsdPerMillion: 9,
            maxOutputUsdPerMillion: 9,
            fixedRequestUsd: 0.09,
          },
          {
            provider: 'BOTHUB',
            model: 'fallback',
            maxInputUsdPerMillion: 0.5,
            maxOutputUsdPerMillion: 1.5,
            fixedRequestUsd: 0.02,
          },
        ]),
      },
      { maxInputUsdPerMillion: 1, maxOutputUsdPerMillion: 2, fixedRequestUsd: 0.03 },
    );

    expect(candidates).toEqual([
      {
        provider: 'BOTHUB',
        model: 'primary',
        price: { inputPerMillionUsd: 1, outputPerMillionUsd: 2, fixedRequestUsd: 0.03 },
      },
      {
        provider: 'BOTHUB',
        model: 'fallback',
        price: { inputPerMillionUsd: 0.5, outputPerMillionUsd: 1.5, fixedRequestUsd: 0.02 },
      },
    ]);
  });

  it('rejects an unbounded fallback list and reserves the most expensive candidate', () => {
    const fallback = {
      provider: 'BOTHUB',
      model: 'fallback',
      maxInputUsdPerMillion: 0.5,
      maxOutputUsdPerMillion: 1.5,
      fixedRequestUsd: 0.02,
    } as const;
    expect(() =>
      resolveGenerationCandidates(
        {
          provider: 'BOTHUB',
          model: 'primary',
          fallbackModelsJson: JSON.stringify([
            fallback,
            { ...fallback, model: 'fallback-2' },
            { ...fallback, model: 'fallback-3' },
          ]),
        },
        { maxInputUsdPerMillion: 1, maxOutputUsdPerMillion: 2, fixedRequestUsd: 0.03 },
      ),
    ).toThrow();
    expect(
      estimateMaximumCostMicros(
        { inputPerMillionUsd: 0.65, outputPerMillionUsd: 1.95, fixedRequestUsd: 0.02 },
        8_000,
        600,
      ),
    ).toBe(26_370);
  });
});
