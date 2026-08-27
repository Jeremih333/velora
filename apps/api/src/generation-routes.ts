import {
  AIProviderError,
  BotHubProvider,
  isTransientAIError,
  type AIUsage,
  type ModelPrice,
} from '@velora/ai';
import { generationCreateSchema, type ResponseLength } from '@velora/domain';
import { composePersistentMemory } from '@velora/memory';
import {
  buildRoleplayPrompt,
  type RoleplayCharacterPrompt,
  type RoleplayHistoryMessage,
  type RoleplayPersonaPrompt,
} from '@velora/prompts';
import { AppError, asError, createId, nowMs, ru } from '@velora/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  readAccessibleConversationSettings,
  requireOwnedConversation,
  type OwnedConversationRow,
} from './conversation-routes';
import type { Env, Variables } from './types';
import { readActiveLore } from './lore-runtime';
import { enqueueAutomaticMemoryIfNeeded, processDueMemoryJobs } from './memory-jobs';
import type { ProductEventName } from './reliability';
import { isGenerationTierEnabled, isPaidAiReady } from './paid-ai';
import { readEffectivePlan, requireModelProfile as requirePlanModelProfile } from './plans';
import { canUseModelTier } from './model-registry';
import { requireEffectiveRoleplayModelProfile } from './model-registry-config';
import { readResponseLengthLimit, readResponseLengthPromptInstruction } from './response-lengths';

interface GenerationEnvironment {
  Bindings: Env;
  Variables: Variables;
}

interface ModelProfileRow {
  readonly name: 'BALANCED' | 'CREATIVE' | 'PREMIUM';
  readonly provider: 'BOTHUB';
  readonly model: string;
  readonly temperature: number;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly fallbackModelsJson: string;
  readonly costPolicyJson: string;
  readonly contextWindow: number;
}

export interface GenerationCandidate {
  readonly provider: 'BOTHUB';
  readonly model: string;
  readonly price: ModelPrice;
  readonly contextWindow: number;
}

interface GenerationMessageRow {
  readonly id: string;
  readonly role: 'USER' | 'ASSISTANT' | 'INTERNAL';
  readonly content: string;
  readonly status: string;
  readonly isGreeting: number;
}

interface PromptCharacterRow extends RoleplayCharacterPrompt {
  readonly contentRating: 'SAFE' | 'MATURE';
}

interface GenerationRecordRow {
  readonly id: string;
  readonly responseMessageId: string | null;
  readonly state: 'PENDING' | 'STREAMING' | 'COMPLETED' | 'STOPPED' | 'FAILED';
}

const costPolicySchema = z.object({
  maxInputUsdPerMillion: z.number().positive(),
  maxOutputUsdPerMillion: z.number().positive(),
  fixedRequestUsd: z.number().nonnegative(),
});
const fallbackModelSchema = z
  .object({
    provider: z.literal('BOTHUB'),
    model: z.string().min(1).max(128),
    maxInputUsdPerMillion: z.number().positive(),
    maxOutputUsdPerMillion: z.number().positive(),
    fixedRequestUsd: z.number().nonnegative(),
    contextWindow: z.number().int().min(2_048).max(2_000_000).default(8_192),
  })
  .strict();
const fallbackModelsSchema = z.array(fallbackModelSchema).max(2);
const personaSchema = z.object({
  name: z.string(),
  shortDescription: z.string(),
  longDescription: z.string(),
  personality: z.string(),
  appearance: z.string(),
  speakingStyle: z.string(),
  background: z.string(),
  pronouns: z.string(),
  representedAge: z.string().nullable(),
  customNotes: z.string(),
});

export const generationRoutes = new Hono<GenerationEnvironment>();

generationRoutes.get('/:conversationId/prompt-inspector', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  const character = await context.env.DB.prepare(
    'SELECT owner_id AS ownerId FROM characters WHERE id = ? AND deleted_at IS NULL',
  )
    .bind(conversation.characterId)
    .first<{ ownerId: string }>();
  if (!character) {
    throw new AppError('CHARACTER_NOT_FOUND', 'Персонаж диалога не найден.', 409);
  }
  const privileged = principal.role === 'ADMIN' || principal.role === 'OWNER';
  if (character.ownerId !== principal.userId && !privileged) {
    throw new AppError(
      'PROMPT_INSPECTOR_FORBIDDEN',
      'Инспектор доступен только создателю персонажа и администрации.',
      403,
    );
  }
  if (!conversation.activeMessageId) {
    throw new AppError('PROMPT_INSPECTOR_EMPTY', 'В диалоге пока нет активной ветки.', 409);
  }
  const settings = await readAccessibleConversationSettings(
    context.env.DB,
    conversation.id,
    principal.userId,
  );
  requirePlanModelProfile(
    await readEffectivePlan(context.env.DB, principal.userId),
    settings.modelProfile,
  );
  const profile = await resolveModelProfile(
    context.env.DB,
    settings.modelProfile,
    settings.modelProfileId,
  );
  const responseLengthLimit = readResponseLengthLimit(settings.responseLength);
  const outputTokens = Math.min(
    settings.maxOutputTokens,
    profile.maxOutputTokens,
    responseLengthLimit,
  );
  const prompt = await assemblePrompt(context.env.DB, conversation, conversation.activeMessageId, {
    maxContextTokens: Math.min(32_000, profile.contextWindow - outputTokens),
    outputTokens,
    customInstructions: settings.customInstructions,
    responseLength: settings.responseLength,
    personaMode: settings.personaMode,
    continuation: false,
  });
  return context.json({
    ...prompt.inspection,
    selectedModel: {
      profileId: settings.modelProfileId,
      providerModelId: profile.model,
    },
    includedLoreEntries: prompt.includedLoreEntries,
    includedExampleMessages: prompt.includedExampleMessages,
    droppedExampleMessages: prompt.droppedExampleMessages,
    droppedHistoryMessages: prompt.droppedHistoryMessages,
    unknownTemplateVariables: prompt.unknownTemplateVariables,
  });
});

