import { describe, expect, it } from 'vitest';
import {
  calculateInputContextBudget,
  estimateMaximumCostMicros,
  planDailyRequestLimit,
  resolveGenerationCandidates,
  selectContextualGroupSpeaker,
} from './generation-routes';

describe('generation fallback policy', () => {
  it('keeps a unique, bounded and explicitly priced fallback order', () => {
    const candidates = resolveGenerationCandidates(
      {
        provider: 'BOTHUB',
        model: 'primary',
        contextWindow: 128_000,
        fallbackModelsJson: JSON.stringify([
          {
            provider: 'BOTHUB',
            model: 'primary',
            maxInputUsdPerMillion: 9,
            maxOutputUsdPerMillion: 9,
            fixedRequestUsd: 0.09,
            contextWindow: 128_000,
          },
          {
            provider: 'BOTHUB',
            model: 'fallback',
            maxInputUsdPerMillion: 0.5,
            maxOutputUsdPerMillion: 1.5,
            fixedRequestUsd: 0.02,
            contextWindow: 8_192,
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
        contextWindow: 128_000,
      },
      {
        provider: 'BOTHUB',
        model: 'fallback',
        price: { inputPerMillionUsd: 0.5, outputPerMillionUsd: 1.5, fixedRequestUsd: 0.02 },
        contextWindow: 8_192,
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
          contextWindow: 128_000,
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

  it('rebudgets the prompt for a smaller fallback context window', () => {
    expect(calculateInputContextBudget(128_000, 800)).toBe(32_000);
    expect(calculateInputContextBudget(8_192, 800)).toBe(7_392);
  });

  it('applies server-owned fair-use limits without exposing credits', () => {
    expect(planDailyRequestLimit('FREE')).toBe(30);
    expect(planDailyRequestLimit('PLUS')).toBe(150);
    expect(planDailyRequestLimit('PRO')).toBe(500);
  });
});

describe('character group routing', () => {
  const members = [
    {
      characterId: 'alice',
      characterVersionId: 'alice-v1',
      name: 'Алиса',
      tagline: 'Смелая разведчица',
      description: 'Исследует лес и древние руины',
      position: 0,
    },
    {
      characterId: 'boris',
      characterVersionId: 'boris-v1',
      name: 'Борис',
      tagline: 'Спокойный врач',
      description: 'Лечит раны и готовит лекарства',
      position: 1,
    },
  ] as const;

  it('prefers an explicitly addressed character', () => {
    expect(
      selectContextualGroupSpeaker('Алиса, что находится в руинах?', members)?.characterId,
    ).toBe('alice');
  });

  it('uses description keywords and leaves ambiguous messages unresolved', () => {
    expect(selectContextualGroupSpeaker('Кто сможет лечить мои раны?', members)?.characterId).toBe(
      'boris',
    );
    expect(selectContextualGroupSpeaker('Продолжайте', members)).toBeNull();
  });
});
