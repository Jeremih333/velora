import { describe, expect, it } from 'vitest';
import {
  activateLore,
  buildRoleplayPrompt,
  parseExampleDialogues,
  renderResolvedTemplate,
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

  it.each([
    ['Hello {{user}}', { user: 'Robin' }, 'Hello Robin'],
    ['I am {{char}}', { char: 'Vesper' }, 'I am Vesper'],
    ['{{char}} knows {{user}}', { char: 'Vesper', user: 'Robin' }, 'Vesper knows Robin'],
    ['Снова {{char}} и {{user}} 🌙', { char: 'Лира', user: 'Лея' }, 'Снова Лира и Лея 🌙'],
    ['обычные {скобки} остаются', {}, 'обычные {скобки} остаются'],
  ])('renders the contract case %s without evaluating content', (source, variables, expected) => {
    expect(renderTemplate(source, variables)).toEqual({
      value: expected,
      unknownVariables: [],
    });
  });

  it('keeps the exact unknown and malformed contract cases literal', () => {
    expect(renderTemplate('{{abc}} + {{', {})).toEqual({
      value: '{{abc}} + {{',
      unknownVariables: ['abc'],
    });
  });

  it('replaces one hundred occurrences deterministically', () => {
    const source = Array.from({ length: 100 }, () => '{{char}}').join(' ');
    const result = renderTemplate(source, { char: 'Лира' });
    expect(result.value.split(' ')).toEqual(Array.from({ length: 100 }, () => 'Лира'));
    expect(result.unknownVariables).toEqual([]);
  });
});