generationRoutes.post('/:conversationId/generate', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  if (conversation.state !== 'ACTIVE') {
    throw new AppError('CONVERSATION_ARCHIVED', 'Сначала верните диалог из архива.', 409);
  }
  const botHubApiKey = context.env.BOTHUB_API_KEY;
  if (!botHubApiKey) {
    throw new AppError('AI_NOT_CONFIGURED', 'AI-провайдер пока не подключён.', 503);
  }
  const input = generationCreateSchema.parse(await context.req.json());
  const replay = await findGenerationByKey(context.env.DB, conversation.id, input.idempotencyKey);
  if (replay) {
    throw new AppError('GENERATION_ALREADY_EXISTS', 'Этот запрос генерации уже обработан.', 409, [
      replay,
    ]);
  }
  const parentMessageId = input.parentMessageId ?? conversation.activeMessageId;
  if (!parentMessageId)
    throw new AppError('USER_MESSAGE_REQUIRED', 'Сначала отправьте реплику.', 409);
  const parent = await requireGenerationParent(context.env.DB, conversation.id, parentMessageId);
  const expectedRole = input.mode === 'REPLY' ? 'USER' : 'ASSISTANT';
  if (
    parent.role !== expectedRole ||
    (input.mode === 'GREETING' && !parent.isGreeting) ||
    (parent.status !== 'COMPLETED' &&
      parent.status !== 'STOPPED' &&
      !(input.mode === 'CONTINUE' && parent.status === 'FAILED' && parent.content.trim()))
  ) {
    throw new AppError(
      'USER_MESSAGE_REQUIRED',
      input.mode === 'GREETING'
        ? 'Перегенерировать можно только приветствие этого диалога.'
        : input.mode === 'CONTINUE'
          ? 'Продолжить можно только завершённый ответ персонажа.'
          : 'Генерация начинается после реплики пользователя.',
      409,
    );
  }
  const settings = await readAccessibleConversationSettings(
    context.env.DB,
    conversation.id,
    principal.userId,
  );
  requirePlanModelProfile(
    await readEffectivePlan(context.env.DB, principal.userId),
    settings.modelProfile,
  );
  const plan = await readEffectivePlan(context.env.DB, principal.userId);
  const selectedRegistryModel = await requireEffectiveRoleplayModelProfile(
    context.env.DB,
    settings.modelProfileId,
  );
  const aiEnabled = isGenerationTierEnabled(context.env, selectedRegistryModel.tier);
  if (!aiEnabled) {
    throw new AppError(
      selectedRegistryModel.tier === 'free' ? 'SPONSORED_FREE_AI_DISABLED' : 'PAID_AI_DISABLED',
      ru.paidAi.disabled,
      503,
    );
  }
  if (!canUseModelTier(plan.code, selectedRegistryModel.tier)) {
    throw new AppError('PLAN_ENTITLEMENT_REQUIRED', ru.billing.planRequired, 403);
  }
  const profile = await resolveModelProfile(
    context.env.DB,
    settings.modelProfile,
    settings.modelProfileId,
  );
  if (
    !(await isPaidAiReady({
      enabled: 'true',
      database: context.env.DB,
      model: profile.model,
    }))
  ) {
    throw new AppError('PAID_AI_NOT_READY', ru.paidAi.notReady, 503);
  }
  const responseLengthLimit = readResponseLengthLimit(settings.responseLength);
  const maxOutputTokens = Math.min(
    settings.maxOutputTokens,
    profile.maxOutputTokens,
    responseLengthLimit,
  );
  const policy = costPolicySchema.parse(JSON.parse(profile.costPolicyJson));
  const candidates = resolveGenerationCandidates(profile, policy);
  const promptsByModel = new Map(
    await Promise.all(
      candidates.map(async (candidate) => {
        const inputBudget = calculateInputContextBudget(candidate.contextWindow, maxOutputTokens);
        if (inputBudget < 1_024) {
          throw new AppError(
            'MODEL_CONTEXT_TOO_SMALL',
            'Контекстное окно выбранной модели недостаточно для ответа.',
            409,
          );
        }
        const candidatePrompt = await assemblePrompt(context.env.DB, conversation, parent.id, {
          maxContextTokens: inputBudget,
          outputTokens: maxOutputTokens,
          customInstructions: settings.customInstructions,
          responseLength: settings.responseLength,
          personaMode: settings.personaMode,
          continuation: input.mode === 'CONTINUE',
          greetingRegeneration: input.mode === 'GREETING',
        });
        return [candidate.model, candidatePrompt] as const;
      }),
    ),
  );
  const maximumBillableCostMicros = Math.max(
    ...candidates.map((candidate) => {
      const candidatePrompt = promptsByModel.get(candidate.model);
      if (!candidatePrompt) throw new Error('Candidate prompt was not assembled.');
      return estimateMaximumCostMicros(
        candidate.price,
        candidatePrompt.estimatedInputTokens,
        maxOutputTokens,
      );
    }),
  );
  const attemptPlan = [candidates[0], candidates[0], ...candidates.slice(1)].filter(
    (candidate): candidate is GenerationCandidate => candidate !== undefined,
  );
  const maximumProviderCostMicros = attemptPlan.reduce((total, candidate) => {
    const candidatePrompt = promptsByModel.get(candidate.model);
    if (!candidatePrompt) throw new Error('Candidate prompt was not assembled.');
    return (
      total +
      estimateMaximumCostMicros(
        candidate.price,
        candidatePrompt.estimatedInputTokens,
        maxOutputTokens,
      )
    );
  }, 0);
  await releaseExpiredGeneration(context.env.DB, conversation.id, principal.userId);
  const existingGroup = await context.env.DB.prepare(
    `SELECT generation_group_id AS generationGroupId FROM messages
     WHERE conversation_id = ?
       AND ((? = 'GREETING' AND is_greeting = 1 AND role = 'ASSISTANT')
         OR (? != 'GREETING' AND parent_message_id = ? AND role = 'ASSISTANT'))
       AND generation_group_id IS NOT NULL AND deleted_at IS NULL
     ORDER BY created_at ASC LIMIT 1`,
  )
    .bind(conversation.id, input.mode, input.mode, parent.id)
    .first<{ generationGroupId: string }>();
  const ids = await prepareGeneration(context.env, {
    userId: principal.userId,
    conversationId: conversation.id,
    requestMessageId: parent.id,
    idempotencyKey: input.idempotencyKey,
    provider: profile.provider,
    model: profile.model,
    maximumBillableCostMicros,
    maximumProviderCostMicros,
    timeoutMs: profile.timeoutMs,
    responseParentMessageId: input.mode === 'GREETING' ? null : parent.id,
    isGreeting: input.mode === 'GREETING',
    generationGroupId:
      input.mode !== 'CONTINUE' && existingGroup ? existingGroup.generationGroupId : createId(),
    sponsoredFree: true,
    planDailyRequestLimit: planDailyRequestLimit(plan.code),
  });
  const requestSignal = context.req.raw.signal;
  const requestId = context.get('requestId');
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let output = '';
      let deltaCount = 0;
      let firstDeltaRecorded = false;
      let stopped = false;
      let attemptedProviderCostMicros = 0;
      const abortController = new AbortController();
      const abortFromClient = () => {
        abortController.abort();
      };
      requestSignal.addEventListener('abort', abortFromClient, { once: true });
      try {
        controller.enqueue(
          sse(encoder, 'meta', {
            generationId: ids.generationId,
            responseMessageId: ids.responseMessageId,
          }),
        );
        let completedGeneration = false;
        attempts: for (let attemptIndex = 0; attemptIndex < attemptPlan.length; attemptIndex += 1) {
          const candidate = attemptPlan[attemptIndex];
          if (!candidate) continue;
          const candidatePrompt = promptsByModel.get(candidate.model);
          if (!candidatePrompt) throw new Error('Candidate prompt was not assembled.');
          const candidateMaximumCostMicros = estimateMaximumCostMicros(
            candidate.price,
            candidatePrompt.estimatedInputTokens,
            maxOutputTokens,
          );
          attemptedProviderCostMicros += candidateMaximumCostMicros;
          await activateGenerationAttempt(context.env.DB, ids, conversation.id, candidate);
          const provider = new BotHubProvider({
            apiKey: botHubApiKey,
            prices: { [candidate.model]: candidate.price },
            ...(context.env.ENVIRONMENT === 'local' && context.env.BOTHUB_BASE_URL
              ? { endpoint: context.env.BOTHUB_BASE_URL }
              : {}),
          });
          try {
            for await (const event of provider.stream(
              {
                requestId,
                model: candidate.model,
                messages: candidatePrompt.messages,
                temperature: settings.temperature,
                maxOutputTokens,
                maxCostUsd: candidateMaximumCostMicros / 1_000_000,
              },
              abortController.signal,
            )) {
              if (event.type === 'delta') {
                if (!firstDeltaRecorded) {
                  firstDeltaRecorded = true;
                  await recordFirstTokenLatency(context.env.DB, ids.aiRequestId);
                }
                if (output.length + event.text.length > 100_000) {
                  abortController.abort();
                  throw new AIProviderError(
                    'AI_OUTPUT_LIMIT',
                    'Provider output exceeded the server safety limit.',
                    false,
                  );
                }
                output += event.text;
                deltaCount += 1;
                if (deltaCount % 12 === 0) {
                  stopped = await isStopped(context.env.DB, ids.generationId, conversation.id);
                  if (stopped) {
                    abortController.abort();
                    break attempts;
                  }
                }
                controller.enqueue(sse(encoder, 'delta', { text: event.text }));
                continue;
              }
              stopped = await isStopped(context.env.DB, ids.generationId, conversation.id);
              if (stopped) {
                abortController.abort();
                break attempts;
              }
              const completed = await completeGeneration(context.env.DB, {
                ...ids,
                userId: principal.userId,
                conversationId: conversation.id,
                output,
                provider: candidate.provider,
                model: candidate.model,
                usage: event.usage,
                finishReason: event.finishReason,
                providerActualCostMicros:
                  attemptedProviderCostMicros -
                  candidateMaximumCostMicros +
                  Math.ceil(event.usage.costUsd * 1_000_000),
                includedLoreEntries: candidatePrompt.includedLoreEntries,
                productEventName:
                  input.mode === 'GREETING' || (input.mode === 'REPLY' && existingGroup)
                    ? 'REGENERATED'
                    : 'GENERATION_COMPLETED',
              });
              if (!completed) {
                stopped = true;
                break attempts;
              }
              context.executionCtx.waitUntil(
                (async () => {
                  await enqueueAutomaticMemoryIfNeeded(context.env.DB, {
                    conversationId: conversation.id,
                    userId: principal.userId,
                    responseMessageId: ids.responseMessageId,
                  });
                  await processDueMemoryJobs(context.env.DB, 1);
                })(),
              );
              controller.enqueue(
                sse(encoder, 'done', {
                  generationId: ids.generationId,
                  responseMessageId: ids.responseMessageId,
                  finishReason: event.finishReason,
                  usage: event.usage,
                  includedLoreEntries: candidatePrompt.includedLoreEntries,
                }),
              );
              completedGeneration = true;
              break attempts;
            }
          } catch (error) {
            const canTryNext =
              output.length === 0 &&
              isTransientAIError(error) &&
              attemptIndex < attemptPlan.length - 1 &&
              !requestSignal.aborted;
            if (!canTryNext) throw error;
            await waitForRetry(100 * 2 ** Math.min(attemptIndex, 3), abortController.signal);
          }
        }
        if (stopped) {
          await stopGenerationPersistence(
            context.env.DB,
            ids,
            conversation.id,
            output,
            attemptedProviderCostMicros,
          );
          controller.enqueue(sse(encoder, 'stopped', { generationId: ids.generationId }));
        } else if (!completedGeneration) {
          throw new AIProviderError(
            'AI_FALLBACK_EXHAUSTED',
            'Every configured generation attempt failed.',
            true,
          );
        }
      } catch (error) {
        if (requestSignal.aborted) {
          await stopGenerationPersistence(
            context.env.DB,
            ids,
            conversation.id,
            output,
            attemptedProviderCostMicros,
          );
        } else {
          await failGeneration(
            context.env.DB,
            ids,
            conversation.id,
            output,
            error,
            attemptedProviderCostMicros,
          );
          controller.enqueue(
            sse(encoder, 'error', {
              code: error instanceof AIProviderError ? error.code : 'GENERATION_FAILED',
              message: 'Не удалось завершить ответ. Попробуйте ещё раз.',
            }),
          );
        }
      } finally {
        requestSignal.removeEventListener('abort', abortFromClient);
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
});

