import {
  conversationCreateSchema,
  conversationPatchSchema,
  memoryEditSchema,
  memoryJobSchema,
  memoryRestoreSchema,
  messageCreateSchema,
  messageEditSchema,
  type ResponseLength,
} from '@velora/domain';
import { AppError, asError, createId, nowMs } from '@velora/shared';
import { composePersistentMemory } from '@velora/memory';
import { renderResolvedTemplate } from '@velora/prompts';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env, Variables } from './types';
import {
  buildMemoryRegenerationPreview,
  enqueueMemoryJob,
  processDueMemoryJobs,
  readMemoryJob,
} from './memory-jobs';
import {
  readEffectivePlan,
  requireModelProfile as requirePlanModelProfile,
  reserveAdvancedOperation,
} from './plans';
import { canUseModelTier, publicModelProjection } from './model-registry';
import {
  readEffectiveRoleplayModelProfiles,
  readRoleplayModelIdForPlan,
  requireEffectiveRoleplayModelProfile,
} from './model-registry-config';
import { readBotHubModelCapabilities } from './bothub-models';
import { isFeatureEnabled } from './reliability';

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
  readonly memoryStaleSinceMessageId: string | null;
  readonly greetingsBackfilled: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface ConversationListRow extends OwnedConversationRow {
  readonly siblingCount?: number;
  readonly characterName: string;
  readonly characterAvatarFileId: string | null;
  readonly characterAvatarFocalX: number;
  readonly characterAvatarFocalY: number;
  readonly lastMessage: string | null;
  readonly messageCount: number;
}

interface ConversationSettingsRow {
  readonly modelProfile: 'BALANCED' | 'CREATIVE' | 'PREMIUM';
  readonly modelProfileId: string;
  readonly temperature: number;
  readonly maxOutputTokens: number;
  readonly responseLength: ResponseLength;
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
  readonly role: 'USER' | 'ASSISTANT' | 'INTERNAL';
  readonly content: string;
  readonly contentFormat: 'PLAIN_TEXT' | 'MARKDOWN';
  readonly status:
    'PENDING' | 'STREAMING' | 'COMPLETED' | 'STOPPED' | 'FAILED' | 'DELETED' | 'MODERATED';
  readonly isGreeting: number;
  readonly editedByUser: number;
  readonly origin:
    'LEGACY' | 'USER_INPUT' | 'CHARACTER_GREETING' | 'AI_GENERATION' | 'USER_EDIT' | 'INTERNAL';
  readonly parentMessageId: string | null;
  readonly generationGroupId: string | null;
  readonly model: string | null;
  readonly provider: string | null;
  readonly metadataJson: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly editedAt: number | null;
}

export type MessageReaction = 'POSITIVE' | 'NEGATIVE' | 'EXCEPTIONAL';

interface GenerationReactionRow {
  readonly messageId: string;
  readonly generationId: string;
  readonly reaction: MessageReaction | null;
}

export interface GenerationReactionInfo {
  readonly generationId: string;
  readonly reaction: MessageReaction | null;
}

interface MessageResponse extends Omit<MessageRow, 'metadataJson' | 'isGreeting' | 'editedByUser'> {
  readonly isGreeting: boolean;
  readonly editedByUser: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly generationId: string | null;
  readonly reaction: MessageReaction | null;
  readonly variantIndex: number;
  readonly variantCount: number;
  readonly variantIds: readonly string[];
}

interface MemoryVersionRow {
  readonly id: string;
  readonly content: string;
  readonly manualContext: string;
  readonly autoSummary: string;
  readonly sourceType: 'AUTO_SUMMARY' | 'FULL_REGENERATION' | 'MANUAL_EDIT' | 'RESTORE';
  readonly fromMessageId: string | null;
  readonly toMessageId: string | null;
  readonly createdAt: number;
  readonly provider: string | null;
  readonly model: string | null;
  readonly previousVersionId: string | null;
}

const memoryVersionProjection = `id, content, manual_context AS manualContext,
  auto_summary AS autoSummary, source AS sourceType,
  from_message_id AS fromMessageId, to_message_id AS toMessageId,
  provider, model, created_at AS createdAt, previous_version_id AS previousVersionId`;

