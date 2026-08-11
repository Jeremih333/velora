import {
  conversationCreateSchema,
  conversationPatchSchema,
  memoryEditSchema,
  memoryJobSchema,
  memoryRestoreSchema,
  messageCreateSchema,
  messageEditSchema,
} from '@velora/domain';
import { AppError, asError, createId, nowMs } from '@velora/shared';
import { renderTemplate } from '@velora/prompts';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from './types';
import { enqueueMemoryJob, processDueMemoryJobs, readMemoryJob } from './memory-jobs';
import {
  readEffectivePlan,
  requireModelProfile as requirePlanModelProfile,
  reserveAdvancedOperation,
} from './plans';

interface ConversationEnvironment {
  Bindings: Env;
  Variables: Variables;
}

export interface OwnedConversationRow {
  readonly id: string;
  readonly userId: string;
  readonly characterId: string;
  readonly characterVersionId: string;
  readonly personaId: string | null;
  readonly personaSnapshotJson: string | null;
  readonly title: string;
  readonly activeMessageId: string | null;
  readonly state: 'ACTIVE' | 'ARCHIVED';
  readonly isPreview: number;
  readonly memoryStale: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface ConversationListRow extends OwnedConversationRow {
  readonly characterName: string;
  readonly characterAvatarFileId: string | null;
  readonly lastMessage: string | null;
}

interface ConversationSettingsRow {
  readonly modelProfile: 'BALANCED' | 'CREATIVE' | 'PREMIUM';
  readonly temperature: number;
  readonly maxOutputTokens: number;
  readonly responseLength: 'SHORT' | 'MEDIUM' | 'LONG';
  readonly customInstructions: string;
  readonly personaMode: 'SNAPSHOT' | 'LIVE';
}

interface CharacterStartRow {
  readonly id: string;
  readonly activeVersionId: string;
  readonly name: string;
  readonly firstMessage: string;
  readonly alternateGreetingsJson: string;
  readonly description: string;
  readonly scenario: string;
  readonly contentRating: 'SAFE' | 'MATURE';
}

interface PersonaSnapshotRow {
  readonly id: string;
  readonly name: string;
  readonly shortDescription: string;
  readonly longDescription: string;
  readonly personality: string;
  readonly appearance: string;
  readonly speakingStyle: string;
  readonly background: string;
  readonly pronouns: string;
  readonly representedAge: string | null;
  readonly customNotes: string;
}

interface MessageRow {
  readonly id: string;
  readonly conversationId: string;
  readonly role: 'USER' | 'ASSISTANT' | 'SYSTEM_INTERNAL';
  readonly content: string;
  readonly status: 'PENDING' | 'STREAMING' | 'COMPLETED' | 'STOPPED' | 'FAILED' | 'MODERATED';
  readonly parentMessageId: string | null;
  readonly generationGroupId: string | null;
  readonly model: string | null;
  readonly provider: string | null;
  readonly metadataJson: string;
  readonly createdAt: number;
  readonly editedAt: number | null;
}

interface MessageResponse extends Omit<MessageRow, 'metadataJson'> {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly variantIndex: number;
  readonly variantCount: number;
  readonly variantIds: readonly string[];
}

interface MemoryVersionRow {
  readonly id: string;
  readonly content: string;
  readonly sourceType: 'AUTO_SUMMARY' | 'FULL_REGENERATION' | 'MANUAL_EDIT' | 'RESTORE';
  readonly fromMessageId: string | null;
  readonly toMessageId: string | null;
  readonly createdAt: number;
  readonly previousVersionId: string | null;
}

const listQuerySchema = z.object({
  state: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const messageQuerySchema = z.object({
  view: z.enum(['active', 'tree']).default('active'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
const branchActivationQuerySchema = z.object({
  descend: z.enum(['0', '1']).default('0'),
});

const conversationProjection = `c.id, c.user_id AS userId, c.character_id AS characterId,
  c.character_version_id AS characterVersionId, c.persona_id AS personaId,
  c.persona_snapshot_json AS personaSnapshotJson, c.title,
  c.active_message_id AS activeMessageId, c.state, c.is_preview AS isPreview,
  c.memory_stale AS memoryStale,
  c.created_at AS createdAt, c.updated_at AS updatedAt`;
const settingsProjection = `model_profile AS modelProfile, temperature,
  max_output_tokens AS maxOutputTokens, response_length AS responseLength,
  custom_instructions AS customInstructions, persona_mode AS personaMode`;
const messageProjection = `id, conversation_id AS conversationId, role, content, status,
  parent_message_id AS parentMessageId, generation_group_id AS generationGroupId,
  model, provider, metadata_json AS metadataJson, created_at AS createdAt,
  edited_at AS editedAt`;

export const conversationRoutes = new Hono<ConversationEnvironment>();

conversationRoutes.get('/', async (context) => {
  const principal = context.get('principal');
  const query = listQuerySchema.parse(context.req.query());
  const stateCondition =
    query.state === 'ALL' ? "c.state IN ('ACTIVE', 'ARCHIVED')" : 'c.state = ?';
  const values: (string | number)[] = [principal.userId];
  if (query.state !== 'ALL') values.push(query.state);
  values.push(principal.userId, principal.userId);
  values.push(query.limit);
  const result = await context.env.DB.prepare(
    `SELECT ${conversationProjection}, v.name AS characterName,
       ch.avatar_file_id AS characterAvatarFileId,
       (SELECT content FROM messages lm WHERE lm.id = c.active_message_id) AS lastMessage
     FROM conversations c
     JOIN characters ch ON ch.id = c.character_id
     JOIN character_versions v ON v.id = c.character_version_id
     WHERE c.user_id = ? AND c.deleted_at IS NULL AND ${stateCondition}
       AND NOT EXISTS (SELECT 1 FROM user_blocks ub
         WHERE (ub.blocker_id = ? AND ub.blocked_user_id = ch.owner_id)
            OR (ub.blocker_id = ch.owner_id AND ub.blocked_user_id = ?))
     ORDER BY c.updated_at DESC LIMIT ?`,
  )
    .bind(...values)
    .all<ConversationListRow>();
  return context.json({ items: result.results.map(toConversationSummary) });
});

conversationRoutes.post('/', async (context) => {
  const principal = context.get('principal');
  const input = conversationCreateSchema.parse(await context.req.json());
  const existing = await readIdempotentResource(
    context.env.DB,
    principal.userId,
    'CREATE_CONVERSATION',
    input.idempotencyKey,
  );
  if (existing) {
    return context.json(
      await conversationDetail(context.env.DB, principal.userId, existing, principal.role),
    );
  }
  const character = await requireAvailableCharacter(
    context.env.DB,
    principal.userId,
    input.characterId,
    input.preview,
  );
  if (character.contentRating === 'MATURE' && principal.ageGateAcceptedAt === null) {
    throw new AppError(
      'AGE_GATE_REQUIRED',
      'Для этого персонажа подтвердите совершеннолетие.',
      403,
    );
  }
  const personaId = await resolvePersonaId(context.env.DB, principal.userId, input.personaId);
  const persona = personaId
    ? await requireOwnedPersonaSnapshot(context.env.DB, principal.userId, personaId)
    : null;
  const user = await context.env.DB.prepare(
    'SELECT display_name AS displayName FROM users WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(principal.userId)
    .first<{ displayName: string }>();
  const greetingOptions = [
    character.firstMessage,
    ...parseAlternateGreetings(character.alternateGreetingsJson),
  ];
  const selectedGreeting = greetingOptions[input.greetingIndex];
  if (selectedGreeting === undefined) {
    throw new AppError('GREETING_NOT_FOUND', 'Выбранное приветствие недоступно.', 400);
  }
  const identityName = persona?.name ?? user?.displayName ?? 'User';
  const renderedGreeting = renderTemplate(selectedGreeting, {
    char: character.name,
    user: identityName,
    persona: persona?.name ?? '',
    scenario: character.scenario,
    description: character.description,
    memory: '',
  }).value;
  const conversationId = createId();
  const firstMessageId = createId();
  const timestamp = nowMs();
  const title = input.title ?? (input.preview ? `Тест · ${character.name}` : character.name);
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO conversations (
          id, user_id, character_id, character_version_id, persona_id,
          persona_snapshot_json, title, active_message_id, is_preview, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        conversationId,
        principal.userId,
        character.id,
        character.activeVersionId,
        personaId,
        persona ? JSON.stringify(persona) : null,
        title,
        firstMessageId,
        input.preview ? 1 : 0,
        timestamp,
        timestamp,
      ),
      context.env.DB.prepare(
        `INSERT INTO conversation_settings (conversation_id, model_profile, updated_at)
         SELECT ?, generation_profile, ? FROM user_settings WHERE user_id = ?`,
      ).bind(conversationId, timestamp, principal.userId),
      context.env.DB.prepare(
        `INSERT INTO messages (id, conversation_id, role, content, status, created_at)
         VALUES (?, ?, 'ASSISTANT', ?, 'COMPLETED', ?)`,
      ).bind(firstMessageId, conversationId, renderedGreeting, timestamp),
      context.env.DB.prepare(
        'INSERT INTO conversation_memory (conversation_id, updated_at) VALUES (?, ?)',
      ).bind(conversationId, timestamp),
      idempotencyInsert(
        context.env.DB,
        principal.userId,
        'CREATE_CONVERSATION',
        input.idempotencyKey,
        conversationId,
        timestamp,
      ),
    ]);
  } catch (error) {
    if (isConstraintError(error)) {
      const raced = await readIdempotentResource(
        context.env.DB,
        principal.userId,
        'CREATE_CONVERSATION',
        input.idempotencyKey,
      );
      if (raced)
        return context.json(
          await conversationDetail(context.env.DB, principal.userId, raced, principal.role),
        );
    }
    throw error;
  }
  return context.json(
    await conversationDetail(context.env.DB, principal.userId, conversationId, principal.role),
    201,
  );
});

conversationRoutes.get('/:conversationId', async (context) => {
  const principal = context.get('principal');
  return context.json(
    await conversationDetail(
      context.env.DB,
      principal.userId,
      context.req.param('conversationId'),
      principal.role,
    ),
  );
});

conversationRoutes.patch('/:conversationId', async (context) => {
  const principal = context.get('principal');
  const id = context.req.param('conversationId');
  const current = await requireOwnedConversation(context.env.DB, principal.userId, id);
  const currentSettings = await readConversationSettings(context.env.DB, id);
  const patch = conversationPatchSchema.parse(await context.req.json());
  if (patch.modelProfile) {
    requirePlanModelProfile(
      await readEffectivePlan(context.env.DB, principal.userId),
      patch.modelProfile,
    );
  }
  const timestamp = nowMs();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE conversations SET title = ?, state = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).bind(
      patch.title ?? current.title,
      patch.state ?? current.state,
      timestamp,
      id,
      principal.userId,
    ),
    context.env.DB.prepare(
      `UPDATE conversation_settings SET model_profile = ?, temperature = ?,
       max_output_tokens = ?, response_length = ?, custom_instructions = ?,
       persona_mode = ?, updated_at = ? WHERE conversation_id = ?`,
    ).bind(
      patch.modelProfile ?? currentSettings.modelProfile,
      patch.temperature ?? currentSettings.temperature,
      patch.maxOutputTokens ?? currentSettings.maxOutputTokens,
      patch.responseLength ?? currentSettings.responseLength,
      patch.customInstructions ?? currentSettings.customInstructions,
      patch.personaMode ?? currentSettings.personaMode,
      timestamp,
      id,
    ),
  ]);
  return context.json(
    await conversationDetail(context.env.DB, principal.userId, id, principal.role),
  );
});

conversationRoutes.delete('/:conversationId', async (context) => {
  const principal = context.get('principal');
  const id = context.req.param('conversationId');
  await requireOwnedConversation(context.env.DB, principal.userId, id);
  const timestamp = nowMs();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE message_generations SET state = 'STOPPED', completed_at = ?
         WHERE conversation_id = ? AND state IN ('PENDING', 'STREAMING')`,
    ).bind(timestamp, id),
    context.env.DB.prepare(
      `UPDATE messages SET status = 'STOPPED'
         WHERE conversation_id = ? AND status IN ('PENDING', 'STREAMING')`,
    ).bind(id),
    context.env.DB.prepare(
      `UPDATE ai_requests SET status = 'REFUNDED', actual_cost_micros = 0,
         provider_actual_cost_micros = provider_estimated_cost_micros,
         completed_at = ?, error_code = 'CONVERSATION_DELETED'
         WHERE conversation_id = ? AND status IN ('RESERVED', 'STREAMING')`,
    ).bind(timestamp, id),
    context.env.DB.prepare('DELETE FROM generation_locks WHERE conversation_id = ?').bind(id),
    context.env.DB.prepare(
      `UPDATE conversations SET state = 'DELETED', deleted_at = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).bind(timestamp, timestamp, id, principal.userId),
  ]);
  return context.json({ deleted: true });
});

