import {
  loreAttachmentSchema,
  lorebookImportSchema,
  lorebookInputSchema,
  lorebookPatchSchema,
  loreEntryInputSchema,
  loreEntryPatchSchema,
  type LoreEntryInput,
  type LorebookTransfer,
} from '@velora/domain';
import { AppError, asError, createId, nowMs } from '@velora/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireOwnedConversation } from './conversation-routes';
import { readActiveLore } from './lore-runtime';
import { sha256 } from './telegram-auth';
import type { Env, Variables } from './types';

interface LorebookEnvironment {
  Bindings: Env;
  Variables: Variables;
}

interface LorebookRow {
  readonly id: string;
  readonly ownerId: string;
  readonly coverMediaFileId: string | null;
  readonly name: string;
  readonly description: string;
  readonly visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface LoreEntryRow {
  readonly id: string;
  readonly lorebookId: string;
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
  readonly createdAt: number;
  readonly updatedAt: number;
}

const lorebookProjection = `id, owner_id AS ownerId, cover_media_file_id AS coverMediaFileId,
  name, description, visibility,
  created_at AS createdAt, updated_at AS updatedAt`;
const entryProjection = `id, lorebook_id AS lorebookId, title, content, keys_json AS keysJson,
  secondary_keys_json AS secondaryKeysJson, enabled, priority, position,
  case_sensitive AS caseSensitive, match_whole_word AS matchWholeWord,
  scan_depth AS scanDepth, token_budget AS tokenBudget,
  created_at AS createdAt, updated_at AS updatedAt`;

export const lorebookRoutes = new Hono<LorebookEnvironment>();

const ownedLorebookQuerySchema = z.object({
  q: z.string().trim().max(80).default(''),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

lorebookRoutes.get('/lorebooks', async (context) => {
  const query = ownedLorebookQuerySchema.parse(context.req.query());
  const order = query.sort === 'oldest' ? 'ASC' : 'DESC';
  const searchCondition = query.q ? 'AND (instr(name, ?) > 0 OR instr(description, ?) > 0)' : '';
  const values = query.q
    ? [context.get('principal').userId, query.q, query.q]
    : [context.get('principal').userId];
  const result = await context.env.DB.prepare(
    `SELECT ${lorebookProjection},
     (SELECT COUNT(*) FROM lorebook_entries e WHERE e.lorebook_id = l.id) AS entryCount
     FROM lorebooks l WHERE owner_id = ? AND deleted_at IS NULL
     ${searchCondition} ORDER BY updated_at ${order}, id ${order} LIMIT 100`,
  )
    .bind(...values)
    .all<LorebookRow & { entryCount: number }>();
  return context.json({ items: result.results });
});

lorebookRoutes.post('/lorebooks', async (context) => {
  const input = lorebookInputSchema.parse(await context.req.json());
  const principal = context.get('principal');
  if (input.coverMediaFileId) {
    await requireOwnedCoverMedia(context.env.DB, principal.userId, input.coverMediaFileId);
  }
  const id = createId();
  const timestamp = nowMs();
  await context.env.DB.prepare(
    `INSERT INTO lorebooks
     (id, owner_id, cover_media_file_id, name, description, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      principal.userId,
      input.coverMediaFileId,
      input.name,
      input.description,
      input.visibility,
      timestamp,
      timestamp,
    )
    .run();
  return context.json(
    await getOwnedLorebook(context.env.DB, context.get('principal').userId, id),
    201,
  );
});

lorebookRoutes.post('/lorebooks/import', async (context) => {
  const principal = context.get('principal');
  const input = lorebookImportSchema.parse(await context.req.json());
  const scope = `lorebook-import:${principal.userId}`;
  const requestHash = await sha256(JSON.stringify(input.transfer));
  const existing = await readLorebookImport(context.env.DB, scope, input.idempotencyKey);
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        'Этот ключ уже использован для другого импорта.',
        409,
      );
    }
    return context.json(existing.response);
  }
  const bookId = createId();
  const timestamp = nowMs();
  const response = { id: bookId, importedEntries: input.transfer.entries.length };
  const statements: D1PreparedStatement[] = [
    context.env.DB.prepare(
      `INSERT INTO lorebooks
       (id, owner_id, name, description, visibility, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'PRIVATE', ?, ?)`,
    ).bind(
      bookId,
      principal.userId,
      input.transfer.book.name,
      input.transfer.book.description,
      timestamp,
      timestamp,
    ),
    ...input.transfer.entries.map((entry) =>
      entryInsertStatement(context.env.DB, createId(), bookId, entry, timestamp),
    ),
    context.env.DB.prepare(
      `INSERT INTO idempotency_keys
       (scope, key, request_hash, response_status, response_json, created_at, expires_at)
       VALUES (?, ?, ?, 201, ?, ?, ?)`,
    ).bind(
      scope,
      input.idempotencyKey,
      requestHash,
      JSON.stringify(response),
      timestamp,
      timestamp + 24 * 60 * 60 * 1000,
    ),
  ];
  try {
    await context.env.DB.batch(statements);
  } catch (error) {
    if (!isConstraintError(error)) throw error;
    const raced = await readLorebookImport(context.env.DB, scope, input.idempotencyKey);
    if (raced?.requestHash !== requestHash) throw error;
    return context.json(raced.response);
  }
  return context.json(response, 201);
});

lorebookRoutes.get('/lorebooks/:lorebookId', async (context) => {
  const principal = context.get('principal');
  const book = await getOwnedLorebook(
    context.env.DB,
    principal.userId,
    context.req.param('lorebookId'),
  );
  return context.json({ ...book, entries: await listEntries(context.env.DB, book.id) });
});

lorebookRoutes.get('/lorebooks/:lorebookId/export', async (context) => {
  const principal = context.get('principal');
  const book = await getOwnedLorebook(
    context.env.DB,
    principal.userId,
    context.req.param('lorebookId'),
  );
  const transfer: LorebookTransfer = {
    format: 'velora-lorebook',
    version: 1,
    book: { name: book.name, description: book.description, visibility: book.visibility },
    entries: await listEntriesForTransfer(context.env.DB, book.id),
  };
  context.header('cache-control', 'private, no-store');
  return context.json(transfer);
});

lorebookRoutes.patch('/lorebooks/:lorebookId', async (context) => {
  const principal = context.get('principal');
  const current = await getOwnedLorebook(
    context.env.DB,
    principal.userId,
    context.req.param('lorebookId'),
  );
  const input = lorebookPatchSchema.parse(await context.req.json());
  const coverMediaFileId =
    input.coverMediaFileId === undefined ? current.coverMediaFileId : input.coverMediaFileId;
  if (coverMediaFileId) {
    await requireOwnedCoverMedia(context.env.DB, principal.userId, coverMediaFileId);
  }
  await context.env.DB.prepare(
    `UPDATE lorebooks SET name = ?, description = ?, visibility = ?, cover_media_file_id = ?,
     updated_at = ?
     WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
  )
    .bind(
      input.name ?? current.name,
      input.description ?? current.description,
      input.visibility ?? current.visibility,
      coverMediaFileId,
      nowMs(),
      current.id,
      principal.userId,
    )
    .run();
  return context.json(await getOwnedLorebook(context.env.DB, principal.userId, current.id));
});

async function requireOwnedCoverMedia(
  database: D1Database,
  ownerId: string,
  mediaId: string,
): Promise<void> {
  const row = await database
    .prepare(
      `SELECT 1 AS found FROM file_objects
       WHERE id = ? AND owner_id = ? AND deleted_at IS NULL
         AND mime_type IN ('image/jpeg', 'image/png', 'image/webp')`,
    )
    .bind(mediaId, ownerId)
    .first<{ found: number }>();
  if (!row) {
    throw new AppError('MEDIA_NOT_FOUND', 'Изображение обложки не найдено.', 404);
  }
}

lorebookRoutes.get('/lorebooks/:lorebookId/attachments', async (context) => {
  const principal = context.get('principal');
  const book = await getOwnedLorebook(
    context.env.DB,
    principal.userId,
    context.req.param('lorebookId'),
  );
  const [characters, conversations] = await Promise.all([
    context.env.DB.prepare(
      `SELECT cl.character_id AS id, cl.enabled FROM character_lorebooks cl
         JOIN characters c ON c.id = cl.character_id
         WHERE cl.lorebook_id = ? AND c.owner_id = ? AND c.deleted_at IS NULL`,
    )
      .bind(book.id, principal.userId)
      .all<{ id: string; enabled: number }>(),
    context.env.DB.prepare(
      `SELECT cl.conversation_id AS id, cl.enabled FROM conversation_lorebooks cl
         JOIN conversations c ON c.id = cl.conversation_id
         WHERE cl.lorebook_id = ? AND c.user_id = ? AND c.deleted_at IS NULL`,
    )
      .bind(book.id, principal.userId)
      .all<{ id: string; enabled: number }>(),
  ]);
  return context.json({
    characters: characters.results.map((row) => ({ id: row.id, enabled: row.enabled === 1 })),
    conversations: conversations.results.map((row) => ({ id: row.id, enabled: row.enabled === 1 })),
  });
});

lorebookRoutes.delete('/lorebooks/:lorebookId', async (context) => {
  const principal = context.get('principal');
  const current = await getOwnedLorebook(
    context.env.DB,
    principal.userId,
    context.req.param('lorebookId'),
  );
  await context.env.DB.batch([
    context.env.DB.prepare('DELETE FROM character_lorebooks WHERE lorebook_id = ?').bind(
      current.id,
    ),
    context.env.DB.prepare('DELETE FROM conversation_lorebooks WHERE lorebook_id = ?').bind(
      current.id,
    ),
    context.env.DB.prepare(
      'UPDATE lorebooks SET deleted_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?',
    ).bind(nowMs(), nowMs(), current.id, principal.userId),
  ]);
  return context.json({ deleted: true });
});

lorebookRoutes.post('/lorebooks/:lorebookId/entries', async (context) => {
  const principal = context.get('principal');
  const book = await getOwnedLorebook(
    context.env.DB,
    principal.userId,
    context.req.param('lorebookId'),
  );
  const input = loreEntryInputSchema.parse(await context.req.json());
  const id = createId();
  const timestamp = nowMs();
  await insertEntry(context.env.DB, id, book.id, input, timestamp);
  return context.json(
    toEntryResponse(await getOwnedEntry(context.env.DB, principal.userId, book.id, id)),
    201,
  );
});

lorebookRoutes.patch('/lorebooks/:lorebookId/entries/:entryId', async (context) => {
  const principal = context.get('principal');
  const bookId = context.req.param('lorebookId');
  const current = await getOwnedEntry(
    context.env.DB,
    principal.userId,
    bookId,
    context.req.param('entryId'),
  );
  const input = loreEntryPatchSchema.parse(await context.req.json());
  await context.env.DB.prepare(
    `UPDATE lorebook_entries SET title = ?, content = ?, keys_json = ?, secondary_keys_json = ?,
     enabled = ?, priority = ?, position = ?, case_sensitive = ?, match_whole_word = ?,
     scan_depth = ?, token_budget = ?, updated_at = ? WHERE id = ? AND lorebook_id = ?`,
  )
    .bind(
      input.title ?? current.title,
      input.content ?? current.content,
      JSON.stringify(input.keys ?? parseKeys(current.keysJson)),
      JSON.stringify(input.secondaryKeys ?? parseKeys(current.secondaryKeysJson)),
      booleanInt(input.enabled ?? current.enabled === 1),
      input.priority ?? current.priority,
      input.position ?? current.position,
      booleanInt(input.caseSensitive ?? current.caseSensitive === 1),
      booleanInt(input.matchWholeWord ?? current.matchWholeWord === 1),
      input.scanDepth ?? current.scanDepth,
      input.tokenBudget ?? current.tokenBudget,
      nowMs(),
      current.id,
      current.lorebookId,
    )
    .run();
  return context.json(
    toEntryResponse(await getOwnedEntry(context.env.DB, principal.userId, bookId, current.id)),
  );
});

lorebookRoutes.delete('/lorebooks/:lorebookId/entries/:entryId', async (context) => {
  const principal = context.get('principal');
  const entry = await getOwnedEntry(
    context.env.DB,
    principal.userId,
    context.req.param('lorebookId'),
    context.req.param('entryId'),
  );
  await context.env.DB.prepare('DELETE FROM lorebook_entries WHERE id = ? AND lorebook_id = ?')
    .bind(entry.id, entry.lorebookId)
    .run();
  await context.env.DB.prepare('UPDATE lorebooks SET updated_at = ? WHERE id = ?')
    .bind(nowMs(), entry.lorebookId)
    .run();
  return context.json({ deleted: true });
});

lorebookRoutes.get('/characters/:characterId/lorebooks', async (context) => {
  const principal = context.get('principal');
  await requireOwnedCharacter(context.env.DB, principal.userId, context.req.param('characterId'));
  const result = await context.env.DB.prepare(
    `SELECT ${lorebookProjection}, cl.enabled FROM character_lorebooks cl
     JOIN lorebooks l ON l.id = cl.lorebook_id
     WHERE cl.character_id = ? AND l.deleted_at IS NULL ORDER BY l.name`,
  )
    .bind(context.req.param('characterId'))
    .all<LorebookRow & { enabled: number }>();
  return context.json({
    items: result.results.map((row) => ({ ...row, enabled: row.enabled === 1 })),
  });
});

lorebookRoutes.put('/characters/:characterId/lorebooks/:lorebookId', async (context) => {
  const principal = context.get('principal');
  const characterId = context.req.param('characterId');
  await requireOwnedCharacter(context.env.DB, principal.userId, characterId);
  await requireAvailableLorebook(context.env.DB, principal.userId, context.req.param('lorebookId'));
  const input = loreAttachmentSchema.parse(await context.req.json());
  await context.env.DB.prepare(
    `INSERT INTO character_lorebooks (character_id, lorebook_id, enabled) VALUES (?, ?, ?)
     ON CONFLICT(character_id, lorebook_id) DO UPDATE SET enabled = excluded.enabled`,
  )
    .bind(characterId, context.req.param('lorebookId'), booleanInt(input.enabled))
    .run();
  return context.json({ attached: true, enabled: input.enabled });
});

lorebookRoutes.delete('/characters/:characterId/lorebooks/:lorebookId', async (context) => {
  const principal = context.get('principal');
  await requireOwnedCharacter(context.env.DB, principal.userId, context.req.param('characterId'));
  await context.env.DB.prepare(
    'DELETE FROM character_lorebooks WHERE character_id = ? AND lorebook_id = ?',
  )
    .bind(context.req.param('characterId'), context.req.param('lorebookId'))
    .run();
  return context.json({ detached: true });
});

lorebookRoutes.get('/conversations/:conversationId/lorebooks', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  const result = await context.env.DB.prepare(
    `SELECT ${lorebookProjection}, cl.enabled FROM conversation_lorebooks cl
     JOIN lorebooks l ON l.id = cl.lorebook_id
     WHERE cl.conversation_id = ? AND l.deleted_at IS NULL ORDER BY l.name`,
  )
    .bind(conversation.id)
    .all<LorebookRow & { enabled: number }>();
  return context.json({
    items: result.results.map((row) => ({ ...row, enabled: row.enabled === 1 })),
  });
});

lorebookRoutes.put('/conversations/:conversationId/lorebooks/:lorebookId', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  await requireAvailableLorebook(context.env.DB, principal.userId, context.req.param('lorebookId'));
  const input = loreAttachmentSchema.parse(await context.req.json());
  await context.env.DB.prepare(
    `INSERT INTO conversation_lorebooks (conversation_id, lorebook_id, enabled) VALUES (?, ?, ?)
     ON CONFLICT(conversation_id, lorebook_id) DO UPDATE SET enabled = excluded.enabled`,
  )
    .bind(conversation.id, context.req.param('lorebookId'), booleanInt(input.enabled))
    .run();
  return context.json({ attached: true, enabled: input.enabled });
});

lorebookRoutes.delete('/conversations/:conversationId/lorebooks/:lorebookId', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  await context.env.DB.prepare(
    'DELETE FROM conversation_lorebooks WHERE conversation_id = ? AND lorebook_id = ?',
  )
    .bind(conversation.id, context.req.param('lorebookId'))
    .run();
  return context.json({ detached: true });
});