const listQuerySchema = z.object({
  state: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
  q: z.string().trim().max(120).default(''),
  sort: z.enum(['newest', 'oldest', 'active']).default('newest'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const messageQuerySchema = z.object({
  view: z.enum(['active', 'tree']).default('active'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
const branchActivationQuerySchema = z.object({
  descend: z.enum(['0', '1']).default('0'),
});
const messageReactionSchema = z.object({
  reaction: z.enum(['POSITIVE', 'NEGATIVE', 'EXCEPTIONAL']),
});

const conversationProjection = `c.id, c.user_id AS userId, c.character_id AS characterId,
  c.character_version_id AS characterVersionId, c.persona_id AS personaId,
  c.persona_snapshot_json AS personaSnapshotJson, c.title,
  c.active_leaf_message_id AS activeMessageId, c.state, c.is_preview AS isPreview,
  c.memory_stale AS memoryStale,
  c.memory_stale_since_message_id AS memoryStaleSinceMessageId,
  c.greetings_backfilled AS greetingsBackfilled,
  c.created_at AS createdAt, c.updated_at AS updatedAt`;
const settingsProjection = `model_profile AS modelProfile, model_profile_id AS modelProfileId, temperature,
  max_output_tokens AS maxOutputTokens, response_length AS responseLength,
  custom_instructions AS customInstructions, persona_mode AS personaMode`;
const messageProjection = `id, conversation_id AS conversationId, role, content,
  content_format AS contentFormat, status, is_greeting AS isGreeting,
  edited_by_user AS editedByUser, origin,
  parent_message_id AS parentMessageId, generation_group_id AS generationGroupId,
  model, provider, metadata_json AS metadataJson, created_at AS createdAt,
  updated_at AS updatedAt, edited_at AS editedAt`;

export const conversationRoutes = new Hono<ConversationEnvironment>();

conversationRoutes.get('/models/catalog', async (context) => {
  const principal = context.get('principal');
  const [plan, capabilities, validated, profiles] = await Promise.all([
    readEffectivePlan(context.env.DB, principal.userId),
    readBotHubModelCapabilities(context.env.DB),
    context.env.DB.prepare(
      `SELECT DISTINCT model FROM provider_smoke_runs
         WHERE provider = 'BOTHUB' AND state = 'COMPLETED'`,
    ).all<{ readonly model: string }>(),
    readEffectiveRoleplayModelProfiles(context.env.DB),
  ]);
  const availableProviderModels = new Set(capabilities?.availableCandidates ?? []);
  const validatedProviderModels = new Set(validated.results.map(({ model }) => model));
  return context.json({
    selectedProviderCatalogCheckedAt: capabilities?.checkedAt ?? null,
    items: profiles.map((profile) => ({
      ...publicModelProjection(
        profile,
        profile.enabled &&
          availableProviderModels.has(profile.providerModelId) &&
          validatedProviderModels.has(profile.providerModelId),
      ),
      allowed: canUseModelTier(plan.code, profile.tier),
    })),
  });
});

conversationRoutes.get('/', async (context) => {
  const principal = context.get('principal');
  const query = listQuerySchema.parse(context.req.query());
  const pattern = `%${escapeConversationLike(query.q)}%`;
  const sharedValues = [
    principal.userId,
    query.state,
    query.state,
    principal.userId,
    principal.userId,
    query.q,
    pattern,
    pattern,
    pattern,
    pattern,
  ] as const;
  const [result, count] = await Promise.all([
    context.env.DB.prepare(
      `SELECT ${conversationProjection}, COALESCE(g.name, v.name) AS characterName,
       (SELECT COUNT(*) FROM conversations sibling
         WHERE sibling.user_id = c.user_id AND sibling.character_id = c.character_id
           AND sibling.deleted_at IS NULL AND sibling.is_preview = 0
           AND (? = 'ALL' OR sibling.state = ?)
           AND NOT EXISTS (SELECT 1 FROM conversation_character_groups grouped_sibling
             WHERE grouped_sibling.conversation_id = sibling.id)) AS siblingCount,
       
       COALESCE(g.avatar_file_id, ch.avatar_file_id) AS characterAvatarFileId,
       ch.avatar_focal_x AS characterAvatarFocalX,
       ch.avatar_focal_y AS characterAvatarFocalY,
       (SELECT content FROM messages lm WHERE lm.id = c.active_leaf_message_id) AS lastMessage,
       ((SELECT COUNT(*) FROM messages mc WHERE mc.conversation_id = c.id
          AND mc.deleted_at IS NULL AND mc.role != 'INTERNAL' AND mc.is_greeting = 0)
        + CASE WHEN EXISTS (SELECT 1 FROM messages greeting
            WHERE greeting.conversation_id = c.id AND greeting.deleted_at IS NULL
              AND greeting.role != 'INTERNAL' AND greeting.is_greeting = 1)
          THEN 1 ELSE 0 END) AS messageCount
     FROM conversations c
     JOIN characters ch ON ch.id = c.character_id
     JOIN character_versions v ON v.id = c.character_version_id
     LEFT JOIN conversation_character_groups cg ON cg.conversation_id = c.id
     LEFT JOIN character_groups g ON g.id = cg.group_id
     WHERE c.user_id = ? AND c.deleted_at IS NULL
       AND (? = 'ALL' OR c.state = ?)
       AND NOT EXISTS (SELECT 1 FROM user_blocks ub
         WHERE (ub.blocker_id = ? AND ub.blocked_user_id = ch.owner_id)
            OR (ub.blocker_id = ch.owner_id AND ub.blocked_user_id = ?))
       AND (? = '' OR c.title LIKE ? ESCAPE '\\' OR COALESCE(g.name, v.name) LIKE ? ESCAPE '\\'
         OR COALESCE(c.persona_snapshot_json, '') LIKE ? ESCAPE '\\'
         OR EXISTS (SELECT 1 FROM messages sm
           WHERE sm.conversation_id = c.id AND sm.deleted_at IS NULL
             AND sm.role != 'INTERNAL' AND sm.content LIKE ? ESCAPE '\\'))
       AND (c.is_preview = 1
         OR EXISTS (SELECT 1 FROM conversation_character_groups grouped
           WHERE grouped.conversation_id = c.id)
         OR c.id = (SELECT newest.id FROM conversations newest
           WHERE newest.user_id = c.user_id AND newest.character_id = c.character_id
             AND newest.deleted_at IS NULL AND newest.is_preview = 0
             AND (? = 'ALL' OR newest.state = ?)
             AND NOT EXISTS (SELECT 1 FROM conversation_character_groups grouped_newest
               WHERE grouped_newest.conversation_id = newest.id)
           ORDER BY newest.updated_at DESC, newest.id DESC LIMIT 1))
     ORDER BY
       CASE WHEN ? = 'active' THEN (
         SELECT COUNT(*) FROM messages active_messages
         WHERE active_messages.conversation_id = c.id
           AND active_messages.deleted_at IS NULL
           AND active_messages.role != 'INTERNAL' AND active_messages.is_greeting = 0
       ) END DESC,
       CASE WHEN ? = 'active' THEN c.updated_at END DESC,
       CASE WHEN ? = 'active' THEN c.id END DESC,
       CASE WHEN ? = 'oldest' THEN c.updated_at END ASC,
       CASE WHEN ? = 'oldest' THEN c.id END ASC,
       CASE WHEN ? = 'newest' THEN c.updated_at END DESC,
       CASE WHEN ? = 'newest' THEN c.id END DESC
     LIMIT ?`,
    )
      .bind(
        query.state,
        query.state,
        ...sharedValues,
        query.state,
        query.state,
        query.sort,
        query.sort,
        query.sort,
        query.sort,
        query.sort,
        query.sort,
        query.sort,
        query.limit,
      )
      .all<ConversationListRow>(),
    context.env.DB.prepare(
      `SELECT COUNT(*) AS totalCount
       FROM conversations c
       JOIN characters ch ON ch.id = c.character_id
       JOIN character_versions v ON v.id = c.character_version_id
       WHERE c.user_id = ? AND c.deleted_at IS NULL
         AND (? = 'ALL' OR c.state = ?)
         AND NOT EXISTS (SELECT 1 FROM user_blocks ub
           WHERE (ub.blocker_id = ? AND ub.blocked_user_id = ch.owner_id)
              OR (ub.blocker_id = ch.owner_id AND ub.blocked_user_id = ?))
         AND (? = '' OR c.title LIKE ? ESCAPE '\\' OR v.name LIKE ? ESCAPE '\\'
           OR COALESCE(c.persona_snapshot_json, '') LIKE ? ESCAPE '\\'
           OR EXISTS (SELECT 1 FROM messages sm
             WHERE sm.conversation_id = c.id AND sm.deleted_at IS NULL
               AND sm.role != 'INTERNAL' AND sm.content LIKE ? ESCAPE '\\'))
       AND (c.is_preview = 1
         OR EXISTS (SELECT 1 FROM conversation_character_groups grouped
           WHERE grouped.conversation_id = c.id)
         OR c.id = (SELECT newest.id FROM conversations newest
           WHERE newest.user_id = c.user_id AND newest.character_id = c.character_id
             AND newest.deleted_at IS NULL AND newest.is_preview = 0
             AND (? = 'ALL' OR newest.state = ?)
             AND NOT EXISTS (SELECT 1 FROM conversation_character_groups grouped_newest
               WHERE grouped_newest.conversation_id = newest.id)
           ORDER BY newest.updated_at DESC, newest.id DESC LIMIT 1))`,
    )
      .bind(...sharedValues, query.state, query.state)
      .first<{ readonly totalCount: number }>(),
  ]);
  return context.json({
    items: result.results.map(toConversationSummary),
    totalCount: count?.totalCount ?? 0,
  });
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
  const renderedGreetings = renderConversationGreetings(greetingOptions, {
    char: character.name,
    user: identityName,
    persona: persona?.name ?? '',
    scenario: character.scenario,
    description: character.description,
  });
  const conversationId = createId();
  const greetingMessageIds = renderedGreetings.map(() => createId());
  const firstMessageId = greetingMessageIds[input.greetingIndex];
  if (!firstMessageId) {
    throw new AppError('GREETING_NOT_FOUND', 'Выбранное приветствие недоступно.', 400);
  }
  const timestamp = nowMs();
  const title = input.title ?? (input.preview ? `Тест · ${character.name}` : character.name);
  const plan = await readEffectivePlan(context.env.DB, principal.userId);
  const defaultModelProfileId = await readRoleplayModelIdForPlan(context.env.DB, plan.code);
  try {
    await context.env.DB.batch([
      context.env.DB.prepare(
        `INSERT INTO conversations (
          id, user_id, character_id, character_version_id, persona_id,
          persona_snapshot_json, title, active_leaf_message_id, is_preview,
          greetings_backfilled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
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
        `INSERT INTO conversation_settings
          (conversation_id, model_profile, model_profile_id, updated_at)
         SELECT ?, generation_profile, ?, ? FROM user_settings WHERE user_id = ?`,
      ).bind(conversationId, defaultModelProfileId, timestamp, principal.userId),
      ...renderedGreetings.map((greeting, index) =>
        context.env.DB.prepare(
          `INSERT INTO messages (
              id, conversation_id, role, content, content_format, status,
              is_greeting, edited_by_user, origin, metadata_json, created_at, updated_at
            ) VALUES (?, ?, 'ASSISTANT', ?, 'MARKDOWN', 'COMPLETED', 1, 0,
              'CHARACTER_GREETING', ?, ?, ?)`,
        ).bind(
          greetingMessageIds[index],
          conversationId,
          greeting,
          JSON.stringify({ greetingIndex: index }),
          timestamp + index,
          timestamp + index,
        ),
      ),
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
  if (patch.modelProfileId) {
    const requestedModel = await requireEffectiveRoleplayModelProfile(
      context.env.DB,
      patch.modelProfileId,
    );
    const plan = await readEffectivePlan(context.env.DB, principal.userId);
    if (!canUseModelTier(plan.code, requestedModel.tier)) {
      throw new AppError(
        'PLAN_ENTITLEMENT_REQUIRED',
        'Эта модель недоступна на вашем тарифе.',
        403,
      );
    }
    const capabilities = await readBotHubModelCapabilities(context.env.DB);
    const validated = await context.env.DB.prepare(
      `SELECT 1 AS found FROM provider_smoke_runs
         WHERE provider = 'BOTHUB' AND model = ? AND state = 'COMPLETED' LIMIT 1`,
    )
      .bind(requestedModel.providerModelId)
      .first<{ readonly found: number }>();
    if (!capabilities?.availableCandidates.includes(requestedModel.providerModelId) || !validated) {
      throw new AppError(
        'MODEL_PROVIDER_UNAVAILABLE',
        'Модель сейчас недоступна у провайдера.',
        409,
      );
    }
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
      `UPDATE conversation_settings SET model_profile = ?, model_profile_id = ?, temperature = ?,
       max_output_tokens = ?, response_length = ?, custom_instructions = ?,
       persona_mode = ?, updated_at = ? WHERE conversation_id = ?`,
    ).bind(
      patch.modelProfile ?? currentSettings.modelProfile,
      patch.modelProfileId ?? currentSettings.modelProfileId,
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
      `UPDATE messages SET status = 'STOPPED', updated_at = ?
         WHERE conversation_id = ? AND status IN ('PENDING', 'STREAMING')`,
    ).bind(timestamp, id),
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
  if (conversation.greetingsBackfilled === 0) {
    await materialiseGreetingVariants(context.env.DB, conversation);
  }
  const query = messageQuerySchema.parse(context.req.query());
  const generationReactions = await readGenerationReactions(
    context.env.DB,
    principal.userId,
    conversation.id,
  );
  if (query.view === 'tree') {
    const result = await context.env.DB.prepare(
      `SELECT ${messageProjection} FROM messages WHERE conversation_id = ? AND deleted_at IS NULL
       ORDER BY created_at ASC, id ASC LIMIT ?`,
    )
      .bind(conversation.id, query.limit)
      .all<MessageRow>();
    return context.json({
      items: withVariantInfo(
        result.results.filter((message) => message.role !== 'INTERNAL'),
        result.results,
        generationReactions,
      ),
      activeMessageId: conversation.activeMessageId,
    });
  }
  if (!conversation.activeMessageId) return context.json({ items: [], activeMessageId: null });
  const result = await context.env.DB.prepare(
    `WITH RECURSIVE branch(
       id, conversationId, role, content, contentFormat, status, isGreeting,
       editedByUser, origin, parentMessageId, generationGroupId, model, provider,
       metadataJson, createdAt, updatedAt, editedAt, depth
     ) AS (
       SELECT ${messageProjection}, 0 FROM messages
       WHERE id = ? AND conversation_id = ? AND deleted_at IS NULL
       UNION ALL
       SELECT ${messageProjection.replaceAll(/\b(id|conversation_id|role|content|content_format|status|is_greeting|edited_by_user|origin|parent_message_id|generation_group_id|model|provider|metadata_json|created_at|updated_at|edited_at)\b/gu, 'm.$1')}, b.depth + 1
       FROM messages m JOIN branch b ON m.id = b.parentMessageId
       WHERE m.conversation_id = ? AND m.deleted_at IS NULL AND b.depth < ?
     ) SELECT id, conversationId, role, content, contentFormat, status, isGreeting,
       editedByUser, origin, parentMessageId, generationGroupId, model, provider,
       metadataJson, createdAt, updatedAt, editedAt FROM branch ORDER BY depth DESC`,
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
      result.results.filter((message) => message.role !== 'INTERNAL'),
      variants.results,
      generationReactions,
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

conversationRoutes.put('/:conversationId/generations/:generationId/reaction', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  const generationId = context.req.param('generationId');
  await requireReactableGeneration(context.env.DB, conversation.id, generationId);
  const input = messageReactionSchema.parse(await context.req.json());
  const timestamp = nowMs();
  await context.env.DB.prepare(
    `INSERT INTO message_generation_reactions
       (generation_id, user_id, reaction, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(generation_id, user_id) DO UPDATE SET
       reaction = excluded.reaction, updated_at = excluded.updated_at`,
  )
    .bind(generationId, principal.userId, input.reaction, timestamp, timestamp)
    .run();
  return context.json({ generationId, reaction: input.reaction });
});

conversationRoutes.delete(
  '/:conversationId/generations/:generationId/reaction',
  async (context) => {
    const principal = context.get('principal');
    const conversation = await requireOwnedConversation(
      context.env.DB,
      principal.userId,
      context.req.param('conversationId'),
    );
    const generationId = context.req.param('generationId');
    await requireReactableGeneration(context.env.DB, conversation.id, generationId);
    await context.env.DB.prepare(
      'DELETE FROM message_generation_reactions WHERE generation_id = ? AND user_id = ?',
    )
      .bind(generationId, principal.userId)
      .run();
    return context.json({ generationId, reaction: null });
  },
);

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
  if (original.role === 'INTERNAL') {
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
    memoryStaleSinceMessageId: original.id,
    role: original.role,
    contentFormat: original.contentFormat,
    isGreeting: original.isGreeting === 1,
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
    message.role === 'INTERNAL' ||
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
    `UPDATE conversations SET active_leaf_message_id = ?, memory_stale = 1,
     memory_stale_since_message_id = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
  )
    .bind(selected.id, selected.id, timestamp, conversation.id, principal.userId)
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
         ) UPDATE messages SET status = 'DELETED', deleted_at = ?, updated_at = ?
         WHERE id IN (SELECT id FROM descendants)`,
    ).bind(message.id, conversation.id, conversation.id, timestamp, timestamp),
    context.env.DB.prepare(
      `UPDATE conversations SET active_leaf_message_id = ?, memory_stale = 1,
       memory_stale_since_message_id = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).bind(
      activeIsDescendant ? message.parentMessageId : conversation.activeMessageId,
      message.id,
      timestamp,
      conversation.id,
      principal.userId,
    ),
  ]);
  return context.json({ deleted: true });
});

interface ChatCharacterRow {
  readonly id: string;
  readonly avatarFileId: string | null;
  readonly avatarFocalX: number;
  readonly avatarFocalY: number;
  readonly contentRating: 'SAFE' | 'MATURE';
  readonly language: string;
  readonly groupSize: string;
  readonly visibility: string;
  readonly publishState: string;
  readonly updatedAt: number;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly personality: string | null;
  readonly firstMessage: string;
  readonly alternateGreetingsJson: string;
  readonly creatorId: string;
  readonly creatorName: string;
  readonly creatorRole: string;
  readonly avatarBotUsername: string | null;
  readonly likeCount: number;
  readonly bookmarkCount: number;
  readonly reviewCount: number;
  readonly averageRating: number | null;
  readonly liked: number;
  readonly bookmarked: number;
}

conversationRoutes.get('/:conversationId/siblings', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  const result = await context.env.DB.prepare(
    `SELECT c.id, c.title, c.state, c.is_preview AS isPreview,
       c.active_leaf_message_id AS activeMessageId, c.updated_at AS updatedAt,
       (SELECT content FROM messages lm WHERE lm.id = c.active_leaf_message_id) AS lastMessage,
       ((SELECT COUNT(*) FROM messages mc WHERE mc.conversation_id = c.id
          AND mc.deleted_at IS NULL AND mc.role != 'INTERNAL' AND mc.is_greeting = 0)
        + CASE WHEN EXISTS (SELECT 1 FROM messages greeting
            WHERE greeting.conversation_id = c.id AND greeting.deleted_at IS NULL
              AND greeting.role != 'INTERNAL' AND greeting.is_greeting = 1)
          THEN 1 ELSE 0 END) AS messageCount
     FROM conversations c
     WHERE c.user_id = ? AND c.character_id = ? AND c.deleted_at IS NULL
       AND c.state != 'DELETED'
       -- Draft previews keep their own row in the list instead of collapsing,
       -- so listing them here too would show the same chat in two places. The
       -- open conversation is always included, even when it is a preview.
       AND (c.is_preview = 0 OR c.id = ?)
       AND NOT EXISTS (SELECT 1 FROM conversation_character_groups grouped
         WHERE grouped.conversation_id = c.id)
     ORDER BY c.updated_at DESC, c.id DESC LIMIT 50`,
  )
    .bind(principal.userId, conversation.characterId, conversation.id)
    .all<{
      id: string;
      title: string;
      state: 'ACTIVE' | 'ARCHIVED';
      isPreview: number;
      activeMessageId: string | null;
      updatedAt: number;
      lastMessage: string | null;
      messageCount: number;
    }>();
  return context.json({
    items: result.results.map((row) => ({
      id: row.id,
      title: row.title,
      state: row.state,
      isPreview: row.isPreview === 1,
      lastMessage: row.lastMessage,
      messageCount: row.messageCount,
      updatedAt: row.updatedAt,
      current: row.id === conversation.id,
    })),
  });
});

conversationRoutes.get('/:conversationId/character', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  const row = await context.env.DB.prepare(
    `SELECT c.id, c.avatar_file_id AS avatarFileId,
       c.avatar_focal_x AS avatarFocalX, c.avatar_focal_y AS avatarFocalY,
       c.content_rating AS contentRating, c.language_code AS language,
       c.group_size AS groupSize, c.visibility, c.publish_state AS publishState,
       c.updated_at AS updatedAt,
       v.name, v.tagline, v.description,
       CASE WHEN c.personality_visible = 1 OR c.owner_id = ? THEN v.personality ELSE NULL END AS personality,
       v.first_message AS firstMessage, v.alternate_greetings_json AS alternateGreetingsJson,
       u.id AS creatorId, COALESCE(up.display_name, u.display_name) AS creatorName,
       u.role AS creatorRole,
       (SELECT cab.telegram_username FROM character_avatar_bots cab
        WHERE cab.character_id = c.id AND cab.status = 'ACTIVE'
        ORDER BY cab.updated_at DESC LIMIT 1) AS avatarBotUsername,
       (SELECT COUNT(*) FROM character_likes cl WHERE cl.character_id = c.id) AS likeCount,
       (SELECT COUNT(*) FROM character_bookmarks cb WHERE cb.character_id = c.id) AS bookmarkCount,
       (SELECT COUNT(*) FROM character_reviews cr WHERE cr.character_id = c.id) AS reviewCount,
       (SELECT ROUND(AVG(cr.rating), 2) FROM character_reviews cr WHERE cr.character_id = c.id) AS averageRating,
       EXISTS (SELECT 1 FROM character_likes mine_l WHERE mine_l.character_id = c.id AND mine_l.user_id = ?) AS liked,
       EXISTS (SELECT 1 FROM character_bookmarks mine_b WHERE mine_b.character_id = c.id AND mine_b.user_id = ?) AS bookmarked
     FROM characters c
     JOIN character_versions v ON v.id = COALESCE(?, c.active_version_id)
     JOIN users u ON u.id = c.owner_id
     LEFT JOIN user_profiles up ON up.user_id = u.id
     WHERE c.id = ? AND c.deleted_at IS NULL`,
  )
    .bind(
      principal.userId,
      principal.userId,
      principal.userId,
      conversation.characterVersionId,
      conversation.characterId,
    )
    .first<ChatCharacterRow>();
  if (!row) throw new AppError('CHARACTER_NOT_FOUND', 'Персонаж не найден.', 404);
  const publicReviews = await isFeatureEnabled(context.env.DB, 'public_reviews', principal.userId);
  const tags = await context.env.DB.prepare(
    `SELECT t.display_name AS displayName FROM character_tags ct JOIN tags t ON t.id = ct.tag_id
     WHERE ct.character_id = ? ORDER BY t.display_name`,
  )
    .bind(row.id)
    .all<{ displayName: string }>();
  let alternateGreetings: readonly string[];
  try {
    alternateGreetings = z
      .array(z.string().min(1))
      .max(10)
      .parse(JSON.parse(row.alternateGreetingsJson));
  } catch {
    alternateGreetings = [];
  }
  const { alternateGreetingsJson, liked, bookmarked, ...safe } = row;
  void alternateGreetingsJson;
  return context.json({
    ...safe,
    liked: liked === 1,
    bookmarked: bookmarked === 1,
    reviewCount: publicReviews ? row.reviewCount : 0,
    averageRating: publicReviews ? row.averageRating : null,
    alternateGreetings,
    tags: tags.results.map((tag) => tag.displayName),
    isOwner: row.creatorId === principal.userId,
    interactable:
      row.publishState === 'PUBLISHED' &&
      (row.visibility === 'PUBLIC' || row.visibility === 'UNLISTED'),
    estimatedTokens: Math.ceil(
      (row.description.length + (row.personality?.length ?? 0) + row.firstMessage.length) / 4,
    ),
  });
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
    `SELECT manual_context AS manualContext, auto_summary AS autoSummary,
     last_summarized_message_id AS lastSummarizedMessageId
     FROM conversation_memory WHERE conversation_id = ?`,
  )
    .bind(conversation.id)
    .first<{
      manualContext: string;
      autoSummary: string;
      lastSummarizedMessageId: string | null;
    }>();
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
    manualContext: state?.manualContext ?? '',
    autoSummary: state?.autoSummary ?? '',
    stale: conversation.memoryStale === 1,
    staleSinceMessageId: conversation.memoryStaleSinceMessageId,
    lastSummarizedMessageId: state?.lastSummarizedMessageId ?? null,
    estimatedTokens: Math.ceil(
      composePersistentMemory(state?.manualContext ?? '', state?.autoSummary ?? '').length / 4,
    ),
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

conversationRoutes.post('/:conversationId/memory/regenerate/preview', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  return context.json(
    await buildMemoryRegenerationPreview(context.env.DB, principal.userId, conversation.id),
  );
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
        `UPDATE conversations SET memory_stale = 0, memory_stale_since_message_id = NULL,
         updated_at = ?
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
    manualContext: input.manualContext,
    // The editor exposes one canonical document. Once the user saves it, the
    // edited document replaces the generated layer instead of being rendered
    // beside (or duplicated with) an older automatic summary.
    autoSummary: '',
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
    `SELECT ${memoryVersionProjection} FROM memory_versions
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
    `SELECT ${memoryVersionProjection} FROM memory_versions
     WHERE id = ? AND conversation_id = ?`,
  )
    .bind(context.req.param('versionId'), conversation.id)
    .first<MemoryVersionRow>();
  if (!source) throw new AppError('MEMORY_VERSION_NOT_FOUND', 'Версия памяти не найдена.', 404);
  const version = await writeMemoryVersion(context.env.DB, {
    userId: principal.userId,
    conversationId: conversation.id,
    manualContext: source.manualContext,
    autoSummary: source.autoSummary,
    fromMessageId: source.fromMessageId,
    toMessageId: source.toMessageId,
    provider: source.provider,
    model: source.model,
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
  const [character, messageCount, group] = await Promise.all([
    database
      .prepare(
        `SELECT v.name, v.tagline, c.avatar_file_id AS avatarFileId,
       c.avatar_focal_x AS avatarFocalX, c.avatar_focal_y AS avatarFocalY,
       c.content_rating AS contentRating, c.owner_id AS ownerId FROM characters c
       JOIN character_versions v ON v.id = ? WHERE c.id = ?`,
      )
      .bind(conversation.characterVersionId, conversation.characterId)
      .first<{
        name: string;
        tagline: string;
        avatarFileId: string | null;
        avatarFocalX: number;
        avatarFocalY: number;
        contentRating: string;
        ownerId: string;
      }>(),
    database
      .prepare(
        `SELECT
           (COUNT(CASE WHEN is_greeting = 0 THEN 1 END)
            + CASE WHEN COUNT(CASE WHEN is_greeting = 1 THEN 1 END) > 0 THEN 1 ELSE 0 END) AS count
         FROM messages
         WHERE conversation_id = ? AND deleted_at IS NULL AND role != 'INTERNAL'`,
      )
      .bind(id)
      .first<{ readonly count: number }>(),
    readConversationGroup(database, id),
  ]);
  if (!character) throw new AppError('CHARACTER_NOT_FOUND', 'Персонаж диалога не найден.', 409);
  return {
    ...toConversationSummary({
      ...conversation,
      characterName: group?.name ?? character.name,
      characterAvatarFileId: group?.avatarFileId ?? character.avatarFileId,
      characterAvatarFocalX: character.avatarFocalX,
      characterAvatarFocalY: character.avatarFocalY,
      lastMessage: null,
      messageCount: messageCount?.count ?? 0,
    }),
    character: {
      name: character.name,
      tagline: character.tagline,
      avatarFileId: character.avatarFileId,
      avatarFocalX: character.avatarFocalX,
      avatarFocalY: character.avatarFocalY,
      contentRating: character.contentRating,
    },
    settings: await readAccessibleConversationSettings(database, id, userId),
    group,
    promptInspectorAvailable: character.ownerId === userId || role === 'ADMIN' || role === 'OWNER',
  };
}

async function readConversationGroup(database: D1Database, conversationId: string) {
  const group = await database
    .prepare(
      `SELECT g.id, g.name, g.avatar_file_id AS avatarFileId,
       cg.routing_mode AS routingMode, cg.active_character_id AS activeCharacterId
       FROM conversation_character_groups cg
       JOIN character_groups g ON g.id = cg.group_id
       WHERE cg.conversation_id = ?`,
    )
    .bind(conversationId)
    .first<{
      id: string;
      name: string;
      avatarFileId: string | null;
      routingMode: 'CONTEXTUAL' | 'MANUAL';
      activeCharacterId: string;
    }>();
  if (!group) return null;
  const members = await database
    .prepare(
      `SELECT gm.character_id AS characterId, gm.position, v.name, v.tagline,
       c.avatar_file_id AS avatarFileId, c.avatar_focal_x AS avatarFocalX,
       c.avatar_focal_y AS avatarFocalY
       FROM conversation_group_members gm
       JOIN characters c ON c.id = gm.character_id
       JOIN character_versions v ON v.id = gm.character_version_id
       WHERE gm.conversation_id = ? ORDER BY gm.position ASC`,
    )
    .bind(conversationId)
    .all<{
      characterId: string;
      position: number;
      name: string;
      tagline: string;
      avatarFileId: string | null;
      avatarFocalX: number;
      avatarFocalY: number;
    }>();
  return { ...group, members: members.results };
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

interface GreetingVersionRow {
  readonly name: string;
  readonly firstMessage: string;
  readonly alternateGreetingsJson: string;
  readonly description: string;
  readonly scenario: string;
}

interface ExistingGreetingRow {
  readonly id: string;
  readonly content: string;
  readonly metadataJson: string | null;
  readonly createdAt: number;
}

function greetingIndexOf(row: Pick<ExistingGreetingRow, 'metadataJson'>): number | null {
  try {
    const parsed: unknown = JSON.parse(row.metadataJson ?? '');
    if (typeof parsed === 'object' && parsed !== null && 'greetingIndex' in parsed) {
      const index: unknown = parsed.greetingIndex;
      if (typeof index === 'number' && Number.isInteger(index) && index >= 0) return index;
    }
  } catch {
    return null;
  }
  return null;
}

export interface PlannedGreeting {
  readonly index: number;
  readonly content: string;
  readonly createdAt: number;
}

/**
 * Decides which greeting siblings a conversation is still missing.
 *
 * Matching is on rendered content, so a greeting the reader edited or
 * regenerated is left alone instead of being duplicated. Timestamps are laid
 * out from the anchor greeting's own position, so restored alternates sort in
 * greeting order and stay ahead of everything said afterwards.
 */
export function planGreetingBackfill(
  rendered: readonly string[],
  existing: readonly Pick<ExistingGreetingRow, 'content' | 'metadataJson' | 'createdAt'>[],
): readonly PlannedGreeting[] {
  const anchor = existing[0];
  if (rendered.length < 2 || !anchor) return [];
  const present = new Set(existing.map((row) => row.content));
  const anchorIndex = greetingIndexOf(anchor) ?? Math.max(0, rendered.indexOf(anchor.content));
  const base = anchor.createdAt - anchorIndex;
  return rendered.flatMap((content, index) =>
    present.has(content) ? [] : [{ index, content, createdAt: base + index }],
  );
}

/**
 * Adds the greeting siblings that a conversation is missing.
 *
 * Greetings only became sibling messages later, so conversations started before
 * that hold a single row and can never offer the alternates their character
 * defines. The rendered text depends on the persona and display name captured
 * when the chat began, which no SQL migration can reproduce, so the repair runs
 * here where that snapshot is available, once per conversation.
 */
async function materialiseGreetingVariants(
  database: D1Database,
  conversation: OwnedConversationRow,
): Promise<void> {
  const markRepaired = database
    .prepare('UPDATE conversations SET greetings_backfilled = 1 WHERE id = ?')
    .bind(conversation.id);
  const version = await database
    .prepare(
      `SELECT name, first_message AS firstMessage,
       alternate_greetings_json AS alternateGreetingsJson, description, scenario
       FROM character_versions WHERE id = ?`,
    )
    .bind(conversation.characterVersionId)
    .first<GreetingVersionRow>();
  const greetingOptions = version
    ? [version.firstMessage, ...parseAlternateGreetings(version.alternateGreetingsJson)]
    : [];
  if (!version || greetingOptions.length < 2) {
    await markRepaired.run();
    return;
  }
  const existing = await database
    .prepare(
      `SELECT id, content, metadata_json AS metadataJson, created_at AS createdAt
       FROM messages WHERE conversation_id = ? AND is_greeting = 1
       AND parent_message_id IS NULL AND deleted_at IS NULL
       ORDER BY created_at ASC, id ASC`,
    )
    .bind(conversation.id)
    .all<ExistingGreetingRow>();
  const persona = ((): { readonly name?: string } | null => {
    if (!conversation.personaSnapshotJson) return null;
    try {
      return JSON.parse(conversation.personaSnapshotJson) as { readonly name?: string };
    } catch {
      return null;
    }
  })();
  const user = await database
    .prepare('SELECT display_name AS displayName FROM users WHERE id = ?')
    .bind(conversation.userId)
    .first<{ displayName: string }>();
  const rendered = renderConversationGreetings(greetingOptions, {
    char: version.name,
    user: persona?.name ?? user?.displayName ?? 'User',
    persona: persona?.name ?? '',
    scenario: version.scenario,
    description: version.description,
  });
  const planned = planGreetingBackfill(rendered, existing.results);
  if (planned.length === 0) {
    await markRepaired.run();
    return;
  }
  await database.batch([
    ...planned.map((greeting) =>
      database
        .prepare(
          `INSERT INTO messages (
             id, conversation_id, role, content, content_format, status,
             is_greeting, edited_by_user, origin, metadata_json, created_at, updated_at
           ) VALUES (?, ?, 'ASSISTANT', ?, 'MARKDOWN', 'COMPLETED', 1, 0,
             'CHARACTER_GREETING', ?, ?, ?)`,
        )
        .bind(
          createId(),
          conversation.id,
          greeting.content,
          JSON.stringify({ greetingIndex: greeting.index }),
          greeting.createdAt,
          greeting.createdAt,
        ),
    ),
    markRepaired,
  ]);
}

export function renderConversationGreetings(
  greetings: readonly string[],
  identity: {
    readonly char: string;
    readonly user: string;
    readonly persona: string;
    readonly scenario: string;
    readonly description: string;
  },
): readonly string[] {
  return greetings.map(
    (greeting) =>
      renderResolvedTemplate(greeting, {
        ...identity,
        memory: '',
      }).value,
  );
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

export async function readAccessibleConversationSettings(
  database: D1Database,
  conversationId: string,
  userId: string,
): Promise<ConversationSettingsRow> {
  const settings = await readConversationSettings(database, conversationId);
  const plan = await readEffectivePlan(database, userId);
  const accessibleModelProfileId = await readRoleplayModelIdForPlan(
    database,
    plan.code,
    settings.modelProfileId,
  );
  if (accessibleModelProfileId === settings.modelProfileId) return settings;
  const timestamp = nowMs();
  await database
    .prepare(
      `UPDATE conversation_settings SET model_profile_id = ?, updated_at = ?
       WHERE conversation_id = ? AND model_profile_id = ?`,
    )
    .bind(accessibleModelProfileId, timestamp, conversationId, settings.modelProfileId)
    .run();
  return { ...settings, modelProfileId: accessibleModelProfileId };
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

async function requireReactableGeneration(
  database: D1Database,
  conversationId: string,
  generationId: string,
): Promise<void> {
  const row = await database
    .prepare(
      `SELECT g.id FROM message_generations g
       JOIN messages response ON response.id = g.response_message_id
       WHERE g.id = ? AND g.conversation_id = ?
         AND response.conversation_id = ? AND response.role = 'ASSISTANT'
         AND response.deleted_at IS NULL`,
    )
    .bind(generationId, conversationId, conversationId)
    .first<{ readonly id: string }>();
  if (!row) {
    throw new AppError('MESSAGE_GENERATION_NOT_FOUND', 'Генерация ответа не найдена.', 404);
  }
}

async function readGenerationReactions(
  database: D1Database,
  userId: string,
  conversationId: string,
): Promise<ReadonlyMap<string, GenerationReactionInfo>> {
  const result = await database
    .prepare(
      `SELECT g.response_message_id AS messageId, g.id AS generationId, r.reaction
       FROM message_generations g
       LEFT JOIN message_generation_reactions r
         ON r.generation_id = g.id AND r.user_id = ?
       WHERE g.conversation_id = ? AND g.response_message_id IS NOT NULL
       ORDER BY g.created_at DESC LIMIT 500`,
    )
    .bind(userId, conversationId)
    .all<GenerationReactionRow>();
  const byMessageId = new Map<string, GenerationReactionInfo>();
  for (const row of result.results) {
    if (byMessageId.has(row.messageId)) continue;
    byMessageId.set(row.messageId, {
      generationId: row.generationId,
      reaction: row.reaction,
    });
  }
  return byMessageId;
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
    characterAvatarFocalX: row.characterAvatarFocalX,
    characterAvatarFocalY: row.characterAvatarFocalY,
    personaName: conversationPersonaName(row.personaSnapshotJson),
    lastMessage: row.lastMessage,
    messageCount: row.messageCount,
    siblingCount: row.siblingCount ?? 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function escapeConversationLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

export function conversationPersonaName(snapshot: string | null): string | null {
  if (!snapshot) return null;
  try {
    const parsed: unknown = JSON.parse(snapshot);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const name = (parsed as Readonly<Record<string, unknown>>)['name'];
    return typeof name === 'string' && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
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
  return {
    ...safe,
    isGreeting: row.isGreeting === 1,
    editedByUser: row.editedByUser === 1,
    metadata,
    generationId: null,
    reaction: null,
  };
}

export function withVariantInfo(
  visibleMessages: readonly MessageRow[],
  allMessages: readonly MessageRow[],
  generationReactions: ReadonlyMap<string, GenerationReactionInfo> = new Map(),
): readonly MessageResponse[] {
  const siblingGroups = new Map<string, readonly MessageRow[]>();
  for (const candidate of allMessages) {
    if (candidate.role === 'INTERNAL') continue;
    const key = variantGroupKey(candidate);
    const current = siblingGroups.get(key) ?? [];
    siblingGroups.set(key, [...current, candidate]);
  }
  return visibleMessages.map((message) => {
    const key = variantGroupKey(message);
    const siblings = siblingGroups.get(key) ?? [message];
    const variantIndex = Math.max(
      0,
      siblings.findIndex((candidate) => candidate.id === message.id),
    );
    return {
      ...toMessageResponse(message),
      generationId: generationReactions.get(message.id)?.generationId ?? null,
      reaction: generationReactions.get(message.id)?.reaction ?? null,
      variantIndex,
      variantCount: siblings.length,
      variantIds: siblings.map((candidate) => candidate.id),
    };
  });
}

function variantGroupKey(message: Pick<MessageRow, 'parentMessageId' | 'role'>): string {
  const parent = message.parentMessageId === null ? 'root:' : `parent:${message.parentMessageId}:`;
  return `${parent}${message.role}`;
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
  readonly memoryStaleSinceMessageId?: string | null;
  readonly role: 'USER' | 'ASSISTANT';
  readonly contentFormat?: 'PLAIN_TEXT' | 'MARKDOWN';
  readonly isGreeting?: boolean;
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
         (id, conversation_id, role, content, content_format, status, parent_message_id,
          is_greeting, edited_by_user, origin, metadata_json, created_at, updated_at, edited_at)
         VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.messageId,
          input.conversationId,
          input.role,
          input.content,
          input.contentFormat ?? 'MARKDOWN',
          input.parentMessageId,
          input.isGreeting ? 1 : 0,
          input.operation === 'EDIT_MESSAGE' ? 1 : 0,
          input.operation === 'EDIT_MESSAGE' ? 'USER_EDIT' : 'USER_INPUT',
          input.metadataJson,
          input.timestamp,
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
          `UPDATE conversations SET active_leaf_message_id = ?,
           memory_stale = CASE WHEN ? = 1 THEN 1 ELSE memory_stale END,
           memory_stale_since_message_id = CASE WHEN ? = 1 THEN ?
             ELSE memory_stale_since_message_id END, updated_at = ?
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
        )
        .bind(
          input.messageId,
          input.memoryStale ? 1 : 0,
          input.memoryStale ? 1 : 0,
          input.memoryStaleSinceMessageId ?? input.messageId,
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
      `SELECT mv.id, mv.content, mv.manual_context AS manualContext,
       mv.auto_summary AS autoSummary, mv.source AS sourceType,
       mv.from_message_id AS fromMessageId, mv.to_message_id AS toMessageId,
       mv.provider, mv.model, mv.created_at AS createdAt,
       mv.previous_version_id AS previousVersionId
       FROM conversation_memory cm JOIN memory_versions mv ON mv.id = cm.current_version_id
       WHERE cm.conversation_id = ?`,
    )
    .bind(conversationId)
    .first<MemoryVersionRow>();
}

interface MemoryWriteInput {
  readonly userId: string;
  readonly conversationId: string;
  readonly manualContext: string;
  readonly autoSummary: string;
  readonly fromMessageId?: string | null;
  readonly toMessageId?: string | null;
  readonly provider?: string | null;
  readonly model?: string | null;
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
  const content = composePersistentMemory(input.manualContext, input.autoSummary);
  try {
    await database.batch([
      database
        .prepare(
          `INSERT INTO memory_versions
          (id, conversation_id, content, manual_context, auto_summary, source,
          from_message_id, to_message_id, provider, model, created_at, created_by,
          previous_version_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          versionId,
          input.conversationId,
          content,
          input.manualContext,
          input.autoSummary,
          input.sourceType,
          input.fromMessageId ?? null,
          input.toMessageId ?? null,
          input.provider ?? null,
          input.model ?? null,
          timestamp,
          input.userId,
          previous?.id ?? null,
        ),
      database
        .prepare(
          `UPDATE conversation_memory SET current_version_id = ?, manual_context = ?,
           auto_summary = ?, updated_at = ?
         WHERE conversation_id = ?`,
        )
        .bind(versionId, input.manualContext, input.autoSummary, timestamp, input.conversationId),
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
      `SELECT ${memoryVersionProjection} FROM memory_versions
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