conversationRoutes.get('/:conversationId/messages', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  const query = messageQuerySchema.parse(context.req.query());
  if (query.view === 'tree') {
    const result = await context.env.DB.prepare(
      `SELECT ${messageProjection} FROM messages WHERE conversation_id = ? AND deleted_at IS NULL
       ORDER BY created_at ASC, id ASC LIMIT ?`,
    )
      .bind(conversation.id, query.limit)
      .all<MessageRow>();
    return context.json({
      items: withVariantInfo(
        result.results.filter((message) => message.role !== 'SYSTEM_INTERNAL'),
        result.results,
      ),
      activeMessageId: conversation.activeMessageId,
    });
  }
  if (!conversation.activeMessageId) return context.json({ items: [], activeMessageId: null });
  const result = await context.env.DB.prepare(
    `WITH RECURSIVE branch(
       id, conversationId, role, content, status, parentMessageId, generationGroupId,
       model, provider, metadataJson, createdAt, editedAt, depth
     ) AS (
       SELECT ${messageProjection}, 0 FROM messages
       WHERE id = ? AND conversation_id = ? AND deleted_at IS NULL
       UNION ALL
       SELECT ${messageProjection.replaceAll(/\b(id|conversation_id|role|content|status|parent_message_id|generation_group_id|model|provider|metadata_json|created_at|edited_at)\b/gu, 'm.$1')}, b.depth + 1
       FROM messages m JOIN branch b ON m.id = b.parentMessageId
       WHERE m.conversation_id = ? AND m.deleted_at IS NULL AND b.depth < ?
     ) SELECT id, conversationId, role, content, status, parentMessageId, generationGroupId,
       model, provider, metadataJson, createdAt, editedAt FROM branch ORDER BY depth DESC`,
  )
    .bind(conversation.activeMessageId, conversation.id, conversation.id, query.limit - 1)
    .all<MessageRow>();
  const variants = await context.env.DB.prepare(
    `SELECT ${messageProjection} FROM messages
     WHERE conversation_id = ? AND deleted_at IS NULL
       AND role IN ('USER', 'ASSISTANT')
     ORDER BY created_at ASC, id ASC LIMIT 500`,
  )
    .bind(conversation.id)
    .all<MessageRow>();
  return context.json({
    items: withVariantInfo(
      result.results.filter((message) => message.role !== 'SYSTEM_INTERNAL'),
      variants.results,
    ),
    activeMessageId: conversation.activeMessageId,
  });
});

