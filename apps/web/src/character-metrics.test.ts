import { describe, expect, it } from 'vitest';
import { estimateTokens } from '@velora/prompts';
import {
  CHARACTER_PROMPT_TOKEN_BUDGET,
  calculateCharacterPromptMetrics,
  visibleTokenEstimate,
} from './character-metrics';

describe('character creator metrics', () => {
  it('uses the shared prompt estimator and displays an empty field as zero', () => {
    expect(visibleTokenEstimate('')).toBe(0);
    expect(visibleTokenEstimate('Привет, мир')).toBe(estimateTokens('Привет, мир'));
  });

  it('calculates one real aggregate budget from the prompt-bearing fields', () => {
    const metrics = calculateCharacterPromptMetrics({
      description: 'Описание мира',
      personality: 'Спокойная и внимательная героиня',
      firstMessage: 'Добро пожаловать.',
    });
    const aggregate = 'Описание мира\n\nСпокойная и внимательная героиня\n\nДобро пожаловать.';
    expect(metrics).toEqual({
      characters: aggregate.length,
      tokens: estimateTokens(aggregate),
      budget: CHARACTER_PROMPT_TOKEN_BUDGET,
      withinBudget: true,
    });
  });

  it('reports drafts that exceed the short-context publishing budget', () => {
    const metrics = calculateCharacterPromptMetrics({ description: 'а'.repeat(10_000) });
    expect(metrics.tokens).toBeGreaterThan(CHARACTER_PROMPT_TOKEN_BUDGET);
    expect(metrics.withinBudget).toBe(false);
  });
});
