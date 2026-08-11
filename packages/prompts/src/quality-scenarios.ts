import type { LoreActivationEntry, RoleplayHistoryMessage, RoleplayPromptInput } from './index';

export type RoleplayQualityScenarioId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface RoleplayQualityLoreCase {
  readonly candidates: readonly LoreActivationEntry[];
  readonly contextMessages: readonly string[];
  readonly totalTokenBudget: number;
  readonly expectedActiveIds: readonly string[];
}

export interface RoleplayQualityExpectation {
  readonly requiredMarkers: readonly string[];
  readonly forbiddenMarkers: readonly string[];
  readonly minimumDroppedHistory: number;
}

export interface RoleplayQualityScenario {
  readonly id: RoleplayQualityScenarioId;
  readonly title: string;
  readonly input: RoleplayPromptInput;
  readonly loreCase: RoleplayQualityLoreCase | null;
  readonly expectation: RoleplayQualityExpectation;
}

const baseCharacter = {
  name: 'Mara',
  description: 'A careful keeper of the observatory.',
  personality: 'Patient, observant, and quietly brave.',
  scenario: 'A storm isolates the mountain observatory.',
  speechStyle: 'Clear, atmospheric sentences.',
  appearance: 'A dark coat and a brass telescope key.',
  background: 'Mara has guarded the observatory for seven winters.',
  goals: 'Discover why the stars disappeared.',
  behaviourRules: 'Stay in character and preserve established facts.',
  systemInstructions: 'Let the user make consequential choices.',
  postHistoryInstructions: 'End with an opening for the user to act.',
  exampleDialogues: '{{user}}: Is the signal real?\n{{char}}: Real enough to answer us.',
} as const;

const englishPersona = {
  name: 'Alex',
  shortDescription: 'A travelling radio engineer.',
  longDescription: 'Alex repairs abandoned transmitters and records unusual signals.',
  personality: 'Curious and methodical.',
  appearance: 'A weathered jacket and a field receiver.',
  speakingStyle: 'Direct questions and concise observations.',
  background: 'Arrived from the valley before the storm.',
  pronouns: 'they/them',
  representedAge: '27',
  customNotes: 'Do not decide Alex’s emotions or actions.',
} as const;

const russianPersona = {
  name: 'Лея',
  shortDescription: 'Исследовательница забытых архивов.',
  longDescription: 'Лея ищет карту города, исчезнувшего после северной бури.',
  personality: 'Наблюдательная и осторожная.',
  appearance: 'Синий плащ и серебряный компас.',
  speakingStyle: 'Короткие точные реплики.',
  background: 'Выросла рядом со старым маяком.',
  pronouns: 'она/её',
  representedAge: '25',
  customNotes: 'Не определять решения Леи вместо пользователя.',
} as const;

function repeatedHistory(count: number): readonly RoleplayHistoryMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? ('USER' as const) : ('ASSISTANT' as const),
    content: `Branch Alpha turn ${String(index + 1)}: ${'signal '.repeat(12).trim()}`,
  }));
}

const loreDefaults = {
  enabled: true,
  priority: 10,
  position: 0,
  caseSensitive: false,
  matchWholeWord: true,
  scanDepth: 20,
  tokenBudget: 300,
} as const;

