import { activateLore, type LoreActivationEntry, type LoreActivationResult } from '@velora/prompts';
import { z } from 'zod';

interface LoreEntryDatabaseRow {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly keysJson: string;
  readonly secondaryKeysJson: string;
  readonly enabled: number;
  readonly priority: number;
  readonly position: number;
  readonly caseSensitive: number;
  readonly matchWholeWord: number;
  readonly scanDepth: number;
  readonly tokenBudget: number;
}

const keysSchema = z.array(z.string().trim().min(1).max(120)).max(50);

export async function readActiveLore(
  database: D1Database,
  input: {
    readonly conversationId: string;
    readonly characterId: string;
    readonly userId: string;
    readonly contextMessages: readonly string[];
    readonly characterName: string;
    readonly userName: string;
    readonly totalTokenBudget: number;
    readonly forceActivateAll?: boolean;
  },
): Promise<LoreActivationResult> {
  const result = await database
    .prepare(
      `WITH attached_books(lorebook_id) AS (
         SELECT cl.lorebook_id FROM character_lorebooks cl
         JOIN lorebooks l ON l.id = cl.lorebook_id
         WHERE cl.character_id = ? AND cl.enabled = 1 AND l.deleted_at IS NULL
         UNION
         SELECT cl.lorebook_id FROM conversation_lorebooks cl
         JOIN lorebooks l ON l.id = cl.lorebook_id
         WHERE cl.conversation_id = ? AND cl.enabled = 1 AND l.deleted_at IS NULL
           AND (l.owner_id = ? OR l.visibility IN ('PUBLIC', 'UNLISTED'))
       )
       SELECT e.id, e.title, e.content, e.keys_json AS keysJson,
        e.secondary_keys_json AS secondaryKeysJson, e.enabled, e.priority, e.position,
        e.case_sensitive AS caseSensitive, e.match_whole_word AS matchWholeWord,
        e.scan_depth AS scanDepth, e.token_budget AS tokenBudget
       FROM lorebook_entries e JOIN attached_books a ON a.lorebook_id = e.lorebook_id
       WHERE e.enabled = 1 ORDER BY e.priority DESC, e.position, e.id`,
    )
    .bind(input.characterId, input.conversationId, input.userId)
    .all<LoreEntryDatabaseRow>();
  const entries = result.results.map(toActivationEntry);
  return activateLore({
    entries,
    contextMessages: input.contextMessages,
    totalTokenBudget: input.totalTokenBudget,
    variables: { char: input.characterName, user: input.userName },
    ...(input.forceActivateAll === undefined ? {} : { forceActivateAll: input.forceActivateAll }),
  });
}

function toActivationEntry(row: LoreEntryDatabaseRow): LoreActivationEntry {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    keys: parseKeys(row.keysJson),
    secondaryKeys: parseKeys(row.secondaryKeysJson),
    enabled: row.enabled === 1,
    priority: row.priority,
    position: row.position,
    caseSensitive: row.caseSensitive === 1,
    matchWholeWord: row.matchWholeWord === 1,
    scanDepth: row.scanDepth,
    tokenBudget: row.tokenBudget,
  };
}

function parseKeys(value: string): readonly string[] {
  try {
    return keysSchema.parse(JSON.parse(value));
  } catch {
    return [];
  }
}