conversationRoutes.post('/:conversationId/messages', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  requireActiveConversation(conversation);
  const input = messageCreateSchema.parse(await context.req.json());
  const existing = await readIdempotentResource(
    context.env.DB,
    principal.userId,
    'CREATE_MESSAGE',
    input.idempotencyKey,
  );
  if (existing)
    return context.json(
      toMessageResponse(await requireMessage(context.env.DB, conversation.id, existing)),
    );
  const parentId =
    input.parentMessageId === undefined ? conversation.activeMessageId : input.parentMessageId;
  if (parentId) {
    const parent = await requireMessage(context.env.DB, conversation.id, parentId);
    if (parent.status !== 'COMPLETED' && parent.status !== 'STOPPED') {
      throw new AppError('MESSAGE_NOT_READY', 'Ответ на это сообщение пока недоступен.', 409);
    }
  }
  const messageId = createId();
  const timestamp = nowMs();
  await insertMessageIdempotently(context.env.DB, {
    userId: principal.userId,
    conversationId: conversation.id,
    messageId,
    parentMessageId: parentId,
    content: input.content,
    metadataJson: '{}',
    operation: 'CREATE_MESSAGE',
    idempotencyKey: input.idempotencyKey,
    timestamp,
    role: 'USER',
  });
  const resolvedId =
    (await readIdempotentResource(
      context.env.DB,
      principal.userId,
      'CREATE_MESSAGE',
      input.idempotencyKey,
    )) ?? messageId;
  return context.json(
    toMessageResponse(await requireMessage(context.env.DB, conversation.id, resolvedId)),
    201,
  );
});

