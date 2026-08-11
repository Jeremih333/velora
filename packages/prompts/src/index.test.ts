import { describe, expect, it } from 'vitest';
import {
  activateLore,
  buildRoleplayPrompt,
  parseExampleDialogues,
  renderTemplate,
  validatePromptBudget,
} from './index';

describe('renderTemplate', () => {
  it('substitutes documented variables including Unicode and repeated tokens', () => {
    expect(
      renderTemplate('Привет, {{user}}. Я {{char}}, {{char}} рядом.', {
        user: 'Лея 🌙',
        char: 'Vel',
      }),
    ).toEqual({
      value: 'Привет, Лея 🌙. Я Vel, Vel рядом.',
      unknownVariables: [],
    });
  });

  it('keeps unknown and malformed tokens literal without evaluating them', () => {
    expect(renderTemplate('{{unknown}} {{{char}}} {{ char', { char: 'A' })).toEqual({
      value: '{{unknown}} {A} {{ char',
      unknownVariables: ['unknown'],
    });
  });

  it('supports escaped literals, empty values and all documented variables', () => {
    expect(
      renderTemplate(
        String.raw`\{{char}} | {{persona}} | {{scenario}} | {{description}} | {{memory}}`,
        { persona: 'Лея', scenario: 'Берег', description: '', memory: 'Ключ' },
      ),
    ).toEqual({
      value: '{{char}} | Лея | Берег |  | Ключ',
      unknownVariables: [],
    });
  });
});

describe('parseExampleDialogues', () => {
  it('parses multiline user/character turns and degrades malformed prefixes safely', () => {
    const result = parseExampleDialogues(
      'неразмеченная строка\n{{user}}: Привет, {{char}}\nпродолжение\n{{char}}: Рад видеть {{user}}',
      { user: 'Лея', char: 'Лира' },
    );
    expect(result).toEqual({
      messages: [
        { role: 'USER', content: 'Привет, Лира\nпродолжение' },
        { role: 'ASSISTANT', content: 'Рад видеть Лея' },
      ],
      malformedLineCount: 1,
      unknownVariables: [],
    });
  });
});

describe('deterministic lore activation', () => {
  const entry = (
    overrides: Partial<Parameters<typeof activateLore>[0]['entries'][number]> = {},
  ) => ({
    id: 'lore-1',
    title: 'Архив',
    content: '{{char}} знает, что {{user}} нашёл архив.',
    keys: ['архив'],
    secondaryKeys: [],
    enabled: true,
    priority: 10,
    position: 0,
    caseSensitive: false,
    matchWholeWord: false,
    scanDepth: 20,
    tokenBudget: 400,
    ...overrides,
  });
  const activate = (
    entries: readonly ReturnType<typeof entry>[],
    contextMessages = ['Я нашёл Архив.'],
    totalTokenBudget = 1000,
  ) =>
    activateLore({
      entries,
      contextMessages,
      totalTokenBudget,
      variables: { char: 'Элиас', user: 'Лея' },
    });

  it('matches Russian and English keys case-insensitively and renders templates', () => {
    const result = activate([entry({ keys: ['АРХИВ', 'archive'] })], ['I enter the ARCHIVE.']);
    expect(result.entries[0]).toMatchObject({
      id: 'lore-1',
      content: 'Элиас знает, что Лея нашёл архив.',
      matchedKeys: ['archive'],
    });
  });

  it('supports case-sensitive, Unicode whole-word and secondary-key gates', () => {
    expect(activate([entry({ keys: ['Лёд'], caseSensitive: true })], ['лёд']).entries).toHaveLength(
      0,
    );
    expect(
      activate([entry({ keys: ['кот'], matchWholeWord: true })], ['котёнок']).entries,
    ).toHaveLength(0);
    expect(
      activate(
        [entry({ keys: ['Москва'], secondaryKeys: ['метро'], matchWholeWord: true })],
        ['Москва и метро'],
      ).entries,
    ).toHaveLength(1);
    expect(
      activate([entry({ keys: ['Москва'], secondaryKeys: ['метро'] })], ['Москва-река']).entries,
    ).toHaveLength(0);
  });

  it('honours scan depth, disabled entries, priority, position and overlapping matches', () => {
    const entries = [
      entry({ id: 'disabled', enabled: false, priority: 100 }),
      entry({ id: 'low', priority: 1, position: 0 }),
      entry({ id: 'high-b', priority: 9, position: 2 }),
      entry({ id: 'high-a', priority: 9, position: 1 }),
      entry({ id: 'recent-only', keys: ['старое'], scanDepth: 1 }),
    ];
    expect(activate(entries, ['старое', 'архив']).entries.map((item) => item.id)).toEqual([
      'high-a',
      'high-b',
      'low',
    ]);
  });

  it('enforces per-entry and total token budgets deterministically', () => {
    const result = activate(
      [
        entry({ id: 'first', content: 'длинный '.repeat(100), tokenBudget: 8, priority: 2 }),
        entry({ id: 'second', content: 'коротко', tokenBudget: 20, priority: 1 }),
      ],
      ['архив'],
      8,
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.id).toBe('first');
    expect(result.entries[0]?.tokenEstimate).toBeLessThanOrEqual(8);
    expect(result.skippedForBudget).toEqual(['second']);
  });
});