generationRoutes.post('/:conversationId/generate/:generationId/stop', async (context) => {
  const principal = context.get('principal');
  const conversation = await requireOwnedConversation(
    context.env.DB,
    principal.userId,
    context.req.param('conversationId'),
  );
  const result = await context.env.DB.prepare(
    `UPDATE message_generations SET state = 'STOPPED', completed_at = ?
     WHERE id = ? AND conversation_id = ? AND state IN ('PENDING', 'STREAMING')`,
  )
    .bind(nowMs(), context.req.param('generationId'), conversation.id)
    .run();
  if (result.meta.changes === 0) {
    throw new AppError('GENERATION_NOT_ACTIVE', 'Активная генерация не найдена.', 404);
  }
  return context.json({ stopped: true });
});

async function assemblePrompt(
  database: D1Database,
  conversation: OwnedConversationRow,
  parentMessageId: string,
  settings: {
    readonly maxContextTokens: number;
    readonly outputTokens: number;
    readonly customInstructions: string;
    readonly responseLength: ResponseLength;
    readonly personaMode: 'SNAPSHOT' | 'LIVE';
    readonly continuation: boolean;
    readonly greetingRegeneration?: boolean;
  },
) {
  const effectiveConversation = await resolveGroupSpeaker(database, conversation, parentMessageId);
  const character = await database
    .prepare(
      `SELECT v.name, v.description, v.personality, v.scenario,
       v.speech_style AS speechStyle, v.appearance, v.background, v.goals,
       v.behaviour_rules AS behaviourRules, v.system_instructions AS systemInstructions,
       v.post_history_instructions AS postHistoryInstructions,
       v.example_dialogues AS exampleDialogues,
       c.content_rating AS contentRating
       FROM character_versions v JOIN characters c ON c.id = v.character_id
       WHERE v.id = ? AND c.id = ?`,
    )
    .bind(effectiveConversation.characterVersionId, effectiveConversation.characterId)
    .first<PromptCharacterRow>();
  if (!character)
    throw new AppError('CHARACTER_VERSION_MISSING', 'Версия персонажа недоступна.', 409);
  const persona = await resolvePromptPersona(database, effectiveConversation, settings.personaMode);
  const memory = await database
    .prepare(
      `SELECT manual_context AS manualContext, auto_summary AS autoSummary
       FROM conversation_memory WHERE conversation_id = ?`,
    )
    .bind(conversation.id)
    .first<{ manualContext: string; autoSummary: string }>();
  const historyResult = await database
    .prepare(
      `WITH RECURSIVE branch(id, parentId, role, content, status, depth) AS (
       SELECT id, parent_message_id, role, content, status, 0 FROM messages
       WHERE id = ? AND conversation_id = ? AND deleted_at IS NULL
       UNION ALL
       SELECT m.id, m.parent_message_id, m.role, m.content, m.status, b.depth + 1
       FROM messages m JOIN branch b ON m.id = b.parentId
       WHERE m.conversation_id = ? AND m.deleted_at IS NULL AND b.depth < 99
       ) SELECT role, content FROM branch
       WHERE role IN ('USER', 'ASSISTANT') AND status IN ('COMPLETED', 'STOPPED', 'FAILED')
       ORDER BY depth DESC`,
    )
    .bind(parentMessageId, conversation.id, conversation.id)
    .all<RoleplayHistoryMessage>();
  const user = await database
    .prepare('SELECT display_name AS displayName FROM users WHERE id = ? AND deleted_at IS NULL')
    .bind(conversation.userId)
    .first<{ displayName: string }>();
  const effectivePlan = await readEffectivePlan(database, conversation.userId);
  const activeLore = await readActiveLore(database, {
    conversationId: conversation.id,
    characterId: effectiveConversation.characterId,
    userId: conversation.userId,
    contextMessages: historyResult.results.map((message) => message.content),
    characterName: character.name,
    userName: persona?.name ?? user?.displayName ?? 'User',
    totalTokenBudget: effectivePlan.entitlements.loreTokenBudget,
    forceActivateAll: true,
  });
  return buildRoleplayPrompt({
    character,
    persona,
    userName: user?.displayName ?? 'User',
    memory: truncateToTokenBudget(
      composePersistentMemory(memory?.manualContext ?? '', memory?.autoSummary ?? ''),
      effectivePlan.entitlements.memoryTokenBudget,
    ),
    lore: activeLore.entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      content: entry.content,
    })),
    customInstructions: [
      settings.customInstructions,
      readResponseLengthPromptInstruction(settings.responseLength),
      settings.continuation
        ? 'Продолжи непосредственно предыдущий ответ персонажа без повторов, заголовков и метакомментариев.'
        : '',
      settings.greetingRegeneration
        ? 'Создай новый самостоятельный вариант первого приветствия персонажа для начала этой ролевой истории. Не продолжай старое приветствие, не упоминай переписывание и не добавляй метакомментарии.'
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
    history: historyResult.results,
    maxContextTokens: settings.maxContextTokens,
    outputTokens: settings.outputTokens,
  });
}