conversationRoutes.post('/:conversationId/messages/:messageId/edit', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  requireActiveConversation(conversation);
  const original = await requireMessage(
    context.env.DB,
    conversation.id,
    context.req.param('messageId'),
  );
  if (original.role === 'SYSTEM_INTERNAL') {
    throw new AppError('MESSAGE_EDIT_FORBIDDEN', 'Служебные сообщения нельзя редактировать.', 403);
  }
  const input = messageEditSchema.parse(await context.req.json());
  const existing = await readIdempotentResource(
    context.env.DB,
    principal.userId,
    'EDIT_MESSAGE',
    input.idempotencyKey,
  );
  if (existing)
    return context.json(
      toMessageResponse(await requireMessage(context.env.DB, conversation.id, existing)),
    );
  const messageId = createId();
  const timestamp = nowMs();
  await insertMessageIdempotently(context.env.DB, {
    userId: principal.userId,
    conversationId: conversation.id,
    messageId,
    parentMessageId: original.parentMessageId,
    content: input.content,
    metadataJson: JSON.stringify({ editedFromId: original.id }),
    operation: 'EDIT_MESSAGE',
    idempotencyKey: input.idempotencyKey,
    timestamp,
    memoryStale: true,
    role: original.role,
  });
  const resolvedId =
    (await readIdempotentResource(
      context.env.DB,
      principal.userId,
      'EDIT_MESSAGE',
      input.idempotencyKey,
    )) ?? messageId;
  return context.json(
    toMessageResponse(await requireMessage(context.env.DB, conversation.id, resolvedId)),
    201,
  );
});

conversationRoutes.put('/:conversationId/active-message/:messageId', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  requireActiveConversation(conversation);
  const message = await requireMessage(
    context.env.DB,
    conversation.id,
    context.req.param('messageId'),
  );
  if (
    message.role === 'SYSTEM_INTERNAL' ||
    (message.status !== 'COMPLETED' && message.status !== 'STOPPED')
  ) {
    throw new AppError('BRANCH_NOT_AVAILABLE', 'Эта ветка пока недоступна.', 409);
  }
  const activation = branchActivationQuerySchema.parse(context.req.query());
  const selected =
    activation.descend === '1'
      ? ((await context.env.DB.prepare(
          `WITH RECURSIVE descendants(id, createdAt, depth) AS (
             SELECT id, created_at, 0 FROM messages WHERE id = ? AND conversation_id = ?
             UNION ALL
             SELECT m.id, m.created_at, d.depth + 1 FROM messages m
             JOIN descendants d ON m.parent_message_id = d.id
             WHERE m.conversation_id = ? AND m.deleted_at IS NULL
               AND m.status IN ('COMPLETED', 'STOPPED')
           ) SELECT d.id FROM descendants d
           WHERE NOT EXISTS (
             SELECT 1 FROM messages child WHERE child.parent_message_id = d.id
               AND child.conversation_id = ? AND child.deleted_at IS NULL
               AND child.status IN ('COMPLETED', 'STOPPED')
           ) ORDER BY d.depth DESC, d.createdAt DESC, d.id DESC LIMIT 1`,
        )
          .bind(message.id, conversation.id, conversation.id, conversation.id)
          .first<{ id: string }>()) ?? { id: message.id })
      : message;
  const timestamp = nowMs();
  await context.env.DB.prepare(
    `UPDATE conversations SET active_message_id = ?, memory_stale = 1, updated_at = ?
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
  )
    .bind(selected.id, timestamp, conversation.id, principal.userId)
    .run();
  return context.json({ activeMessageId: selected.id, memoryStale: true });
});

conversationRoutes.delete('/:conversationId/messages/:messageId', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  requireActiveConversation(conversation);
  const messageId = context.req.param('messageId');
  const message = await context.env.DB.prepare(
    `SELECT ${messageProjection}, deleted_at AS deletedAt FROM messages
     WHERE id = ? AND conversation_id = ?`,
  )
    .bind(messageId, conversation.id)
    .first<MessageRow & { readonly deletedAt: number | null }>();
  if (!message) throw new AppError('MESSAGE_NOT_FOUND', 'Сообщение не найдено.', 404);
  if (message.deletedAt !== null) return context.json({ deleted: true });
  if (message.status === 'STREAMING' || message.status === 'PENDING') {
    throw new AppError('MESSAGE_NOT_READY', 'Сначала остановите создание ответа.', 409);
  }
  const activeIsDescendant = conversation.activeMessageId
    ? await context.env.DB.prepare(
        `WITH RECURSIVE descendants(id) AS (
           SELECT id FROM messages WHERE id = ? AND conversation_id = ?
           UNION ALL
           SELECT m.id FROM messages m JOIN descendants d ON m.parent_message_id = d.id
           WHERE m.conversation_id = ? AND m.deleted_at IS NULL
         ) SELECT 1 AS found FROM descendants WHERE id = ? LIMIT 1`,
      )
        .bind(message.id, conversation.id, conversation.id, conversation.activeMessageId)
        .first<{ found: number }>()
    : null;
  const timestamp = nowMs();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `WITH RECURSIVE descendants(id) AS (
           SELECT id FROM messages WHERE id = ? AND conversation_id = ?
           UNION ALL
           SELECT m.id FROM messages m JOIN descendants d ON m.parent_message_id = d.id
           WHERE m.conversation_id = ? AND m.deleted_at IS NULL
         ) UPDATE messages SET deleted_at = ? WHERE id IN (SELECT id FROM descendants)`,
    ).bind(message.id, conversation.id, conversation.id, timestamp),
    context.env.DB.prepare(
      `UPDATE conversations SET active_message_id = ?, memory_stale = 1, updated_at = ?
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).bind(
      activeIsDescendant ? message.parentMessageId : conversation.activeMessageId,
      timestamp,
      conversation.id,
      principal.userId,
    ),
  ]);
  return context.json({ deleted: true });
});