describe('roleplay prompt builder', () => {
  const character = {
    name: 'Лира',
    description: 'Хранительница маяка',
    personality: 'Внимательная',
    scenario: 'Ночной берег',
    speechStyle: 'Тихая речь',
    appearance: '',
    background: '',
    goals: '',
    behaviourRules: '',
    systemInstructions: 'Не выходить из роли',
    postHistoryInstructions: '',
    exampleDialogues: '',
  };

  it('keeps platform policy first and preserves the latest branch within budget', () => {
    const result = buildRoleplayPrompt({
      character,
      persona: null,
      memory: '',
      lore: [],
      customInstructions: '',
      history: [
        { role: 'USER', content: 'старое '.repeat(500) },
        { role: 'ASSISTANT', content: 'Последний ответ' },
        { role: 'USER', content: 'Последняя реплика' },
      ],
      maxContextTokens: 1_000,
      outputTokens: 200,
    });
    expect(result.messages[0]?.role).toBe('system');
    expect(result.messages.at(-1)?.content).toBe('Последняя реплика');
    expect(result.droppedHistoryMessages).toBe(1);
  });

  it('fails closed instead of silently dropping essential prompt sections', () => {
    expect(() =>
      buildRoleplayPrompt({
        character: { ...character, description: 'x'.repeat(5_000) },
        persona: null,
        memory: '',
        lore: [],
        customInstructions: '',
        history: [],
        maxContextTokens: 512,
        outputTokens: 128,
      }),
    ).toThrow(/exceed/iu);
  });

  it('renders every template-aware layer and keeps precedence around examples and history', () => {
    const result = buildRoleplayPrompt({
      character: {
        ...character,
        scenario: '{{char}} ждёт {{user}}',
        systemInstructions: 'Автор просит обращаться к {{persona}}',
        exampleDialogues: '{{user}}: Где {{char}}?\n{{char}}: Я здесь.',
        postHistoryInstructions: 'Заверши сцену для {{user}}.',
      },
      persona: {
        name: 'Лея',
        shortDescription: '{{user}} — исследовательница',
        longDescription: '',
        personality: '',
        appearance: '',
        speakingStyle: '',
        background: '',
        pronouns: '',
        representedAge: null,
        customNotes: '',
      },
      memory: '{{char}} уже доверяет {{user}}.',
      lore: [],
      customInstructions: 'Пиши для {{user}} кратко.',
      history: [{ role: 'USER', content: 'Продолжай.' }],
      maxContextTokens: 2_000,
      outputTokens: 200,
    });
    expect(result.messages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
      'system',
    ]);
    expect(result.messages[0]?.content).toContain('Лира ждёт Лея');
    expect(result.messages[0]?.content).toContain('Пиши для Лея кратко.');
    expect(result.messages[1]?.content).toBe('Где Лира?');
    expect(result.messages.at(-1)?.content).toContain('Заверши сцену для Лея.');
    expect(result.includedExampleMessages).toBe(2);
    expect(result.unknownTemplateVariables).toEqual([]);
    expect(result.inspection.character.scenario).toBe('Лира ждёт Лея');
    expect(result.inspection.memory).toBe('Лира уже доверяет Лея.');
    expect(result.inspection.recentMessages).toEqual([{ role: 'USER', content: 'Продолжай.' }]);
    expect(result.inspection.tokenEstimates.totalInput).toBe(result.estimatedInputTokens);
    expect(result.inspection.tokenEstimates.contextLimit).toBe(2_000);
  });
});

describe('validatePromptBudget', () => {
  it('rejects context overflow', () => {
    const base = {
      maxContextTokens: 100,
      outputTokens: 20,
      systemTokens: 10,
      characterTokens: 10,
      personaTokens: 10,
      memoryTokens: 10,
      loreTokens: 10,
    };
    expect(validatePromptBudget({ ...base, recentChatTokens: 30 })).toBe(true);
    expect(validatePromptBudget({ ...base, recentChatTokens: 31 })).toBe(false);
  });
});