describe('renderResolvedTemplate', () => {
  it('resolves nested documented variables and preserves escaped literals', () => {
    expect(
      renderResolvedTemplate(String.raw`{{description}} | \{{char}}`, {
        char: 'Vesper',
        user: 'Robin',
        scenario: '{{user}} enters the harbour',
        description: '{{char}} guides {{user}} in {{scenario}}',
      }),
    ).toEqual({
      value: 'Vesper guides Robin in Robin enters the harbour | {{char}}',
      unknownVariables: [],
    });
  });

  it('terminates cyclic references without evaluating arbitrary tokens', () => {
    expect(
      renderResolvedTemplate('{{description}} {{unknown}}', {
        description: '{{scenario}}',
        scenario: '{{description}}',
      }),
    ).toEqual({ value: '{{description}} {{unknown}}', unknownVariables: ['unknown'] });
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
      priority: 10,
    });
    expect(activate([entry({ keys: ['ДваЧе'] })], ['Привет, Дваче.']).entries).toHaveLength(1);
  });

  it('can keep attached character canon active even before a trigger is mentioned', () => {
    const result = activateLore({
      entries: [entry({ keys: ['ДваЧе'] })],
      contextMessages: ['Привет ещё раз.'],
      totalTokenBudget: 1000,
      variables: { char: 'Алиса', user: 'Семён' },
      forceActivateAll: true,
    });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.matchedKeys).toEqual([]);
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

  it('requires character-led actions, scene progression and substantial replies', () => {
    const result = buildRoleplayPrompt({
      character,
      persona: null,
      memory: '',
      lore: [],
      customInstructions: '',
      history: [{ role: 'USER', content: 'Расскажи о себе подробнее.' }],
      maxContextTokens: 4_000,
      outputTokens: 800,
    });
    const system = result.messages[0]?.content ?? '';
    expect(system).toContain("Preserve the character's personality");
    expect(system).toContain('*single asterisks*');
    expect(system).toContain('Move the story forward');
    expect(system).toContain('3-6 cohesive paragraphs');
    expect(system).toContain("Never decide the user's thoughts");
    expect(system).toContain('ACTIVE_LORE contains facts and conditional character behaviour');
  });

  it('marks activated lore as binding behaviour for the current turn', () => {
    const result = buildRoleplayPrompt({
      character,
      persona: null,
      memory: '',
      lore: [
        {
          id: 'alice-trigger',
          title: 'Прозвище',
          content: 'Если Алису называют ДваЧе, она явно злится и отвечает резко.',
        },
      ],
      customInstructions: '',
      history: [{ role: 'USER', content: 'Привет, ДваЧе.' }],
      maxContextTokens: 4_000,
      outputTokens: 800,
    });
    const system = result.messages[0]?.content ?? '';
    expect(system).toContain('ACTIVE_LORE');
    expect(system).toContain('Если Алису называют ДваЧе, она явно злится');
    expect(result.includedLoreEntries).toEqual(['alice-trigger']);
  });

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

  it('uses the profile display name for {{user}} when no Persona is active', () => {
    const result = buildRoleplayPrompt({
      character: { ...character, scenario: '{{char}} встречает {{user}}.' },
      persona: null,
      userName: 'Робин',
      memory: '',
      lore: [],
      customInstructions: '',
      history: [],
      maxContextTokens: 1_000,
      outputTokens: 200,
    });
    expect(result.inspection.character.scenario).toBe('Лира встречает Робин.');
  });

  it('makes the selected persona pronouns an explicit address rule', () => {
    const result = buildRoleplayPrompt({
      character,
      persona: {
        name: 'Саша',
        shortDescription: '',
        longDescription: '',
        personality: '',
        appearance: '',
        speakingStyle: '',
        background: '',
        pronouns: 'он/его',
        representedAge: null,
        customNotes: '',
      },
      memory: '',
      lore: [],
      customInstructions: '',
      history: [{ role: 'USER', content: 'Опиши меня.' }],
      maxContextTokens: 2_000,
      outputTokens: 400,
    });

    const system = result.messages[0]?.content ?? '';
    expect(system).toContain('PERSONA_ADDRESS_RULE');
    expect(system).toContain('он/его');
    expect(system).toContain('Never infer different gendered forms');
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
        longDescription: '{{user}} помнит северный берег.',
        personality: '{{user}} сохраняет спокойствие.',
        appearance: '{{user}} носит серебряный плащ.',
        speakingStyle: '{{user}} говорит кратко.',
        background: '{{user}} выросла у маяка.',
        pronouns: '',
        representedAge: null,
        customNotes: '{{char}} не решает за {{user}}.',
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
    expect(result.inspection.persona).toMatchObject({
      shortDescription: 'Лея — исследовательница',
      longDescription: 'Лея помнит северный берег.',
      personality: 'Лея сохраняет спокойствие.',
      appearance: 'Лея носит серебряный плащ.',
      speakingStyle: 'Лея говорит кратко.',
      background: 'Лея выросла у маяка.',
      customNotes: 'Лира не решает за Лея.',
    });
    expect(result.messages[0]?.content).toContain('Лея помнит северный берег.');
    expect(result.inspection.memory).toBe('Лира уже доверяет Лея.');
    expect(result.inspection.recentMessages).toEqual([{ role: 'USER', content: 'Продолжай.' }]);
    expect(result.inspection.tokenEstimates.totalInput).toBe(result.estimatedInputTokens);
    expect(result.inspection.tokenEstimates.contextLimit).toBe(2_000);
  });

  it('keeps the documented prompt precedence through the latest user message', () => {
    const result = buildRoleplayPrompt({
      character: {
        ...character,
        description: 'CHARACTER_MARKER',
        systemInstructions: 'CREATOR_MARKER',
      },
      persona: {
        name: 'Лея',
        shortDescription: 'PERSONA_MARKER',
        longDescription: '',
        personality: '',
        appearance: '',
        speakingStyle: '',
        background: '',
        pronouns: '',
        representedAge: null,
        customNotes: '',
      },
      memory: 'MEMORY_MARKER',
      lore: [{ id: 'lore-1', title: 'Лор', content: 'LORE_MARKER' }],
      customInstructions: 'CHAT_INSTRUCTIONS_MARKER',
      history: [
        { role: 'ASSISTANT', content: 'RECENT_BRANCH_MARKER' },
        { role: 'USER', content: 'LATEST_USER_MARKER' },
      ],
      maxContextTokens: 4_000,
      outputTokens: 200,
    });
    const system = result.messages[0]?.content ?? '';
    const orderedSystemMarkers = [
      'PLATFORM_SAFETY',
      'PLATFORM_GENERATION_INSTRUCTIONS',
      'CHARACTER_MARKER',
      'CREATOR_MARKER',
      'PERSONA_MARKER',
      'MEMORY_MARKER',
      'LORE_MARKER',
      'CHAT_INSTRUCTIONS_MARKER',
    ];
    const indexes = orderedSystemMarkers.map((marker) => system.indexOf(marker));
    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((left, right) => left - right));
    expect(result.messages.at(-2)?.content).toBe('RECENT_BRANCH_MARKER');
    expect(result.messages.at(-1)?.content).toBe('LATEST_USER_MARKER');
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
