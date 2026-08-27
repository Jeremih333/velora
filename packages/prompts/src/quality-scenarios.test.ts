import { describe, expect, it } from 'vitest';
import { activateLore, buildRoleplayPrompt, renderResolvedTemplate } from './index';
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

describe('final roleplay acceptance — Алекс and Мира', () => {
  it('exposes the exact persona, rendered character, both memory facts, lore, style and branch', () => {
    const variables = { char: 'Мира', user: 'Алекс' } as const;
    const greeting = renderResolvedTemplate(
      '{{char}} встречает {{user}} у закрытой двери обсерватории.',
      variables,
    );
    expect(greeting).toEqual({
      value: 'Мира встречает Алекс у закрытой двери обсерватории.',
      unknownVariables: [],
    });

    const lore = activateLore({
      entries: [
        {
          id: 'acceptance-lore',
          title: 'Северная башня',
          content: '{{char}} знает: серебряный колокол открывает тайную лестницу для {{user}}.',
          keys: ['серебряный колокол'],
          secondaryKeys: [],
          enabled: true,
          priority: 100,
          position: 0,
          caseSensitive: false,
          matchWholeWord: true,
          scanDepth: 20,
          tokenBudget: 200,
        },
      ],
      contextMessages: ['Алекс касается предмета: серебряный колокол.'],
      totalTokenBudget: 500,
      variables,
    });
    expect(lore.entries.map((entry) => entry.id)).toEqual(['acceptance-lore']);

    const prompt = buildRoleplayPrompt({
      character: {
        name: 'Мира',
        description: 'Хранительница северной обсерватории.',
        personality: '{{char}} терпелива, внимательна и никогда не решает за {{user}}.',
        scenario: '{{user}} пришёл в башню во время метеоритного дождя.',
        speechStyle: 'Тихая кинематографичная проза в настоящем времени.',
        appearance: 'Тёмный плащ и ключ на серебряной цепочке.',
        background: 'Семь лет охраняет башню.',
        goals: 'Показать {{user}} правду о созвездиях.',
        behaviourRules: 'Не выходить из роли {{char}}.',
        systemInstructions: 'Сохранять агентность {{user}}.',
        postHistoryInstructions: 'Оставлять ясное пространство для следующего действия {{user}}.',
        exampleDialogues: '{{user}}: Ты ждала меня?\n{{char}}: Дольше, чем показывают часы.',
      },
      persona: {
        name: 'Алекс',
        shortDescription: 'Картограф звёздных маршрутов.',
        longDescription: 'Алекс ищет исчезнувшее созвездие.',
        personality: 'Наблюдательный и осторожный.',
        appearance: 'Дорожный плащ и латунный секстант.',
        speakingStyle: 'Короткие прямые вопросы.',
        background: 'Пришёл из прибрежного города.',
        pronouns: 'он/его',
        representedAge: '28',
        customNotes: 'Мира не определяет мысли и действия Алекса.',
      },
      memory:
        'MANUAL_FACT: Алекс боится высоты.\nAUTO_FACT: ранее Мира передала Алексу карту северного неба.',
      lore: lore.entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        content: entry.content,
      })),
      customInstructions:
        'STYLE_INSTRUCTION: пиши от третьего лица, атмосферно и без метакомментариев.',
      history: [
        { role: 'ASSISTANT', content: greeting.value },
        { role: 'USER', content: 'SELECTED_BRANCH: Алекс поднимает серебряный колокол.' },
      ],
      maxContextTokens: 8_192,
      outputTokens: 600,
    });

    expect(prompt.inspection.character.name).toBe('Мира');
    expect(prompt.inspection.character.personality).toContain('Мира терпелива');
    expect(prompt.inspection.character.personality).toContain('Алекс');
    expect(prompt.inspection.persona?.name).toBe('Алекс');
    expect(prompt.inspection.memory).toContain('MANUAL_FACT');
    expect(prompt.inspection.memory).toContain('AUTO_FACT');
    expect(prompt.inspection.lore.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'acceptance-lore', title: 'Северная башня' },
    ]);
    expect(prompt.inspection.chatInstructions).toContain('STYLE_INSTRUCTION');
    expect(
      prompt.inspection.recentMessages.some((message) =>
        message.content.includes('SELECTED_BRANCH'),
      ),
    ).toBe(true);
    expect(
      prompt.inspection.recentMessages.every(
        (message) => !message.content.includes('UNSELECTED_BRANCH'),
      ),
    ).toBe(true);
    const providerContext = prompt.messages.map((message) => message.content).join('\n');
    expect(providerContext).not.toContain('UNSELECTED_BRANCH');
    expect(providerContext).not.toMatch(/\{\{(?:char|user)\}\}/u);
    expect(providerContext).toContain('Мира');
    expect(providerContext).toContain('Алекс');
    expect(prompt.includedLoreEntries).toEqual(['acceptance-lore']);
    expect(prompt.unknownTemplateVariables).toEqual([]);
  });
});