conversationRoutes.get('/:conversationId/memory', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  const active = await readActiveMemory(context.env.DB, conversation.id);
  const state = await context.env.DB.prepare(
    `SELECT last_summarized_message_id AS lastSummarizedMessageId
     FROM conversation_memory WHERE conversation_id = ?`,
  )
    .bind(conversation.id)
    .first<{ lastSummarizedMessageId: string | null }>();
  const pendingJob = await context.env.DB.prepare(
    `SELECT id, status, attempts, max_attempts AS maxAttempts,
     available_at AS availableAt, last_error_code AS lastErrorCode
     FROM jobs WHERE type = 'SUMMARIZE_MEMORY'
     AND json_extract(payload_json, '$.userId') = ?
     AND json_extract(payload_json, '$.conversationId') = ?
     AND status IN ('PENDING', 'PROCESSING', 'FAILED')
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(principal.userId, conversation.id)
    .first();
  return context.json({
    active,
    stale: conversation.memoryStale === 1,
    lastSummarizedMessageId: state?.lastSummarizedMessageId ?? null,
    estimatedTokens: active ? Math.ceil(active.content.length / 4) : 0,
    pendingJob,
  });
});

conversationRoutes.post('/:conversationId/memory/summarize', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  const input = memoryJobSchema.parse(await context.req.json());
  await reserveAdvancedOperation(
    context.env.DB,
    principal.userId,
    `memory:incremental:${input.idempotencyKey}`,
    'MEMORY_SUMMARIZE',
  );
  const job = await enqueueMemoryJob(context.env.DB, {
    conversationId: conversation.id,
    userId: principal.userId,
    mode: 'INCREMENTAL',
    idempotencyKey: input.idempotencyKey,
  });
  context.executionCtx.waitUntil(processDueMemoryJobs(context.env.DB, 1));
  return context.json(job, 202);
});

conversationRoutes.post('/:conversationId/memory/regenerate', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  const input = memoryJobSchema.parse(await context.req.json());
  await reserveAdvancedOperation(
    context.env.DB,
    principal.userId,
    `memory:full:${input.idempotencyKey}`,
    'MEMORY_REGENERATE',
  );
  const job = await enqueueMemoryJob(context.env.DB, {
    conversationId: conversation.id,
    userId: principal.userId,
    mode: 'FULL',
    idempotencyKey: input.idempotencyKey,
  });
  context.executionCtx.waitUntil(processDueMemoryJobs(context.env.DB, 1));
  return context.json(job, 202);
});

conversationRoutes.get('/:conversationId/memory/jobs/:jobId', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  const job = await readMemoryJob(
    context.env.DB,
    principal.userId,
    conversation.id,
    context.req.param('jobId'),
  );
  if (!job) throw new AppError('MEMORY_JOB_NOT_FOUND', 'Задача памяти не найдена.', 404);
  return context.json(job);
});

conversationRoutes.post('/:conversationId/memory/keep', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  const input = memoryJobSchema.parse(await context.req.json());
  const timestamp = nowMs();
  const keepKey = `keep:${input.idempotencyKey}`;
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `UPDATE conversations SET memory_stale = 0, updated_at = ?
           WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      ).bind(timestamp, conversation.id, principal.userId),
      idempotencyInsert(
        context.env.DB,
        principal.userId,
        'EDIT_MEMORY',
        keepKey,
        conversation.id,
        timestamp,
      ),
    ]);
  } catch (error) {
    if (!isConstraintError(error)) throw error;
    const existing = await readIdempotentResource(
      context.env.DB,
      principal.userId,
      'EDIT_MEMORY',
      keepKey,
    );
    if (existing !== conversation.id) throw error;
  }
  return context.json({ stale: false });
});

