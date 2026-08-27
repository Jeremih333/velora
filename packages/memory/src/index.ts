export type MemorySource = 'AUTO_SUMMARY' | 'FULL_REGENERATION' | 'MANUAL_EDIT' | 'RESTORE';

export interface MemoryVersionInput {
  readonly manualContext: string;
  readonly autoSummary: string;
  readonly source: MemorySource;
  readonly previousVersionId: string | null;
  readonly fromMessageId: string | null;
  readonly toMessageId: string | null;
}

export interface MemoryMessage {
  readonly id: string;
  readonly role: 'USER' | 'ASSISTANT';
  readonly content: string;
}

export interface DeterministicSummaryInput {
  readonly messages: readonly MemoryMessage[];
  readonly preservedMemory?: string;
  readonly mode: 'INCREMENTAL' | 'FULL';
  readonly maxCharacters?: number;
}

export interface DeterministicSummary {
  readonly content: string;
  readonly fromMessageId: string | null;
  readonly toMessageId: string | null;
  readonly messageCount: number;
  readonly estimatedTokens: number;
  readonly model: 'deterministic-extractive-v1' | 'deterministic-hierarchical-v1';
}

const DEFAULT_MAX_CHARACTERS = 56_000;
const MIN_EXCERPT_CHARACTERS = 48;
const MAX_EXCERPT_CHARACTERS = 320;
const CHUNK_SIZE = 50;
const HIERARCHICAL_THRESHOLD = 500;

export const MEMORY_SECTION_TITLES = [
  'Активные персонажи:',
  'Действия персонажей:',
  'Краткая сводка диалога:',
  'Сюжет действий:',
  'Характеры:',
  'Отношения персонажей:',
] as const;

export const MEMORY_SUMMARY_RETENTION_RULES = [
  'ключевые события',
  'отношения и чувства',
  'обещания и конфликты',
  'важные факты, персонажи, локации и предметы',
  'текущие цели и незакрытые сюжетные линии',
  'изменения характера',
] as const;

export const MEMORY_SUMMARY_INSTRUCTIONS = [
  'Сохраняй только сюжетно значимые сведения:',
  ...MEMORY_SUMMARY_RETENTION_RULES.map((rule) => `- ${rule};`),
  'Не сохраняй каждую фразу и не добавляй факты, которых нет в истории.',
].join('\n');

export function validateMemoryVersion(input: MemoryVersionInput): void {
  if (input.manualContext.length > 64_000) {
    throw new RangeError('Manual context exceeds 64,000 characters.');
  }
  if (input.autoSummary.length > 64_000) {
    throw new RangeError('Automatic summary exceeds 64,000 characters.');
  }
  if (input.source === 'AUTO_SUMMARY' && input.toMessageId === null) {
    throw new Error('Automatic summary must identify its final covered message.');
  }
  if (input.source === 'RESTORE' && input.previousVersionId === null) {
    throw new Error('Restore must reference a previous version.');
  }
}