export const roleplayQualityScenarios: readonly RoleplayQualityScenario[] = [
  {
    id: 'A',
    title: 'Simple English',
    input: {
      character: baseCharacter,
      persona: englishPersona,
      memory: 'Mara already trusted Alex with the telescope key.',
      lore: [],
      customInstructions: 'Keep the scene grounded and interactive.',
      history: [
        { role: 'ASSISTANT', content: 'The receiver clicked once in the dark.' },
        { role: 'USER', content: 'Alex tunes the receiver to 14.2 MHz.' },
      ],
      maxContextTokens: 4_096,
      outputTokens: 320,
    },
    loreCase: null,
    expectation: {
      requiredMarkers: ['Mara', 'Alex', 'mountain observatory', 'telescope key', '14.2 MHz'],
      forbiddenMarkers: [],
      minimumDroppedHistory: 0,
    },
  },
  {
    id: 'B',
    title: 'Russian roleplay',
    input: {
      character: {
        ...baseCharacter,
        name: 'Элиас',
        description: 'Хранитель подземного архива.',
        scenario: 'Ночной архив просыпается, когда Лея касается медной печати.',
        exampleDialogues: '{{user}}: Здесь безопасно?\n{{char}}: Пока мы помним правила архива.',
      },
      persona: russianPersona,
      memory: 'Элиас пообещал Лее не открывать западную дверь без неё.',
      lore: [],
      customInstructions: 'Продолжай сцену на русском языке.',
      history: [{ role: 'USER', content: 'Лея показывает найденный серебряный ключ.' }],
      maxContextTokens: 4_096,
      outputTokens: 320,
    },
    loreCase: null,
    expectation: {
      requiredMarkers: ['Элиас', 'Лея', 'Ночной архив', 'западную дверь', 'серебряный ключ'],
      forbiddenMarkers: [],
      minimumDroppedHistory: 0,
    },
  },
  {
    id: 'C',
    title: 'Huge character definition',
    input: {
      character: {
        ...baseCharacter,
        name: 'Ione',
        description: `Ione keeps a precise expedition ledger. ${'Layered expedition detail. '.repeat(420)}`,
        scenario: 'The expedition reaches a city inside a glacier.',
        systemInstructions:
          'Preserve every established location and never collapse the expedition timeline.',
      },
      persona: englishPersona,
      memory: 'The third expedition day ended at the blue gate.',
      lore: [],
      customInstructions: 'Prefer continuity over surprise.',
      history: [{ role: 'USER', content: 'We return to the blue gate at dawn.' }],
      maxContextTokens: 16_384,
      outputTokens: 600,
    },
    loreCase: null,
    expectation: {
      requiredMarkers: ['Ione', 'city inside a glacier', 'third expedition day', 'blue gate'],
      forbiddenMarkers: [],
      minimumDroppedHistory: 0,
    },
  },
  {
    id: 'D',
    title: 'Multiple deterministic lore entries',
    input: {
      character: { ...baseCharacter, name: 'Nora' },
      persona: englishPersona,
      memory: 'Nora and Alex entered the station together.',
      lore: [],
      customInstructions: 'Use only activated world information.',
      history: [{ role: 'USER', content: 'Alex asks about the black beacon near Station Echo.' }],
      maxContextTokens: 4_096,
      outputTokens: 320,
    },
    loreCase: {
      candidates: [
        {
          ...loreDefaults,
          id: 'echo-station',
          title: 'Station Echo',
          content: 'Station Echo circles a silent red moon.',
          keys: ['Station Echo'],
          secondaryKeys: [],
        },
        {
          ...loreDefaults,
          id: 'black-beacon',
          title: 'Black beacon',
          content: 'The black beacon transmits only during magnetic storms.',
          keys: ['black beacon'],
          secondaryKeys: ['Station Echo'],
          priority: 20,
        },
        {
          ...loreDefaults,
          id: 'unrelated-palace',
          title: 'Sun palace',
          content: 'UNRELATED_LORE_SUN_PALACE must never enter this prompt.',
          keys: ['sun palace'],
          secondaryKeys: [],
        },
      ],
      contextMessages: ['Alex asks about the black beacon near Station Echo.'],
      totalTokenBudget: 800,
      expectedActiveIds: ['black-beacon', 'echo-station'],
    },
    expectation: {
      requiredMarkers: ['Station Echo circles a silent red moon', 'black beacon transmits'],
      forbiddenMarkers: ['UNRELATED_LORE_SUN_PALACE'],
      minimumDroppedHistory: 0,
    },
  },
  {
    id: 'E',
    title: 'Heavy documented template use',
    input: {
      character: {
        ...baseCharacter,
        name: 'Vesper',
        description: '{{char}} guides {{user}}. Scenario: {{scenario}}.',
        personality: '{{char}} listens to {{persona}} before acting.',
        scenario: '{{user}} arrives at the glass harbour.',
        speechStyle: '{{char}} addresses {{user}} by name.',
        appearance: '{{description}}',
        background: 'The promise is recorded in memory: {{memory}}',
        goals: 'Help {{user}} understand {{scenario}}.',
        behaviourRules: 'Never impersonate {{user}}.',
        systemInstructions: 'Keep {{char}} consistent with {{description}}.',
        postHistoryInstructions: 'Invite {{user}} to choose the next action.',
        exampleDialogues: '{{user}}: Who are you, {{char}}?\n{{char}}: I am waiting for {{user}}.',
      },
      persona: {
        ...englishPersona,
        name: 'Robin',
        shortDescription: '{{user}} is the harbour cartographer.',
        customNotes: '{{char}} must not choose for {{user}}.',
      },
      memory: '{{char}} gave {{user}} the prism compass.',
      lore: [
        {
          id: 'glass-harbour',
          title: 'Glass harbour',
          content: '{{char}} knows that {{user}} can open the tide gate.',
        },
      ],
      customInstructions: 'Use {{memory}} and call {{user}} by name.',
      history: [{ role: 'USER', content: 'Robin raises the prism compass.' }],
      maxContextTokens: 6_144,
      outputTokens: 400,
    },
    loreCase: null,
    expectation: {
      requiredMarkers: ['Vesper', 'Robin', 'glass harbour', 'prism compass', 'tide gate'],
      forbiddenMarkers: ['{{char}}', '{{user}}', '{{persona}}', '{{scenario}}', '{{memory}}'],
      minimumDroppedHistory: 0,
    },
  },
  {
    id: 'F',
    title: 'Long selected branch',
    input: {
      character: { ...baseCharacter, name: 'Orin' },
      persona: englishPersona,
      memory: 'Persistent summary: Orin and Alex chose Branch Alpha and repaired the north relay.',
      lore: [],
      customInstructions: 'Continue only the selected branch.',
      history: [
        ...repeatedHistory(360),
        { role: 'ASSISTANT', content: 'SELECTED_BRANCH_RECENT: the north relay starts humming.' },
        { role: 'USER', content: 'SELECTED_BRANCH_TIP: Alex opens the final frequency envelope.' },
      ],
      maxContextTokens: 4_096,
      outputTokens: 400,
    },
    loreCase: null,
    expectation: {
      requiredMarkers: [
        'Persistent summary',
        'Branch Alpha',
        'SELECTED_BRANCH_RECENT',
        'SELECTED_BRANCH_TIP',
      ],
      forbiddenMarkers: ['UNSELECTED_BRANCH_BETA'],
      minimumDroppedHistory: 250,
    },
  },
];