conversationRoutes.put('/:conversationId/memory', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  const input = memoryEditSchema.parse(await context.req.json());
  const version = await writeMemoryVersion(context.env.DB, {
    userId: principal.userId,
    conversationId: conversation.id,
    content: input.content,
    sourceType: 'MANUAL_EDIT',
    operation: 'EDIT_MEMORY',
    idempotencyKey: input.idempotencyKey,
  });
  return context.json(version, 201);
});

conversationRoutes.get('/:conversationId/memory/versions', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  const result = await context.env.DB.prepare(
    `SELECT id, content, source_type AS sourceType, from_message_id AS fromMessageId,
       to_message_id AS toMessageId, created_at AS createdAt,
       previous_version_id AS previousVersionId FROM memory_versions
     WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
  )
    .bind(conversation.id)
    .all<MemoryVersionRow>();
  return context.json({ items: result.results });
});

conversationRoutes.post('/:conversationId/memory/versions/:versionId/restore', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  const input = memoryRestoreSchema.parse(await context.req.json());
  const source = await context.env.DB.prepare(
    `SELECT id, content, source_type AS sourceType, from_message_id AS fromMessageId,
       to_message_id AS toMessageId, created_at AS createdAt,
       previous_version_id AS previousVersionId FROM memory_versions
     WHERE id = ? AND conversation_id = ?`,
  )
    .bind(context.req.param('versionId'), conversation.id)
    .first<MemoryVersionRow>();
  if (!source) throw new AppError('MEMORY_VERSION_NOT_FOUND', 'Версия памяти не найдена.', 404);
  const version = await writeMemoryVersion(context.env.DB, {
    userId: principal.userId,
    conversationId: conversation.id,
    content: source.content,
    sourceType: 'RESTORE',
    operation: 'RESTORE_MEMORY',
    idempotencyKey: input.idempotencyKey,
  });
  return context.json(version, 201);
});

export async function requireOwnedConversation(
  database: D1Database,
  userId: string,
  conversationId: string,
): Promise<OwnedConversationRow> {
  const row = await database
    .prepare(
      `SELECT ${conversationProjection} FROM conversations c
       JOIN characters access_character ON access_character.id = c.character_id
       WHERE c.id = ? AND c.user_id = ? AND c.deleted_at IS NULL AND c.state != 'DELETED'
       AND NOT EXISTS (SELECT 1 FROM user_blocks ub
         WHERE (ub.blocker_id = ? AND ub.blocked_user_id = access_character.owner_id)
            OR (ub.blocker_id = access_character.owner_id AND ub.blocked_user_id = ?))`,
    )
    .bind(conversationId, userId, userId, userId)
    .first<OwnedConversationRow>();
  if (!row) throw new AppError('CONVERSATION_NOT_FOUND', 'Диалог не найден.', 404);
  return row;
}

async function conversationDetail(
  database: D1Database,
  userId: string,
  id: string,
  role: Variables['principal']['role'],
) {
  const conversation = await requireOwnedConversation(database, userId, id);
  const character = await database
    .prepare(
      `SELECT v.name, v.tagline, c.avatar_file_id AS avatarFileId,
       c.content_rating AS contentRating, c.owner_id AS ownerId FROM characters c
       JOIN character_versions v ON v.id = ? WHERE c.id = ?`,
    )
    .bind(conversation.characterVersionId, conversation.characterId)
    .first<{
      name: string;
      tagline: string;
      avatarFileId: string | null;
      contentRating: string;
      ownerId: string;
    }>();
  if (!character) throw new AppError('CHARACTER_NOT_FOUND', 'Персонаж диалога не найден.', 409);
  return {
    ...toConversationSummary({
      ...conversation,
      characterName: character.name,
      characterAvatarFileId: character.avatarFileId,
      lastMessage: null,
    }),
    character: {
      name: character.name,
      tagline: character.tagline,
      avatarFileId: character.avatarFileId,
      contentRating: character.contentRating,
    },
    settings: await readConversationSettings(database, id),
    promptInspectorAvailable: character.ownerId === userId || role === 'ADMIN' || role === 'OWNER',
  };
}

async function requireAvailableCharacter(
  database: D1Database,
  userId: string,
  characterId: string,
  preview: boolean,
): Promise<CharacterStartRow> {
  const row = await database
    .prepare(
      `SELECT c.id, c.active_version_id AS activeVersionId, v.name,
       v.first_message AS firstMessage, v.alternate_greetings_json AS alternateGreetingsJson,
       v.description, v.scenario, c.content_rating AS contentRating
       FROM characters c JOIN character_versions v ON v.id = c.active_version_id
       JOIN users u ON u.id = c.owner_id
       WHERE c.id = ? AND c.deleted_at IS NULL AND u.deleted_at IS NULL
       AND u.moderation_state = 'ACTIVE'
       AND ((? = 1 AND c.owner_id = ?)
         OR (? = 0 AND c.publish_state = 'PUBLISHED'
           AND c.visibility IN ('PUBLIC', 'UNLISTED')))
       AND NOT EXISTS (SELECT 1 FROM user_blocks ub
         WHERE (ub.blocker_id = ? AND ub.blocked_user_id = c.owner_id)
            OR (ub.blocker_id = c.owner_id AND ub.blocked_user_id = ?))`,
    )
    .bind(characterId, preview ? 1 : 0, userId, preview ? 1 : 0, userId, userId)
    .first<CharacterStartRow>();
  if (!row) throw new AppError('CHARACTER_NOT_FOUND', 'Персонаж недоступен.', 404);
  return row;
}

function parseAlternateGreetings(value: string): readonly string[] {
  try {
    return z.array(z.string().min(1)).max(10).parse(JSON.parse(value));
  } catch {
    return [];
  }
}

async function resolvePersonaId(
  database: D1Database,
  userId: string,
  requested: string | null | undefined,
): Promise<string | null> {
  if (requested !== undefined) return requested;
  const settings = await database
    .prepare('SELECT default_persona_id AS defaultPersonaId FROM user_settings WHERE user_id = ?')
    .bind(userId)
    .first<{ defaultPersonaId: string | null }>();
  return settings?.defaultPersonaId ?? null;
}

async function requireOwnedPersonaSnapshot(
  database: D1Database,
  userId: string,
  personaId: string,
): Promise<PersonaSnapshotRow> {
  const row = await database
    .prepare(
      `SELECT id, name, short_description AS shortDescription,
       long_description AS longDescription, personality, appearance,
       speaking_style AS speakingStyle, background, pronouns,
       represented_age AS representedAge, custom_notes AS customNotes
       FROM personas WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    )
    .bind(personaId, userId)
    .first<PersonaSnapshotRow>();
  if (!row) throw new AppError('PERSONA_NOT_FOUND', 'Образ не найден.', 404);
  return row;
}

