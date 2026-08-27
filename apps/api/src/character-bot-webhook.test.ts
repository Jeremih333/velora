import { describe, expect, it } from 'vitest';
import { AIProviderError, type AIStreamEvent } from '@velora/ai';
import { ROLEPLAY_MODEL_REGISTRY } from './model-registry';
import {
  availableChildBotModels,
  buildChildBotLoreContext,
  childBotGreetingKeyboard,
  childBotGenerationAttemptPlan,
  childBotModelKeyboard,
  childBotModelPlanLabel,
  childBotResponseKeyboard,
  buildChildBotRoleplayMessages,
  CHARACTER_BOT_STREAM_PROTOCOL,
  CHILD_BOT_USER_MODEL_UPSERT_SQL,
  childBotFailureMessage,
  CHILD_BOT_LOOKUP_SQL,
  formatChildBotTelegramHtml,
  readChildBotGreetings,
  hasExactBotMention,
  intersectValidatedProviderModels,
  isHumanChildBotActor,
  mergeChildBotMemory,
  normalizeChildBotCommand,
  planAwareDailyBudgetMicros,
  resolveChildBotModelForUser,
  resolveChildBotGenerationCandidates,
  shouldPublishChildBotLiveDraft,
  shouldAnswerChildBotMessage,
  streamChildBotWithFallback,
  wrapChildBotProviderFetcher,
} from './character-bot-webhook';