lorebookRoutes.get('/conversations/:conversationId/lore/active', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  const character = await context.env.DB.prepare(
    'SELECT name FROM character_versions WHERE id = ? AND character_id = ?',
  )
    .bind(conversation.characterVersionId, conversation.characterId)
    .first<{ name: string }>();
  if (!character)
    throw new AppError('CHARACTER_VERSION_MISSING', 'Версия персонажа недоступна.', 409);
  const history = conversation.activeMessageId
    ? await context.env.DB.prepare(
        `WITH RECURSIVE branch(id, parentId, content, depth) AS (
           SELECT id, parent_message_id, content, 0 FROM messages
           WHERE id = ? AND conversation_id = ? AND deleted_at IS NULL
           UNION ALL
           SELECT m.id, m.parent_message_id, m.content, b.depth + 1 FROM messages m
           JOIN branch b ON m.id = b.parentId
           WHERE m.conversation_id = ? AND m.deleted_at IS NULL AND b.depth < 199
         ) SELECT content FROM branch ORDER BY depth DESC`,
      )
        .bind(conversation.activeMessageId, conversation.id, conversation.id)
        .all<{ content: string }>()
    : { results: [] };
  const active = await readActiveLore(context.env.DB, {
    conversationId: conversation.id,
    characterId: conversation.characterId,
    userId: principal.userId,
    contextMessages: history.results.map((message) => message.content),
    characterName: character.name,
    userName: await resolveConversationUserName(context.env.DB, conversation),
    totalTokenBudget: 1_600,
  });
  return context.json(active);
});

