import { describe, expect, it } from 'vitest';
import { activateLore, buildRoleplayPrompt } from './index';
import { roleplayQualityScenarios } from './quality-scenarios';

describe.each(roleplayQualityScenarios)('roleplay quality scenario $id — $title', (scenario) => {
  it('assembles the complete bounded prompt without unrelated context', () => {
    const activation = scenario.loreCase
      ? activateLore({
          entries: scenario.loreCase.candidates,
          contextMessages: scenario.loreCase.contextMessages,
          totalTokenBudget: scenario.loreCase.totalTokenBudget,
          variables: {
            char: scenario.input.character.name,
            user: scenario.input.persona?.name ?? 'User',
          },
        })
      : null;
    if (scenario.loreCase && activation) {
      expect(activation.entries.map((entry) => entry.id)).toEqual(
        scenario.loreCase.expectedActiveIds,
      );
    }
    const prompt = buildRoleplayPrompt({
      ...scenario.input,
      lore:
        activation?.entries.map((entry) => ({
          id: entry.id,
          title: entry.title,
          content: entry.content,
        })) ?? scenario.input.lore,
    });
    const rendered = prompt.messages.map((message) => message.content).join('\n');
    for (const marker of scenario.expectation.requiredMarkers) {
      expect(rendered, `required marker for scenario ${scenario.id}`).toContain(marker);
    }
    for (const marker of scenario.expectation.forbiddenMarkers) {
      expect(rendered, `forbidden marker for scenario ${scenario.id}`).not.toContain(marker);
    }
    expect(prompt.droppedHistoryMessages).toBeGreaterThanOrEqual(
      scenario.expectation.minimumDroppedHistory,
    );
    expect(prompt.estimatedInputTokens + scenario.input.outputTokens).toBeLessThanOrEqual(
      scenario.input.maxContextTokens,
    );
    expect(prompt.inspection.tokenEstimates.totalInput).toBe(prompt.estimatedInputTokens);
    expect(prompt.unknownTemplateVariables).toEqual([]);
  });
});
