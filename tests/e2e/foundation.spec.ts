import { expect, test } from '@playwright/test';

const matureReviewPendingText =
  'Персонаж с отметкой Mature отправлен на проверку возраста и безопасности. До решения модератора он не показывается в каталоге.';

test('renders the isolated Velora shell without pretending standalone auth', async ({ page }) => {
  await page.route('**/health', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Enter a world that remembers you' }),
  ).toBeVisible();
  await expect(page.getByText('Standalone mode is for development only.')).toBeVisible();
  await expect(page.getByText('Persistent memory')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
});

test('authenticated MiniApp navigation and persona creation remain usable', async ({ page }) => {
  test.setTimeout(90_000);
  let personas: readonly Record<string, unknown>[] = [];
  let lorebook: Record<string, unknown> | null = null;
  let loreEntries: readonly Record<string, unknown>[] = [];
  let importedLorebook: Record<string, unknown> | null = null;
  let importedLoreEntries: readonly Record<string, unknown>[] = [];
  let conversationCreated = false;
  let onboardingCompleted = false;
  let onboardingPayload: Record<string, unknown> | null = null;
  let conversationPreview = false;
  let previewRequestVerified = false;
  const characterAutosaveBodies: Record<string, unknown>[] = [];
  let conversationLoreEnabled = false;
  let memoryContent = '';
  let openedInvoiceUrl = '';
  let characterLiked = false;
  let characterBookmarked = false;
  let characterReview: { readonly rating: number; readonly text: string } | null = null;
  let ownedCharacters: readonly Record<string, unknown>[] = [
    {
      id: 'mature-character-1',
      avatarFileId: null,
      visibility: 'PRIVATE',
      publishState: 'DRAFT',
      contentRating: 'MATURE',
      language: 'ru',
      version: 1,
      name: 'Ночная история',
      tagline: 'Только после безопасной проверки',
      description: 'Взрослая история с обязательной проверкой перед публикацией.',
      personality: 'Спокойный взрослый персонаж с обозначенными границами.',
      scenario: '',
      firstMessage: 'Обсудим границы до начала истории.',
      exampleDialogues: '',
      creatorNotes: '',
      speechStyle: '',
      appearance: '',
      background: '',
      goals: '',
      behaviourRules: '',
      systemInstructions: '',
      postHistoryInstructions: '',
      alternateGreetings: [],
      tags: ['mature'],
      updatedAt: 1,
    },
  ];
  let deletionPending = false;
  let blockedUsers: readonly Record<string, unknown>[] = [
    {
      userId: 'blocked-user-1',
      displayName: 'Заблокированный автор',
      username: 'blocked_author',
      createdAt: 1,
    },
  ];
  let supportRequests: readonly Record<string, unknown>[] = [];
  let profileDisplayName = 'Алиса';
  let settingsLocale: 'ru' | 'en' = 'ru';
  let conversationSettings = {
    modelProfile: 'BALANCED',
    responseLength: 'MEDIUM',
    temperature: 0.8,
    maxOutputTokens: 800,
    customInstructions: '',
    personaMode: 'SNAPSHOT',
  };
  let conversationMessages: readonly Record<string, unknown>[] = [
    {
      id: 'message-first',
      conversationId: 'conversation-1',
      role: 'ASSISTANT',
      content: '*Ты всё-таки пришёл.*',
      status: 'COMPLETED',
      parentMessageId: null,
      generationGroupId: null,
      model: null,
      provider: null,
      metadata: {},
      createdAt: 1,
      editedAt: null,
      variantIndex: 0,
      variantCount: 1,
      variantIds: ['message-first'],
    },
  ];
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === 'telegram.org') {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `window.Telegram={WebApp:{initData:'signed-telegram-init-data',colorScheme:'dark',ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},openInvoice(url,callback){window.__openedInvoiceUrl=url;callback?.('paid')}}};`,
      });
      return;
    }
    if (url.pathname === '/health') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"status":"ok"}',
      });
      return;
    }
    if (url.pathname === '/api/v1/auth/telegram') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'user-1', displayName: 'Алиса', role: 'ADMIN' },
          csrfToken: 'csrf-test',
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/feature-flags') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          flags: {
            advanced_memory: false,
            new_model: false,
            public_reviews: true,
            experimental_renderer: false,
          },
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/me') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-1',
          username: 'alice',
          displayName: 'Алиса',
          avatarFileId: null,
          locale: 'ru',
          role: 'ADMIN',
          moderationState: 'ACTIVE',
          ageGateAccepted: false,
          onboardingCompleted,
          plan: 'PLUS',
          planDisplayName: 'Plus',
          planAccessUntil: 1_800_000_000_000,
          planEntitlements: {
            rateLimitMultiplier: 1,
            characterLimit: 10,
            personaLimit: 3,
            memoryTokenBudget: 2000,
            loreTokenBudget: 1000,
            advancedOperationsDaily: 3,
            modelProfiles: ['BALANCED', 'CREATIVE'],
          },
          creditBalanceMicros: 0,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/onboarding/complete' && request.method() === 'POST') {
      onboardingPayload = request.postDataJSON() as Record<string, unknown>;
      onboardingCompleted = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          completed: true,
          personaId: null,
          matureEnabled: false,
          policyAcceptedAt: 1,
          completedAt: 1,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/billing/packs') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          paymentsEnabled: true,
          recurringPayments: false,
          currency: 'XTR',
          items: [
            {
              code: 'test-pack',
              displayName: 'Пробный пакет',
              description: 'Предоплаченные кредиты для ролевых ответов.',
              starsAmount: 75,
              creditAmountMicros: 5_000_000,
              active: true,
              sortOrder: 0,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/billing/payments') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"items":[]}',
      });
      return;
    }
    if (url.pathname === '/api/v1/billing/access-packs') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          paymentsEnabled: true,
          recurringPayments: false,
          currency: 'XTR',
          items: [],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/billing/invoices' && request.method() === 'POST') {
      const input = request.postDataJSON() as {
        readonly termsAccepted: boolean;
        readonly packCode: string;
      };
      expect(input.termsAccepted).toBe(true);
      expect(input.packCode).toBe('test-pack');
      openedInvoiceUrl = 'https://t.me/$invoice-test';
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'payment-1',
          packCode: input.packCode,
          starsAmount: 75,
          creditAmountMicros: 5_000_000,
          state: 'INVOICE_SENT',
          invoiceUrl: openedInvoiceUrl,
          recurring: false,
          createdAt: 1,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/discovery') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'character-1',
              avatarFileId: null,
              contentRating: 'SAFE',
              language: 'ru',
              updatedAt: 1,
              name: 'Лира',
              tagline: 'Хранительница забытого маяка',
              description: 'Персонаж для спокойной мистической истории.',
              firstMessage: 'Ты всё-таки пришёл.',
              alternateGreetings: [],
              creatorId: 'creator-1',
              creatorName: 'Velora',
              likeCount: characterLiked ? 8 : 7,
              bookmarkCount: characterBookmarked ? 1 : 0,
              reviewCount: characterReview ? 1 : 0,
              averageRating: characterReview?.rating ?? null,
              liked: characterLiked,
              bookmarked: characterBookmarked,
              myRating: characterReview?.rating ?? null,
              myReviewText: characterReview?.text ?? null,
              tags: ['мистика'],
            },
          ],
          nextCursor: null,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/profiles/me') {
      if (request.method() === 'PATCH') {
        const input = request.postDataJSON() as { readonly displayName: string };
        profileDisplayName = input.displayName;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          userId: 'user-1',
          displayName: profileDisplayName,
          bio: profileDisplayName === 'Алиса' ? '' : 'Пишу камерные мистические истории.',
          avatarFileId: null,
          avatarPending: false,
          visibility: 'PUBLIC',
          role: 'ADMIN',
          isOwn: true,
          stats: { characters: 1, likes: 8, chats: 3 },
          characters: [],
          createdAt: 1,
          updatedAt: 1,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/profiles/creator-1') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          userId: 'creator-1',
          displayName: 'Velora',
          bio: 'Создатель мистических персонажей.',
          avatarFileId: null,
          avatarPending: false,
          visibility: 'PUBLIC',
          role: 'CREATOR',
          isOwn: false,
          stats: { characters: 1, likes: 7, chats: 4 },
          characters: [
            {
              id: 'character-1',
              avatarFileId: null,
              name: 'Лира',
              tagline: 'Хранительница забытого маяка',
              contentRating: 'SAFE',
              updatedAt: 1,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/media' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' });
      return;
    }
    if (url.pathname === '/api/v1/discovery/character-1/like') {
      characterLiked = request.method() === 'PUT';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ liked: characterLiked, likeCount: characterLiked ? 8 : 7 }),
      });
      return;
    }
    if (url.pathname === '/api/v1/discovery/character-1/bookmark') {
      characterBookmarked = request.method() === 'PUT';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          bookmarked: characterBookmarked,
          bookmarkCount: characterBookmarked ? 1 : 0,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/discovery/character-1/review' && request.method() === 'PUT') {
      characterReview = request.postDataJSON() as {
        readonly rating: number;
        readonly text: string;
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...characterReview, updatedAt: 1 }),
      });
      return;
    }
    if (url.pathname === '/api/v1/discovery/character-1/reviews') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: characterReview
            ? [
                {
                  userId: 'user-1',
                  displayName: 'Алиса',
                  rating: characterReview.rating,
                  reviewText: characterReview.text,
                  updatedAt: 1,
                },
              ]
            : [],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/discovery/creator-stats/me') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"characterCount":1,"publishedCount":1,"chatsStarted":3,"likes":8,"bookmarks":1,"reviews":1,"averageRating":5}',
      });
      return;
    }
    if (url.pathname === '/api/v1/reports' && request.method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: '{"id":"report-1","caseId":"case-1","state":"OPEN","priority":20}',
      });
      return;
    }
    if (url.pathname === '/api/v1/conversations' && request.method() === 'POST') {
      const requestBody = request.postDataJSON() as { readonly preview?: boolean };
      conversationCreated = true;
      conversationPreview = requestBody.preview === true;
      previewRequestVerified ||= conversationPreview;
      const createdConversationId = conversationPreview ? 'conversation-preview' : 'conversation-1';
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: createdConversationId,
          characterId: 'character-1',
          personaId: null,
          title: 'Лира',
          activeMessageId: 'message-first',
          state: 'ACTIVE',
          isPreview: conversationPreview,
          memoryStale: false,
          characterName: 'Лира',
          characterAvatarFileId: null,
          lastMessage: null,
          createdAt: 1,
          updatedAt: 1,
        }),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-preview' &&
      request.method() === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'conversation-preview',
          characterId: 'mature-character-1',
          personaId: null,
          title: 'Тест · Ночная история',
          activeMessageId: 'message-first',
          state: 'ACTIVE',
          isPreview: true,
          memoryStale: false,
          characterName: 'Ночная история',
          characterAvatarFileId: null,
          lastMessage: null,
          createdAt: 1,
          updatedAt: 1,
          settings: conversationSettings,
          promptInspectorAvailable: true,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/conversations/conversation-preview/messages') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: conversationMessages,
          activeMessageId: conversationMessages.at(-1)?.['id'] ?? null,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/conversations/conversation-1' && request.method() === 'PATCH') {
      conversationSettings = {
        ...conversationSettings,
        ...(request.postDataJSON() as typeof conversationSettings),
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'conversation-1',
          characterId: 'character-1',
          personaId: null,
          title: 'Лира',
          activeMessageId: conversationMessages.at(-1)?.['id'] ?? null,
          state: 'ACTIVE',
          isPreview: conversationPreview,
          memoryStale: false,
          characterName: 'Лира',
          characterAvatarFileId: null,
          lastMessage: null,
          createdAt: 1,
          updatedAt: 1,
          settings: conversationSettings,
          promptInspectorAvailable: true,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/conversations/conversation-1' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'conversation-1',
          characterId: 'character-1',
          personaId: null,
          title: 'Лира',
          activeMessageId: conversationMessages.at(-1)?.['id'] ?? null,
          state: 'ACTIVE',
          isPreview: conversationPreview,
          memoryStale: false,
          characterName: 'Лира',
          characterAvatarFileId: null,
          lastMessage: null,
          createdAt: 1,
          updatedAt: 1,
          settings: conversationSettings,
          promptInspectorAvailable: true,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/conversations/conversation-1/prompt-inspector') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          character: {
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
          },
          persona: null,
          memory: memoryContent,
          lore: [{ id: 'lore-entry-1', title: 'Скрытая дверь', content: 'Тайный проход.' }],
          chatInstructions: conversationSettings.customInstructions,
          recentMessages: [{ role: 'USER', content: 'Я открываю дверь.' }],
          tokenEstimates: {
            platformPolicy: 50,
            character: 80,
            creatorInstructions: 10,
            persona: 0,
            memory: 6,
            lore: 8,
            chatInstructions: 4,
            examples: 0,
            recentMessages: 7,
            postHistoryInstructions: 0,
            totalInput: 165,
            outputReserved: 400,
            contextLimit: 32000,
          },
          includedLoreEntries: ['lore-entry-1'],
          includedExampleMessages: 0,
          droppedExampleMessages: 0,
          droppedHistoryMessages: 0,
          unknownTemplateVariables: [],
        }),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-1/memory' &&
      request.method() === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          active: memoryContent
            ? {
                id: 'memory-1',
                content: memoryContent,
                sourceType: 'MANUAL_EDIT',
                fromMessageId: null,
                toMessageId: null,
                createdAt: 4,
                previousVersionId: null,
              }
            : null,
          stale: false,
          lastSummarizedMessageId: null,
          estimatedTokens: Math.ceil(memoryContent.length / 4),
          pendingJob: null,
        }),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-1/memory' &&
      request.method() === 'PUT'
    ) {
      const input = request.postDataJSON() as { readonly content: string };
      memoryContent = input.content;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'memory-1',
          content: memoryContent,
          sourceType: 'MANUAL_EDIT',
          fromMessageId: null,
          toMessageId: null,
          createdAt: 4,
          previousVersionId: null,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/conversations/conversation-1/lorebooks') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items:
            conversationLoreEnabled && lorebook
              ? [{ ...lorebook, enabled: true, entryCount: loreEntries.length }]
              : [],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/conversations/conversation-1/lore/active') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          entries:
            conversationLoreEnabled && loreEntries.length > 0
              ? [{ id: 'lore-entry-1', title: 'Скрытая дверь' }]
              : [],
          totalTokens: conversationLoreEnabled && loreEntries.length > 0 ? 6 : 0,
        }),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-1/lorebooks/lorebook-1' &&
      request.method() === 'PUT'
    ) {
      conversationLoreEnabled = true;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-1/lorebooks/lorebook-1' &&
      request.method() === 'DELETE'
    ) {
      conversationLoreEnabled = false;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-1/messages' &&
      request.method() === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: conversationMessages,
          activeMessageId: conversationMessages.at(-1)?.['id'] ?? null,
        }),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-1/messages' &&
      request.method() === 'POST'
    ) {
      const created = {
        id: 'message-user',
        conversationId: 'conversation-1',
        role: 'USER',
        content: 'Я открываю дверь.',
        status: 'COMPLETED',
        parentMessageId: 'message-first',
        generationGroupId: null,
        model: null,
        provider: null,
        metadata: {},
        createdAt: 2,
        editedAt: null,
        variantIndex: 0,
        variantCount: 1,
        variantIds: ['message-user'],
      };
      conversationMessages = [...conversationMessages, created];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }
    if (url.pathname === '/api/v1/conversations/conversation-1/generate') {
      conversationMessages = [
        ...conversationMessages,
        {
          id: 'message-ai',
          conversationId: 'conversation-1',
          role: 'ASSISTANT',
          content: 'Архив отвечает эхом.',
          status: 'COMPLETED',
          parentMessageId: 'message-user',
          generationGroupId: 'generation-1',
          model: 'test',
          provider: 'BOTHUB',
          metadata: {},
          createdAt: 3,
          editedAt: null,
          variantIndex: 0,
          variantCount: 1,
          variantIds: ['message-ai'],
        },
      ];
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'event: delta\ndata: {"text":"Архив отвечает эхом."}\n\nevent: done\ndata: {"generationId":"generation-1"}\n\n',
      });
      return;
    }
    if (url.pathname === '/api/v1/conversations' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: conversationCreated
            ? [
                {
                  id: 'conversation-1',
                  characterId: 'character-1',
                  personaId: null,
                  title: 'Лира',
                  activeMessageId: conversationMessages.at(-1)?.['id'] ?? null,
                  state: 'ACTIVE',
                  isPreview: conversationPreview,
                  memoryStale: false,
                  characterName: 'Лира',
                  characterAvatarFileId: null,
                  lastMessage: 'Архив отвечает эхом.',
                  createdAt: 1,
                  updatedAt: 3,
                },
              ]
            : [],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/personas' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: personas }),
      });
      return;
    }
    if (url.pathname === '/api/v1/personas' && request.method() === 'POST') {
      const input = request.postDataJSON() as Record<string, unknown>;
      const created = {
        id: 'persona-1',
        avatarFileId: null,
        shortDescription: '',
        longDescription: '',
        personality: '',
        appearance: '',
        speakingStyle: '',
        background: '',
        pronouns: '',
        representedAge: null,
        customNotes: '',
        visibility: 'PRIVATE',
        isDefault: true,
        updatedAt: 1,
        ...input,
      };
      personas = [created];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/characters/mature-character-1/publish' &&
      request.method() === 'POST'
    ) {
      ownedCharacters = ownedCharacters.map((character) =>
        character['id'] === 'mature-character-1'
          ? { ...character, visibility: 'PUBLIC', publishState: 'MODERATION_PENDING' }
          : character,
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mature-character-1',
          visibility: 'PUBLIC',
          publishState: 'MODERATION_PENDING',
          message: matureReviewPendingText,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/characters/mature-character-1' && request.method() === 'PATCH') {
      const input = request.postDataJSON() as Record<string, unknown>;
      characterAutosaveBodies.push(input);
      let updated: Record<string, unknown> | null = null;
      ownedCharacters = ownedCharacters.map((character) => {
        if (character['id'] !== 'mature-character-1') return character;
        updated = { ...character, ...input, version: Number(character['version']) + 1 };
        return updated;
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      });
      return;
    }
    if (url.pathname === '/api/v1/characters' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: ownedCharacters }),
      });
      return;
    }
    if (url.pathname === '/api/v1/lorebooks' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            ...(lorebook ? [{ ...lorebook, entryCount: loreEntries.length }] : []),
            ...(importedLorebook
              ? [{ ...importedLorebook, entryCount: importedLoreEntries.length }]
              : []),
          ],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/lorebooks' && request.method() === 'POST') {
      lorebook = {
        id: 'lorebook-1',
        ownerId: 'user-1',
        name: 'Архив мира',
        description: 'Тайные сведения',
        visibility: 'PRIVATE',
        createdAt: 1,
        updatedAt: 1,
        ...(request.postDataJSON() as Record<string, unknown>),
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(lorebook),
      });
      return;
    }
    if (url.pathname === '/api/v1/lorebooks/import' && request.method() === 'POST') {
      const payload = request.postDataJSON() as {
        readonly transfer: {
          readonly book: {
            readonly name: string;
            readonly description?: string;
          };
          readonly entries: readonly Record<string, unknown>[];
        };
      };
      importedLorebook = {
        id: 'lorebook-imported',
        ownerId: 'user-1',
        name: payload.transfer.book.name,
        description: payload.transfer.book.description ?? '',
        visibility: 'PRIVATE',
        createdAt: 2,
        updatedAt: 2,
      };
      importedLoreEntries = payload.transfer.entries.map((entry, index) => ({
        id: `imported-entry-${String(index + 1)}`,
        lorebookId: 'lorebook-imported',
        createdAt: 2,
        updatedAt: 2,
        ...entry,
      }));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'lorebook-imported',
          importedEntries: importedLoreEntries.length,
        }),
      });
      return;
    }
    if (
      importedLorebook &&
      url.pathname === `/api/v1/lorebooks/${String(importedLorebook['id'])}` &&
      request.method() === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...importedLorebook, entries: importedLoreEntries }),
      });
      return;
    }
    if (
      importedLorebook &&
      url.pathname === `/api/v1/lorebooks/${String(importedLorebook['id'])}/attachments`
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"characters":[],"conversations":[]}',
      });
      return;
    }
    if (
      lorebook &&
      url.pathname === `/api/v1/lorebooks/${String(lorebook['id'])}/export` &&
      request.method() === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          format: 'velora-lorebook',
          version: 1,
          book: {
            name: lorebook['name'],
            description: lorebook['description'],
            visibility: lorebook['visibility'],
          },
          entries: loreEntries.map((entry) =>
            Object.fromEntries(
              Object.entries(entry).filter(
                ([key]) => !['id', 'lorebookId', 'createdAt', 'updatedAt'].includes(key),
              ),
            ),
          ),
        }),
      });
      return;
    }
    if (
      lorebook &&
      url.pathname === `/api/v1/lorebooks/${String(lorebook['id'])}` &&
      request.method() === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...lorebook, entries: loreEntries }),
      });
      return;
    }
    if (lorebook && url.pathname === `/api/v1/lorebooks/${String(lorebook['id'])}/attachments`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"characters":[],"conversations":[]}',
      });
      return;
    }
    if (
      lorebook &&
      url.pathname === `/api/v1/lorebooks/${String(lorebook['id'])}/entries` &&
      request.method() === 'POST'
    ) {
      const created = {
        id: 'lore-entry-1',
        lorebookId: String(lorebook['id']),
        title: 'Скрытая дверь',
        content: 'За архивом есть проход.',
        keys: ['архив'],
        secondaryKeys: [],
        enabled: true,
        priority: 0,
        position: 0,
        caseSensitive: false,
        matchWholeWord: false,
        scanDepth: 20,
        tokenBudget: 400,
        createdAt: 1,
        updatedAt: 1,
        ...(request.postDataJSON() as Record<string, unknown>),
      };
      loreEntries = [created];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }
    if (url.pathname === '/api/v1/settings') {
      if (request.method() === 'PATCH') {
        const body = request.postDataJSON() as { readonly locale?: 'ru' | 'en' };
        settingsLocale = body.locale ?? settingsLocale;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          theme: 'dark',
          locale: settingsLocale,
          defaultPersonaId: null,
          generationProfile: 'BALANCED',
          nsfwVisible: false,
          preferences: {},
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/data-controls') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          export: {
            formatVersion: 1,
            resources: ['conversations', 'characters', 'lorebooks', 'supportRequests'],
            counts: {
              conversations: 1,
              characters: 1,
              lorebooks: 1,
              supportRequests: supportRequests.length,
            },
          },
          deletion: deletionPending
            ? {
                id: 'deletion-1',
                state: 'PENDING',
                requestedAt: 1,
                executeAfter: Date.now() + 7 * 24 * 60 * 60 * 1000,
                cancellable: true,
              }
            : null,
          gracePeriodDays: 7,
          retention: {
            retained: ['financial ledger', 'moderation evidence'],
            reason: 'Disputes and fraud prevention.',
            identity: 'Identity is pseudonymized.',
          },
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/data-export') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-disposition': 'attachment; filename="velora-export.json"' },
        body: JSON.stringify({ formatVersion: 1 }),
      });
      return;
    }
    if (url.pathname === '/api/v1/support/requests') {
      if (request.method() === 'POST') {
        const input = request.postDataJSON() as Record<string, unknown>;
        const created = {
          id: 'support-1',
          userId: 'user-1',
          ...input,
          state: 'OPEN',
          resolutionNote: '',
          createdAt: 1,
          updatedAt: 1,
          resolvedAt: null,
        };
        supportRequests = [created];
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(created),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: supportRequests }),
        });
      }
      return;
    }
    if (url.pathname === '/api/v1/admin/support/requests') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: supportRequests }),
      });
      return;
    }
    if (url.pathname === '/api/v1/data-controls/account-deletion') {
      if (request.method() === 'POST') {
        const input = request.postDataJSON() as { readonly confirmation: string };
        expect(input.confirmation).toBe('УДАЛИТЬ');
        deletionPending = true;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ state: 'PENDING' }),
        });
      } else {
        deletionPending = false;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"cancelled":true}',
        });
      }
      return;
    }
    if (url.pathname === '/api/v1/blocks' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: blockedUsers }),
      });
      return;
    }
    if (url.pathname === '/api/v1/blocks/blocked-user-1' && request.method() === 'DELETE') {
      blockedUsers = [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"blocked":false,"userId":"blocked-user-1"}',
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/moderation/cases') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"items":[]}',
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/operations/dashboard') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: 12,
          activeUsers24h: 5,
          messages24h: 18,
          aiRequests24h: 3,
          failedGenerations24h: 0,
          aiCostMicros24h: 12500,
          paymentFailures24h: 0,
          moderationBacklog: 0,
          jobBacklog: 1,
          productEvents24h: 24,
          providerLastSuccessAt: 1,
          providerLastFailureAt: null,
          planDistribution: { FREE: 12 },
          generatedAt: 1,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/billing/access-packs') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' });
      return;
    }
    if (url.pathname === '/api/v1/admin/billing/plans') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'plan-free',
              code: 'FREE',
              displayName: 'Free',
              active: true,
              rank: 0,
              entitlements: {
                rateLimitMultiplier: 1,
                characterLimit: 10,
                personaLimit: 3,
                memoryTokenBudget: 2000,
                loreTokenBudget: 1000,
                advancedOperationsDaily: 3,
                modelProfiles: ['BALANCED'],
              },
            },
          ],
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Алиса, твоя история начинается здесь' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByRole('heading', { name: 'Выбери комфортный режим' })).toBeVisible();
  await page.getByText('Я принимаю правила сообщества').click();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.getByLabel('Имя образа').fill('Странница');
  await page.getByLabel('Короткое описание').fill('Ищет забытые истории.');
  await page.getByRole('button', { name: 'Сохранить образ' }).click();
  await expect(page.getByRole('heading', { name: 'Выбери, с чего начать' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Лира' })).toBeVisible();
  await page.getByRole('button', { name: 'Начать' }).click();
  await expect(page.getByText('Ты всё-таки пришёл.')).toBeVisible();
  expect(onboardingPayload).toMatchObject({
    policyAccepted: true,
    matureEnabled: false,
    persona: { name: 'Странница', shortDescription: 'Ищет забытые истории.' },
  });
  await page.getByRole('button', { name: /Каталог/u }).click();
  await expect(page.getByRole('heading', { name: 'Найди свою историю' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Лира' })).toBeVisible();
  await page.getByRole('button', { name: 'от Velora' }).click();
  await expect(page.getByRole('heading', { name: 'Velora' })).toBeVisible();
  await expect(page.getByText('Создатель мистических персонажей.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Опубликованные персонажи' })).toBeVisible();
  await page.getByRole('button', { name: '← В каталог' }).click();
  await page.locator('.brand-button').click();
  await expect(page.getByText('Автор пока ничего о себе не рассказал.')).toBeVisible();
  await page.getByRole('button', { name: 'Редактировать профиль' }).click();
  await page.getByRole('textbox', { name: 'Отображаемое имя' }).fill('Алиса Велора');
  await page.getByRole('textbox', { name: 'О себе' }).fill('Пишу камерные мистические истории.');
  await page.getByRole('button', { name: 'Сохранить профиль' }).click();
  await expect(page.getByRole('heading', { name: 'Алиса Велора' })).toBeVisible();
  await page.getByRole('button', { name: '← В каталог' }).click();
  await page.getByRole('button', { name: 'Открыть AI-кредиты' }).click();
  await expect(page.getByRole('heading', { name: 'Разовое пополнение' })).toBeVisible();
  await expect(page.getByText('Без карты, подписки и автопополнения')).toBeVisible();
  await expect(page.getByText('Текущий тариф: Plus')).toBeVisible();
  const buyButton = page.getByRole('button', { name: 'Купить за 75 ⭐' });
  await expect(buyButton).toBeDisabled();
  await page.getByRole('checkbox').check();
  await buyButton.click();
  await expect.poll(() => openedInvoiceUrl).toBe('https://t.me/$invoice-test');
  await expect
    .poll(() =>
      page.evaluate(() => (window as Window & { __openedInvoiceUrl?: string }).__openedInvoiceUrl),
    )
    .toBe('https://t.me/$invoice-test');
  await expect(page.getByText('Оплата подтверждена. Баланс обновляется.')).toBeVisible();
  await page.getByRole('button', { name: /Каталог/u }).click();
  await page.getByRole('button', { name: '♡ Нравится' }).click();
  await expect(page.getByRole('button', { name: '♥ Нравится' })).toBeVisible();
  await page.getByRole('button', { name: '♧ В закладки' }).click();
  await expect(page.getByRole('button', { name: '🔖 Сохранено' })).toBeVisible();
  await page.getByRole('button', { name: 'Подробнее' }).click();
  await page.getByLabel('Ваша оценка').selectOption('5');
  await page.getByPlaceholder('Отзыв необязателен').fill('Очень атмосферный персонаж.');
  await page.getByRole('button', { name: 'Оценить' }).click();
  await expect(page.getByRole('region', { name: 'Отзывы' }).getByRole('paragraph')).toHaveText(
    'Очень атмосферный персонаж.',
  );
  await page.getByRole('button', { name: /Пожаловаться/u }).click();
  await page.getByLabel('Причина жалобы').selectOption('SPAM');
  await page.getByLabel('Описание жалобы').fill('Повторяющийся рекламный контент.');
  await page.getByRole('button', { name: 'Отправить жалобу' }).click();
  await expect(page.getByText('Жалоба отправлена в очередь модерации.')).toBeVisible();
  await page.getByRole('button', { name: 'Начать историю' }).click();
  await expect(page.getByText('Ты всё-таки пришёл.')).toBeVisible();
  await expect(page.locator('.message-bubble.is-character em')).toHaveText('Ты всё-таки пришёл.');
  await page.getByLabel('Реплика').fill('Я открываю дверь.');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByText('Архив отвечает эхом.')).toBeVisible();
  const latestAssistant = page.locator('.message-bubble.is-character').last();
  await latestAssistant.getByRole('button', { name: 'Действия с сообщением' }).click();
  await expect(latestAssistant.getByRole('button', { name: 'Другой ответ' })).toBeVisible();
  await expect(latestAssistant.getByRole('button', { name: 'Продолжить ответ' })).toBeVisible();
  await latestAssistant.getByRole('button', { name: 'Изменить' }).click();
  await expect(latestAssistant.getByLabel('Изменённый текст сообщения')).toBeVisible();
  await latestAssistant.getByRole('button', { name: 'Отмена' }).click();
  await latestAssistant.getByRole('button', { name: 'Действия с сообщением' }).click();
  await latestAssistant.getByRole('button', { name: 'Удалить' }).click();
  await expect(
    page.getByRole('heading', { name: 'Удалить сообщение и продолжение ветки?' }),
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click();
  await latestAssistant.getByRole('button', { name: 'Действия с сообщением' }).click();
  await latestAssistant.getByRole('button', { name: 'Пожаловаться' }).click();
  await page
    .getByLabel('Описание жалобы на сообщение')
    .fill('Ответ персонажа нарушает выбранные ограничения истории.');
  await page.getByRole('dialog').getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByRole('heading', { name: 'Жалоба на сообщение' })).toBeHidden();
  await page.getByRole('button', { name: 'Инструменты истории' }).click();
  await page
    .getByRole('navigation', { name: 'Инструменты истории' })
    .getByRole('button', { name: /Диалог/u })
    .click();
  await expect(page.getByRole('heading', { name: 'Удалить диалог?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Оставить' }).click();
  await page.getByRole('button', { name: 'Назад к диалогам' }).click();
  await page.getByRole('button', { name: /Образы/u }).click();
  await page.getByRole('button', { name: /Создать/u }).click();
  await page.getByLabel('Имя').fill('Странница');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { name: 'Странница' })).toBeVisible();
  await page.getByRole('button', { name: /Персонажи/u }).click();
  await expect(page.getByRole('heading', { name: 'Ночная история' })).toBeVisible();
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await expect(page.getByText('✓ Сохранено')).toBeVisible();
  await page.getByLabel('Короткая фраза').fill('Обновлённый безопасный черновик');
  await expect(page.getByText('Изменения ожидают сохранения')).toBeVisible();
  await expect(page.getByText('✓ Сохранено')).toBeVisible();
  expect(characterAutosaveBodies).toHaveLength(1);
  expect(characterAutosaveBodies[0]).toMatchObject({
    baseVersion: 1,
    tagline: 'Обновлённый безопасный черновик',
  });
  await page.getByRole('button', { name: '← Назад' }).click();
  await expect(page.getByRole('heading', { name: 'Ночная история' })).toBeVisible();
  await page.getByRole('button', { name: 'Тестовый диалог' }).click();
  await expect(page.getByText('Приватный тест черновика')).toBeVisible();
  expect(previewRequestVerified).toBe(true);
  await page.getByRole('button', { name: 'Назад к диалогам' }).click();
  conversationPreview = false;
  await page.getByRole('button', { name: /Персонажи/u }).click();
  await expect(page.getByRole('heading', { name: 'Ночная история' })).toBeVisible();
  await page.getByRole('button', { name: 'Опубликовать' }).click();
  await expect(page.getByText(matureReviewPendingText)).toBeVisible();
  await expect(page.getByText('На проверке')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Отменить проверку' })).toBeVisible();
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await page.getByLabel('Короткая фраза').fill('Не отправлять автоматически на повторную проверку');
  await expect(page.getByText('Изменения ожидают сохранения')).toBeVisible();
  await page.waitForTimeout(1_100);
  expect(characterAutosaveBodies).toHaveLength(1);
  await page.getByRole('button', { name: 'Отменить' }).click();
  await page.getByRole('button', { name: /Книги мира/u }).click();
  await page.getByRole('button', { name: /Создать/u }).click();
  await page.getByLabel('Название').fill('Архив мира');
  await page.getByLabel('Описание').fill('Тайные сведения');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { name: 'Настройки книги' })).toBeVisible();
  await page.getByRole('button', { name: /Запись/u }).click();
  await page.getByLabel('Заголовок').fill('Скрытая дверь');
  await page.getByLabel('Содержание').fill('За архивом есть проход.');
  await page.getByLabel('Основные ключи через запятую').fill('архив');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { name: 'Скрытая дверь' })).toBeVisible();
  await page.getByRole('button', { name: '← Назад' }).click();
  const loreDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт' }).click();
  const loreDownload = await loreDownloadPromise;
  expect(loreDownload.suggestedFilename()).toBe('Архив-мира.json');
  await page.getByLabel('Импортировать книгу мира').setInputFiles({
    name: 'world.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'velora-lorebook',
        version: 1,
        book: {
          name: 'Импортированный мир',
          description: 'Проверенный перенос',
          visibility: 'PUBLIC',
        },
        entries: [
          {
            title: 'Башня',
            content: 'Башня стоит на севере.',
            keys: ['башня'],
            secondaryKeys: [],
            enabled: true,
            priority: 0,
            position: 0,
            caseSensitive: false,
            matchWholeWord: false,
            scanDepth: 20,
            tokenBudget: 400,
          },
        ],
      }),
    ),
  });
  await expect(page.getByRole('heading', { name: 'Настройки книги' })).toBeVisible();
  await expect(page.getByLabel('Название')).toHaveValue('Импортированный мир');
  await expect(page.getByLabel('Видимость')).toHaveValue('PRIVATE');
  await page.getByRole('button', { name: /Диалоги/u }).click();
  await page.getByRole('button', { name: /Лира/u }).click();
  await page.getByRole('button', { name: 'Инструменты истории' }).click();
  await page.getByRole('button', { name: /Контекст/u }).click();
  await page.getByLabel('Архив мира').check();
  await expect(page.getByText('Активные сейчас: 1')).toBeVisible();
  await expect(page.getByText('6 токенов')).toBeVisible();
  await page.getByRole('button', { name: /Память/u }).click();
  await expect(page.getByText(/AI-кредиты не расходуются/u)).toBeVisible();
  await page.getByLabel('Текст постоянной памяти').fill('Обещание у маяка сохранено.');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Изменено вручную')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Инструменты истории' })
    .getByRole('button', { name: /Промпт/u })
    .click();
  await expect(page.getByText('Инспектор промпта', { exact: true })).toBeVisible();
  await expect(page.getByText('165 входных токенов')).toBeVisible();
  await page.getByText('Активный лор · 1').click();
  await expect(page.getByText('Скрытая дверь')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Инструменты истории' })
    .getByRole('button', { name: /Настройки/u })
    .click();
  await page.getByLabel('Профиль генерации').selectOption('CREATIVE');
  await page.getByLabel('Длина ответа').selectOption('SHORT');
  await page.getByLabel('Инструкции для этого чата').fill('Пиши кинематографично.');
  await page.getByRole('button', { name: 'Сохранить настройки' }).click();
  await expect(page.getByText('Настройки истории сохранены.')).toBeVisible();
  expect(conversationSettings.modelProfile).toBe('CREATIVE');
  expect(conversationSettings.responseLength).toBe('SHORT');
  expect(conversationSettings.customInstructions).toBe('Пиши кинематографично.');
  conversationMessages = Array.from({ length: 100 }, (_, index) => ({
    id: `history-${String(index + 1)}`,
    conversationId: 'conversation-1',
    role: index % 2 === 0 ? 'ASSISTANT' : 'USER',
    content: `Историческое сообщение ${String(index + 1)}`,
    status: 'COMPLETED',
    parentMessageId: index === 0 ? null : `history-${String(index)}`,
    generationGroupId: null,
    model: null,
    provider: null,
    metadata: {},
    createdAt: index + 1,
    editedAt: null,
    variantIndex: 0,
    variantCount: 1,
    variantIds: [`history-${String(index + 1)}`],
  }));
  await page.reload();
  await page.getByRole('button', { name: /Диалоги/u }).click();
  await page.getByRole('button', { name: /Лира/u }).click();
  await expect(page.locator('.message-bubble')).toHaveCount(80);
  const loadEarlier = page.getByRole('button', { name: 'Показать предыдущие сообщения · 20' });
  await expect(loadEarlier).toBeVisible();
  await loadEarlier.click();
  await expect(page.locator('.message-bubble')).toHaveCount(100);
  await page.route(
    '**/api/v1/conversations/conversation-1/messages',
    async (route) => {
      await route.abort('internetdisconnected');
    },
    { times: 1 },
  );
  await page.context().setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'Нет подключения' })).toBeVisible();
  const offlineDraft = page.getByLabel('Реплика');
  await offlineDraft.fill('Этот черновик нельзя потерять.');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByRole('alert')).toContainText('Нет подключения к сети');
  await expect(offlineDraft).toHaveValue('Этот черновик нельзя потерять.');
  await page.context().setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: 'Нет подключения' })).toBeHidden();
  await offlineDraft.fill('');
  const catalogNavigation = page.getByRole('button', { name: /Каталог/u });
  await catalogNavigation.focus();
  expect(
    await catalogNavigation.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).not.toBe('none');
  const unnamedButtons = await page
    .locator('button')
    .evaluateAll((buttons) =>
      buttons
        .filter(
          (button) =>
            !button.textContent.trim() &&
            !button.getAttribute('aria-label') &&
            !button.getAttribute('title'),
        )
        .map((button) => button.outerHTML),
    );
  expect(unnamedButtons).toEqual([]);
  await page.locator('html').evaluate((element) => {
    element.style.fontSize = '200%';
  });
  const overflowingElements = await page.locator('html').evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.right > window.innerWidth + 1 || bounds.left < -1;
      })
      .slice(0, 12)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        text: element.textContent.trim().slice(0, 80),
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
      })),
  );
  expect(overflowingElements).toEqual([]);
  await page.locator('html').evaluate((element) => {
    element.style.fontSize = '';
  });
  await page.getByRole('button', { name: /Модерация/u }).click();
  await expect(page.getByRole('heading', { name: 'Очередь модерации' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Очередь пуста' })).toBeVisible();
  await page.getByRole('button', { name: 'Поддержка' }).click();
  await expect(page.getByRole('heading', { name: 'Обращения в поддержку' })).toBeVisible();
  await page.getByRole('button', { name: '← К модерации' }).click();
  await page.getByRole('button', { name: 'Система' }).click();
  await expect(page.getByRole('heading', { name: 'Состояние системы' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Системные показатели' })).toContainText(
    'Активны за 24 часа',
  );
  await page.getByRole('button', { name: '← К модерации' }).click();
  await expect(page.getByRole('heading', { name: 'Очередь модерации' })).toBeVisible();
  await page
    .getByRole('button', { name: /Настройки/u })
    .last()
    .click();
  await page.getByLabel('Язык').selectOption('en');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Chats/u })).toBeVisible();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('button', { name: /Discover/u }).click();
  await expect(page.getByRole('heading', { name: 'Find your story' })).toBeVisible();
  await page.getByRole('button', { name: 'Open AI credits' }).click();
  await expect(page.getByRole('heading', { name: 'One-time top-up' })).toBeVisible();
  await expect(page.getByText('No card, subscription, or automatic top-up')).toBeVisible();
  await page.getByRole('button', { name: /Settings/u }).click();
  await page.getByLabel('Language').selectOption('ru');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Управление аккаунтом' })).toBeVisible();
  await expect(page.getByText('Диалоги: 1')).toBeVisible();
  const supportSection = page.getByRole('region', { name: 'Поддержка' });
  await expect(supportSection).toBeVisible();
  await supportSection
    .getByRole('textbox', { name: 'Тема', exact: true })
    .fill('Ошибка отображения');
  await supportSection
    .getByRole('textbox', { name: 'Сообщение', exact: true })
    .fill('После открытия диалога отображается пустой экран без текста.');
  await supportSection.getByRole('button', { name: 'Отправить обращение' }).click();
  await expect(page.getByText('Обращение отправлено в поддержку.')).toBeVisible();
  await expect(page.getByText('Ошибка отображения')).toBeVisible();
  await page.getByText('Условия использования').click();
  await expect(page.getByText(/AI может ошибаться/u)).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать данные' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('velora-export.json');
  await expect(page.getByText('Заблокированный автор')).toBeVisible();
  await page.getByRole('button', { name: 'Разблокировать' }).click();
  await expect(page.getByText('Вы пока никого не блокировали.')).toBeVisible();
  await page.getByRole('button', { name: 'Запросить удаление аккаунта' }).click();
  const deletionDialog = page.getByRole('alertdialog', { name: 'Удалить аккаунт?' });
  await expect(deletionDialog).toBeVisible();
  const scheduleDeletion = deletionDialog.getByRole('button', {
    name: 'Запланировать удаление',
  });
  await expect(scheduleDeletion).toBeDisabled();
  await deletionDialog.getByLabel('Подтверждение').fill('УДАЛИТЬ');
  await scheduleDeletion.click();
  await expect(page.getByRole('button', { name: 'Отменить удаление' })).toBeVisible();
  await page.getByRole('button', { name: 'Отменить удаление' }).click();
  await expect(page.getByRole('button', { name: 'Запросить удаление аккаунта' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});

test('owner manages moderator appointments without exposing the control to staff', async ({
  page,
}) => {
  let staff: readonly Record<string, unknown>[] = [];
  let smokeRun: Readonly<Record<string, unknown>> | null = null;
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === 'telegram.org') {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `window.Telegram={WebApp:{initData:'owner-init-data',colorScheme:'dark',ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){}}};`,
      });
      return;
    }
    if (url.pathname === '/health') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"status":"ok"}',
      });
      return;
    }
    if (url.pathname === '/api/v1/auth/telegram') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'owner-1', displayName: 'Владелец', role: 'OWNER' },
          csrfToken: 'owner-csrf',
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/me') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'owner-1',
          username: 'vldd',
          displayName: 'Владелец',
          avatarFileId: null,
          locale: 'ru',
          role: 'OWNER',
          moderationState: 'ACTIVE',
          ageGateAccepted: true,
          onboardingCompleted: true,
          plan: 'FREE',
          planDisplayName: 'Free',
          planAccessUntil: null,
          planEntitlements: {
            rateLimitMultiplier: 1,
            characterLimit: 10,
            personaLimit: 3,
            memoryTokenBudget: 2000,
            loreTokenBudget: 1000,
            advancedOperationsDaily: 3,
            modelProfiles: ['BALANCED'],
          },
          creditBalanceMicros: 0,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/feature-flags') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"flags":{"advanced_memory":false,"new_model":false,"public_reviews":true,"experimental_renderer":false}}',
      });
      return;
    }
    if (url.pathname === '/api/v1/discovery') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"items":[],"nextCursor":null}',
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/moderation/cases') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' });
      return;
    }
    if (url.pathname === '/api/v1/admin/operations/dashboard') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: 2,
          activeUsers24h: 2,
          messages24h: 0,
          aiRequests24h: 0,
          failedGenerations24h: 0,
          aiCostMicros24h: 0,
          paymentFailures24h: 0,
          moderationBacklog: 0,
          jobBacklog: 0,
          productEvents24h: 0,
          providerLastSuccessAt: null,
          providerLastFailureAt: null,
          planDistribution: { FREE: 2 },
          generatedAt: 1,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/operations/ai-smoke') {
      if (request.method() === 'POST') {
        expect(request.postDataJSON()).toEqual({ confirmation: 'ПОТРАТИТЬ 1 ЗАПРОС V3' });
        smokeRun = {
          runKey: 'BOTHUB_INITIAL_ROLEPLAY_V3',
          provider: 'BOTHUB',
          model: 'deepseek-chat-v3.1',
          state: 'COMPLETED',
          protocolVariant: 'BOTHUB_DOCUMENTED',
          inputTokens: 24,
          outputTokens: 12,
          cachedTokens: 0,
          providerReportedCostMicros: 120,
          conservativeCostMicros: 20_000,
          latencyMs: 450,
          outputLength: 42,
          errorCode: null,
          httpStatus: 200,
          responseStarted: true,
          startedAt: 1,
          completedAt: 2,
          alreadyAttempted: false,
          output: 'Дверь тихо открылась навстречу лунному саду.',
        };
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            run: smokeRun,
            history: [smokeRun],
            capabilities: {
              availableCandidates: ['deepseek-chat-v3.1'],
              selectedModel: 'deepseek-chat-v3.1',
              checkedAt: 1,
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            run: smokeRun,
            history: smokeRun ? [smokeRun] : [],
            capabilities: {
              availableCandidates: ['deepseek-chat-v3.1'],
              selectedModel: 'deepseek-chat-v3.1',
              checkedAt: 1,
            },
          }),
        });
      }
      return;
    }
    if (url.pathname === '/api/v1/admin/billing/plans') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'plan-free',
              code: 'FREE',
              displayName: 'Free',
              active: true,
              rank: 0,
              entitlements: {
                rateLimitMultiplier: 1,
                characterLimit: 10,
                personaLimit: 3,
                memoryTokenBudget: 2000,
                loreTokenBudget: 1000,
                advancedOperationsDaily: 3,
                modelProfiles: ['BALANCED'],
              },
            },
            {
              id: 'plan-plus',
              code: 'PLUS',
              displayName: 'Plus',
              active: true,
              rank: 10,
              entitlements: {
                rateLimitMultiplier: 2,
                characterLimit: 30,
                personaLimit: 10,
                memoryTokenBudget: 6000,
                loreTokenBudget: 4000,
                advancedOperationsDaily: 12,
                modelProfiles: ['BALANCED', 'CREATIVE'],
              },
            },
          ],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/billing/access-packs') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"items":[]}',
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/feature-flags') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' });
      return;
    }
    if (url.pathname === '/api/v1/admin/staff') {
      if (request.method() === 'POST') {
        const input = request.postDataJSON() as {
          readonly telegramId: string;
          readonly role: string;
        };
        expect(input).toEqual({ telegramId: '7001001', role: 'MODERATOR' });
        staff = [
          {
            id: 'staff-1',
            userId: 'user-2',
            telegramId: input.telegramId,
            username: 'moderator_test',
            displayName: 'Тестовый модератор',
            role: input.role,
            assignedBy: 'owner-1',
            assignedAt: 1,
          },
        ];
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: '{"id":"staff-1","userId":"user-2","role":"MODERATOR"}',
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: staff }),
        });
      }
      return;
    }
    if (url.pathname === '/api/v1/admin/staff/7001001' && request.method() === 'DELETE') {
      staff = [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"revoked":true}',
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Модерация/u }).click();
  await page.getByRole('button', { name: 'Система' }).click();
  await expect(page.getByText('Тариф FREE')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Контрольный запрос BotHub' })).toBeVisible();
  const smokeButton = page.getByRole('button', { name: 'Запустить один платный запрос' });
  await expect(smokeButton).toBeDisabled();
  await page.getByLabel('Я понимаю, что будет списана стоимость одного запроса BotHub.').check();
  await smokeButton.click();
  await expect(page.getByText('Дверь тихо открылась навстречу лунному саду.')).toBeVisible();
  await expect(page.getByText(/24 входных \/ 12 выходных токенов/u)).toBeVisible();
  await expect(smokeButton).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Команда модерации' })).toBeVisible();
  await page.getByLabel('Telegram ID').fill('7001001');
  await page.getByRole('button', { name: 'Назначить' }).click();
  await expect(page.getByText('Тестовый модератор')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Снять' }).click();
  await expect(page.getByText('Тестовый модератор')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});