interface GroupSpeakerCandidate {
  readonly characterId: string;
  readonly characterVersionId: string;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly position: number;
}

async function resolveGroupSpeaker(
  database: D1Database,
  conversation: OwnedConversationRow,
  parentMessageId: string,
): Promise<OwnedConversationRow> {
  const group = await database
    .prepare(
      `SELECT routing_mode AS routingMode, active_character_id AS activeCharacterId
       FROM conversation_character_groups WHERE conversation_id = ?`,
    )
    .bind(conversation.id)
    .first<{ routingMode: 'CONTEXTUAL' | 'MANUAL'; activeCharacterId: string }>();
  if (!group) return conversation;
  const candidates = await database
    .prepare(
      `SELECT m.character_id AS characterId, m.character_version_id AS characterVersionId,
       m.position, v.name, v.tagline, v.description
       FROM conversation_group_members m
       JOIN character_versions v ON v.id = m.character_version_id
       WHERE m.conversation_id = ? ORDER BY m.position ASC`,
    )
    .bind(conversation.id)
    .all<GroupSpeakerCandidate>();
  let selected = candidates.results.find(
    (candidate) => candidate.characterId === group.activeCharacterId,
  );
  if (group.routingMode === 'CONTEXTUAL') {
    const latestUser = await database
      .prepare(
        `WITH RECURSIVE branch(id, parent_id, role, content, depth) AS (
          SELECT id, parent_message_id, role, content, 0 FROM messages
          WHERE id = ? AND conversation_id = ?
          UNION ALL
          SELECT m.id, m.parent_message_id, m.role, m.content, b.depth + 1
          FROM messages m JOIN branch b ON m.id = b.parent_id
          WHERE m.conversation_id = ? AND b.depth < 99
        ) SELECT content FROM branch WHERE role = 'USER' ORDER BY depth ASC LIMIT 1`,
      )
      .bind(parentMessageId, conversation.id, conversation.id)
      .first<{ readonly content: string }>();
    selected =
      selectContextualGroupSpeaker(latestUser?.content ?? '', candidates.results) ?? selected;
  }
  if (!selected)
    throw new AppError('GROUP_SPEAKER_UNAVAILABLE', 'В группе нет доступного персонажа.', 409);
  if (selected.characterId !== group.activeCharacterId) {
    await database
      .prepare(
        'UPDATE conversation_character_groups SET active_character_id = ? WHERE conversation_id = ?',
      )
      .bind(selected.characterId, conversation.id)
      .run();
  }
  return {
    ...conversation,
    characterId: selected.characterId,
    characterVersionId: selected.characterVersionId,
  };
}

export function selectContextualGroupSpeaker<T extends GroupSpeakerCandidate>(
  message: string,
  candidates: readonly T[],
): T | null {
  const normalized = message.toLocaleLowerCase('ru').replaceAll('ё', 'е');
  const words = new Set(normalized.match(/[\p{L}\p{N}]{3,}/gu) ?? []);
  let winner: { readonly candidate: T; readonly score: number } | null = null;
  for (const candidate of candidates) {
    const name = candidate.name.toLocaleLowerCase('ru').replaceAll('ё', 'е');
    const descriptor = `${candidate.name} ${candidate.tagline} ${candidate.description}`
      .toLocaleLowerCase('ru')
      .replaceAll('ё', 'е');
    const descriptorWords = new Set(descriptor.match(/[\p{L}\p{N}]{3,}/gu) ?? []);
    let score = normalized.includes(name) ? 100 : 0;
    for (const word of words) if (descriptorWords.has(word)) score += 1;
    if (winner === null || score > winner.score) winner = { candidate, score };
  }
  return winner && winner.score > 0 ? winner.candidate : null;
}

function truncateToTokenBudget(value: string, tokenBudget: number): string {
  if (Math.ceil(value.length / 4) <= tokenBudget) return value;
  return Array.from(value)
    .slice(0, tokenBudget * 4)
    .join('');
}