async function getOwnedLorebook(
  database: D1Database,
  userId: string,
  id: string,
): Promise<LorebookRow> {
  const row = await database
    .prepare(
      `SELECT ${lorebookProjection} FROM lorebooks WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
    )
    .bind(id, userId)
    .first<LorebookRow>();
  if (!row) throw new AppError('LOREBOOK_NOT_FOUND', 'Книга мира не найдена.', 404);
  return row;
}

async function requireAvailableLorebook(
  database: D1Database,
  userId: string,
  id: string,
): Promise<void> {
  const row = await database
    .prepare(
      `SELECT 1 AS found FROM lorebooks WHERE id = ? AND deleted_at IS NULL
     AND (owner_id = ? OR visibility IN ('PUBLIC', 'UNLISTED'))`,
    )
    .bind(id, userId)
    .first<{ found: number }>();
  if (!row) throw new AppError('LOREBOOK_NOT_FOUND', 'Книга мира недоступна.', 404);
}

async function requireOwnedCharacter(
  database: D1Database,
  userId: string,
  id: string,
): Promise<void> {
  const row = await database
    .prepare(
      'SELECT 1 AS found FROM characters WHERE id = ? AND owner_id = ? AND deleted_at IS NULL',
    )
    .bind(id, userId)
    .first<{ found: number }>();
  if (!row) throw new AppError('CHARACTER_NOT_FOUND', 'Персонаж не найден.', 404);
}

async function listEntries(database: D1Database, lorebookId: string) {
  const result = await database
    .prepare(
      `SELECT ${entryProjection} FROM lorebook_entries WHERE lorebook_id = ? ORDER BY priority DESC, position, id`,
    )
    .bind(lorebookId)
    .all<LoreEntryRow>();
  return result.results.map(toEntryResponse);
}

async function getOwnedEntry(
  database: D1Database,
  userId: string,
  lorebookId: string,
  entryId: string,
): Promise<LoreEntryRow> {
  await getOwnedLorebook(database, userId, lorebookId);
  const row = await database
    .prepare(`SELECT ${entryProjection} FROM lorebook_entries WHERE id = ? AND lorebook_id = ?`)
    .bind(entryId, lorebookId)
    .first<LoreEntryRow>();
  if (!row) throw new AppError('LORE_ENTRY_NOT_FOUND', 'Запись книги мира не найдена.', 404);
  return row;
}

async function insertEntry(
  database: D1Database,
  id: string,
  lorebookId: string,
  input: LoreEntryInput,
  timestamp: number,
): Promise<void> {
  await database.batch([
    database
      .prepare(
        `INSERT INTO lorebook_entries
       (id, lorebook_id, title, content, keys_json, secondary_keys_json, enabled, priority,
        position, case_sensitive, match_whole_word, scan_depth, token_budget, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        lorebookId,
        input.title,
        input.content,
        JSON.stringify(input.keys),
        JSON.stringify(input.secondaryKeys),
        booleanInt(input.enabled),
        input.priority,
        input.position,
        booleanInt(input.caseSensitive),
        booleanInt(input.matchWholeWord),
        input.scanDepth,
        input.tokenBudget,
        timestamp,
        timestamp,
      ),
    database
      .prepare('UPDATE lorebooks SET updated_at = ? WHERE id = ?')
      .bind(timestamp, lorebookId),
  ]);
}