export async function readConversationSettings(
  database: D1Database,
  conversationId: string,
): Promise<ConversationSettingsRow> {
  const row = await database
    .prepare(`SELECT ${settingsProjection} FROM conversation_settings WHERE conversation_id = ?`)
    .bind(conversationId)
    .first<ConversationSettingsRow>();
  if (!row)
    throw new AppError('CONVERSATION_SETTINGS_NOT_FOUND', 'Настройки диалога не найдены.', 409);
  return row;
}

async function requireMessage(
  database: D1Database,
  conversationId: string,
  messageId: string,
): Promise<MessageRow> {
  const row = await database
    .prepare(
      `SELECT ${messageProjection} FROM messages
       WHERE id = ? AND conversation_id = ? AND deleted_at IS NULL`,
    )
    .bind(messageId, conversationId)
    .first<MessageRow>();
  if (!row) throw new AppError('MESSAGE_NOT_FOUND', 'Сообщение не найдено.', 404);
  return row;
}

function toConversationSummary(row: ConversationListRow) {
  return {
    id: row.id,
    characterId: row.characterId,
    personaId: row.personaId,
    title: row.title,
    activeMessageId: row.activeMessageId,
    state: row.state,
    isPreview: row.isPreview === 1,
    memoryStale: row.memoryStale === 1,
    characterName: row.characterName,
    characterAvatarFileId: row.characterAvatarFileId,
    lastMessage: row.lastMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMessageResponse(
  row: MessageRow,
): Omit<MessageResponse, 'variantIndex' | 'variantCount' | 'variantIds'> {
  let metadata: Readonly<Record<string, unknown>> = {};
  try {
    const value: unknown = JSON.parse(row.metadataJson);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      metadata = value as Readonly<Record<string, unknown>>;
    }
  } catch {
    metadata = {};
  }
  const { metadataJson, ...safe } = row;
  void metadataJson;
  return { ...safe, metadata };
}

function withVariantInfo(
  visibleMessages: readonly MessageRow[],
  allMessages: readonly MessageRow[],
): readonly MessageResponse[] {
  const siblingGroups = new Map<string, readonly MessageRow[]>();
  for (const candidate of allMessages) {
    if (candidate.role === 'SYSTEM_INTERNAL') continue;
    const key = `${candidate.parentMessageId ?? 'root'}:${candidate.role}`;
    const current = siblingGroups.get(key) ?? [];
    siblingGroups.set(key, [...current, candidate]);
  }
  return visibleMessages.map((message) => {
    const key = `${message.parentMessageId ?? 'root'}:${message.role}`;
    const siblings = siblingGroups.get(key) ?? [message];
    const variantIndex = Math.max(
      0,
      siblings.findIndex((candidate) => candidate.id === message.id),
    );
    return {
      ...toMessageResponse(message),
      variantIndex,
      variantCount: siblings.length,
      variantIds: siblings.map((candidate) => candidate.id),
    };
  });
}

function requireActiveConversation(conversation: OwnedConversationRow): void {
  if (conversation.state !== 'ACTIVE') {
    throw new AppError('CONVERSATION_ARCHIVED', 'Сначала верните диалог из архива.', 409);
  }
}

type MutationOperation =
  'CREATE_CONVERSATION' | 'CREATE_MESSAGE' | 'EDIT_MESSAGE' | 'EDIT_MEMORY' | 'RESTORE_MEMORY';

function idempotencyInsert(
  database: D1Database,
  userId: string,
  operation: MutationOperation,
  key: string,
  resourceId: string,
  timestamp: number,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO mutation_idempotency_keys
       (user_id, operation, idempotency_key, resource_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(userId, operation, key, resourceId, timestamp);
}

async function readIdempotentResource(
  database: D1Database,
  userId: string,
  operation: MutationOperation,
  key: string,
): Promise<string | null> {
  const row = await database
    .prepare(
      `SELECT resource_id AS resourceId FROM mutation_idempotency_keys
       WHERE user_id = ? AND operation = ? AND idempotency_key = ?`,
    )
    .bind(userId, operation, key)
    .first<{ resourceId: string }>();
  return row?.resourceId ?? null;
}

interface MessageInsert {
  readonly userId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly parentMessageId: string | null;
  readonly content: string;
  readonly metadataJson: string;
  readonly operation: 'CREATE_MESSAGE' | 'EDIT_MESSAGE';
  readonly idempotencyKey: string;
  readonly timestamp: number;
  readonly memoryStale?: boolean;
  readonly role: 'USER' | 'ASSISTANT';
}

async function insertMessageIdempotently(
  database: D1Database,
  input: MessageInsert,
): Promise<void> {
  try {
    await database.batch([
      database
        .prepare(
          `INSERT INTO messages
         (id, conversation_id, role, content, status, parent_message_id, metadata_json, created_at, edited_at)
         VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?)`,
        )
        .bind(
          input.messageId,
          input.conversationId,
          input.role,
          input.content,
          input.parentMessageId,
          input.metadataJson,
          input.timestamp,
          input.operation === 'EDIT_MESSAGE' ? input.timestamp : null,
        ),
      idempotencyInsert(
        database,
        input.userId,
        input.operation,
        input.idempotencyKey,
        input.messageId,
        input.timestamp,
      ),
      database
        .prepare(
          `UPDATE conversations SET active_message_id = ?,
           memory_stale = CASE WHEN ? = 1 THEN 1 ELSE memory_stale END, updated_at = ?
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
        )
        .bind(
          input.messageId,
          input.memoryStale ? 1 : 0,
          input.timestamp,
          input.conversationId,
          input.userId,
        ),
    ]);
  } catch (error) {
    if (!isConstraintError(error)) throw error;
    const existing = await readIdempotentResource(
      database,
      input.userId,
      input.operation,
      input.idempotencyKey,
    );
    if (!existing) throw error;
  }
}

async function readActiveMemory(
  database: D1Database,
  conversationId: string,
): Promise<MemoryVersionRow | null> {
  return database
    .prepare(
      `SELECT mv.id, mv.content, mv.source_type AS sourceType,
       mv.from_message_id AS fromMessageId, mv.to_message_id AS toMessageId,
       mv.created_at AS createdAt, mv.previous_version_id AS previousVersionId
       FROM conversation_memory cm JOIN memory_versions mv ON mv.id = cm.active_version_id
       WHERE cm.conversation_id = ?`,
    )
    .bind(conversationId)
    .first<MemoryVersionRow>();
}

interface MemoryWriteInput {
  readonly userId: string;
  readonly conversationId: string;
  readonly content: string;
  readonly sourceType: 'MANUAL_EDIT' | 'RESTORE';
  readonly operation: 'EDIT_MEMORY' | 'RESTORE_MEMORY';
  readonly idempotencyKey: string;
}

async function writeMemoryVersion(
  database: D1Database,
  input: MemoryWriteInput,
): Promise<MemoryVersionRow> {
  const existing = await readIdempotentResource(
    database,
    input.userId,
    input.operation,
    input.idempotencyKey,
  );
  if (existing) return requireMemoryVersion(database, input.conversationId, existing);
  const previous = await readActiveMemory(database, input.conversationId);
  const versionId = createId();
  const timestamp = nowMs();
  try {
    await database.batch([
      database
        .prepare(
          `INSERT INTO memory_versions
         (id, conversation_id, content, source_type, created_at, created_by, previous_version_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          versionId,
          input.conversationId,
          input.content,
          input.sourceType,
          timestamp,
          input.userId,
          previous?.id ?? null,
        ),
      database
        .prepare(
          `UPDATE conversation_memory SET active_version_id = ?, updated_at = ?
         WHERE conversation_id = ?`,
        )
        .bind(versionId, timestamp, input.conversationId),
      database
        .prepare(
          `UPDATE conversations SET memory_stale = 0, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        )
        .bind(timestamp, input.conversationId, input.userId),
      idempotencyInsert(
        database,
        input.userId,
        input.operation,
        input.idempotencyKey,
        versionId,
        timestamp,
      ),
    ]);
  } catch (error) {
    if (isConstraintError(error)) {
      const raced = await readIdempotentResource(
        database,
        input.userId,
        input.operation,
        input.idempotencyKey,
      );
      if (raced) return requireMemoryVersion(database, input.conversationId, raced);
    }
    throw error;
  }
  return requireMemoryVersion(database, input.conversationId, versionId);
}

async function requireMemoryVersion(
  database: D1Database,
  conversationId: string,
  versionId: string,
): Promise<MemoryVersionRow> {
  const row = await database
    .prepare(
      `SELECT id, content, source_type AS sourceType, from_message_id AS fromMessageId,
       to_message_id AS toMessageId, created_at AS createdAt,
       previous_version_id AS previousVersionId FROM memory_versions
       WHERE id = ? AND conversation_id = ?`,
    )
    .bind(versionId, conversationId)
    .first<MemoryVersionRow>();
  if (!row) throw new AppError('MEMORY_VERSION_NOT_FOUND', 'Версия памяти не найдена.', 404);
  return row;
}

function isConstraintError(error: unknown): boolean {
  return /UNIQUE|constraint/iu.test(asError(error).message);
}
