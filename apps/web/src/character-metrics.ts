import { estimateTokens } from '@velora/prompts';

export const CHARACTER_PROMPT_TOKEN_BUDGET = 2_400;

export const CHARACTER_PROMPT_FIELDS = [
  'description',
  'personality',
  'scenario',
  'firstMessage',
  'speechStyle',
  'appearance',
  'background',
  'exampleDialogues',
  'creatorNotes',
  'goals',
  'behaviourRules',
  'systemInstructions',
  'postHistoryInstructions',
  'alternateGreetings',
] as const;

export interface CharacterPromptMetrics {
  readonly characters: number;
  readonly tokens: number;
  readonly budget: number;
  readonly withinBudget: boolean;
}

export function visibleTokenEstimate(value: string): number {
  return value.length === 0 ? 0 : estimateTokens(value);
}

export function calculateCharacterPromptMetrics(
  values: Readonly<
    Partial<Record<(typeof CHARACTER_PROMPT_FIELDS)[number], string | readonly string[]>>
  >,
): CharacterPromptMetrics {
  const prompt = CHARACTER_PROMPT_FIELDS.map((field) => {
    const value = values[field];
    if (typeof value === 'string') return value.trim();
    return value ? value.join('\n---\n').trim() : '';
  })
    .filter(Boolean)
    .join('\n\n');
  const characters = prompt.length;
  const tokens = visibleTokenEstimate(prompt);
  return {
    characters,
    tokens,
    budget: CHARACTER_PROMPT_TOKEN_BUDGET,
    withinBudget: tokens <= CHARACTER_PROMPT_TOKEN_BUDGET,
  };
}

export function characterPromptValuesFromForm(
  form: HTMLFormElement,
): Partial<Record<(typeof CHARACTER_PROMPT_FIELDS)[number], string>> {
  const data = new FormData(form);
  return Object.fromEntries(
    CHARACTER_PROMPT_FIELDS.map((field) => {
      const value = data.get(field);
      return [field, typeof value === 'string' ? value : ''];
    }),
  );
}