function entryInsertStatement(
  database: D1Database,
  id: string,
  lorebookId: string,
  input: LoreEntryInput,
  timestamp: number,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO lorebook_entries
       (id, lorebook_id, title, content, keys_json, secondary_keys_json, enabled, priority,
        position, case_sensitive, match_whole_word, scan_depth, token_budget, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      lorebookId,
      input.title,
      input.content,
      JSON.stringify(input.keys),
      JSON.stringify(input.secondaryKeys),
      booleanInt(input.enabled),
      input.priority,
      input.position,
      booleanInt(input.caseSensitive),
      booleanInt(input.matchWholeWord),
      input.scanDepth,
      input.tokenBudget,
      timestamp,
      timestamp,
    );
}

async function listEntriesForTransfer(
  database: D1Database,
  lorebookId: string,
): Promise<LorebookTransfer['entries']> {
  const result = await database
    .prepare(
      `SELECT ${entryProjection} FROM lorebook_entries
       WHERE lorebook_id = ? ORDER BY position, priority DESC, id LIMIT 101`,
    )
    .bind(lorebookId)
    .all<LoreEntryRow>();
  if (result.results.length > 100) {
    throw new AppError('LOREBOOK_EXPORT_TOO_LARGE', 'Экспорт поддерживает до 100 записей.', 409);
  }
  return result.results.map((row) => {
    const response = toEntryResponse(row);
    return {
      title: response.title,
      content: response.content,
      keys: [...response.keys],
      secondaryKeys: [...response.secondaryKeys],
      enabled: response.enabled,
      priority: response.priority,
      position: response.position,
      caseSensitive: response.caseSensitive,
      matchWholeWord: response.matchWholeWord,
      scanDepth: response.scanDepth,
      tokenBudget: response.tokenBudget,
    };
  });
}