describe('character AI-avatar controls', () => {
  it('never lets bot-authored or actorless Telegram updates trigger generation', () => {
    expect(isHumanChildBotActor(undefined)).toBe(false);
    expect(isHumanChildBotActor({ is_bot: true })).toBe(false);
    expect(isHumanChildBotActor({ is_bot: false })).toBe(true);
    expect(isHumanChildBotActor({})).toBe(true);
  });

  it('renders roleplay actions as safe Telegram italics rather than bold text', () => {
    expect(formatChildBotTelegramHtml('*Катя улыбнулась.* Привет!')).toBe(
      '<i>Катя улыбнулась.</i> Привет!',
    );
    expect(formatChildBotTelegramHtml('<script> & *тихо*')).toBe(
      '&lt;script&gt; &amp; <i>тихо</i>',
    );
    expect(formatChildBotTelegramHtml('**не превращать в жирный**')).toBe(
      '**не превращать в жирный**',
    );
  });

  it('formats multiline AvatarBot actions without touching ordinary dialogue', () => {
    expect(formatChildBotTelegramHtml('*walks to the window\nand listens*')).toBe(
      '<i>walks to the window\nand listens</i>',
    );
    expect(formatChildBotTelegramHtml('Ordinary dialogue without an action.')).toBe(
      'Ordinary dialogue without an action.',
    );
  });

  it('allocates isolated daily AvatarBot budgets by the interacting user plan', () => {
    expect(planAwareDailyBudgetMicros('0.40', 'FREE')).toBe(400_000);
    expect(planAwareDailyBudgetMicros('0.40', 'PLUS')).toBe(1_200_000);
    expect(planAwareDailyBudgetMicros('0.40', 'PRO')).toBe(2_400_000);
    expect(planAwareDailyBudgetMicros('invalid', 'PRO')).toBe(0);
  });

  it('loads persona fields from the active character version', () => {
    expect(CHILD_BOT_LOOKUP_SQL).toContain('v.name AS characterName');
    expect(CHILD_BOT_LOOKUP_SQL).toContain('b.character_id AS characterId');
    expect(CHILD_BOT_LOOKUP_SQL).toContain(
      'JOIN character_versions v ON v.id = c.active_version_id',
    );
    expect(CHILD_BOT_LOOKUP_SQL).not.toContain('c.name AS characterName');
    expect(CHILD_BOT_LOOKUP_SQL).toContain('v.scenario');
    expect(CHILD_BOT_LOOKUP_SQL).toContain('v.system_instructions AS systemInstructions');
  });

  it('keeps the full persona, scene and both sides of history in avatar roleplay', () => {
    const messages = buildChildBotRoleplayMessages(
      {
        id: 'bot-1',
        characterId: 'character-1',
        ownerId: 'owner-1',
        ownerTelegramId: '1',
        telegramBotId: '2',
        telegramUsername: 'alice',
        tokenCiphertext: 'x',
        tokenIv: 'y',
        characterName: 'Алиса',
        personality: 'дерзкая и живая',
        speechStyle: 'разговорный',
        behaviourRules: 'не выходит из роли',
        firstMessage: 'Привет',
        alternateGreetingsJson: '[]',
        scenario: 'ночной лагерь',
        appearance: 'рыжие волосы',
        background: 'пионерка',
        goals: 'раскрыть тайну',
        systemInstructions: 'сохранять инициативу',
        postHistoryInstructions: 'не повторяться',
        modelProfileId: 'model',
      },
      'Алиса нашла ключ',
      [{ body: 'Что ты видишь?', assistantBody: '*Щурится.* Старую дверь.' }],
      'Открой её.',
      [{ title: 'Старый корпус', content: 'Под лестницей спрятан вход в медпункт.' }],
    );
    expect(messages[0]?.content).toContain('ночной лагерь');
    expect(messages[0]?.content).toContain('Эталон голоса и подачи персонажа: Привет');
    expect(messages[0]?.content).toContain('полноценная художественная ролевая сцена');
    expect(messages[0]?.content).toContain('3–6 цельных абзацев');
    expect(messages[0]?.content).toContain('не управляй действиями пользователя');
    expect(messages[0]?.content).toContain('[Старый корпус]');
    expect(messages[0]?.content).toContain('вход в медпункт');
    expect(messages.map(({ role }) => role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(messages[0]?.content).toContain('ACTIVE_LORE. Это обязательный канон персонажа');
    expect(messages[2]?.content).toContain('*Щурится.*');
  });

  it('builds compact looping greeting controls and ignores malformed alternatives', () => {
    expect(
      readChildBotGreetings({
        firstMessage: 'Первое',
        alternateGreetingsJson: JSON.stringify(['Второе', 'Первое', 'Третье']),
      }),
    ).toEqual(['Первое', 'Второе', 'Третье']);
    expect(readChildBotGreetings({ firstMessage: 'Первое', alternateGreetingsJson: '{' })).toEqual([
      'Первое',
    ]);
    expect(childBotGreetingKeyboard(0, 3)?.inline_keyboard[0]).toEqual([
      { text: '‹', callback_data: 'greeting:set:2' },
      { text: '1 / 3', callback_data: 'greeting:noop' },
      { text: '›', callback_data: 'greeting:set:1' },
    ]);
  });

  it('labels AvatarBot model access without exposing internal tier names', () => {
    expect(childBotModelPlanLabel('free')).toBe('Free');
    expect(childBotModelPlanLabel('standard')).toBe('Premium');
    expect(childBotModelPlanLabel('premium')).toBe('Pro');
  });

  it('shows only tariff-accessible AvatarBot models and labels every choice', () => {
    const freeModels = availableChildBotModels('FREE');
    const premiumModels = availableChildBotModels('PLUS');
    const proModels = availableChildBotModels('PRO');

    expect(freeModels.length).toBeGreaterThan(0);
    expect(freeModels.every(({ tier }) => tier === 'free')).toBe(true);
    expect(premiumModels.every(({ tier }) => tier !== 'premium')).toBe(true);
    expect(proModels.length).toBeGreaterThanOrEqual(premiumModels.length);

    const keyboard = childBotModelKeyboard(proModels, proModels[0]?.id);
    const labels = keyboard.inline_keyboard.flatMap((row) => row.map(({ text }) => text));
    expect(labels.at(-1)).toBe('Закрыть');
    expect(labels.slice(0, -1).every((label) => / · (Free|Premium|Pro)$/u.test(label))).toBe(true);
  });

  it('keeps response navigation compact and adds the back action only after regeneration', () => {
    expect(childBotResponseKeyboard(42, 0).inline_keyboard[0]).toEqual([
      { text: '➡️', callback_data: 'response:next:42:0' },
    ]);
    expect(childBotResponseKeyboard(42, 2).inline_keyboard[0]).toEqual([
      { text: '⬅️', callback_data: 'response:show:42:1' },
      { text: '➡️', callback_data: 'response:next:42:2' },
    ]);
  });

  it('activates AvatarBot lore from character canon, recent turns and the current message', () => {
    expect(
      buildChildBotLoreContext(
        { characterName: 'Катя', scenario: 'Пионерлагерь Совёнок' },
        [{ body: 'Пойдём к пристани?', assistantBody: 'Хорошо.' }],
        'Что находится на острове?',
      ),
    ).toEqual([
      'Катя',
      'Пионерлагерь Совёнок',
      'Пойдём к пристани?',
      'Хорошо.',
      'Что находится на острове?',
    ]);
  });

  it('adds only supplied new events and persists their last Telegram update boundary', () => {
    expect(
      mergeChildBotMemory('Старая память', [
        { updateId: 41, body: 'Первое новое сообщение' },
        { updateId: 44, body: 'Второе новое сообщение' },
      ]),
    ).toEqual({
      summary: 'Старая память\n• Первое новое сообщение\n• Второе новое сообщение',
      summarizedThroughUpdateId: 44,
    });
    expect(mergeChildBotMemory('Старая память', [])).toBeNull();
  });

  it('caps persisted group memory without losing the latest event boundary', () => {
    const merged = mergeChildBotMemory(null, [{ updateId: 99, body: 'x'.repeat(15_000) }]);
    expect(merged?.summary).toHaveLength(12_000);
    expect(merged?.summary.endsWith('x')).toBe(true);
    expect(merged?.summarizedThroughUpdateId).toBe(99);
  });

  it('keeps paid model tiers inaccessible without the matching subscription', () => {
    expect(availableChildBotModels('FREE').every((model) => model.tier === 'free')).toBe(true);
    expect(availableChildBotModels('PLUS').some((model) => model.tier === 'standard')).toBe(true);
    expect(availableChildBotModels('PLUS').some((model) => model.tier === 'premium')).toBe(false);
    expect(availableChildBotModels('PRO').some((model) => model.tier === 'standard')).toBe(true);
  });

  it('isolates model resolution by the interacting user plan and defaults everyone to Free', () => {
    const providerModels = ROLEPLAY_MODEL_REGISTRY.map((model) => model.providerModelId);
    const freeUser = resolveChildBotModelForUser({
      planCode: 'FREE',
      preferredModelProfileId: 'velora-balanced',
      availableProviderModelIds: providerModels,
    });
    const proWithoutPreference = resolveChildBotModelForUser({
      planCode: 'PRO',
      preferredModelProfileId: null,
      availableProviderModelIds: providerModels,
    });
    const proWithPreference = resolveChildBotModelForUser({
      planCode: 'PRO',
      preferredModelProfileId: 'velora-balanced',
      availableProviderModelIds: providerModels,
    });
    expect(freeUser?.tier).toBe('free');
    expect(freeUser?.id).toBe('velora-free-roleplay');
    expect(proWithoutPreference?.id).toBe('velora-free-roleplay');
    expect(proWithPreference?.id).toBe('velora-balanced');
  });

  it('retries once and falls back only to models allowed by the interacting user plan', () => {
    const providerModels = ROLEPLAY_MODEL_REGISTRY.map((model) => model.providerModelId);
    const freeCandidates = resolveChildBotGenerationCandidates({
      planCode: 'FREE',
      selectedModelId: 'velora-free-roleplay',
      availableProviderModelIds: providerModels,
    });
    expect(freeCandidates.map(({ id }) => id)).toEqual([
      'velora-free-roleplay',
      'velora-free-context',
    ]);
    expect(freeCandidates.every(({ tier }) => tier === 'free')).toBe(true);
    expect(childBotGenerationAttemptPlan(freeCandidates).map(({ id }) => id)).toEqual([
      'velora-free-roleplay',
      'velora-free-roleplay',
      'velora-free-context',
    ]);

    const paidCandidates = resolveChildBotGenerationCandidates({
      planCode: 'PLUS',
      selectedModelId: 'velora-balanced',
      availableProviderModelIds: providerModels,
    });
    expect(paidCandidates.map(({ id }) => id)).toEqual([
      'velora-balanced',
      'velora-deepseek-v3-0324',
      'velora-free-context',
    ]);
    expect(paidCandidates.every(({ tier }) => tier !== 'premium')).toBe(true);
  });

  it('never routes a fallback to a provider model missing from the validated catalog', () => {
    const candidates = resolveChildBotGenerationCandidates({
      planCode: 'FREE',
      selectedModelId: 'velora-free-roleplay',
      availableProviderModelIds: ['l3-lunaris-8b'],
    });
    expect(
      childBotGenerationAttemptPlan(candidates).map(({ providerModelId }) => providerModelId),
    ).toEqual(['l3-lunaris-8b', 'l3-lunaris-8b']);
  });

  it('recovers from the production upstream outage with a bounded retry and fallback', async () => {
    const candidates = resolveChildBotGenerationCandidates({
      planCode: 'FREE',
      selectedModelId: 'velora-free-roleplay',
      availableProviderModelIds: ['l3-lunaris-8b', 'mistral-nemo'],
    });
    const attempts: string[] = [];
    const result = await streamChildBotWithFallback({
      attemptPlan: childBotGenerationAttemptPlan(candidates),
      apiKey: 'test',
      fetcher: fetch,
      requestId: 'request',
      messages: [{ role: 'user', content: 'Привет' }],
      temperature: 0.9,
      streamAttempt: (model, index) =>
        (async function* (): AsyncIterable<AIStreamEvent> {
          await Promise.resolve();
          attempts.push(model.providerModelId);
          if (index < 2) {
            throw new AIProviderError('BOTHUB_UPSTREAM_UNAVAILABLE', 'temporary', true, 503);
          }
          yield { type: 'delta', text: 'Ответ восстановлен' };
          yield {
            type: 'completed',
            usage: { inputTokens: 10, outputTokens: 3, cachedInputTokens: 0, costUsd: 0.001 },
            finishReason: 'stop',
          };
        })(),
    });
    expect(attempts).toEqual(['l3-lunaris-8b', 'l3-lunaris-8b', 'mistral-nemo']);
    expect(result.output).toBe('Ответ восстановлен');
    expect(result.model.providerModelId).toBe('mistral-nemo');
  });

  it('does not retry after partial output to prevent duplicated character replies', async () => {
    const candidates = resolveChildBotGenerationCandidates({
      planCode: 'FREE',
      selectedModelId: 'velora-free-roleplay',
      availableProviderModelIds: ['l3-lunaris-8b', 'mistral-nemo'],
    });
    let attempts = 0;
    await expect(
      streamChildBotWithFallback({
        attemptPlan: childBotGenerationAttemptPlan(candidates),
        apiKey: 'test',
        fetcher: fetch,
        requestId: 'request',
        messages: [{ role: 'user', content: 'Привет' }],
        temperature: 0.9,
        streamAttempt: () =>
          (async function* (): AsyncIterable<AIStreamEvent> {
            await Promise.resolve();
            attempts += 1;
            yield { type: 'delta', text: 'Частичный ответ' };
            throw new AIProviderError('BOTHUB_UPSTREAM_UNAVAILABLE', 'temporary', true, 503);
          })(),
      }),
    ).rejects.toMatchObject({ code: 'BOTHUB_UPSTREAM_UNAVAILABLE' });
    expect(attempts).toBe(1);
  });

  it('persists a model preference by avatar and concrete Telegram user, never globally', () => {
    expect(CHILD_BOT_USER_MODEL_UPSERT_SQL).toContain(
      'ON CONFLICT(avatar_bot_id, telegram_user_id)',
    );
    expect(CHILD_BOT_USER_MODEL_UPSERT_SQL).not.toContain('UPDATE character_avatar_bots');
  });

  it('does not offer a model missing from the current BotHub key-scoped catalog', () => {
    const available = availableChildBotModels('PRO', [
      'deepseek-chat-v3.1',
      'llama-3.3-70b-instruct',
    ]);
    expect(available.map(({ providerModelId }) => providerModelId)).toEqual([
      'deepseek-chat-v3.1',
      'llama-3.3-70b-instruct',
    ]);
    expect(available).toHaveLength(2);
  });

  it('requires both catalog presence and a completed provider validation', () => {
    expect(
      intersectValidatedProviderModels(
        ['deepseek-chat-v3.1', 'rocinante-12b', 'llama-3.3-70b-instruct'],
        ['deepseek-chat-v3.1', 'llama-3.3-70b-instruct'],
      ),
    ).toEqual(['deepseek-chat-v3.1', 'llama-3.3-70b-instruct']);
  });

  it('uses the BotHub documented stream contract verified by production smoke tests', () => {
    expect(CHARACTER_BOT_STREAM_PROTOCOL).toBe('BOTHUB_DOCUMENTED');
  });

  it('keeps the platform fetch behind a lexical wrapper', async () => {
    const platformFetch = function (this: unknown) {
      if (this !== undefined) throw new Error('FETCH_WAS_REBOUND');
      return Promise.resolve(new Response('{}'));
    } as typeof fetch;
    const wrapped = wrapChildBotProviderFetcher(platformFetch);
    await expect(
      Reflect.apply(wrapped, { accidentalProviderInstance: true }, ['https://example.test']),
    ).resolves.toBeInstanceOf(Response);
  });

  it('turns provider failures into safe user-facing replies without upstream details', () => {
    expect(childBotFailureMessage('BOTHUB_CONTENT_RESTRICTED')).toContain('изменить формулировку');
    expect(childBotFailureMessage('BOTHUB_BALANCE_REQUIRED')).toContain('лимита провайдера');
    expect(childBotFailureMessage('BOTHUB_NETWORK_ERROR')).toContain('Попробуйте ещё раз');
    expect(childBotFailureMessage('BOTHUB_NETWORK_ERROR')).not.toContain('BOTHUB');
  });

  it('accepts commands addressed to the avatar username', () => {
    expect(normalizeChildBotCommand('/start@aliceneyrobot payload')).toBe('/start');
    expect(normalizeChildBotCommand('/MODEL@AliceNeyRobot')).toBe('/model');
    expect(normalizeChildBotCommand('обычный текст')).toBeNull();
  });

  it('answers every ordinary private message but requires a direct reply in groups', () => {
    expect(shouldAnswerChildBotMessage({ chatType: 'private', telegramBotId: '9001' })).toBe(true);
    expect(
      shouldAnswerChildBotMessage({
        chatType: 'supergroup',
        telegramBotId: '9001',
        repliedToTelegramBotId: 9001,
      }),
    ).toBe(true);
    expect(
      shouldAnswerChildBotMessage({
        chatType: 'group',
        telegramBotId: '9001',
        repliedToTelegramBotId: 777,
      }),
    ).toBe(false);
  });

  it('answers an exact Telegram mention in groups but ignores links and other usernames', () => {
    const text = 'Алиса, @aliceneyrobot ответь мне';
    const offset = text.indexOf('@aliceneyrobot');
    const mention = [{ type: 'mention', offset, length: '@aliceneyrobot'.length }];
    expect(hasExactBotMention(text, mention, 'aliceneyrobot')).toBe(true);
    expect(
      shouldAnswerChildBotMessage({
        chatType: 'supergroup',
        telegramBotId: '9001',
        telegramUsername: '@AliceNeyRobot',
        text,
        entities: mention,
      }),
    ).toBe(true);
    expect(
      hasExactBotMention(
        'https://t.me/aliceneyrobot',
        [{ type: 'url', offset: 0, length: 'https://t.me/aliceneyrobot'.length }],
        'aliceneyrobot',
      ),
    ).toBe(false);
    expect(
      hasExactBotMention(
        '@other_bot привет',
        [{ type: 'mention', offset: 0, length: '@other_bot'.length }],
        'aliceneyrobot',
      ),
    ).toBe(false);
  });

  it('rate-limits official live drafts to private chats while groups use typing', () => {
    expect(
      shouldPublishChildBotLiveDraft({
        chatType: 'private',
        outputLength: 48,
        previousLength: 0,
        elapsedMs: 100,
      }),
    ).toBe(true);
    expect(
      shouldPublishChildBotLiveDraft({
        chatType: 'private',
        outputLength: 12,
        previousLength: 0,
        elapsedMs: 800,
      }),
    ).toBe(true);
    expect(
      shouldPublishChildBotLiveDraft({
        chatType: 'supergroup',
        outputLength: 500,
        previousLength: 0,
        elapsedMs: 5_000,
      }),
    ).toBe(false);
  });
});