async function resolvePromptPersona(
  database: D1Database,
  conversation: OwnedConversationRow,
  mode: 'SNAPSHOT' | 'LIVE',
): Promise<RoleplayPersonaPrompt | null> {
  if (mode === 'LIVE' && conversation.personaId) {
    const row = await database
      .prepare(
        `SELECT name, short_description AS shortDescription, long_description AS longDescription,
         personality, appearance, speaking_style AS speakingStyle, background, pronouns,
         represented_age AS representedAge, custom_notes AS customNotes
         FROM personas WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      )
      .bind(conversation.personaId, conversation.userId)
      .first<RoleplayPersonaPrompt>();
    if (row) return personaSchema.parse(row);
  }
  if (!conversation.personaSnapshotJson) return null;
  try {
    return personaSchema.parse(JSON.parse(conversation.personaSnapshotJson));
  } catch {
    throw new AppError('PERSONA_SNAPSHOT_INVALID', 'Снимок образа повреждён.', 409);
  }
}

async function requireGenerationParent(
  database: D1Database,
  conversationId: string,
  messageId: string,
): Promise<GenerationMessageRow> {
  const row = await database
    .prepare(
      `SELECT id, role, content, status, is_greeting AS isGreeting FROM messages
       WHERE id = ? AND conversation_id = ? AND deleted_at IS NULL`,
    )
    .bind(messageId, conversationId)
    .first<GenerationMessageRow>();
  if (!row) throw new AppError('MESSAGE_NOT_FOUND', 'Сообщение не найдено.', 404);
  return row;
}

async function resolveModelProfile(
  database: D1Database,
  legacyName: 'BALANCED' | 'CREATIVE' | 'PREMIUM',
  modelProfileId: string,
): Promise<ModelProfileRow> {
  const configured = await requireEffectiveRoleplayModelProfile(database, modelProfileId);
  const effectiveProfiles = await Promise.all(
    configured.fallbackIds.map(async (id) =>
      requireEffectiveRoleplayModelProfile(database, id).catch(() => null),
    ),
  );
  const fallbacks = effectiveProfiles.flatMap((fallback) =>
    fallback
      ? [
          {
            provider: 'BOTHUB' as const,
            model: fallback.providerModelId,
            maxInputUsdPerMillion: fallback.price.inputPerMillionUsd,
            maxOutputUsdPerMillion: fallback.price.outputPerMillionUsd,
            fixedRequestUsd: fallback.price.fixedRequestUsd,
            contextWindow: fallback.contextWindow,
          },
        ]
      : [],
  );
  return {
    name: legacyName,
    provider: 'BOTHUB',
    model: configured.providerModelId,
    temperature: 0.9,
    maxOutputTokens: configured.maxOutput,
    timeoutMs: 90_000,
    fallbackModelsJson: JSON.stringify(fallbacks),
    costPolicyJson: JSON.stringify({
      maxInputUsdPerMillion: configured.price.inputPerMillionUsd,
      maxOutputUsdPerMillion: configured.price.outputPerMillionUsd,
      fixedRequestUsd: configured.price.fixedRequestUsd,
    }),
    contextWindow: configured.contextWindow,
  };
}

export function resolveGenerationCandidates(
  profile: Pick<ModelProfileRow, 'provider' | 'model' | 'fallbackModelsJson' | 'contextWindow'>,
  primaryPolicy: z.infer<typeof costPolicySchema>,
): readonly GenerationCandidate[] {
  const fallbacks = fallbackModelsSchema.parse(JSON.parse(profile.fallbackModelsJson));
  const candidates: GenerationCandidate[] = [
    {
      provider: profile.provider,
      model: profile.model,
      price: {
        inputPerMillionUsd: primaryPolicy.maxInputUsdPerMillion,
        outputPerMillionUsd: primaryPolicy.maxOutputUsdPerMillion,
        fixedRequestUsd: primaryPolicy.fixedRequestUsd,
      },
      contextWindow: profile.contextWindow,
    },
  ];
  for (const fallback of fallbacks) {
    if (candidates.some((candidate) => candidate.model === fallback.model)) continue;
    candidates.push({
      provider: fallback.provider,
      model: fallback.model,
      price: {
        inputPerMillionUsd: fallback.maxInputUsdPerMillion,
        outputPerMillionUsd: fallback.maxOutputUsdPerMillion,
        fixedRequestUsd: fallback.fixedRequestUsd,
      },
      contextWindow: fallback.contextWindow,
    });
  }
  return candidates;
}

export function estimateMaximumCostMicros(
  price: ModelPrice,
  inputTokens: number,
  outputTokens: number,
): number {
  return Math.ceil(
    price.fixedRequestUsd * 1_000_000 +
      inputTokens * price.inputPerMillionUsd +
      outputTokens * price.outputPerMillionUsd,
  );
}

export function calculateInputContextBudget(contextWindow: number, outputTokens: number): number {
  return Math.min(32_000, contextWindow - outputTokens);
}

async function recordFirstTokenLatency(database: D1Database, requestId: string): Promise<void> {
  const timestamp = nowMs();
  await database
    .prepare(
      `UPDATE ai_requests SET first_token_latency_ms = ? - created_at
       WHERE id = ? AND first_token_latency_ms IS NULL`,
    )
    .bind(timestamp, requestId)
    .run();
}

async function activateGenerationAttempt(
  database: D1Database,
  ids: GenerationIds,
  conversationId: string,
  candidate: GenerationCandidate,
): Promise<void> {
  const timestamp = nowMs();
  await database.batch([
    database
      .prepare(
        `UPDATE ai_requests SET provider = ?, model = ?
         WHERE id = ? AND generation_id = ? AND status = 'STREAMING'`,
      )
      .bind(candidate.provider, candidate.model, ids.aiRequestId, ids.generationId),
    database
      .prepare(
        `UPDATE messages SET provider = ?, model = ?, updated_at = ?
         WHERE id = ? AND conversation_id = ? AND status = 'STREAMING'`,
      )
      .bind(candidate.provider, candidate.model, timestamp, ids.responseMessageId, conversationId),
  ]);
}

async function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw new AIProviderError('BOTHUB_ABORTED', 'BotHub request was aborted.', false);
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new AIProviderError('BOTHUB_ABORTED', 'BotHub request was aborted.', false));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function findGenerationByKey(
  database: D1Database,
  conversationId: string,
  key: string,
): Promise<GenerationRecordRow | null> {
  return database
    .prepare(
      `SELECT id, response_message_id AS responseMessageId, state FROM message_generations
       WHERE conversation_id = ? AND idempotency_key = ?`,
    )
    .bind(conversationId, key)
    .first<GenerationRecordRow>();
}

interface PrepareGenerationInput {
  readonly userId: string;
  readonly conversationId: string;
  readonly requestMessageId: string;
  readonly idempotencyKey: string;
  readonly provider: string;
  readonly model: string;
  readonly maximumBillableCostMicros: number;
  readonly maximumProviderCostMicros: number;
  readonly timeoutMs: number;
  readonly responseParentMessageId: string | null;
  readonly isGreeting: boolean;
  readonly generationGroupId: string;
  readonly sponsoredFree: boolean;
  readonly planDailyRequestLimit: number;
}

interface GenerationIds {
  readonly generationId: string;
  readonly responseMessageId: string;
  readonly aiRequestId: string;
}

async function prepareGeneration(env: Env, input: PrepareGenerationInput): Promise<GenerationIds> {
  await assertBudgetAvailable(
    env,
    input.userId,
    input.maximumBillableCostMicros,
    input.maximumProviderCostMicros,
    input.sponsoredFree,
    input.planDailyRequestLimit,
  );
  const ids = { generationId: createId(), responseMessageId: createId(), aiRequestId: createId() };
  const timestamp = nowMs();
  const dayStart = startOfUtcDay(timestamp);
  const monthStart = Date.UTC(
    new Date(timestamp).getUTCFullYear(),
    new Date(timestamp).getUTCMonth(),
    1,
  );
  const dailyLimit = usdToMicros(env.DAILY_AI_BUDGET_USD);
  const perUserDailyLimit = usdToMicros(
    env.PER_USER_DAILY_AI_BUDGET_USD ?? env.DAILY_AI_BUDGET_USD,
  );
  const monthlyLimit = usdToMicros(env.MONTHLY_AI_BUDGET_USD);
  const lifetimeLimit = usdToMicros(env.LIFETIME_AI_BUDGET_USD);
  const reservation = await env.DB.prepare(
    `INSERT INTO ai_requests (
       id, user_id, conversation_id, provider, model, purpose,
       estimated_cost_micros, provider_estimated_cost_micros,
       status, idempotency_key, created_at, billing_mode
     ) SELECT ?, ?, ?, ?, ?, 'ROLEPLAY', ?, ?, 'RESERVED', ?, ?, ?
     WHERE
       (? = 'SPONSORED_FREE' OR
       (SELECT COALESCE(SUM(amount_micros), 0) FROM credit_transactions WHERE user_id = ?)
       - (SELECT COALESCE(SUM(estimated_cost_micros), 0) FROM ai_requests
          WHERE user_id = ? AND status IN ('RESERVED', 'STREAMING')) >= ?)
       AND (? != 'SPONSORED_FREE' OR
         (SELECT COUNT(*) FROM ai_requests WHERE user_id = ?
          AND billing_mode = 'SPONSORED_FREE' AND created_at >= ?
          AND status IN ('RESERVED', 'STREAMING', 'COMPLETED')) < ?)
       AND (SELECT COALESCE(SUM(CASE WHEN provider_actual_cost_micros > 0
          THEN provider_actual_cost_micros WHEN status IN ('RESERVED', 'STREAMING')
          THEN provider_estimated_cost_micros ELSE 0 END), 0)
          FROM ai_requests WHERE purpose = 'ROLEPLAY' AND created_at >= ?) + ? <= ?
       AND (SELECT COALESCE(SUM(CASE WHEN provider_actual_cost_micros > 0
          THEN provider_actual_cost_micros WHEN status IN ('RESERVED', 'STREAMING')
          THEN provider_estimated_cost_micros ELSE 0 END), 0)
          FROM ai_requests WHERE user_id = ? AND purpose = 'ROLEPLAY' AND created_at >= ?) + ? <= ?
       AND (SELECT COALESCE(SUM(CASE WHEN provider_actual_cost_micros > 0
          THEN provider_actual_cost_micros WHEN status IN ('RESERVED', 'STREAMING')
          THEN provider_estimated_cost_micros ELSE 0 END), 0)
          FROM ai_requests WHERE purpose = 'ROLEPLAY' AND created_at >= ?) + ? <= ?
       AND (SELECT COALESCE(SUM(CASE WHEN provider_actual_cost_micros > 0
          THEN provider_actual_cost_micros WHEN status IN ('RESERVED', 'STREAMING')
          THEN provider_estimated_cost_micros ELSE 0 END), 0)
          FROM ai_requests WHERE purpose = 'ROLEPLAY') + ? <= ?`,
  )
    .bind(
      ids.aiRequestId,
      input.userId,
      input.conversationId,
      input.provider,
      input.model,
      input.maximumBillableCostMicros,
      input.maximumProviderCostMicros,
      `roleplay:${input.userId}:${input.conversationId}:${input.idempotencyKey}`,
      timestamp,
      input.sponsoredFree ? 'SPONSORED_FREE' : 'USER_CREDITS',
      input.sponsoredFree ? 'SPONSORED_FREE' : 'USER_CREDITS',
      input.userId,
      input.userId,
      input.maximumBillableCostMicros,
      input.sponsoredFree ? 'SPONSORED_FREE' : 'USER_CREDITS',
      input.userId,
      dayStart,
      input.planDailyRequestLimit,
      dayStart,
      input.maximumProviderCostMicros,
      dailyLimit,
      input.userId,
      dayStart,
      input.maximumProviderCostMicros,
      perUserDailyLimit,
      monthStart,
      input.maximumProviderCostMicros,
      monthlyLimit,
      input.maximumProviderCostMicros,
      lifetimeLimit,
    )
    .run();
  if (reservation.meta.changes === 0) {
    throw new AppError(
      'AI_BUDGET_RACE',
      'Баланс или общий бюджет изменился. Повторите запрос.',
      409,
    );
  }
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO messages
         (id, conversation_id, role, content, content_format, status, parent_message_id,
          generation_group_id, is_greeting, edited_by_user, origin, model, provider,
          metadata_json, created_at, updated_at)
         VALUES (?, ?, 'ASSISTANT', '', 'MARKDOWN', 'STREAMING', ?, ?, ?, 0,
          'AI_GENERATION', ?, ?, COALESCE((
            SELECT json_object('speakerCharacterId', cg.active_character_id, 'speakerName', v.name)
            FROM conversation_character_groups cg
            JOIN conversation_group_members gm ON gm.conversation_id = cg.conversation_id
              AND gm.character_id = cg.active_character_id
            JOIN character_versions v ON v.id = gm.character_version_id
            WHERE cg.conversation_id = ?
          ), '{}'), ?, ?)`,
      ).bind(
        ids.responseMessageId,
        input.conversationId,
        input.responseParentMessageId,
        input.generationGroupId,
        input.isGreeting ? 1 : 0,
        input.model,
        input.provider,
        input.conversationId,
        timestamp,
        timestamp,
      ),
      env.DB.prepare(
        `INSERT INTO message_generations
         (id, conversation_id, request_message_id, response_message_id, idempotency_key, state, created_at)
         VALUES (?, ?, ?, ?, ?, 'STREAMING', ?)`,
      ).bind(
        ids.generationId,
        input.conversationId,
        input.requestMessageId,
        ids.responseMessageId,
        input.idempotencyKey,
        timestamp,
      ),
      env.DB.prepare(
        `INSERT INTO generation_locks
         (conversation_id, generation_id, acquired_at, expires_at, user_id)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        input.conversationId,
        ids.generationId,
        timestamp,
        timestamp + input.timeoutMs + 30_000,
        input.userId,
      ),
      env.DB.prepare(
        `UPDATE ai_requests SET generation_id = ?, status = 'STREAMING'
         WHERE id = ? AND status = 'RESERVED'`,
      ).bind(ids.generationId, ids.aiRequestId),
    ]);
  } catch (error) {
    await env.DB.prepare(
      `UPDATE ai_requests SET status = 'REFUNDED', completed_at = ?, error_code = 'LOCK_CONFLICT'
       WHERE id = ?`,
    )
      .bind(nowMs(), ids.aiRequestId)
      .run();
    const activeLock = await env.DB.prepare(
      `SELECT generation_id AS generationId FROM generation_locks
       WHERE conversation_id = ? OR user_id = ? LIMIT 1`,
    )
      .bind(input.conversationId, input.userId)
      .first<{ generationId: string }>();
    if (/UNIQUE|constraint/iu.test(asError(error).message) && activeLock) {
      throw new AppError('GENERATION_IN_PROGRESS', 'У вас уже создаётся ответ.', 409);
    }
    throw error;
  }
  return ids;
}

async function releaseExpiredGeneration(
  database: D1Database,
  conversationId: string,
  userId: string,
): Promise<void> {
  const timestamp = nowMs();
  const stale = await database
    .prepare(
      `SELECT l.generation_id AS generationId, l.conversation_id AS conversationId,
       g.response_message_id AS responseMessageId, r.id AS aiRequestId
       FROM generation_locks l
       JOIN message_generations g ON g.id = l.generation_id
       LEFT JOIN ai_requests r ON r.generation_id = g.id
       WHERE (l.conversation_id = ? OR l.user_id = ?) AND l.expires_at <= ?
       ORDER BY l.expires_at ASC LIMIT 1`,
    )
    .bind(conversationId, userId, timestamp)
    .first<{
      generationId: string;
      conversationId: string;
      responseMessageId: string | null;
      aiRequestId: string | null;
    }>();
  if (!stale) return;
  const statements = [
    database
      .prepare(
        `UPDATE message_generations SET state = 'FAILED', completed_at = ?, error_code = 'LOCK_EXPIRED'
         WHERE id = ? AND state IN ('PENDING', 'STREAMING')`,
      )
      .bind(timestamp, stale.generationId),
    database
      .prepare(
        `UPDATE ai_requests SET status = 'REFUNDED',
         provider_actual_cost_micros = provider_estimated_cost_micros,
         completed_at = ?, error_code = 'LOCK_EXPIRED'
         WHERE generation_id = ? AND status IN ('RESERVED', 'STREAMING')`,
      )
      .bind(timestamp, stale.generationId),
    database
      .prepare(`DELETE FROM generation_locks WHERE generation_id = ? AND expires_at <= ?`)
      .bind(stale.generationId, timestamp),
  ];
  if (stale.responseMessageId) {
    statements.splice(
      1,
      0,
      database
        .prepare(
          `UPDATE messages SET status = 'FAILED', updated_at = ?
           WHERE id = ? AND conversation_id = ? AND status = 'STREAMING'`,
        )
        .bind(timestamp, stale.responseMessageId, stale.conversationId),
    );
  }
  await database.batch(statements);
}

async function assertBudgetAvailable(
  env: Env,
  userId: string,
  requiredBillableMicros: number,
  requiredProviderMicros: number,
  sponsoredFree: boolean,
  planDailyRequestLimit: number,
): Promise<void> {
  const timestamp = nowMs();
  const row = await env.DB.prepare(
    `SELECT
      (SELECT COALESCE(SUM(amount_micros), 0) FROM credit_transactions WHERE user_id = ?) AS ledger,
      (SELECT COALESCE(SUM(estimated_cost_micros), 0) FROM ai_requests
       WHERE user_id = ? AND status IN ('RESERVED', 'STREAMING')) AS reserved,
      (SELECT COALESCE(SUM(CASE WHEN provider_actual_cost_micros > 0
       THEN provider_actual_cost_micros WHEN status IN ('RESERVED', 'STREAMING')
       THEN provider_estimated_cost_micros ELSE 0 END), 0)
       FROM ai_requests WHERE purpose = 'ROLEPLAY' AND created_at >= ?) AS daily,
      (SELECT COALESCE(SUM(CASE WHEN provider_actual_cost_micros > 0
       THEN provider_actual_cost_micros WHEN status IN ('RESERVED', 'STREAMING')
       THEN provider_estimated_cost_micros ELSE 0 END), 0)
       FROM ai_requests WHERE user_id = ? AND purpose = 'ROLEPLAY' AND created_at >= ?)
       AS userDaily,
      (SELECT COALESCE(SUM(CASE WHEN provider_actual_cost_micros > 0
       THEN provider_actual_cost_micros WHEN status IN ('RESERVED', 'STREAMING')
       THEN provider_estimated_cost_micros ELSE 0 END), 0)
       FROM ai_requests WHERE purpose = 'ROLEPLAY' AND created_at >= ?) AS monthly,
      (SELECT COALESCE(SUM(CASE WHEN provider_actual_cost_micros > 0
       THEN provider_actual_cost_micros WHEN status IN ('RESERVED', 'STREAMING')
       THEN provider_estimated_cost_micros ELSE 0 END), 0)
       FROM ai_requests WHERE purpose = 'ROLEPLAY') AS lifetime,
      (SELECT COUNT(*) FROM ai_requests WHERE user_id = ?
       AND billing_mode = 'SPONSORED_FREE' AND created_at >= ?
       AND status IN ('RESERVED', 'STREAMING', 'COMPLETED')) AS sponsoredDaily`,
  )
    .bind(
      userId,
      userId,
      startOfUtcDay(timestamp),
      userId,
      startOfUtcDay(timestamp),
      Date.UTC(new Date(timestamp).getUTCFullYear(), new Date(timestamp).getUTCMonth(), 1),
      userId,
      startOfUtcDay(timestamp),
    )
    .first<{
      ledger: number;
      reserved: number;
      daily: number;
      userDaily: number;
      monthly: number;
      lifetime: number;
      sponsoredDaily: number;
    }>();
  if (!row || (!sponsoredFree && row.ledger - row.reserved < requiredBillableMicros)) {
    throw new AppError('AI_CREDITS_REQUIRED', 'Недостаточно предоплаченных AI-кредитов.', 403);
  }
  if (sponsoredFree && row.sponsoredDaily >= planDailyRequestLimit) {
    throw new AppError(
      'FREE_DAILY_LIMIT_REACHED',
      'Fair-use на сегодня исчерпан. Лимит обновится в 00:00 UTC.',
      429,
    );
  }
  if (
    row.userDaily + requiredProviderMicros >
    usdToMicros(env.PER_USER_DAILY_AI_BUDGET_USD ?? env.DAILY_AI_BUDGET_USD)
  ) {
    throw new AppError(
      'USER_DAILY_AI_BUDGET_EXHAUSTED',
      'Ваш дневной лимит генераций временно исчерпан.',
      429,
    );
  }
  if (
    row.daily + requiredProviderMicros > usdToMicros(env.DAILY_AI_BUDGET_USD) ||
    row.monthly + requiredProviderMicros > usdToMicros(env.MONTHLY_AI_BUDGET_USD) ||
    row.lifetime + requiredProviderMicros > usdToMicros(env.LIFETIME_AI_BUDGET_USD)
  ) {
    throw new AppError('AI_BUDGET_EXHAUSTED', 'Лимит AI временно исчерпан.', 503);
  }
}

export function planDailyRequestLimit(planCode: string): number {
  if (planCode === 'PRO') return 500;
  if (planCode === 'PLUS') return 150;
  return 30;
}

interface CompletionInput extends GenerationIds {
  readonly userId: string;
  readonly conversationId: string;
  readonly output: string;
  readonly provider: string;
  readonly model: string;
  readonly usage: AIUsage;
  readonly finishReason: string;
  readonly providerActualCostMicros: number;
  readonly includedLoreEntries: readonly string[];
  readonly productEventName: Extract<ProductEventName, 'GENERATION_COMPLETED' | 'REGENERATED'>;
}

async function completeGeneration(database: D1Database, input: CompletionInput): Promise<boolean> {
  const timestamp = nowMs();
  const actualMicros = Math.max(0, Math.ceil(input.usage.costUsd * 1_000_000));
  const reservation = await database
    .prepare(
      `SELECT estimated_cost_micros AS estimatedCostMicros,
       provider_estimated_cost_micros AS providerEstimatedCostMicros FROM ai_requests
       WHERE id = ? AND generation_id = ? AND status = 'STREAMING'`,
    )
    .bind(input.aiRequestId, input.generationId)
    .first<{ estimatedCostMicros: number; providerEstimatedCostMicros: number }>();
  if (!reservation) return false;
  if (actualMicros > reservation.estimatedCostMicros) {
    throw new AIProviderError(
      'AI_COST_LIMIT_EXCEEDED',
      'Provider usage exceeded the pre-authorized cost ceiling.',
      false,
    );
  }
  if (input.providerActualCostMicros > reservation.providerEstimatedCostMicros) {
    throw new AIProviderError(
      'AI_PROVIDER_COST_LIMIT_EXCEEDED',
      'Provider attempts exceeded the pre-authorized provider cost ceiling.',
      false,
    );
  }
  const usageDate = new Date(timestamp).toISOString().slice(0, 10);
  const results = await database.batch([
    database
      .prepare(
        `UPDATE message_generations SET state = 'COMPLETED', completed_at = ?
         WHERE id = ? AND conversation_id = ? AND state = 'STREAMING'`,
      )
      .bind(timestamp, input.generationId, input.conversationId),
    database
      .prepare(
        `UPDATE messages SET content = ?, status = 'COMPLETED', model = ?, provider = ?,
         metadata_json = ?, updated_at = ?
       WHERE id = ? AND conversation_id = ?
       AND EXISTS (SELECT 1 FROM message_generations
         WHERE id = ? AND conversation_id = ? AND state = 'COMPLETED')`,
      )
      .bind(
        input.output,
        input.model,
        input.provider,
        JSON.stringify({ includedLoreEntries: input.includedLoreEntries }),
        timestamp,
        input.responseMessageId,
        input.conversationId,
        input.generationId,
        input.conversationId,
      ),
    database
      .prepare(
        `UPDATE ai_requests SET input_tokens = ?, output_tokens = ?, cached_tokens = ?,
       actual_cost_micros = ?, provider_actual_cost_micros = ?,
       latency_ms = ? - created_at, finish_reason = ?, status = 'COMPLETED', completed_at = ?
       WHERE id = ? AND status = 'STREAMING'
       AND EXISTS (SELECT 1 FROM message_generations WHERE id = ? AND state = 'COMPLETED')`,
      )
      .bind(
        input.usage.inputTokens,
        input.usage.outputTokens,
        input.usage.cachedInputTokens,
        actualMicros,
        input.providerActualCostMicros,
        timestamp,
        input.finishReason.slice(0, 80),
        timestamp,
        input.aiRequestId,
        input.generationId,
      ),
    database
      .prepare(
        `INSERT INTO product_events
         (id, source_key, user_id, event_name, route_group, created_at)
         SELECT ?, ?, ?, ?, 'generation', ?
         WHERE EXISTS (SELECT 1 FROM message_generations WHERE id = ? AND state = 'COMPLETED')
         ON CONFLICT(source_key) DO NOTHING`,
      )
      .bind(
        createId(),
        `generation:${input.generationId}`,
        input.userId,
        input.productEventName,
        timestamp,
        input.generationId,
      ),
    database
      .prepare(
        `INSERT INTO credit_transactions
       (id, user_id, type, amount_micros, idempotency_key, reference_type, reference_id,
        metadata_json, created_at)
       SELECT ?, ?, 'GENERATION_USAGE', ?, ?, 'AI_REQUEST', ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM message_generations WHERE id = ? AND state = 'COMPLETED')
       AND EXISTS (SELECT 1 FROM ai_requests WHERE id = ? AND billing_mode = 'USER_CREDITS')`,
      )
      .bind(
        createId(),
        input.userId,
        -actualMicros,
        `ai-usage:${input.aiRequestId}`,
        input.aiRequestId,
        JSON.stringify({ provider: input.provider, model: input.model }),
        timestamp,
        input.generationId,
        input.aiRequestId,
      ),
    database
      .prepare(
        `INSERT INTO usage_daily
       (usage_date, user_id, purpose, requests, input_tokens, output_tokens, cost_micros)
       SELECT ?, ?, 'ROLEPLAY', 1, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM message_generations WHERE id = ? AND state = 'COMPLETED')
       ON CONFLICT(usage_date, user_id, purpose) DO UPDATE SET
       requests = requests + 1, input_tokens = input_tokens + excluded.input_tokens,
       output_tokens = output_tokens + excluded.output_tokens,
       cost_micros = cost_micros + excluded.cost_micros`,
      )
      .bind(
        usageDate,
        input.userId,
        input.usage.inputTokens,
        input.usage.outputTokens,
        actualMicros,
        input.generationId,
      ),
    database
      .prepare(
        `UPDATE conversations SET active_leaf_message_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ?
       AND EXISTS (SELECT 1 FROM message_generations WHERE id = ? AND state = 'COMPLETED')`,
      )
      .bind(
        input.responseMessageId,
        timestamp,
        input.conversationId,
        input.userId,
        input.generationId,
      ),
    database
      .prepare('DELETE FROM generation_locks WHERE conversation_id = ? AND generation_id = ?')
      .bind(input.conversationId, input.generationId),
  ]);
  return (results[0]?.meta.changes ?? 0) === 1;
}

async function stopGenerationPersistence(
  database: D1Database,
  ids: GenerationIds,
  conversationId: string,
  output: string,
  attemptedProviderCostMicros: number,
): Promise<void> {
  const timestamp = nowMs();
  await database.batch([
    database
      .prepare(
        `UPDATE messages SET content = ?, status = 'STOPPED', updated_at = ?
         WHERE id = ? AND conversation_id = ?`,
      )
      .bind(output, timestamp, ids.responseMessageId, conversationId),
    database
      .prepare(
        `UPDATE conversations SET active_leaf_message_id = ?, updated_at = ?
         WHERE id = ? AND ? <> ''`,
      )
      .bind(ids.responseMessageId, timestamp, conversationId, output),
    database
      .prepare(`UPDATE message_generations SET state = 'STOPPED', completed_at = ? WHERE id = ?`)
      .bind(timestamp, ids.generationId),
    database
      .prepare(
        `UPDATE ai_requests SET status = 'REFUNDED', provider_actual_cost_micros = ?,
         completed_at = ?, error_code = 'STOPPED'
       WHERE id = ?`,
      )
      .bind(attemptedProviderCostMicros, timestamp, ids.aiRequestId),
    database
      .prepare('DELETE FROM generation_locks WHERE conversation_id = ? AND generation_id = ?')
      .bind(conversationId, ids.generationId),
  ]);
}

async function failGeneration(
  database: D1Database,
  ids: GenerationIds,
  conversationId: string,
  output: string,
  error: unknown,
  attemptedProviderCostMicros: number,
): Promise<void> {
  const timestamp = nowMs();
  const code = error instanceof AIProviderError ? error.code.slice(0, 120) : 'GENERATION_FAILED';
  await database.batch([
    database
      .prepare(
        `UPDATE messages SET content = ?, status = 'FAILED', updated_at = ?
         WHERE id = ? AND conversation_id = ?`,
      )
      .bind(output, timestamp, ids.responseMessageId, conversationId),
    database
      .prepare(
        `UPDATE conversations SET active_leaf_message_id = ?, updated_at = ?
         WHERE id = ? AND ? <> ''`,
      )
      .bind(ids.responseMessageId, timestamp, conversationId, output),
    database
      .prepare(
        `UPDATE message_generations SET state = 'FAILED', completed_at = ?, error_code = ? WHERE id = ?`,
      )
      .bind(timestamp, code, ids.generationId),
    database
      .prepare(
        `UPDATE ai_requests SET status = 'FAILED', provider_actual_cost_micros = ?,
         completed_at = ?, error_code = ? WHERE id = ?`,
      )
      .bind(attemptedProviderCostMicros, timestamp, code, ids.aiRequestId),
    database
      .prepare('DELETE FROM generation_locks WHERE conversation_id = ? AND generation_id = ?')
      .bind(conversationId, ids.generationId),
  ]);
}

async function isStopped(
  database: D1Database,
  generationId: string,
  conversationId: string,
): Promise<boolean> {
  const row = await database
    .prepare('SELECT state FROM message_generations WHERE id = ? AND conversation_id = ?')
    .bind(generationId, conversationId)
    .first<{ state: string }>();
  return row?.state === 'STOPPED';
}

function sse(encoder: TextEncoder, event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function startOfUtcDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function usdToMicros(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AppError('AI_BUDGET_INVALID', 'Лимит AI настроен неверно.', 503);
  }
  return Math.floor(parsed * 1_000_000);
}