export function composePersistentMemory(manualContext: string, autoSummary: string): string {
  return [
    manualContext.trim() ? `PINNED_MANUAL_CONTEXT:\n${manualContext.trim()}` : '',
    autoSummary.trim() ? `AUTO_SUMMARY:\n${autoSummary.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function isMemoryStale(
  lastCoveredAt: number | null,
  earliestEditedAt: number | null,
): boolean {
  return lastCoveredAt !== null && earliestEditedAt !== null && earliestEditedAt <= lastCoveredAt;
}

/**
 * A no-cost, extractive fallback. It only copies normalized excerpts from the
 * actual active branch, so it cannot invent facts and never calls an AI model.
 */
export function buildDeterministicSummary(input: DeterministicSummaryInput): DeterministicSummary {
  if (input.messages.length > HIERARCHICAL_THRESHOLD) {
    return buildHierarchicalDeterministicSummary(input);
  }
  const maxCharacters = input.maxCharacters ?? DEFAULT_MAX_CHARACTERS;
  if (maxCharacters < 4_000 || maxCharacters > 64_000) {
    throw new RangeError('Memory summary limit must be between 4,000 and 64,000 characters.');
  }
  const preserved = normalize(input.preservedMemory ?? '');
  if (preserved.length > maxCharacters - 2_000) {
    throw new RangeError('Preserved manual memory leaves no safe room for new history.');
  }
  const messages = input.messages
    .map((message) => ({ ...message, content: normalize(message.content) }))
    .filter((message) => message.content.length > 0);
  const structuredSections = renderStructuredMemorySections(messages);
  const header =
    input.mode === 'FULL'
      ? 'Полная детерминированная сводка активной ветки'
      : 'Обновлённая детерминированная сводка активной ветки';
  const prefix = [
    header,
    'Сводка составлена только из фрагментов реальных сообщений; домыслы не добавлялись.',
    MEMORY_SUMMARY_INSTRUCTIONS,
    preserved ? `\nТекущая память (сохранена при обновлении):\n${preserved}` : '',
    `\n${structuredSections}`,
    messages.length > 0 ? '\nХронология:' : '\nХронология пока пуста.',
  ]
    .filter(Boolean)
    .join('\n');
  const available = Math.max(0, maxCharacters - prefix.length - messages.length * 18);
  const excerptLimit = Math.max(
    MIN_EXCERPT_CHARACTERS,
    Math.min(MAX_EXCERPT_CHARACTERS, Math.floor(available / Math.max(1, messages.length))),
  );
  let content = `${prefix}${renderDetailedLines(messages, excerptLimit)}`;
  if (content.length > maxCharacters) {
    const adjustedLimit = Math.max(
      12,
      excerptLimit - Math.ceil((content.length - maxCharacters) / Math.max(1, messages.length)),
    );
    content = `${prefix}${renderDetailedLines(messages, adjustedLimit)}`;
  }
  if (content.length > maxCharacters) {
    throw new RangeError('Memory could not be compacted without truncating history.');
  }
  return {
    content,
    fromMessageId: messages[0]?.id ?? null,
    toMessageId: messages.at(-1)?.id ?? null,
    messageCount: messages.length,
    estimatedTokens: Math.ceil(content.length / 4),
    model: 'deterministic-extractive-v1',
  };
}

function renderStructuredMemorySections(messages: readonly MemoryMessage[]): string {
  const roles = [
    messages.some(({ role }) => role === 'USER') ? '- Пользователь' : '',
    messages.some(({ role }) => role === 'ASSISTANT') ? '- Персонаж' : '',
  ].filter(Boolean);
  const actions = messages
    .flatMap(({ content }) => [...content.matchAll(/(?<!\*)\*([^*]+?)\*(?!\*)/gsu)])
    .map((match) => normalize(match[1] ?? ''))
    .filter(Boolean)
    .slice(-12)
    .map((action) => `- ${action}`);
  const latest = messages
    .slice(-8)
    .map(
      ({ role, content }) =>
        `- ${role === 'USER' ? 'Пользователь' : 'Персонаж'}: ${excerpt(content, 220)}`,
    );
  const empty = '- Пока нет подтверждённых сведений.';
  return [
    `Активные персонажи:\n${roles.length > 0 ? roles.join('\n') : empty}`,
    `Действия персонажей:\n${actions.length > 0 ? actions.join('\n') : empty}`,
    `Краткая сводка диалога:\n${latest.length > 0 ? latest.join('\n') : empty}`,
    `Сюжет действий:\n${actions.length > 0 ? actions.join('\n') : empty}`,
    `Характеры:\n${empty}`,
    `Отношения персонажей:\n${empty}`,
  ].join('\n\n');
}

/**
 * Compacts every chronological episode instead of slicing the final string.
 * The fallback remains extractive: every excerpt comes from a real message.
 */
export function buildHierarchicalDeterministicSummary(
  input: DeterministicSummaryInput,
): DeterministicSummary {
  const maxCharacters = input.maxCharacters ?? DEFAULT_MAX_CHARACTERS;
  if (maxCharacters < 4_000 || maxCharacters > 64_000) {
    throw new RangeError('Memory summary limit must be between 4,000 and 64,000 characters.');
  }
  const preserved = normalize(input.preservedMemory ?? '');
  if (preserved.length > maxCharacters - 4_000) {
    throw new RangeError('Preserved manual memory leaves no safe room for hierarchical history.');
  }
  const messages = input.messages
    .map((message) => ({ ...message, content: normalize(message.content) }))
    .filter((message) => message.content.length > 0);
  const structuredSections = renderStructuredMemorySections(messages);
  const chunks = Array.from({ length: Math.ceil(messages.length / CHUNK_SIZE) }, (_, index) =>
    messages.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
  );
  const header = [
    'Иерархическая сводка активной ветки',
    'Каждый эпизод составлен только из фрагментов реальных сообщений; домыслы не добавлялись.',
    MEMORY_SUMMARY_INSTRUCTIONS,
    preserved ? `\nТекущая память (сохранена при обновлении):\n${preserved}` : '',
    `\n${structuredSections}`,
    '\nХронология эпизодов:',
  ]
    .filter(Boolean)
    .join('\n');
  const remaining = maxCharacters - header.length;
  const perChunk = Math.floor(remaining / Math.max(1, chunks.length));
  if (perChunk < 72)
    throw new RangeError('Conversation is too large for safe hierarchical memory.');
  const episodeLines = chunks.map((chunk, index) => {
    const selected = selectEpisodeMessages(chunk);
    const label = `\nЭпизод ${String(index + 1)} (${String(index * CHUNK_SIZE + 1)}–${String(index * CHUNK_SIZE + chunk.length)}):`;
    const excerptBudget = Math.max(
      20,
      Math.floor((perChunk - label.length - selected.length * 4) / selected.length),
    );
    return `${label}\n${selected.map((message) => `${message.role === 'USER' ? 'П' : 'Р'}: ${excerpt(message.content, excerptBudget)}`).join('\n')}`;
  });
  const content = `${header}${episodeLines.join('')}`;
  if (content.length > maxCharacters) {
    throw new RangeError('Hierarchical memory exceeded its validated budget.');
  }
  return {
    content,
    fromMessageId: messages[0]?.id ?? null,
    toMessageId: messages.at(-1)?.id ?? null,
    messageCount: messages.length,
    estimatedTokens: Math.ceil(content.length / 4),
    model: 'deterministic-hierarchical-v1',
  };
}

function selectEpisodeMessages(messages: readonly MemoryMessage[]): readonly MemoryMessage[] {
  if (messages.length <= 3) return messages;
  const middle = messages[Math.floor(messages.length / 2)];
  return [messages[0], middle, messages.at(-1)].filter(
    (message): message is MemoryMessage => message !== undefined,
  );
}

function renderDetailedLines(messages: readonly MemoryMessage[], excerptLimit: number): string {
  const lines: string[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    if (index % CHUNK_SIZE === 0) {
      lines.push(`\nЭпизод ${String(Math.floor(index / CHUNK_SIZE) + 1)}:`);
    }
    const message = messages[index];
    if (!message) continue;
    const speaker = message.role === 'USER' ? 'Пользователь' : 'Персонаж';
    lines.push(`- ${speaker}: ${excerpt(message.content, excerptLimit)}`);
  }
  return lines.join('\n');
}

function normalize(value: string): string {
  return value.replaceAll(/\s+/gu, ' ').trim();
}

function excerpt(value: string, limit: number): string {
  if (value.length <= limit) return value;
  if (limit < 12) return value.slice(0, limit);
  const headLength = Math.ceil((limit - 3) * 0.7);
  const tailLength = limit - 3 - headLength;
  return `${value.slice(0, headLength)}…${value.slice(-tailLength)}`;
}