async function readLorebookImport(
  database: D1Database,
  scope: string,
  key: string,
): Promise<{
  readonly requestHash: string;
  readonly response: { readonly id: string; readonly importedEntries: number };
} | null> {
  const row = await database
    .prepare(
      `SELECT request_hash AS requestHash, response_json AS responseJson
       FROM idempotency_keys WHERE scope = ? AND key = ?`,
    )
    .bind(scope, key)
    .first<{ requestHash: string; responseJson: string | null }>();
  if (!row?.responseJson) return null;
  const parsed: unknown = JSON.parse(row.responseJson);
  if (!isImportResponse(parsed)) throw new Error('LOREBOOK_IMPORT_RESPONSE_CORRUPT');
  return { requestHash: row.requestHash, response: parsed };
}

function isImportResponse(
  value: unknown,
): value is { readonly id: string; readonly importedEntries: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'importedEntries' in value &&
    typeof value.importedEntries === 'number'
  );
}

function isConstraintError(error: unknown): boolean {
  return /UNIQUE|constraint/iu.test(asError(error).message);
}

function toEntryResponse(row: LoreEntryRow) {
  return {
    id: row.id,
    lorebookId: row.lorebookId,
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseKeys(value: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed;
  } catch {
    // Corrupt JSON fails closed and cannot activate an entry.
  }
  return [];
}

function booleanInt(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

async function resolveConversationUserName(
  database: D1Database,
  conversation: Awaited<ReturnType<typeof requireOwnedConversation>>,
): Promise<string> {
  const settings = await database
    .prepare(
      'SELECT persona_mode AS personaMode FROM conversation_settings WHERE conversation_id = ?',
    )
    .bind(conversation.id)
    .first<{ personaMode: 'SNAPSHOT' | 'LIVE' }>();
  if (settings?.personaMode === 'LIVE' && conversation.personaId) {
    const persona = await database
      .prepare('SELECT name FROM personas WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
      .bind(conversation.personaId, conversation.userId)
      .first<{ name: string }>();
    if (persona) return persona.name;
  }
  if (conversation.personaSnapshotJson) {
    try {
      const snapshot: unknown = JSON.parse(conversation.personaSnapshotJson);
      if (
        typeof snapshot === 'object' &&
        snapshot !== null &&
        'name' in snapshot &&
        typeof snapshot.name === 'string'
      ) {
        return snapshot.name;
      }
    } catch {
      // Fall back to the authenticated profile when a legacy snapshot is corrupt.
    }
  }
  const user = await database
    .prepare('SELECT display_name AS displayName FROM users WHERE id = ? AND deleted_at IS NULL')
    .bind(conversation.userId)
    .first<{ displayName: string }>();
  return user?.displayName ?? 'User';
}
