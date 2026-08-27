import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Dialog, type Page, type TestInfo } from '@playwright/test';
import sharp from 'sharp';

function capturesReferenceEvidence(testInfo: TestInfo): boolean {
  return ['iphone', 'tablet', 'desktop'].includes(testInfo.project.name);
}

async function expectNoBlockingA11y(page: Page, name: string): Promise<void> {
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const releaseBlockingViolations = accessibility.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(
    releaseBlockingViolations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        html: node.html,
        failureSummary: node.failureSummary,
      })),
    })),
    `Critical/serious accessibility violations in ${name}`,
  ).toEqual([]);
}

async function expectNoRenderedArtifacts(page: Page, name: string): Promise<void> {
  const audit = await page.evaluate(() => {
    const renderedText = document.body.innerText;
    const forbiddenText = [
      /\bTODO\b/u,
      /Lorem ipsum/iu,
      /\bundefined\b/u,
      /\bnull\b/u,
      /\bNaN\b/u,
      /\[object Object\]/u,
      /translation_key/u,
      /missing_translation/u,
      /\{\{(?:char|user)\}\}/u,
    ];
    const rawMarkdown = [/\*\*[^*\n]+\*\*/u, /(?:^|\s)\*[^*\n]+\*(?=\s|$)/mu];
    const brokenImages = [...document.images]
      .filter((image) => image.getClientRects().length > 0)
      .filter((image) => !image.complete || image.naturalWidth <= 0)
      .map((image) => image.alt || image.currentSrc || image.src || 'unnamed image');
    return {
      forbiddenMatches: forbiddenText
        .map((pattern) => renderedText.match(pattern)?.[0] ?? null)
        .filter((match): match is string => match !== null),
      rawMarkdownMatches: rawMarkdown
        .map((pattern) => renderedText.match(pattern)?.[0]?.trim() ?? null)
        .filter((match): match is string => match !== null),
      brokenImages,
    };
  });
  expect(audit.forbiddenMatches, `Rendered text artifacts in ${name}`).toEqual([]);
  expect(audit.rawMarkdownMatches, `Raw markdown in ${name}`).toEqual([]);
  expect(audit.brokenImages, `Broken visible images in ${name}`).toEqual([]);
}

function installPageDiagnostics(page: Page): () => void {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const failedResponses: string[] = [];
  page.on('console', (message) => {
    const expectedOfflineResourceError =
      message.text().includes('ERR_INTERNET_DISCONNECTED') ||
      message.text() === 'Failed to load resource: WebKit encountered an internal error';
    if (message.type() === 'error' && !expectedOfflineResourceError) {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const failureText = request.failure()?.errorText ?? '';
    const expectedOfflineMessageFailure =
      request.url().includes('/api/v1/conversations/conversation-1/messages') &&
      (failureText.includes('INTERNET_DISCONNECTED') ||
        failureText === 'WebKit encountered an internal error' ||
        failureText === 'Blocked by Web Inspector');
    // Chromium reports an intercepted, bodyless 204 as aborted even though the mocked mutation
    // completed and the refreshed Lorebook state is asserted immediately afterwards.
    const interceptedNoContentMutation =
      request.url().includes('/api/v1/conversations/conversation-1/lorebooks/lorebook-1') &&
      ['PUT', 'DELETE'].includes(request.method()) &&
      request.failure()?.errorText.includes('ERR_ABORTED');
    if (!expectedOfflineMessageFailure && !interceptedNoContentMutation) {
      failedRequests.push(
        `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`,
      );
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedResponses.push(
        `${String(response.status())} ${response.request().method()} ${response.url()}`,
      );
    }
  });
  return () => {
    expect(consoleErrors, 'Unexpected browser console.error entries').toEqual([]);
    expect(pageErrors, 'Unexpected uncaught browser exceptions').toEqual([]);
    expect(failedRequests, 'Unexpected failed browser requests').toEqual([]);
    expect(failedResponses, 'Unexpected HTTP 4xx/5xx responses').toEqual([]);
  };
}

async function expectVisualSnapshot(page: Page, name: string): Promise<void> {
  await expectNoRenderedArtifacts(page, name);
  await expectNoBlockingA11y(page, name);
  if (process.platform !== 'linux') return;
  await page.evaluate(async () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    await document.fonts.ready;
  });
  await expect(page).toHaveScreenshot(`visual-${name}.png`, {
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
    maxDiffPixelRatio: 0.003,
  });
}

async function openAppMenuSection(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /^(?:Open menu|Открыть меню)$/u }).click();
  const drawer = page.getByRole('dialog', { name: /Velora menu|Меню Velora/u });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name, exact: true }).click();
  await expect(drawer).toBeHidden();
}

async function openStoryTool(page: Page, name: RegExp): Promise<void> {
  await page.getByRole('button', { name: /^(?:Story tools|Инструменты истории)$/u }).click();
  const menu = page.getByRole('dialog', { name: /^(?:Story tools|Инструменты истории)$/u });
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name }).click();
  await expect(menu).toBeHidden();
}

const matureReviewPendingText =
  'Персонаж с отметкой Mature отправлен на проверку возраста и безопасности. До решения модератора он не показывается в каталоге.';

function capacityProjectionFixture() {
  const definitions = [
    ['workerRequests', 'DAY', 1_620, 100_000],
    ['d1RowsRead', 'DAY', 20_000, 5_000_000],
    ['d1RowsWritten', 'DAY', 500, 100_000],
    ['queueOperations', 'DAY', 9, 10_000],
    ['r2Storage', 'TOTAL', 1024 * 1024, 10 * 1024 * 1024 * 1024],
    ['r2ClassAOperations', 'MONTH', 90, 1_000_000],
    ['r2ClassBOperations', 'MONTH', 600, 10_000_000],
  ] as const;
  return {
    safetyMarginPercent: 35,
    basisWindowHours: 24,
    metrics: definitions.map(([key, period, projected, freeLimit]) => ({
      key,
      period,
      projected,
      freeLimit,
      utilizationPercent: (projected / freeLimit) * 100,
      status: 'OK',
    })),
    exceedsFreePlan: false,
    automaticUpgradeEnabled: false,
    runtimePolicy: {
      status: 'OK',
      analyticsEnabled: true,
      cacheTtlMultiplier: 1,
      backgroundJobsEnabled: true,
      coreChatEnabled: true,
    },
  };
}

function ownerAiUsageFixture() {
  return {
    daily: { requests: 3, inputTokens: 120, outputTokens: 80, costMicros: 12_500 },
    weekly: { requests: 8, inputTokens: 500, outputTokens: 320, costMicros: 30_000 },
    lifetime: { requests: 20, inputTokens: 1_200, outputTokens: 900, costMicros: 70_000 },
    perModelWeekly: [
      {
        model: 'l3-lunaris-8b',
        requests: 8,
        inputTokens: 500,
        outputTokens: 320,
        costMicros: 30_000,
      },
    ],
    configuredBudgetMicros: {
      daily: 800_000,
      monthly: 24_000_000,
      lifetime: 350_000_000,
      remainingLifetime: 349_930_000,
    },
    capsBalance: {
      estimatedRemainingCaps: null,
      status: 'PROVIDER_BALANCE_API_UNAVAILABLE',
    },
  };
}

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
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const motionContract = await page.evaluate(() => {
    const read = (className: string) => {
      const element = document.createElement('div');
      element.className = className;
      document.body.append(element);
      const style = getComputedStyle(element);
      const result = {
        animationName: style.animationName,
        transitionDuration: style.transitionDuration,
      };
      element.remove();
      return result;
    };
    return {
      drawer: read('app-drawer'),
      popup: read('chat-dialog'),
      message: read('message-bubble'),
      accordion: read('drawer-submenu'),
      skeleton: read('skeleton-avatar'),
      card: read('story-card'),
    };
  });
  expect(motionContract.drawer.animationName).toContain('drawer-slide-in');
  expect(motionContract.popup.animationName).toContain('popup-scale-in');
  expect(motionContract.message.animationName).toContain('message-arrival');
  expect(motionContract.accordion.animationName).toContain('accordion-reveal');
  expect(motionContract.skeleton.animationName).toContain('skeleton-shimmer');
  expect(motionContract.card.transitionDuration).not.toBe('0s');
});

test('@visual @a11y authenticated MiniApp navigation and persona creation remain usable', async ({
  page,
}, testInfo) => {
  // This scenario intentionally traverses the complete product and runs repeated axe scans.
  // Repeated full-page axe scans plus the complete stateful journey can exceed ten minutes on a
  // constrained Windows runner while still making steady progress. Keep a bounded fifteen-minute
  // ceiling without retries, skipped checkpoints or weaker assertions.
  test.setTimeout(1_200_000);
  page.setDefaultTimeout(15_000);
  const assertPageDiagnostics = installPageDiagnostics(page);
  let notificationRead = false;
  const longHistoryMessageCount = 500;
  const longHistoryGenerationId = `generation-history-${String(longHistoryMessageCount)}`;
  let personas: readonly Record<string, unknown>[] = [
    {
      id: 'persona-default',
      name: 'Алекс',
      avatarFileId: null,
      shortDescription: 'Исследователь забытых архивов.',
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
    },
    {
      id: 'persona-wanderer',
      name: 'Проводница',
      avatarFileId: '11111111-1111-4111-8111-111111111111',
      shortDescription: 'Ищет забытые истории и тихие миры.',
      longDescription: '',
      personality: '',
      appearance: '',
      speakingStyle: '',
      background: '',
      pronouns: '',
      representedAge: null,
      customNotes: '',
      visibility: 'PRIVATE',
      isDefault: false,
      updatedAt: 1,
    },
  ];
  let defaultPersonaId: string | null = 'persona-default';
  let settingsPreferences: Readonly<Record<string, unknown>> = {};
  let settingsTheme: 'dark' | 'amoled' | 'light' = 'dark';
  let latestPersonaPatch: Readonly<Record<string, unknown>> | null = null;
  let lorebook: Record<string, unknown> | null = null;
  let loreEntries: readonly Record<string, unknown>[] = [];
  const lorebookCharacterIds = new Set<string>();
  let importedLorebook: Record<string, unknown> | null = null;
  let importedLoreEntries: readonly Record<string, unknown>[] = [];
  let conversationCreated = false;
  let onboardingCompleted = false;
  let onboardingPayload: Record<string, unknown> | null = null;
  let onboardingConversationPayload: Record<string, unknown> | null = null;
  let latestConversationPayload: Record<string, unknown> | null = null;
  let telegramAuthRequests = 0;
  let conversationPreview = false;
  let previewRequestVerified = false;
  const characterAutosaveBodies: Record<string, unknown>[] = [];
  let conversationLoreEnabled = false;
  let memoryManualContext = '';
  let memoryAutoSummary = '';
  let openedInvoiceUrl = '';
  let characterLiked = false;
  let characterBookmarked = false;
  let directImageUploadVerified = false;
  let directlyUploadedMedia: Record<string, unknown> | null = null;
  let generatedAvatarVerified = false;
  let characterAssistVerified = false;
  const discoveryQueries: URLSearchParams[] = [];
  const ownedCharacterQueries: URLSearchParams[] = [];
  const lorebookQueries: URLSearchParams[] = [];
  const conversationListQueries: URLSearchParams[] = [];
  let conversationState: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE';
  let characterReview: { readonly rating: number; readonly text: string } | null = null;
  const liraGreeting =
    '**Ты всё-таки пришёл.**\n\n*Маяк вспыхнул над чёрным морем, и ветер принёс запах соли.*\n\nЯ ждала того, кто не испугается подняться наверх. Здесь каждая ступень помнит чужие истории, а последняя дверь открывается только перед теми, кто готов услышать правду.';
  let ownedCharacters: readonly Record<string, unknown>[] = [
    {
      id: 'mature-character-1',
      avatarFileId: null,
      visibility: 'PRIVATE',
      publishState: 'DRAFT',
      contentRating: 'MATURE',
      language: 'ru',
      groupSize: 'single',
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
  let safeSearch = true;
  let matureImageBlur = true;
  let conversationSettings = {
    modelProfile: 'BALANCED',
    modelProfileId: 'velora-balanced',
    responseLength: 'MEDIUM',
    temperature: 0.8,
    maxOutputTokens: 800,
    customInstructions: 'Пиши кинематографично.',
    personaMode: 'SNAPSHOT',
  };
  let conversationMessages: readonly Record<string, unknown>[] = [
    {
      id: 'message-first',
      conversationId: 'conversation-1',
      role: 'ASSISTANT',
      content: '*Ты всё-таки пришёл.*',
      contentFormat: 'MARKDOWN',
      status: 'COMPLETED',
      isGreeting: true,
      editedByUser: false,
      origin: 'CHARACTER_GREETING',
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
      generationId: null,
      reaction: null,
    },
  ];
  const reactionRequests: string[] = [];
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/conversations/models/catalog') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          selectedProviderCatalogCheckedAt: 1,
          items: [
            {
              id: 'velora-balanced',
              displayName: 'Velora Balanced',
              descriptionRu: 'Проверенная модель для длинных историй.',
              bestForRu: 'Длинные истории',
              speedLabel: 'Средняя',
              qualityLabel: 'Высокое',
              roleplayLabel: 'Высокое',
              memoryLabel: 'Большая',
              providerLabel: 'BotHub',
              costLabelRu: 'Средний',
              contextWindow: 131072,
              maxOutput: 1200,
              tier: 'standard',
              experimental: false,
              supportsStreaming: true,
              available: true,
              allowed: true,
            },
            {
              id: 'velora-free-roleplay',
              displayName: 'Lunaris Roleplay',
              descriptionRu: 'Экономичная ролевая модель.',
              bestForRu: 'Ролевые сцены на русском',
              speedLabel: 'Высокая',
              qualityLabel: 'Базовое',
              roleplayLabel: 'Хорошее',
              memoryLabel: 'Большая',
              providerLabel: 'BotHub',
              costLabelRu: 'Очень низкий',
              contextWindow: 128000,
              maxOutput: 800,
              tier: 'free',
              experimental: true,
              supportsStreaming: true,
              available: true,
              allowed: true,
            },
            {
              id: 'velora-free-context',
              displayName: 'Velora Nano',
              descriptionRu: 'Самая экономичная модель для знакомства с приложением.',
              bestForRu: 'Пробные истории и большой контекст',
              speedLabel: 'Высокая',
              qualityLabel: 'Базовое',
              roleplayLabel: 'Базовое',
              memoryLabel: 'Большая',
              providerLabel: 'BotHub',
              costLabelRu: 'Минимальный',
              contextWindow: 400000,
              maxOutput: 800,
              tier: 'free',
              experimental: false,
              supportsStreaming: true,
              available: true,
              allowed: true,
            },
            {
              id: 'velora-premium-story',
              displayName: 'Velora Premium Story',
              descriptionRu: 'Выразительная модель для сложных сцен и эмоциональных диалогов.',
              bestForRu: 'Сложные ролевые истории',
              speedLabel: 'Средняя',
              qualityLabel: 'Максимальное',
              roleplayLabel: 'Максимальное',
              memoryLabel: 'Большая',
              providerLabel: 'BotHub',
              costLabelRu: 'Высокий',
              contextWindow: 200000,
              maxOutput: 2400,
              tier: 'premium',
              experimental: false,
              supportsStreaming: true,
              available: true,
              allowed: false,
            },
            {
              id: 'velora-provider-paused',
              displayName: 'Velora Creative Preview',
              descriptionRu: 'Экспериментальная модель для необычной подачи.',
              bestForRu: 'Творческие эксперименты',
              speedLabel: 'Средняя',
              qualityLabel: 'Высокое',
              roleplayLabel: 'Высокое',
              memoryLabel: 'Средняя',
              providerLabel: 'BotHub',
              costLabelRu: 'Средний',
              contextWindow: 64000,
              maxOutput: 1200,
              tier: 'standard',
              experimental: true,
              supportsStreaming: true,
              available: false,
              allowed: true,
            },
          ],
        }),
      });
      return;
    }
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
      telegramAuthRequests += 1;
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
    if (url.pathname === '/api/v1/notifications' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          unreadCount: notificationRead ? 0 : 1,
          items: [
            {
              id: 'notification-welcome',
              kind: 'WELCOME',
              title: 'Добро пожаловать в VeloraAI',
              body: 'Выбери персонажа и начни свою историю.',
              actionTab: 'discover',
              readAt: notificationRead ? 1_800_000_000_000 : null,
              createdAt: 1_800_000_000_000,
            },
          ],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/notifications/read-all' && request.method() === 'POST') {
      notificationRead = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updated: 1 }),
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
          personaId: 'onboarding-persona-1',
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
          items: [
            {
              code: 'plus-30',
              displayName: 'Plus на 30 дней',
              description: 'Больше памяти и пространства для твоих историй.',
              starsAmount: 120,
              planCode: 'PLUS',
              durationDays: 30,
              active: true,
              sortOrder: 10,
              recurring: false,
            },
            {
              code: 'pro-30',
              displayName: 'Pro на 30 дней',
              description: 'Максимум памяти и доступных моделей.',
              starsAmount: 240,
              planCode: 'PRO',
              durationDays: 30,
              active: true,
              sortOrder: 20,
              recurring: false,
            },
            {
              code: 'plus-90',
              displayName: 'Plus на 90 дней',
              description: 'Больше памяти и пространства для твоих историй.',
              starsAmount: 320,
              planCode: 'PLUS',
              durationDays: 90,
              active: true,
              sortOrder: 30,
              recurring: false,
            },
            {
              code: 'pro-90',
              displayName: 'Pro на 90 дней',
              description: 'Максимум памяти и доступных моделей.',
              starsAmount: 640,
              planCode: 'PRO',
              durationDays: 90,
              active: true,
              sortOrder: 40,
              recurring: false,
            },
            {
              code: 'plus-365',
              displayName: 'Plus на 365 дней',
              description: 'Больше памяти и пространства для твоих историй.',
              starsAmount: 1_000,
              planCode: 'PLUS',
              durationDays: 365,
              active: true,
              sortOrder: 50,
              recurring: false,
            },
            {
              code: 'pro-365',
              displayName: 'Pro на 365 дней',
              description: 'Максимум памяти и доступных моделей.',
              starsAmount: 2_000,
              planCode: 'PRO',
              durationDays: 365,
              active: true,
              sortOrder: 60,
              recurring: false,
            },
          ],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/billing/plans') {
      const entitlements = (
        characterLimit: number,
        personaLimit: number,
        memoryTokenBudget: number,
        advancedOperationsDaily: number,
        modelProfiles: readonly string[],
      ) => ({
        rateLimitMultiplier: 1,
        characterLimit,
        personaLimit,
        memoryTokenBudget,
        loreTokenBudget: memoryTokenBudget,
        advancedOperationsDaily,
        modelProfiles,
      });
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
              entitlements: entitlements(10, 3, 2_000, 3, ['BALANCED']),
            },
            {
              id: 'plan-plus',
              code: 'PLUS',
              displayName: 'Plus',
              active: true,
              rank: 10,
              entitlements: entitlements(50, 10, 5_000, 12, ['BALANCED', 'CREATIVE']),
            },
            {
              id: 'plan-pro',
              code: 'PRO',
              displayName: 'Pro',
              active: true,
              rank: 20,
              entitlements: entitlements(200, 30, 10_000, 40, ['BALANCED', 'CREATIVE', 'PREMIUM']),
            },
          ],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/billing/access-invoices' && request.method() === 'POST') {
      const input = request.postDataJSON() as {
        readonly termsAccepted: boolean;
        readonly packCode: string;
      };
      expect(input.termsAccepted).toBe(true);
      expect(input.packCode).toBe('plus-365');
      openedInvoiceUrl = 'https://t.me/$invoice-test';
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'access-payment-1',
          packCode: input.packCode,
          starsAmount: 1_000,
          creditAmountMicros: 0,
          state: 'INVOICE_SENT',
          invoiceUrl: openedInvoiceUrl,
          recurring: false,
          createdAt: 1,
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
    if (url.pathname === '/api/v1/config') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          environment: 'test',
          appName: 'Velora',
          telegramBotUsername: 'aivel0ra_bot',
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/discovery/tags/catalog') {
      const names = [
        'Мистика',
        'Романтика',
        'Фэнтези',
        'Приключение',
        'Драма',
        'Друзья',
        'Магия',
        'Научная фантастика',
        'Сверхъестественное',
        'Оригинальный персонаж',
        'Очень длинный тег для проверки аккуратного переноса без горизонтальной прокрутки',
        ...Array.from({ length: 52 }, (_, index) => `Категория истории ${String(index + 1)}`),
      ];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: names.map((displayName, index) => ({
            slug:
              index === 0
                ? 'mystery'
                : index === 1
                  ? 'romance'
                  : `reference-tag-${String(index + 1)}`,
            displayName,
            usageCount: 80_000 - index * 917,
          })),
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/discovery/languages/catalog') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { code: 'ru', nativeName: 'Русский', direction: 'ltr', usageCount: 80 },
            { code: 'zh', nativeName: '中文', direction: 'ltr', usageCount: 72 },
            { code: 'ja', nativeName: '日本語', direction: 'ltr', usageCount: 68 },
            { code: 'ko', nativeName: '한국어', direction: 'ltr', usageCount: 63 },
            { code: 'ar', nativeName: 'العربية', direction: 'rtl', usageCount: 58 },
            { code: 'en', nativeName: 'English', direction: 'ltr', usageCount: 55 },
            { code: 'de', nativeName: 'Deutsch', direction: 'ltr', usageCount: 47 },
            { code: 'fr', nativeName: 'Français', direction: 'ltr', usageCount: 42 },
            { code: 'es', nativeName: 'Español', direction: 'ltr', usageCount: 38 },
            { code: 'hi', nativeName: 'हिन्दी', direction: 'ltr', usageCount: 33 },
            { code: 'pl', nativeName: 'Polski', direction: 'ltr', usageCount: 28 },
            { code: 'pt', nativeName: 'Português', direction: 'ltr', usageCount: 23 },
            { code: 'it', nativeName: 'Italiano', direction: 'ltr', usageCount: 18 },
            { code: 'tr', nativeName: 'Türkçe', direction: 'ltr', usageCount: 13 },
            { code: 'other', nativeName: 'Другой', direction: 'ltr', usageCount: 5 },
          ],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/discovery') {
      discoveryQueries.push(new URLSearchParams(url.search));
      if (url.searchParams.get('cursor') === 'catalog-page-2') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 'character-page-2',
                avatarFileId: '55555555-5555-4555-8555-555555555555',
                contentRating: 'SAFE',
                language: 'ru',
                updatedAt: 0,
                name: 'Эхо гавани',
                tagline: 'Вторая страница каталога',
                description: 'Проверка cursor-пагинации без загрузки всего каталога заранее.',
                firstMessage: 'Слышишь эхо?',
                alternateGreetings: [],
                creatorId: 'creator-1',
                creatorName: 'Velora',
                likeCount: 0,
                bookmarkCount: 0,
                reviewCount: 0,
                averageRating: null,
                liked: false,
                bookmarked: false,
                myRating: null,
                myReviewText: null,
                tags: ['гавань'],
              },
            ],
            totalCount: 2,
            nextCursor: null,
            contentPreferences: { safeSearch, matureImageBlur },
          }),
        });
        return;
      }
      const publishedMira = ownedCharacters.find(
        (character) =>
          character['id'] === 'new-character-1' && character['publishState'] === 'PUBLISHED',
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'character-1',
              avatarFileId: '44444444-4444-4444-8444-444444444444',
              contentRating: 'SAFE',
              language: 'ru',
              updatedAt: 1,
              name: 'Лира',
              tagline: 'Хранительница забытого маяка',
              description: 'Персонаж для **спокойной мистической истории**.',
              firstMessage: liraGreeting,
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
            ...(publishedMira
              ? [
                  {
                    id: publishedMira['id'],
                    avatarFileId: publishedMira['avatarFileId'],
                    contentRating: publishedMira['contentRating'],
                    language: publishedMira['language'],
                    updatedAt: publishedMira['updatedAt'],
                    name: publishedMira['name'],
                    tagline: publishedMira['tagline'],
                    description: publishedMira['description'],
                    personality:
                      publishedMira['personalityVisible'] === true
                        ? publishedMira['personality']
                        : null,
                    firstMessage: publishedMira['firstMessage'],
                    alternateGreetings: publishedMira['alternateGreetings'],
                    creatorId: 'user-1',
                    creatorName: profileDisplayName,
                    likeCount: 0,
                    bookmarkCount: 0,
                    reviewCount: 0,
                    averageRating: null,
                    liked: false,
                    bookmarked: false,
                    myRating: null,
                    myReviewText: null,
                    tags: publishedMira['tags'],
                  },
                ]
              : []),
          ],
          totalCount: publishedMira ? 3 : 2,
          nextCursor:
            url.searchParams.get('q') === '' &&
            !url.searchParams.has('language') &&
            !url.searchParams.has('rating') &&
            !url.searchParams.has('includeTags') &&
            !url.searchParams.has('excludeTags')
              ? 'catalog-page-2'
              : null,
          contentPreferences: { safeSearch, matureImageBlur },
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/discovery/character-1') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'character-1',
          avatarFileId: '44444444-4444-4444-8444-444444444444',
          contentRating: 'SAFE',
          language: 'ru',
          updatedAt: 1,
          name: 'Лира',
          tagline: 'Хранительница забытого маяка',
          description: 'Персонаж для **спокойной мистической истории**.',
          firstMessage: liraGreeting,
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
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/discovery/new-character-1') {
      const publishedMira = ownedCharacters.find(
        (character) =>
          character['id'] === 'new-character-1' && character['publishState'] === 'PUBLISHED',
      );
      if (!publishedMira) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: publishedMira['id'],
          avatarFileId: publishedMira['avatarFileId'],
          contentRating: publishedMira['contentRating'],
          language: publishedMira['language'],
          updatedAt: publishedMira['updatedAt'],
          name: publishedMira['name'],
          tagline: publishedMira['tagline'],
          description: publishedMira['description'],
          personality:
            publishedMira['personalityVisible'] === true ? publishedMira['personality'] : null,
          firstMessage: publishedMira['firstMessage'],
          alternateGreetings: publishedMira['alternateGreetings'],
          creatorId: 'user-1',
          creatorName: profileDisplayName,
          likeCount: 0,
          bookmarkCount: 0,
          reviewCount: 0,
          averageRating: null,
          liked: false,
          bookmarked: false,
          myRating: null,
          myReviewText: null,
          tags: publishedMira['tags'],
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
          username: 'alice',
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
          username: 'alex5657',
          displayName: 'Velora',
          bio: 'Создатель мистических персонажей.',
          avatarFileId: null,
          avatarPending: false,
          visibility: 'PUBLIC',
          role: 'CREATOR',
          isOwn: false,
          stats: { characters: 2, likes: 7, chats: 4 },
          characters: [
            {
              id: 'character-1',
              avatarFileId: null,
              name: 'Лира',
              tagline: 'Хранительница забытого маяка',
              contentRating: 'SAFE',
              updatedAt: 1,
            },
            {
              id: 'character-archive-1',
              avatarFileId: null,
              name: 'Архивариус',
              tagline: 'Собирает истории забытого города',
              contentRating: 'SAFE',
              updatedAt: 0,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/media' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            ...(directlyUploadedMedia ? [directlyUploadedMedia] : []),
            {
              id: '11111111-1111-4111-8111-111111111111',
              mimeType: 'image/jpeg',
              originalName: 'lighthouse.jpg',
              byteSize: 1024,
              width: 1600,
              height: 900,
              moderationState: 'APPROVED',
              contentUrl: '/api/v1/media/11111111-1111-4111-8111-111111111111/content',
            },
          ],
          capabilities: {
            directUpload: true,
            acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
            maxBytes: 10_000_000,
            maxOutputDimension: 1_600,
          },
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/media/generate-avatar' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({ prompt: 'рыжая хранительница старой башни' });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ mimeType: 'image/jpeg', imageBase64: '/9j/' }),
      });
      return;
    }
    if (url.pathname === '/api/v1/characters/assist' && request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      characterAssistVerified =
        body['target'] === 'firstMessage' &&
        body['name'] === 'Мира' &&
        body['language'] === 'ru' &&
        typeof body['context'] === 'string' &&
        body['context'].includes('Хранительница северной башни');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          target: 'firstMessage',
          suggestion: '*Башня ждала тебя, {{user}}.*',
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/media' && request.method() === 'POST') {
      const body = request.postDataBuffer();
      const contentType = request.headers()['content-type'];
      const uploadName = request.headers()['x-upload-name'] ?? '';
      const encodedAsWebp =
        contentType === 'image/webp' &&
        body?.subarray(0, 4).toString('ascii') === 'RIFF' &&
        body.subarray(8, 12).toString('ascii') === 'WEBP';
      const encodedAsJpeg =
        contentType === 'image/jpeg' && body?.[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
      const encodedBodyUnavailable = body === null || body.byteLength === 0;
      if (uploadName === 'portrait.png') {
        directImageUploadVerified =
          (contentType === 'image/webp' || contentType === 'image/jpeg') &&
          (encodedBodyUnavailable || encodedAsWebp || encodedAsJpeg);
      } else {
        generatedAvatarVerified =
          contentType === 'image/jpeg' &&
          uploadName.includes('%') &&
          (encodedBodyUnavailable || encodedAsJpeg);
      }
      const uploadedId =
        uploadName === 'portrait.png'
          ? '22222222-2222-4222-8222-222222222222'
          : '33333333-3333-4333-8333-333333333333';
      directlyUploadedMedia = {
        id: uploadedId,
        mimeType: contentType,
        originalName: 'portrait.png',
        byteSize: body?.byteLength ?? 0,
        width: 1,
        height: 1,
        moderationState: 'PENDING',
        contentUrl: `/api/v1/media/${uploadedId}/content`,
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(directlyUploadedMedia),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/media/11111111-1111-4111-8111-111111111111/content' &&
      request.method() === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#7650e9"/></svg>',
      });
      return;
    }
    if (
      url.pathname === '/api/v1/media/22222222-2222-4222-8222-222222222222/content' &&
      request.method() === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#9d72ff"/></svg>',
      });
      return;
    }
    if (
      url.pathname === '/api/v1/media/33333333-3333-4333-8333-333333333333/content' &&
      request.method() === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#262626"/></svg>',
      });
      return;
    }
    if (
      url.pathname === '/api/v1/media/44444444-4444-4444-8444-444444444444/content' &&
      request.method() === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 960"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#4b4e55"/><stop offset=".55" stop-color="#202226"/><stop offset="1" stop-color="#0b0c0e"/></linearGradient><radialGradient id="beam"><stop stop-color="#f2f2f2" stop-opacity=".72"/><stop offset="1" stop-color="#f2f2f2" stop-opacity="0"/></radialGradient></defs><rect width="720" height="960" fill="url(#sky)"/><circle cx="505" cy="235" r="190" fill="url(#beam)"/><path d="M0 690 155 560l95 76 108-146 145 156 86-91 131 136v269H0z" fill="#0b0c0e"/><path d="M321 720h120l-18-332h-84z" fill="#15171a" stroke="#c8c9cc" stroke-width="8"/><path d="m330 390 51-68 51 68z" fill="#111214" stroke="#e2e2e2" stroke-width="8"/><rect x="350" y="426" width="62" height="46" rx="7" fill="#f2f2f2"/><path d="m411 449 238-100-218 143z" fill="#eee" opacity=".2"/><path d="M345 535h72M339 625h84" stroke="#686b70" stroke-width="8"/></svg>`,
      });
      return;
    }
    if (
      url.pathname === '/api/v1/media/55555555-5555-4555-8555-555555555555/content' &&
      request.method() === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 960"><defs><linearGradient id="fog" x2="0" y2="1"><stop stop-color="#666a71"/><stop offset=".5" stop-color="#25272b"/><stop offset="1" stop-color="#090a0c"/></linearGradient></defs><rect width="720" height="960" fill="url(#fog)"/><circle cx="185" cy="205" r="98" fill="#e4e4e4" opacity=".75"/><path d="M0 650c105-48 194-34 282 10 103 52 203 39 438-58v358H0z" fill="#111214"/><path d="M0 716c138-50 270-25 371 18 98 42 203 41 349-7" fill="none" stroke="#b5b7bb" stroke-opacity=".45" stroke-width="10"/><path d="M292 620c35-143 64-252 113-313 45 65 78 173 109 313z" fill="#17191c" stroke="#d2d3d5" stroke-width="7"/><path d="M363 322h86l-18-70h-49z" fill="#111214"/><path d="m404 254 223 81-213-34z" fill="#f3f3f3" opacity=".22"/><path d="M320 531h168" stroke="#74777d" stroke-width="7"/></svg>`,
      });
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
    if (url.pathname === '/api/v1/discovery/new-character-1/reviews') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"items":[]}',
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
      const requestBody = request.postDataJSON() as Record<string, unknown> & {
        readonly preview?: boolean;
      };
      if (!requestBody.preview && onboardingCompleted && !conversationCreated) {
        onboardingConversationPayload = requestBody;
      }
      if (!requestBody.preview) latestConversationPayload = requestBody;
      conversationCreated = true;
      conversationPreview = requestBody.preview === true;
      previewRequestVerified ||= conversationPreview;
      const isMira = requestBody['characterId'] === 'new-character-1';
      const createdConversationId = isMira
        ? conversationPreview
          ? 'conversation-mira-preview'
          : 'conversation-mira'
        : conversationPreview
          ? 'conversation-preview'
          : 'conversation-1';
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: createdConversationId,
          characterId: isMira ? 'new-character-1' : 'character-1',
          personaId: null,
          title: isMira ? 'Мира' : 'Лира',
          activeMessageId: 'message-first',
          state: 'ACTIVE',
          isPreview: conversationPreview,
          memoryStale: false,
          characterName: isMira ? 'Мира' : 'Лира',
          characterAvatarFileId: isMira ? '11111111-1111-4111-8111-111111111111' : null,
          lastMessage: null,
          createdAt: 1,
          updatedAt: 1,
        }),
      });
      return;
    }
    if (
      (url.pathname === '/api/v1/conversations/conversation-mira-preview' ||
        url.pathname === '/api/v1/conversations/conversation-mira') &&
      request.method() === 'GET'
    ) {
      const isPreview = url.pathname.endsWith('-preview');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: isPreview ? 'conversation-mira-preview' : 'conversation-mira',
          characterId: 'new-character-1',
          personaId: null,
          title: isPreview ? 'Тест · Мира' : 'Мира',
          activeMessageId: 'message-mira-first',
          state: 'ACTIVE',
          isPreview,
          memoryStale: false,
          characterName: 'Мира',
          characterAvatarFileId: '11111111-1111-4111-8111-111111111111',
          lastMessage: null,
          createdAt: 1,
          updatedAt: 1,
          settings: conversationSettings,
          promptInspectorAvailable: true,
        }),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-mira-preview/messages' ||
      url.pathname === '/api/v1/conversations/conversation-mira/messages'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'message-mira-first',
              conversationId: url.pathname.includes('-preview')
                ? 'conversation-mira-preview'
                : 'conversation-mira',
              role: 'ASSISTANT',
              content: 'Добро пожаловать в башню, Алиса.',
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
              variantIds: ['message-mira-first'],
            },
          ],
          activeMessageId: 'message-mira-first',
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
      const patch = request.postDataJSON() as Partial<typeof conversationSettings> & {
        readonly state?: 'ACTIVE' | 'ARCHIVED';
      };
      if (patch.state === 'ACTIVE' || patch.state === 'ARCHIVED') {
        conversationState = patch.state;
      }
      conversationSettings = {
        ...conversationSettings,
        ...patch,
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
          state: conversationState,
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
          selectedModel: {
            profileId: conversationSettings.modelProfileId,
            providerModelId:
              conversationSettings.modelProfileId === 'velora-free-roleplay'
                ? 'l3-lunaris-8b'
                : 'deepseek-chat-v3.1',
          },
          persona: {
            name: 'Алекс',
            shortDescription: 'Картограф звёздных маршрутов.',
            longDescription: 'Ищет исчезнувшее созвездие.',
            personality: 'Наблюдательный',
            appearance: 'Дорожный плащ',
            speakingStyle: 'Короткие вопросы',
            background: 'Пришёл с побережья',
            pronouns: 'он/его',
            representedAge: '28',
            customNotes: 'Не решать за Алекса.',
          },
          memory: [
            memoryManualContext ? `PINNED_MANUAL_CONTEXT:\n${memoryManualContext}` : '',
            memoryAutoSummary ? `AUTO_SUMMARY:\n${memoryAutoSummary}` : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
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
          active:
            memoryManualContext || memoryAutoSummary
              ? {
                  id: 'memory-1',
                  content: [memoryManualContext, memoryAutoSummary].filter(Boolean).join('\n\n'),
                  manualContext: memoryManualContext,
                  autoSummary: memoryAutoSummary,
                  sourceType: 'MANUAL_EDIT',
                  fromMessageId: null,
                  toMessageId: null,
                  createdAt: 4,
                  provider: null,
                  model: null,
                  previousVersionId: null,
                }
              : null,
          manualContext: memoryManualContext,
          autoSummary: memoryAutoSummary,
          stale: false,
          staleSinceMessageId: null,
          lastSummarizedMessageId: null,
          estimatedTokens: Math.ceil((memoryManualContext.length + memoryAutoSummary.length) / 4),
          pendingJob: null,
        }),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-1/memory/versions' &&
      request.method() === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            ...(memoryManualContext || memoryAutoSummary
              ? [
                  {
                    id: 'memory-1',
                    content: [memoryManualContext, memoryAutoSummary].filter(Boolean).join('\n\n'),
                    manualContext: memoryManualContext,
                    autoSummary: memoryAutoSummary,
                    sourceType: 'MANUAL_EDIT',
                    fromMessageId: null,
                    toMessageId: null,
                    createdAt: 4,
                    provider: null,
                    model: null,
                    previousVersionId: 'memory-old',
                  },
                ]
              : []),
            {
              id: 'memory-old',
              content: 'Старая память у маяка.',
              manualContext: '',
              autoSummary: 'Старая память у маяка.',
              sourceType: 'AUTO_SUMMARY',
              fromMessageId: 'message-user',
              toMessageId: 'message-ai',
              createdAt: 2,
              provider: 'VELORA',
              model: 'deterministic-extractive-v1',
              previousVersionId: null,
            },
          ],
        }),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-1/memory/versions/memory-old/restore' &&
      request.method() === 'POST'
    ) {
      memoryManualContext = '';
      memoryAutoSummary = 'Старая память у маяка.';
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'memory-1',
          content: memoryAutoSummary,
          manualContext: memoryManualContext,
          autoSummary: memoryAutoSummary,
          sourceType: 'RESTORE',
          fromMessageId: null,
          toMessageId: null,
          createdAt: 5,
          provider: null,
          model: null,
          previousVersionId: 'memory-old',
        }),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-1/memory' &&
      request.method() === 'PUT'
    ) {
      const input = request.postDataJSON() as { readonly manualContext: string };
      memoryManualContext = input.manualContext;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'memory-1',
          content: [memoryManualContext, memoryAutoSummary].filter(Boolean).join('\n\n'),
          manualContext: memoryManualContext,
          autoSummary: memoryAutoSummary,
          sourceType: 'MANUAL_EDIT',
          fromMessageId: null,
          toMessageId: null,
          createdAt: 4,
          provider: null,
          model: null,
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
              ? [
                  {
                    id: 'lore-entry-1',
                    title: 'Скрытая дверь',
                    matchedKeys: ['архив'],
                    priority: 12,
                    tokenEstimate: 6,
                  },
                ]
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
      await route.fulfill({ status: 204 });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-1/lorebooks/lorebook-1' &&
      request.method() === 'DELETE'
    ) {
      conversationLoreEnabled = false;
      await route.fulfill({ status: 204 });
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
    if (
      url.pathname ===
        `/api/v1/conversations/conversation-1/generations/${longHistoryGenerationId}/reaction` &&
      (request.method() === 'PUT' || request.method() === 'DELETE')
    ) {
      const reaction =
        request.method() === 'PUT'
          ? (request.postDataJSON() as { readonly reaction: string }).reaction
          : null;
      reactionRequests.push(`${request.method()}:${reaction ?? 'NONE'}`);
      conversationMessages = conversationMessages.map((message) =>
        message['generationId'] === longHistoryGenerationId ? { ...message, reaction } : message,
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ generationId: longHistoryGenerationId, reaction }),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-1/messages/message-first/edit' &&
      request.method() === 'POST'
    ) {
      const input = request.postDataJSON() as { readonly content: string };
      const original = conversationMessages.find((item) => item['id'] === 'message-first');
      const edited = {
        ...original,
        id: 'message-first-edited',
        content: input.content,
        editedByUser: true,
        origin: 'USER_EDIT',
        metadata: { editedFromId: 'message-first' },
        editedAt: 2,
        variantIds: ['message-first', 'message-first-edited'],
        variantIndex: 1,
        variantCount: 2,
      };
      conversationMessages = conversationMessages.map((item) =>
        item['id'] === 'message-first' ? edited : item,
      );
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(edited),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-1/messages/message-ai/edit' &&
      request.method() === 'POST'
    ) {
      const input = request.postDataJSON() as { readonly content: string };
      const original = conversationMessages.find((item) => item['id'] === 'message-ai');
      const edited = {
        ...original,
        id: 'message-ai-edited',
        content: input.content,
        metadata: { editedFromId: 'message-ai' },
        editedAt: 4,
        variantIds: ['message-ai', 'message-ai-edited'],
        variantIndex: 1,
        variantCount: 2,
      };
      conversationMessages = conversationMessages.map((item) =>
        item['id'] === 'message-ai' ? edited : item,
      );
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(edited),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-1/memory/regenerate/preview' &&
      request.method() === 'POST'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          currentAutoSummary: memoryAutoSummary,
          generatedAutoSummary: 'Полная сводка активной ветки.',
          manualContext: memoryManualContext,
          fromMessageId: 'message-greeting',
          toMessageId: 'message-ai',
          messageCount: 3,
          estimatedTokens: 8,
          provider: 'VELORA',
          model: 'deterministic-extractive-v1',
        }),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-1/memory/regenerate' &&
      request.method() === 'POST'
    ) {
      memoryAutoSummary = 'Полная сводка активной ветки.';
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'memory-job-full',
          status: 'COMPLETED',
          attempts: 1,
          maxAttempts: 5,
          availableAt: 1,
          lastErrorCode: null,
        }),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/conversations/conversation-1/memory/summarize' &&
      request.method() === 'POST'
    ) {
      memoryAutoSummary = `${memoryAutoSummary}\nРезюме последних событий.`.trim();
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'memory-job-1',
          status: 'COMPLETED',
          attempts: 1,
          maxAttempts: 5,
          availableAt: 1,
          lastErrorCode: null,
        }),
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
      conversationListQueries.push(new URLSearchParams(url.search));
      const requestedState = url.searchParams.get('state') ?? 'ACTIVE';
      const visibleConversation =
        conversationCreated && (requestedState === 'ALL' || requestedState === conversationState);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalCount: visibleConversation ? 1 : 0,
          items: visibleConversation
            ? [
                {
                  id: 'conversation-1',
                  characterId: 'character-1',
                  personaId: null,
                  title: 'Лира',
                  activeMessageId: conversationMessages.at(-1)?.['id'] ?? null,
                  state: conversationState,
                  isPreview: conversationPreview,
                  memoryStale: false,
                  characterName: 'Лира',
                  characterAvatarFileId: null,
                  personaName: 'Алекс',
                  lastMessage: 'Архив отвечает эхом.',
                  messageCount: conversationMessages.length,
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
      const isFirstPersona = personas.length === 0;
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
        isDefault: isFirstPersona,
        updatedAt: 1,
        ...input,
      };
      personas = [...personas, created];
      if (isFirstPersona) defaultPersonaId = created.id;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }
    const personaPatchMatch = /^\/api\/v1\/personas\/([^/]+)$/u.exec(url.pathname);
    if (personaPatchMatch && request.method() === 'PATCH') {
      const personaId = personaPatchMatch[1];
      latestPersonaPatch = request.postDataJSON() as Readonly<Record<string, unknown>>;
      let updated: Readonly<Record<string, unknown>> | undefined;
      personas = personas.map((persona) => {
        if (persona['id'] !== personaId) return persona;
        updated = { ...persona, ...latestPersonaPatch, updatedAt: 2 };
        return updated;
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      });
      return;
    }
    const makeDefaultMatch = /^\/api\/v1\/personas\/([^/]+)\/default$/u.exec(url.pathname);
    if (makeDefaultMatch && request.method() === 'POST') {
      defaultPersonaId = makeDefaultMatch[1] ?? null;
      personas = personas.map((persona) => ({
        ...persona,
        isDefault: persona['id'] === defaultPersonaId,
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ defaultPersonaId }),
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
    if (
      url.pathname === '/api/v1/characters/new-character-1/publish' &&
      request.method() === 'POST'
    ) {
      expect(lorebookCharacterIds.has('new-character-1')).toBe(true);
      ownedCharacters = ownedCharacters.map((character) =>
        character['id'] === 'new-character-1'
          ? { ...character, visibility: 'PUBLIC', publishState: 'PUBLISHED' }
          : character,
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'new-character-1',
          visibility: 'PUBLIC',
          publishState: 'PUBLISHED',
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
    if (url.pathname === '/api/v1/characters/new-character-1' && request.method() === 'PATCH') {
      const input = request.postDataJSON() as Record<string, unknown>;
      const characterIndex = ownedCharacters.findIndex(
        (character) => character['id'] === 'new-character-1',
      );
      if (characterIndex === -1) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'CHARACTER_NOT_FOUND' } }),
        });
        return;
      }
      const current = ownedCharacters[characterIndex];
      if (!current) throw new Error('Character fixture index disappeared.');
      const updated = { ...current, ...input, version: Number(current['version']) + 1 };
      ownedCharacters = ownedCharacters.with(characterIndex, updated);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      });
      return;
    }
    if (url.pathname === '/api/v1/characters' && request.method() === 'GET') {
      const query = new URLSearchParams(url.search);
      ownedCharacterQueries.push(query);
      const kind = query.get('kind');
      const visibility = query.get('visibility');
      const items = ownedCharacters.filter(
        (character) =>
          (kind === null || kind === 'ALL' || character['groupSize'] === kind) &&
          (visibility === null || visibility === 'ALL' || character['visibility'] === visibility),
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items }),
      });
      return;
    }
    if (url.pathname === '/api/v1/characters' && request.method() === 'POST') {
      const input = request.postDataJSON() as Record<string, unknown>;
      const created = {
        id: 'new-character-1',
        ownerId: 'user-1',
        version: 1,
        visibility: 'PRIVATE',
        publishState: 'DRAFT',
        updatedAt: 5,
        ...input,
      };
      ownedCharacters = [...ownedCharacters, created];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }
    if (url.pathname === '/api/v1/lorebooks' && request.method() === 'GET') {
      lorebookQueries.push(new URLSearchParams(url.search));
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
        body: JSON.stringify({
          characters: [...lorebookCharacterIds].map((id) => ({ id, enabled: true })),
          conversations: [],
        }),
      });
      return;
    }
    if (
      lorebook &&
      url.pathname === `/api/v1/characters/new-character-1/lorebooks/${String(lorebook['id'])}` &&
      request.method() === 'PUT'
    ) {
      lorebookCharacterIds.add('new-character-1');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"enabled":true}',
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
        const body = request.postDataJSON() as {
          readonly theme?: 'dark' | 'amoled' | 'light';
          readonly locale?: 'ru' | 'en';
          readonly safeSearch?: boolean;
          readonly matureImageBlur?: boolean;
          readonly preferences?: Readonly<Record<string, unknown>>;
        };
        settingsTheme = body.theme ?? settingsTheme;
        settingsLocale = body.locale ?? settingsLocale;
        safeSearch = body.safeSearch ?? safeSearch;
        matureImageBlur = body.matureImageBlur ?? matureImageBlur;
        settingsPreferences = body.preferences ?? settingsPreferences;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          theme: settingsTheme,
          locale: settingsLocale,
          defaultPersonaId,
          generationProfile: 'BALANCED',
          nsfwVisible: false,
          safeSearch,
          matureImageBlur,
          preferences: settingsPreferences,
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
                executeAfter: Date.parse('2026-08-28T12:00:00.000Z'),
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
          jobsCreated24h: 2,
          productEvents24h: 24,
          mediaObjectsCreated24h: 3,
          mediaBytesCreated24h: 4096,
          mediaBytesTotal: 8192,
          providerLastSuccessAt: 1,
          providerLastFailureAt: null,
          planDistribution: { FREE: 12 },
          ownerAiUsage: null,
          capacityProjection: capacityProjectionFixture(),
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

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (payload: ShareData) => {
        (
          window as Window & {
            __sharedCharacter?: ShareData;
          }
        ).__sharedCharacter = payload;
        return Promise.resolve();
      },
    });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Алиса, твоя история начинается здесь' }),
  ).toBeVisible();
  expect(telegramAuthRequests).toBe(1);
  await expectVisualSnapshot(page, 'home');
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByRole('heading', { name: 'Выбери комфортный режим' })).toBeVisible();
  await page.getByText('Я принимаю правила сообщества').click();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.getByLabel('Имя образа').fill('Странница');
  await page.getByLabel('Короткое описание').fill('Ищет забытые истории.');
  await page.getByRole('button', { name: 'Сохранить образ' }).click();
  await expect(page.getByRole('heading', { name: 'Выбери, с чего начать' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Лира' })).toBeVisible();
  expect(discoveryQueries.at(-1)?.get('sort')).toBe('newest');
  await page.getByRole('button', { name: 'Начать' }).click();
  await expect(page.getByText('Ты всё-таки пришёл.')).toBeVisible();
  expect(onboardingPayload).toMatchObject({
    policyAccepted: true,
    matureEnabled: false,
    persona: { name: 'Странница', shortDescription: 'Ищет забытые истории.' },
  });
  expect(onboardingConversationPayload).toMatchObject({
    characterId: 'character-1',
    personaId: 'onboarding-persona-1',
  });
  await page.getByRole('button', { name: /Главная/u }).click();
  await expect(page.getByRole('heading', { name: 'Найди свою историю' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.balance-pill')).toContainText('Plus');
  await expect(page.locator('.notification-badge')).toHaveText('1');
  await page.locator('.notification-trigger').click();
  const notificationCenter = page.locator('.notification-center');
  await expect(notificationCenter).toBeVisible();
  await expect(notificationCenter).toContainText('VeloraAI');
  await notificationCenter.locator('.notification-mark-all').click();
  await expect(page.locator('.notification-badge')).toHaveCount(0);
  await notificationCenter.locator('.shell-icon-button').click();
  await expect(notificationCenter).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Лира' })).toBeVisible();
  if (capturesReferenceEvidence(testInfo)) {
    await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
    let drawer = page.getByRole('dialog', { name: 'Меню Velora' });
    await drawer.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(drawer.getByRole('button', { name: 'Персонаж', exact: true })).toBeVisible();
    await expect(page.locator('.app-drawer')).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.app-drawer')).toHaveCSS('transition-duration', '0s');
    await expectNoBlockingA11y(page, 'ui-02-create-drawer');
    await page.screenshot({
      path: testInfo.outputPath('ui-02-create-drawer-actual.png'),
    });
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
    drawer = page.getByRole('dialog', { name: 'Меню Velora' });
    await drawer.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(drawer.getByRole('button', { name: 'Персонаж', exact: true })).toBeHidden();
    await expect(drawer.getByRole('button', { name: 'Персонажи', exact: true })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Lorebooks', exact: true })).toBeVisible();
    await expect(
      drawer.getByRole('button', { name: 'Заблокированные пользователи', exact: true }),
    ).toBeAttached();
    await expect(drawer.getByRole('button', { name: 'Поддержка', exact: true })).toBeAttached();
    await expect(
      drawer.getByRole('button', { name: 'Условия и конфиденциальность', exact: true }),
    ).toBeAttached();
    await expectNoBlockingA11y(page, 'ui-03-library-drawer');
    await page.screenshot({
      path: testInfo.outputPath('ui-03-library-drawer-actual.png'),
    });
    await drawer.dispatchEvent('pointerdown', {
      pointerId: 31,
      pointerType: 'touch',
      button: 0,
      clientX: 280,
      clientY: 180,
    });
    await drawer.dispatchEvent('pointerup', {
      pointerId: 31,
      pointerType: 'touch',
      button: 0,
      clientX: 150,
      clientY: 188,
    });
    await expect(drawer).toBeHidden();
    await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
    drawer = page.getByRole('dialog', { name: 'Меню Velora' });
    const supportDrawerLink = drawer.getByRole('button', { name: 'Поддержка', exact: true });
    await supportDrawerLink.scrollIntoViewIfNeeded();
    await supportDrawerLink.click();
    await expect(page.getByRole('heading', { name: 'Поддержка', exact: true })).toBeInViewport();
    await page.getByRole('button', { name: /Главная/u }).click();
    await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
    drawer = page.getByRole('dialog', { name: 'Меню Velora' });
    await page.locator('.app-drawer-backdrop').click({ position: { x: 380, y: 120 } });
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Что создаём?' })).toBeVisible();
    await expect(page.locator('.create-option-card')).toHaveCount(4);
    await expect(page.getByText('Персона', { exact: true })).toBeVisible();
    await expect(page.getByText('ИИ-персонаж', { exact: true })).toBeVisible();
    await expect(page.getByText('Группа персонажей', { exact: true })).toBeVisible();
    await expect(page.getByText('Lorebook', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: /Главная/u }).click();
    await expect(drawer).toBeHidden();
  }
  await expectVisualSnapshot(page, 'search');
  await page.getByRole('button', { name: 'Показать ещё' }).click();
  await expect(page.getByRole('heading', { name: 'Эхо гавани' })).toBeVisible();
  await expect(page.getByText('Найдено: 2')).toBeVisible();
  if (capturesReferenceEvidence(testInfo)) {
    await page.evaluate(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
    await expectNoBlockingA11y(page, 'ui-01-discovery');
    await page.screenshot({ path: testInfo.outputPath('ui-01-discovery-actual.png') });
  }
  const compactLiraCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Лира', exact: true }) });
  await compactLiraCard.getByRole('button', { name: 'Действия с персонажем «Лира»' }).click();
  const compactCardMenu = page.locator('body > .action-menu-popover');
  await expect(compactCardMenu).toBeVisible();
  const compactMenuBounds = await compactCardMenu.boundingBox();
  const compactMenuViewport = page.viewportSize();
  expect(compactMenuBounds).not.toBeNull();
  expect(compactMenuViewport).not.toBeNull();
  if (compactMenuBounds && compactMenuViewport) {
    expect(compactMenuBounds.x).toBeGreaterThanOrEqual(0);
    expect(compactMenuBounds.y).toBeGreaterThanOrEqual(0);
    expect(compactMenuBounds.x + compactMenuBounds.width).toBeLessThanOrEqual(
      compactMenuViewport.width,
    );
    expect(compactMenuBounds.y + compactMenuBounds.height).toBeLessThanOrEqual(
      compactMenuViewport.height,
    );
  }
  await page.keyboard.press('Escape');
  await expect(compactCardMenu).toBeHidden();
  expect(discoveryQueries.at(-1)?.get('cursor')).toBe('catalog-page-2');
  await page.getByRole('button', { name: 'Сортировка персонажей' }).click();
  await page.getByRole('option', { name: 'Сначала старые' }).click();
  await expect.poll(() => discoveryQueries.at(-1)?.get('sort')).toBe('oldest');
  await expect(page.getByText('Найдено: 2')).toBeVisible();
  await page.getByRole('button', { name: 'Сортировка персонажей' }).click();
  await page.getByRole('option', { name: 'Сначала новые' }).click();
  await expect(page.getByRole('button', { name: 'Сортировка персонажей' })).toHaveText(
    /Сначала новые/u,
  );
  await expect(page.getByRole('heading', { name: 'Лира' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Фильтры поиска' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Включить тег «Мистика»' })).toBeVisible();
  if (capturesReferenceEvidence(testInfo)) {
    await expectNoBlockingA11y(page, 'ui-29-tag-filter');
    await page.screenshot({ path: testInfo.outputPath('ui-29-tag-filter-actual.png') });
  }
  await page.getByRole('combobox', { name: 'Категория' }).selectOption('SAFE');
  await page.getByRole('checkbox', { name: 'Включить тег «Мистика»' }).click();
  if (capturesReferenceEvidence(testInfo)) {
    await expectNoBlockingA11y(page, 'ui-30-selected-tag');
    await page.screenshot({ path: testInfo.outputPath('ui-30-selected-tag-actual.png') });
  }
  const tagSearch = page.getByRole('searchbox', { name: 'Теги' });
  await tagSearch.fill('Очень длинный');
  await expect(page.getByRole('list', { name: 'Теги' }).getByRole('listitem')).toHaveCount(1);
  if (capturesReferenceEvidence(testInfo)) {
    await expectNoBlockingA11y(page, 'ui-31-tag-query');
    await page.screenshot({ path: testInfo.outputPath('ui-31-tag-query-actual.png') });
  }
  await tagSearch.fill('');
  const tagList = page.getByRole('list', { name: 'Теги' });
  await tagList.evaluate((element) => {
    element.scrollTop = Math.round(element.scrollHeight * 0.35);
  });
  if (capturesReferenceEvidence(testInfo)) {
    await expectNoBlockingA11y(page, 'ui-32-expanded-tag-groups');
    await page.screenshot({ path: testInfo.outputPath('ui-32-expanded-tag-groups-actual.png') });
  }
  await page.getByRole('button', { name: 'Исключить тег «Романтика»' }).click();
  await tagList.evaluate((element) => {
    element.scrollTop = 0;
  });
  if (capturesReferenceEvidence(testInfo)) {
    await expectNoBlockingA11y(page, 'ui-33-excluded-tags');
    await page.screenshot({ path: testInfo.outputPath('ui-33-excluded-tags-actual.png') });
  }
  await tagList.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  if (capturesReferenceEvidence(testInfo)) {
    await expectNoBlockingA11y(page, 'ui-34-dense-tag-list');
    await page.screenshot({ path: testInfo.outputPath('ui-34-dense-tag-list-actual.png') });
  }
  await page.screenshot({ path: testInfo.outputPath('filter-sheet-actual.png'), fullPage: true });
  await expectVisualSnapshot(page, 'filters');
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByRole('button', { name: 'Фильтры · 3' })).toBeVisible();
  expect(discoveryQueries.at(-1)?.get('languages')).toBeNull();
  expect(discoveryQueries.at(-1)?.get('rating')).toBe('SAFE');
  expect(discoveryQueries.at(-1)?.get('includeTags')).toBe('mystery');
  expect(discoveryQueries.at(-1)?.get('excludeTags')).toBe('romance');
  if (capturesReferenceEvidence(testInfo)) {
    await expectNoBlockingA11y(page, 'ui-35-filtered-discovery');
    await page.screenshot({ path: testInfo.outputPath('ui-35-filtered-discovery-actual.png') });
  }
  await page.getByRole('button', { name: 'Фильтры · 3' }).click();
  await page.getByRole('button', { name: 'Сбросить' }).click();
  await expect(page.getByRole('button', { name: 'Языки · 0' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Категория' })).toHaveValue('ALL');
  await expect(page.getByRole('checkbox', { name: 'Включить тег «Мистика»' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(page.getByRole('button', { name: 'Исключить тег «Романтика»' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: 'Закрыть фильтры' }).click();
  await expect(page.getByRole('button', { name: 'Фильтры', exact: true })).toBeVisible();
  await page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Лира' }) })
    .getByRole('button', { name: 'от Velora' })
    .click();
  await expect(page.getByRole('heading', { name: 'Velora' })).toBeVisible();
  await expect(page.getByText('@alex5657', { exact: true })).toBeVisible();
  await expect(page.getByText('Создатель мистических персонажей.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Опубликованные персонажи' })).toBeVisible();
  const creatorCharacters = page.locator('.profile-character-grid');
  await expect(page.getByRole('status')).toHaveText('Найдено: 2');
  await expect(creatorCharacters.getByRole('button')).toHaveCount(2);
  await page.getByRole('searchbox', { name: 'Поиск персонажей автора' }).fill('Архив');
  await expect(page.getByRole('status')).toHaveText('Найдено: 1');
  await expect(
    creatorCharacters.getByRole('button', { name: 'Открыть персонажа «Архивариус»' }),
  ).toBeVisible();
  await page.getByRole('searchbox', { name: 'Поиск персонажей автора' }).fill('');
  await page.getByRole('combobox', { name: 'Категория' }).selectOption('MATURE');
  await expect(page.getByText('По этим условиям персонажей не найдено.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Категория' }).selectOption('ALL');
  await page.getByRole('button', { name: 'Сортировка персонажей автора' }).click();
  await page.getByRole('option', { name: 'Сначала старые' }).click();
  await expect(creatorCharacters.getByRole('button').first()).toHaveAccessibleName(
    'Открыть персонажа «Архивариус»',
  );
  if (capturesReferenceEvidence(testInfo)) {
    await page.evaluate(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
    await expectNoBlockingA11y(page, 'ui-26-public-creator-profile');
    await page.screenshot({
      path: testInfo.outputPath('ui-26-public-creator-profile-actual.png'),
    });
  }
  await expectVisualSnapshot(page, 'creator');
  await page.getByRole('button', { name: 'В каталог' }).click();
  await page.locator('.brand-button').click();
  await expect(page.getByText('Автор пока ничего о себе не рассказал.')).toBeVisible();
  await page.getByRole('button', { name: 'Редактировать профиль' }).click();
  await page.getByRole('textbox', { name: 'Отображаемое имя' }).fill('Алиса Велора');
  await page.getByRole('textbox', { name: 'О себе' }).fill('Пишу камерные мистические истории.');
  await page.getByRole('button', { name: 'Сохранить профиль' }).click();
  await expect(page.getByRole('heading', { name: 'Алиса Велора' })).toBeVisible();
  await expect(page.getByText('Текущий тариф: Plus')).toBeVisible();
  await expect(page.getByRole('button', { name: /Заблокированные · 1/u })).toBeVisible();
  if (capturesReferenceEvidence(testInfo)) {
    await expect(page.locator('.toast')).toBeHidden({ timeout: 5_000 });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await expectNoBlockingA11y(page, 'ui-11-profile-overview');
    await page.screenshot({
      path: testInfo.outputPath('ui-11-profile-overview-actual.png'),
    });
  }
  await page.getByRole('button', { name: 'Тариф', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Premium и Pro', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Без карты, подписки и автопополнения')).toBeVisible();
  await expect(page.getByText('Текущий тариф: Plus')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Free', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plus', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pro', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Ежемесячно' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('radio', { name: 'Ежегодно' }).click();
  await expect(page.getByText('1000 Stars')).toBeVisible();
  await page.getByRole('radio', { name: 'Ежемесячно' }).click();
  if (capturesReferenceEvidence(testInfo)) {
    await page.locator('#access-packs-title').evaluate((element) => {
      window.scrollTo({
        top: window.scrollY + element.getBoundingClientRect().top - 96,
        behavior: 'instant',
      });
    });
    await expectNoBlockingA11y(page, 'ui-38-41-pricing-cards');
    await page.screenshot({
      path: testInfo.outputPath('ui-38-pricing-plan-card-actual.png'),
    });
    await page
      .locator('.plan-card')
      .nth(1)
      .evaluate((element) => {
        if (!(element instanceof HTMLElement) || !(element.parentElement instanceof HTMLElement)) {
          return;
        }
        element.parentElement.scrollTo({ left: element.offsetLeft - 20, behavior: 'instant' });
      });
    await page.screenshot({
      path: testInfo.outputPath('ui-39-pricing-comparison-actual.png'),
    });
    await page
      .locator('.plan-card')
      .nth(2)
      .evaluate((element) => {
        if (!(element instanceof HTMLElement) || !(element.parentElement instanceof HTMLElement)) {
          return;
        }
        element.parentElement.scrollTo({ left: element.offsetLeft - 20, behavior: 'instant' });
      });
    await page.screenshot({
      path: testInfo.outputPath('ui-40-pricing-premium-card-actual.png'),
    });
    await page.locator('.plan-card-premium .plan-card-purchase').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('ui-41-pricing-lower-actual.png'),
    });
  }
  await page.getByRole('radio', { name: 'Ежегодно' }).click();
  await expect(page.getByText('1000 Stars')).toBeVisible();
  await expect(page.getByText('2000 Stars')).toBeVisible();
  if (capturesReferenceEvidence(testInfo)) {
    await page.locator('#access-packs-title').evaluate((element) => {
      window.scrollTo({
        top: window.scrollY + element.getBoundingClientRect().top - 96,
        behavior: 'instant',
      });
    });
    await page
      .locator('.plan-card')
      .nth(1)
      .evaluate((element) => {
        if (!(element instanceof HTMLElement) || !(element.parentElement instanceof HTMLElement)) {
          return;
        }
        element.parentElement.scrollTo({ left: element.offsetLeft - 20, behavior: 'instant' });
      });
    await page.screenshot({
      path: testInfo.outputPath('ui-44-pricing-annual-period-actual.png'),
    });
    await page
      .locator('.plan-card')
      .nth(2)
      .evaluate((element) => {
        if (!(element instanceof HTMLElement) || !(element.parentElement instanceof HTMLElement)) {
          return;
        }
        element.parentElement.scrollTo({ left: element.offsetLeft - 20, behavior: 'instant' });
      });
    await page.screenshot({
      path: testInfo.outputPath('ui-45-pricing-annual-details-actual.png'),
    });
    await page.locator('.plan-card-premium .plan-card-purchase').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('ui-46-pricing-fixed-period-actual.png'),
    });
  }
  const faq = page.getByRole('region', { name: 'Частые вопросы' });
  await faq.getByText('Это подписка с автоматическим продлением?').click();
  await expect(faq.getByText(/Повторного списания не будет/u)).toBeVisible();
  if (capturesReferenceEvidence(testInfo)) {
    await page.locator('#billing-faq-title').evaluate((element) => {
      window.scrollTo({
        top: window.scrollY + element.getBoundingClientRect().top - 96,
        behavior: 'instant',
      });
    });
    await expectNoBlockingA11y(page, 'ui-42-43-pricing-faq');
    await page.screenshot({
      path: testInfo.outputPath('ui-42-pricing-faq-top-actual.png'),
    });
  }
  await faq.getByText('Как запросить возврат Stars?').click();
  await expect(faq.getByText(/Возврат не выполняется автоматически/u)).toBeVisible();
  if (capturesReferenceEvidence(testInfo)) {
    await faq
      .locator('details')
      .last()
      .locator('summary')
      .evaluate((element) => {
        window.scrollTo({
          top: window.scrollY + element.getBoundingClientRect().top - 96,
          behavior: 'instant',
        });
      });
    await page.screenshot({
      path: testInfo.outputPath('ui-43-pricing-faq-lower-actual.png'),
    });
  }
  const buyButton = page
    .locator('.plan-card')
    .filter({ has: page.getByRole('heading', { name: 'Plus', exact: true }) })
    .getByRole('button', { name: 'Купить один раз' });
  await expect(buyButton).toBeDisabled();
  await page.getByRole('checkbox').check();
  await buyButton.click();
  await expect.poll(() => openedInvoiceUrl).toBe('https://t.me/$invoice-test');
  await expect
    .poll(() =>
      page.evaluate(() => (window as Window & { __openedInvoiceUrl?: string }).__openedInvoiceUrl),
    )
    .toBe('https://t.me/$invoice-test');
  await expect(page.getByText('Доступ начислен. Тариф и срок обновляются.')).toBeVisible();
  await page.getByRole('button', { name: /Главная/u }).click();
  const liraCharacter = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Лира' }) });
  await liraCharacter.getByRole('button', { name: 'Нравится' }).click();
  await expect(liraCharacter.getByRole('button', { name: 'Нравится' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await liraCharacter.getByRole('button', { name: /Действия с персонажем.*Лира/u }).click();
  await page.getByRole('menuitem', { name: 'В закладки' }).click();
  await liraCharacter.getByRole('button', { name: 'Подробнее' }).click();
  await expect(page).toHaveURL(/\?character=character-1$/u);
  await expect(liraCharacter.locator('.story-cover')).toBeVisible();
  await expect(liraCharacter.getByRole('button', { name: 'от Velora' })).toBeVisible();
  await expect(
    liraCharacter.getByText('Персонаж для спокойной мистической истории.'),
  ).toBeVisible();
  await expect(liraCharacter.locator('.character-markdown-description strong')).toHaveText(
    'спокойной мистической истории',
  );
  await expect(liraCharacter.getByText('мистика', { exact: true })).toBeVisible();
  await expect(liraCharacter.getByLabel('Статистика персонажа')).toBeVisible();
  await expect(liraCharacter.getByRole('button', { name: 'Нравится' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(liraCharacter.getByRole('button', { name: 'Сохранено' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(liraCharacter.getByRole('button', { name: 'Поделиться' })).toBeVisible();
  await expect(liraCharacter.getByRole('button', { name: 'Начать историю' })).toBeVisible();
  if (capturesReferenceEvidence(testInfo)) {
    await expect(page.locator('.toast')).toBeHidden({ timeout: 7_000 });
    await liraCharacter.scrollIntoViewIfNeeded();
    await expectNoBlockingA11y(page, 'ui-23-public-character-profile');
    await page.screenshot({
      path: testInfo.outputPath('ui-23-public-character-profile-actual.png'),
    });
  }
  const greetingBlock = liraCharacter.getByRole('region', { name: 'Приветствие' });
  await expect(greetingBlock.locator('strong')).toHaveText('Ты всё-таки пришёл.');
  await expect(greetingBlock.locator('em')).toHaveText(
    'Маяк вспыхнул над чёрным морем, и ветер принёс запах соли.',
  );
  const expandGreeting = greetingBlock.getByRole('button', { name: 'Показать полностью' });
  await expect(expandGreeting).toHaveAttribute('aria-expanded', 'false');
  await expect(greetingBlock.locator('.greeting-copy')).toHaveClass(/is-collapsed/u);
  if (capturesReferenceEvidence(testInfo)) {
    await greetingBlock.evaluate((element) => {
      element.scrollIntoView({ block: 'end', behavior: 'instant' });
    });
    await expectNoBlockingA11y(page, 'ui-24-greeting-collapsed');
    await page.screenshot({
      path: testInfo.outputPath('ui-24-greeting-collapsed-actual.png'),
    });
  }
  await expandGreeting.click();
  await expect(greetingBlock.locator('.greeting-copy')).not.toHaveClass(/is-collapsed/u);
  await expect(greetingBlock.getByRole('button', { name: 'Свернуть приветствие' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(greetingBlock).not.toContainText('**Ты всё-таки пришёл.**');
  const expandedCharacterGeometry = await liraCharacter.evaluate((card) => {
    const grid = card.closest('.card-grid');
    const cardRect = card.getBoundingClientRect();
    const gridRect = grid?.getBoundingClientRect();
    return {
      cardWidth: cardRect.width,
      gridWidth: gridRect?.width ?? 0,
    };
  });
  expect(expandedCharacterGeometry.gridWidth).toBeGreaterThan(0);
  expect(expandedCharacterGeometry.cardWidth).toBeGreaterThanOrEqual(
    expandedCharacterGeometry.gridWidth * 0.95,
  );
  if (capturesReferenceEvidence(testInfo)) {
    await greetingBlock.evaluate((element) => {
      element.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    await expectNoBlockingA11y(page, 'ui-25-greeting-expanded');
    await page.screenshot({
      path: testInfo.outputPath('ui-25-greeting-expanded-actual.png'),
    });
  }
  await liraCharacter.getByRole('button', { name: 'Поделиться' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __sharedCharacter?: ShareData;
            }
          ).__sharedCharacter,
      ),
    )
    .toMatchObject({
      title: 'Лира',
      url: 'https://t.me/aivel0ra_bot?startapp=character_character-1',
    });
  await expectVisualSnapshot(page, 'character');
  await liraCharacter.getByLabel('Ваша оценка').selectOption('5');
  await liraCharacter.getByPlaceholder('Отзыв необязателен').fill('Очень атмосферный персонаж.');
  await liraCharacter.getByRole('button', { name: 'Оценить' }).click();
  await expect(
    liraCharacter.getByRole('region', { name: 'Отзывы' }).getByRole('paragraph'),
  ).toHaveText('Очень атмосферный персонаж.');
  await liraCharacter.getByRole('button', { name: /Пожаловаться/u }).click();
  await liraCharacter.getByLabel('Причина жалобы').selectOption('SPAM');
  await liraCharacter.getByLabel('Описание жалобы').fill('Повторяющийся рекламный контент.');
  await liraCharacter.getByRole('button', { name: 'Отправить жалобу' }).click();
  await expect(page.getByText('Жалоба отправлена в очередь модерации.')).toBeVisible();
  // The card copy itself is the primary start target; the cover remains reserved for avatar preview.
  await liraCharacter.getByRole('heading', { name: 'Лира' }).click();
  const personaChooser = page.getByRole('dialog', { name: 'Кто будет общаться с Лира?' });
  await expect(personaChooser).toBeVisible();
  await expect(personaChooser.getByRole('radio', { name: /Алекс/u })).toBeChecked();
  await personaChooser.getByRole('searchbox', { name: 'Поиск по образам' }).fill('Провод');
  await expect(personaChooser.getByText('Проводница', { exact: true })).toBeVisible();
  await expect(personaChooser.getByText('Алекс', { exact: true })).toBeHidden();
  await personaChooser.getByRole('searchbox', { name: 'Поиск по образам' }).fill('');
  await personaChooser.getByRole('radio', { name: /Проводница/u }).check();
  await personaChooser.getByRole('checkbox', { name: /Больше не спрашивать/u }).check();
  if (capturesReferenceEvidence(testInfo)) {
    await expectNoBlockingA11y(page, 'ui-12-persona-chooser');
    await page.screenshot({
      path: testInfo.outputPath('ui-12-persona-chooser-actual.png'),
    });
  }
  await personaChooser.getByRole('button', { name: 'Начать историю с Лира' }).click();
  await expect
    .poll(() => latestConversationPayload)
    .toMatchObject({
      characterId: 'character-1',
      personaId: 'persona-wanderer',
      greetingIndex: 0,
    });
  expect(defaultPersonaId).toBe('persona-wanderer');
  expect(settingsPreferences['autoUseDefaultPersona']).toBe(true);
  await expect(page.locator('.message-bubble.is-character em')).toHaveText('Ты всё-таки пришёл.');
  const greetingBubble = page.locator('.message-bubble.is-character').first();
  await greetingBubble.getByRole('button', { name: 'Действия с сообщением' }).click();
  const greetingMenu = page.getByRole('menu', { name: 'Меню сообщения' });
  await expect(greetingMenu.getByRole('menuitem')).toHaveCount(3);
  for (const action of ['Копировать', 'Редактировать', 'Перегенерировать приветствие']) {
    await expect(greetingMenu.getByRole('menuitem', { name: action })).toBeVisible();
  }
  for (const unrelatedAction of [
    'Ответвить отсюда',
    'Продолжить',
    'Сообщить о проблеме',
    'Удалить',
  ]) {
    await expect(greetingMenu.getByRole('menuitem', { name: unrelatedAction })).toHaveCount(0);
  }
  await greetingMenu.getByRole('menuitem', { name: 'Редактировать' }).click();
  await greetingBubble
    .getByLabel('Изменённый текст сообщения')
    .fill('*Ты вошёл в эту историю другим путём.*');
  await greetingBubble.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.locator('.message-bubble.is-character').first()).toContainText(
    'Ты вошёл в эту историю другим путём.',
  );
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  const composerBounds = await page.getByLabel('Реплика').boundingBox();
  const navigationBounds = await page.locator('.bottom-nav').boundingBox();
  expect(composerBounds).not.toBeNull();
  expect(navigationBounds).not.toBeNull();
  if (composerBounds && navigationBounds) {
    expect(composerBounds.y + composerBounds.height).toBeLessThanOrEqual(navigationBounds.y - 4);
  }
  await expectVisualSnapshot(page, 'chat');
  await page.getByLabel('Реплика').fill('Я открываю дверь.');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.locator('.message-list').getByText('Архив отвечает эхом.')).toBeVisible();
  const latestAssistant = page.locator('.message-bubble.is-character').last();
  await latestAssistant.getByRole('button', { name: 'Действия с сообщением' }).click();
  await expect(page.getByRole('menuitem', { name: 'Перегенерировать' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Продолжить' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Редактировать' }).click();
  await expect(latestAssistant.getByLabel('Изменённый текст сообщения')).toBeVisible();
  await latestAssistant.getByLabel('Изменённый текст сообщения').fill('Архив отвечает тихим эхом.');
  await latestAssistant.getByRole('button', { name: 'Сохранить' }).click();
  await expect(latestAssistant.getByLabel('Изменённый текст сообщения')).toBeHidden();
  await expect(page.locator('.message-bubble.is-character').last()).toContainText(
    'Архив отвечает тихим эхом.',
  );
  const editedAssistant = page.locator('.message-bubble.is-character').last();
  await editedAssistant.getByRole('button', { name: 'Действия с сообщением' }).click();
  await page.getByRole('menuitem', { name: 'Перегенерировать' }).click();
  await expect(page.locator('.message-bubble.is-character').last()).toContainText(
    'Архив отвечает эхом.',
  );
  const regeneratedAssistant = page.locator('.message-bubble.is-character').last();
  await regeneratedAssistant.getByRole('button', { name: 'Действия с сообщением' }).click();
  await page.getByRole('menuitem', { name: 'Удалить' }).click();
  await expect(
    page.getByRole('heading', { name: 'Удалить сообщение и продолжение ветки?' }),
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Отмена' }).click();
  await latestAssistant.getByRole('button', { name: 'Действия с сообщением' }).click();
  await page.getByRole('menuitem', { name: 'Сообщить о проблеме' }).click();
  await page
    .getByLabel('Описание жалобы на сообщение')
    .fill('Ответ персонажа нарушает выбранные ограничения истории.');
  await page.getByRole('dialog').getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByRole('heading', { name: 'Жалоба на сообщение' })).toBeHidden();
  await page.getByRole('button', { name: 'Инструменты истории' }).click();
  const storyMenu = page.getByRole('dialog', { name: 'Инструменты истории' });
  await expect(storyMenu.getByRole('button', { name: /Профиль персонажа/u })).toBeVisible();
  await expect(storyMenu.getByRole('button', { name: /Память и суммаризация/u })).toBeVisible();
  await storyMenu.getByRole('button', { name: /Удалить чат/u }).click();
  await expect(storyMenu).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Удалить диалог?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Оставить' }).click();
  await page.getByRole('button', { name: 'Назад к диалогам' }).click();
  await openAppMenuSection(page, 'Образы');
  await page.locator('.view-header').getByRole('button', { name: 'Создать', exact: true }).click();
  await page.getByLabel('Имя').fill('Странница');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { name: 'Странница' })).toBeVisible();
  await expect(page.getByText('Найдено образов: 3')).toBeVisible();
  if (capturesReferenceEvidence(testInfo)) {
    await expect(page.locator('.toast')).toBeHidden({ timeout: 5_000 });
    await page.evaluate(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
    await expectNoBlockingA11y(page, 'ui-13-owned-personas');
    await page.screenshot({
      path: testInfo.outputPath('ui-13-owned-personas-actual.png'),
    });
  }
  const personaLibrarySearch = page.getByRole('searchbox', {
    name: 'Поиск по своим образам',
  });
  await personaLibrarySearch.fill('Провод');
  await expect(page.getByText('Найдено образов: 1')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Проводница' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Алекс' })).toBeHidden();
  await personaLibrarySearch.fill('нет такого образа');
  await expect(page.getByRole('heading', { name: 'Таких образов нет' })).toBeVisible();
  await personaLibrarySearch.fill('');
  await expect(page.getByText('Найдено образов: 3')).toBeVisible();
  const createdPersonaCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Странница', exact: true }) });
  await createdPersonaCard
    .getByRole('button', { name: 'Действия с персонажем «Странница»' })
    .click();
  await page.getByRole('menuitem', { name: 'Изменить' }).click();
  await expect(page.getByRole('heading', { name: 'Редактировать образ' })).toBeVisible();
  const personaUploadFixture = await sharp({
    create: { width: 160, height: 160, channels: 3, background: '#7047d8' },
  })
    .png()
    .toBuffer();
  const personaUploadInput = page.locator('.persona-editor-view .media-upload input[type="file"]');
  await personaUploadInput.setInputFiles({
    name: 'portrait.png',
    mimeType: 'image/png',
    buffer: personaUploadFixture,
  });
  await page.getByRole('button', { name: 'Обрезать и загрузить' }).click();
  await expect(page.locator('.persona-editor-view input[name="avatarFileId"]')).toHaveValue(
    '22222222-2222-4222-8222-222222222222',
  );
  await page.getByLabel('Коротко о себе').fill('Проводник по забытым мирам.');
  await page
    .getByLabel('Полное описание')
    .fill('Путешественница, которая собирает истории и бережно хранит найденные тайны.');
  if (capturesReferenceEvidence(testInfo)) {
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.locator('.persona-editor-avatar').scrollIntoViewIfNeeded();
    await expect(page.locator('.persona-editor-avatar')).toBeInViewport();
    await expect(page.locator('.product-topbar')).toBeHidden();
    await expect(page.locator('.bottom-nav')).toBeHidden();
    await expectNoBlockingA11y(page, 'ui-14-persona-editor-top');
    await page.screenshot({
      path: testInfo.outputPath('ui-14-persona-editor-top-actual.png'),
    });
  }
  await page.getByLabel('Характер').fill('Спокойная, внимательная и любопытная.');
  await page
    .locator('textarea[name="appearance"]')
    .fill('Тёмный плащ, дорожная сумка и серебряный компас.');
  await page.getByLabel('Стиль речи').fill('Говорит мягко и образно.');
  await page.getByLabel('Предыстория').fill('Много лет путешествует между забытыми архивами.');
  await page.getByLabel('Местоимения').fill('она/её');
  await page.getByLabel('Возраст образа').fill('24');
  await page.getByLabel('Личные заметки').fill('Не раскрывать источник серебряного компаса сразу.');
  await page.getByRole('checkbox', { name: 'Использовать этот образ по умолчанию' }).check();
  if (capturesReferenceEvidence(testInfo)) {
    await page.locator('.workspace').evaluate((workspace) => {
      workspace.scrollTo({ top: workspace.scrollHeight, left: 0, behavior: 'instant' });
    });
    const personaActions = page.locator('.persona-editor-view .editor-actions');
    await expect(personaActions).toBeInViewport();
    await expectNoBlockingA11y(page, 'ui-15-persona-editor-bottom');
    await page.screenshot({
      path: testInfo.outputPath('ui-15-persona-editor-bottom-actual.png'),
    });
  }
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByText('Проводник по забытым мирам.')).toBeVisible();
  expect(latestPersonaPatch).toMatchObject({
    avatarFileId: '22222222-2222-4222-8222-222222222222',
    shortDescription: 'Проводник по забытым мирам.',
    longDescription: 'Путешественница, которая собирает истории и бережно хранит найденные тайны.',
    personality: 'Спокойная, внимательная и любопытная.',
    appearance: 'Тёмный плащ, дорожная сумка и серебряный компас.',
    speakingStyle: 'Говорит мягко и образно.',
    background: 'Много лет путешествует между забытыми архивами.',
    pronouns: 'она/её',
    representedAge: '24',
    customNotes: 'Не раскрывать источник серебряного компаса сразу.',
  });
  expect(defaultPersonaId).toBe('persona-1');
  await page.getByRole('button', { name: /Персонажи/u }).click();
  await expect(page.getByRole('heading', { name: 'Ночная история' })).toBeVisible();
  await expect(
    page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: 'Ночная история' }) })
      .getByText('Личные', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Размер группы').selectOption('single');
  await expect.poll(() => ownedCharacterQueries.at(-1)?.get('kind')).toBe('single');
  await expect(page).toHaveURL(/(?:\?|&)kind=single(?:&|$)/u);
  await page.getByLabel('Размер группы').selectOption('ALL');
  await expect(page).not.toHaveURL(/(?:\?|&)kind=/u);
  if (capturesReferenceEvidence(testInfo)) {
    await expect(page.locator('.toast')).toBeHidden({ timeout: 5_000 });
    await expectNoBlockingA11y(page, 'ui-04-characters');
    await page.screenshot({
      path: testInfo.outputPath('ui-04-characters-actual.png'),
    });
  }
  await page.locator('.view-header').getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Новый персонаж' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Общий бюджет описания персонажа' })).toContainText(
    '≈ 0 / 2400 токенов',
  );
  const uploadInput = page.locator('.media-upload input[type="file"]');
  await expect(uploadInput).toBeEnabled();
  const uploadFixture = await sharp({
    create: { width: 160, height: 100, channels: 3, background: '#7047d8' },
  })
    .png()
    .toBuffer();
  await uploadInput.setInputFiles({
    name: 'portrait.png',
    mimeType: 'image/png',
    buffer: uploadFixture,
  });
  await page.getByLabel('Фокус по горизонтали').fill('25');
  await page.getByLabel('Фокус по вертикали').fill('75');
  if (capturesReferenceEvidence(testInfo)) {
    const uploadRegion = page.locator('.media-upload');
    await uploadRegion.scrollIntoViewIfNeeded();
    await expectNoBlockingA11y(page, 'contract-19-image-upload');
    await page.screenshot({
      path: testInfo.outputPath('contract-19-image-upload-actual.png'),
    });
  }
  await page.getByRole('button', { name: 'Обрезать и загрузить' }).click();
  await expect
    .poll(() => directImageUploadVerified, {
      message: 'Browser crop was not uploaded in a compressed image format.',
    })
    .toBe(true);
  await expect(page.locator('input[name="avatarFileId"]')).toHaveValue(
    '22222222-2222-4222-8222-222222222222',
  );
  await page.getByText('Создать аватар', { exact: true }).click();
  await page
    .getByPlaceholder('Опиши внешность и стиль персонажа')
    .fill('рыжая хранительница старой башни');
  await page.getByRole('button', { name: 'Сгенерировать' }).click();
  await expect.poll(() => generatedAvatarVerified).toBe(true);
  await expect(page.locator('input[name="avatarFileId"]')).toHaveValue(
    '33333333-3333-4333-8333-333333333333',
  );
  await expect(page.getByRole('group', { name: 'Кадрирование аватара' })).toContainText('1 x 1 px');
  await page.locator('input[name="avatarFocalX"]').fill('23');
  await page.locator('input[name="avatarFocalY"]').fill('77');
  await page.getByLabel('Имя').fill('Мира');
  await page.getByLabel('Короткая фраза', { exact: true }).fill('Хранительница северной башни');
  await page
    .getByLabel('Описание (не менее 20 символов)', { exact: true })
    .fill('Персонаж для камерной мистической истории у северной башни.');
  const characterAssist = page.getByRole('group', { name: 'AI-помощник' });
  await characterAssist.getByRole('button', { name: 'Предложить' }).click();
  await expect.poll(() => characterAssistVerified).toBe(true);
  await expect(page.getByLabel('Первое сообщение', { exact: true })).toHaveValue('');
  await expect(page.getByText('*Башня ждала тебя, {{user}}.*', { exact: true })).toBeVisible();
  await characterAssist.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByLabel('Первое сообщение', { exact: true })).toHaveValue(
    '*Башня ждала тебя, {{user}}.*',
  );
  if (capturesReferenceEvidence(testInfo)) {
    await expect(page.locator('.toast')).toBeHidden({ timeout: 5_000 });
    const avatarCrop = page.getByRole('group', { name: 'Кадрирование аватара' });
    await avatarCrop.evaluate((element) => {
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    await expectNoBlockingA11y(page, 'ui-07-character-avatar-crop');
    await page.screenshot({
      path: testInfo.outputPath('ui-07-character-avatar-crop-actual.png'),
    });
    await page.locator('.media-avatar-generator').evaluate((element) => {
      if (element instanceof HTMLDetailsElement) element.open = false;
    });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await expectNoBlockingA11y(page, 'ui-07-character-editor-top');
    await page.screenshot({
      path: testInfo.outputPath('ui-07-character-editor-top-actual.png'),
    });
  }
  await page
    .getByLabel('Характер (не менее 20 символов)', { exact: true })
    .fill('Внимательная, сдержанная и очень бережно относится к собеседнику.');
  await page.getByRole('switch', { name: /Характер · Публичные/u }).check();
  await page
    .getByLabel('Первое сообщение', { exact: true })
    .fill('*Добро пожаловать в башню, {{user}}.*');
  await expect(
    page.getByRole('region', { name: 'Предпросмотр приветствия' }).locator('em'),
  ).toHaveText('Добро пожаловать в башню, Твой образ.');
  if (capturesReferenceEvidence(testInfo)) {
    await page.getByLabel('Первое сообщение', { exact: true }).scrollIntoViewIfNeeded();
    await expectNoBlockingA11y(page, 'ui-08-character-editor-middle');
    await page.screenshot({
      path: testInfo.outputPath('ui-08-character-editor-middle-actual.png'),
    });
  }
  await page.getByLabel('Теги через запятую').fill('башня, мистика');
  await expect(page.getByRole('radio', { name: 'Личные', exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'По ссылке', exact: true }).check();
  await expect(page.getByRole('radio', { name: 'По ссылке', exact: true })).toBeChecked();
  await expect(page.getByRole('region', { name: 'Общий бюджет описания персонажа' })).toContainText(
    /≈ \d+ \/ 2400 токенов/u,
  );
  if (capturesReferenceEvidence(testInfo)) {
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect(page.getByRole('button', { name: 'Сохранить черновик' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Опубликовать' })).toBeVisible();
    const editorActionsBox = await page.locator('.character-editor-submit-actions').boundingBox();
    const bottomNavigationBox = await page.locator('.bottom-nav').boundingBox();
    expect(editorActionsBox).not.toBeNull();
    expect(bottomNavigationBox).not.toBeNull();
    expect((editorActionsBox?.y ?? 0) + (editorActionsBox?.height ?? 0)).toBeLessThanOrEqual(
      (bottomNavigationBox?.y ?? 0) + 1,
    );
    await expectNoBlockingA11y(page, 'ui-09-character-editor-bottom');
    await page.screenshot({
      path: testInfo.outputPath('ui-09-character-editor-bottom-actual.png'),
    });
  }
  await expect(page.getByText('Сохранено', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: /Я принимаю правила сообщества/u }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Опубликовать' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Запрещённый контент и попытки обхода ограничений не допускаются',
  );
  await page.getByRole('button', { name: 'Сохранить черновик' }).click();
  await expect(page.getByRole('heading', { name: 'Мира' })).toBeVisible();
  expect(ownedCharacters.find((item) => item['id'] === 'new-character-1')).toMatchObject({
    avatarFocalX: 23,
    avatarFocalY: 77,
  });
  const createdCharacter = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Мира' }) });
  await expect(createdCharacter).toContainText('башня');
  await page.reload();
  await page.getByRole('button', { name: /Персонажи/u }).click();
  await expect(page.getByRole('heading', { name: 'Мира' })).toBeVisible();
  const nightCharacter = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Ночная история' }) });
  await nightCharacter.getByRole('button', { name: /Действия с персонажем/u }).click();
  await page.getByRole('menuitem', { name: 'Редактировать' }).click();
  await expect(page.getByText('Сохранено', { exact: true })).toBeVisible();
  await page.getByLabel('Короткая фраза', { exact: true }).fill('Обновлённый безопасный черновик');
  await expect(page.getByText('Изменения ожидают сохранения')).toBeVisible();
  await expect(page.getByText('Сохранено', { exact: true })).toBeVisible();
  expect(characterAutosaveBodies).toHaveLength(1);
  expect(characterAutosaveBodies[0]).toMatchObject({
    baseVersion: 1,
    tagline: 'Обновлённый безопасный черновик',
  });
  // The editor header lives below the sticky Telegram shell. Return it to its
  // real visible position before tapping Back instead of letting smooth
  // auto-scroll place the control underneath the shell header.
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  await page.getByRole('button', { name: 'Назад' }).click();
  await expect(page.getByRole('heading', { name: 'Ночная история' })).toBeVisible();
  await nightCharacter.getByRole('button', { name: 'Тестовый диалог' }).click();
  await expect(page.getByText('Приватный тест черновика')).toBeVisible();
  expect(previewRequestVerified).toBe(true);
  await page.getByRole('button', { name: 'Назад к диалогам' }).click();
  conversationPreview = false;
  await page.getByRole('button', { name: /Персонажи/u }).click();
  await expect(page.getByRole('heading', { name: 'Ночная история' })).toBeVisible();
  await nightCharacter.getByRole('button', { name: /Действия с персонажем/u }).click();
  await page.getByRole('menuitem', { name: 'Опубликовать' }).click();
  await expect(page.getByText(matureReviewPendingText)).toBeVisible();
  await expect(page.getByText('На проверке')).toBeVisible();
  await nightCharacter.getByRole('button', { name: /Действия с персонажем/u }).click();
  await expect(page.getByRole('menuitem', { name: 'Отменить проверку' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Редактировать' }).click();
  await page
    .getByLabel('Короткая фраза', { exact: true })
    .fill('Не отправлять автоматически на повторную проверку');
  await expect(page.getByText('Изменения ожидают сохранения')).toBeVisible();
  await page.waitForTimeout(1_100);
  expect(characterAutosaveBodies).toHaveLength(1);
  await page.getByRole('button', { name: 'Отменить' }).click();
  await page.getByRole('button', { name: /Книги мира/u }).click();
  await page
    .locator('.lorebooks-library .view-header')
    .getByRole('button', { name: /Создать/u })
    .click();
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
  const miraLorebookCheckbox = page
    .locator('.check-list label')
    .filter({ hasText: /^Мира$/u })
    .getByRole('checkbox');
  await miraLorebookCheckbox.click();
  await expect.poll(() => lorebookCharacterIds.has('new-character-1')).toBe(true);
  await expect(miraLorebookCheckbox).toBeChecked();
  await page.getByRole('button', { name: 'Назад' }).click();
  if (capturesReferenceEvidence(testInfo)) {
    await expect(page.locator('.toast')).toBeHidden({ timeout: 5_000 });
    await expectNoBlockingA11y(page, 'ui-05-lorebooks');
    await page.screenshot({
      path: testInfo.outputPath('ui-05-lorebooks-actual.png'),
    });
    const lorebookSort = page.getByRole('button', { name: 'Сортировка книг мира' });
    if ((page.viewportSize()?.width ?? 1_024) <= 767) {
      await expect(lorebookSort).toBeHidden();
    } else {
      await lorebookSort.click();
      await expect(page.getByRole('listbox', { name: 'Сортировка книг мира' })).toBeVisible();
      await expectNoBlockingA11y(page, 'ui-06-sort-popup');
      await page.screenshot({
        path: testInfo.outputPath('ui-06-sort-popup-actual.png'),
      });
      await page.getByRole('option', { name: 'Сначала старые' }).click();
      await expect.poll(() => lorebookQueries.at(-1)?.get('sort')).toBe('oldest');
      await expect(page).toHaveURL(/(?:\?|&)sort=oldest(?:&|$)/u);
    }
  }
  const loreDownloadPromise = page.waitForEvent('download');
  const archiveLorebook = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Архив мира' }) });
  if ((page.viewportSize()?.width ?? 1_024) <= 620) {
    const coverBox = await archiveLorebook.locator('.lorebook-cover').boundingBox();
    expect(coverBox).not.toBeNull();
    expect(Math.abs((coverBox?.width ?? 0) - (coverBox?.height ?? 0))).toBeLessThanOrEqual(1);
  }
  await archiveLorebook.getByRole('button', { name: /Действия с книгой/u }).click();
  const lorebookMenuBox = await page.getByRole('menu').boundingBox();
  const viewportWidth = page.viewportSize()?.width ?? 0;
  expect(lorebookMenuBox).not.toBeNull();
  expect(lorebookMenuBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((lorebookMenuBox?.x ?? 0) + (lorebookMenuBox?.width ?? 0)).toBeLessThanOrEqual(
    viewportWidth,
  );
  await page.getByRole('menuitem', { name: 'Экспорт' }).click();
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
  await page.getByRole('button', { name: /Персонажи/u }).click();
  let miraCharacter = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Мира' }) });
  await miraCharacter.getByRole('button', { name: 'Тестовый диалог' }).click();
  await expect(page.getByText('Добро пожаловать в башню, Алиса.')).toBeVisible();
  await page.getByRole('button', { name: 'Назад к диалогам' }).click();
  conversationPreview = false;
  await page.getByRole('button', { name: /Персонажи/u }).click();
  miraCharacter = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Мира' }) });
  await miraCharacter.getByRole('button', { name: /Действия с персонажем/u }).click();
  await page.getByRole('menuitem', { name: 'Редактировать' }).click();
  await expect(page.getByRole('heading', { name: 'Редактор персонажа' })).toBeVisible();
  await page.getByRole('checkbox', { name: /Я принимаю правила сообщества/u }).check();
  await page.getByRole('button', { name: 'Опубликовать' }).click();
  await expect(page.getByRole('heading', { name: 'Мои творения', exact: true })).toBeVisible();
  miraCharacter = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Мира' }) });
  await expect(miraCharacter).toContainText('Опубликован');
  await page.getByRole('button', { name: /Главная/u }).click();
  const publishedMira = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Мира' }) });
  await expect(publishedMira).toContainText('Хранительница северной башни');
  await publishedMira.getByRole('button', { name: 'Подробнее' }).click();
  await expect(publishedMira).toContainText(
    'Внимательная, сдержанная и очень бережно относится к собеседнику.',
  );
  await publishedMira.getByRole('button', { name: 'Начать историю' }).click();
  await expect(page.getByText('Добро пожаловать в башню, Алиса.')).toBeVisible();
  await page.getByRole('button', { name: 'Назад к диалогам' }).click();
  await page.getByRole('button', { name: /Диалоги/u }).click();
  await expect(page.getByRole('heading', { name: 'Диалоги' })).toBeVisible();
  await expect(page.getByText('1 диалог', { exact: true })).toBeVisible();
  await expect(page.getByText('Лира · Алекс')).toBeVisible();
  await expect(page.getByText(/\d+ сообщ\./u)).toBeVisible();
  if (capturesReferenceEvidence(testInfo)) {
    await expect(page.locator('.toast')).toBeHidden({ timeout: 5_000 });
    const chatSearchGeometry = await page.locator('.chat-search').evaluate((form) => {
      const input = form.querySelector('input');
      const button = form.querySelector('button');
      if (!(input instanceof HTMLElement) || !(button instanceof HTMLElement)) return null;
      const formBox = form.getBoundingClientRect();
      const inputBox = input.getBoundingClientRect();
      const buttonBox = button.getBoundingClientRect();
      return {
        inputWidth: inputBox.width,
        contained:
          inputBox.left >= formBox.left &&
          buttonBox.right <= formBox.right &&
          inputBox.right <= buttonBox.left,
      };
    });
    expect(chatSearchGeometry?.contained).toBe(true);
    expect(chatSearchGeometry?.inputWidth).toBeGreaterThan(150);
    await expectNoBlockingA11y(page, 'ui-10-recent-chats');
    await page.screenshot({
      path: testInfo.outputPath('ui-10-recent-chats-actual.png'),
    });
    await page.getByLabel('Поиск по диалогам').fill('Архив');
    await page.getByRole('button', { name: 'Найти' }).click();
    await expect.poll(() => conversationListQueries.at(-1)?.get('q')).toBe('Архив');
    await page.getByLabel('Поиск по диалогам').fill('');
    await page.getByRole('button', { name: 'Найти' }).click();
    await page.getByRole('button', { name: 'Сортировка диалогов' }).click();
    await page.getByRole('option', { name: 'Сначала старые' }).click();
    await expect.poll(() => conversationListQueries.at(-1)?.get('sort')).toBe('oldest');
    await page.getByRole('heading', { name: 'Диалоги' }).evaluate((element) => {
      element.scrollIntoView({ block: 'start', behavior: 'instant' });
      window.scrollBy({ top: -120, behavior: 'instant' });
    });
    await page.getByRole('button', { name: 'Сортировка диалогов' }).click();
    await expect(page.getByRole('option')).toHaveCount(3);
    await page.getByRole('option', { name: 'Наиболее активные' }).click();
    await expect.poll(() => conversationListQueries.at(-1)?.get('sort')).toBe('active');
    await page.getByRole('button', { name: 'Сортировка диалогов' }).click();
    await expect(page.getByRole('option', { name: 'Наиболее активные' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expectNoBlockingA11y(page, 'ui-28-chat-sort');
    await page.screenshot({
      path: testInfo.outputPath('ui-28-chat-sort-actual.png'),
    });
    await page.getByRole('option', { name: 'Сначала недавние' }).click();
    await expect(page.getByRole('button', { name: 'Сортировка диалогов' })).toContainText(
      'Сначала недавние',
    );
    await page.getByRole('button', { name: 'Управление диалогами' }).click();
    await expect.poll(() => conversationListQueries.at(-1)?.get('state')).toBe('ALL');
    const conversationCard = page.getByRole('article').filter({ hasText: 'Лира · Алекс' });
    await conversationCard.getByRole('button', { name: 'Действия с диалогом «Лира»' }).click();
    await page.getByRole('menuitem', { name: 'В архив' }).click();
    await expect(conversationCard).toContainText('В архиве');
    await conversationCard.getByRole('button', { name: 'Действия с диалогом «Лира»' }).click();
    await page.getByRole('menuitem', { name: 'Вернуть из архива' }).click();
    await expect(conversationCard).not.toContainText('В архиве');
    await conversationCard.getByRole('checkbox', { name: 'Выбрать диалог «Лира»' }).check();
    await expect(page.getByRole('status')).toHaveText('Выбрано: 1');
    await page.getByRole('button', { name: 'Удалить выбранное' }).click();
    const bulkDeleteDialog = page.getByRole('alertdialog', {
      name: 'Удалить выбранные диалоги?',
    });
    await expect(bulkDeleteDialog).toContainText('Будет удалено: 1');
    await bulkDeleteDialog.getByRole('button', { name: 'Отмена' }).click();
    await page.getByRole('button', { name: 'Выбрать все' }).click();
    await expect(page.getByRole('status')).toHaveText('Выбрано: 0');
    await expect(page.getByRole('button', { name: 'Удалить выбранное' })).toBeDisabled();
    await page.getByRole('heading', { name: 'Диалоги' }).evaluate((element) => {
      element.scrollIntoView({ block: 'start', behavior: 'instant' });
      window.scrollBy({ top: -120, behavior: 'instant' });
    });
    const compactChatListGeometry = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('.chat-list-view .conversation-card');
      const navigation = document.querySelector<HTMLElement>('.bottom-nav');
      if (!card || !navigation) return null;
      const cardRect = card.getBoundingClientRect();
      const navigationRect = navigation.getBoundingClientRect();
      return {
        cardTop: cardRect.top,
        navigationTop: navigationRect.top,
      };
    });
    expect(compactChatListGeometry).not.toBeNull();
    expect(compactChatListGeometry?.cardTop ?? Number.POSITIVE_INFINITY).toBeLessThan(
      (compactChatListGeometry?.navigationTop ?? 0) - 44,
    );
    await expectNoBlockingA11y(page, 'ui-27-manage-chats');
    await page.screenshot({
      path: testInfo.outputPath('ui-27-manage-chats-actual.png'),
    });
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  }
  await page.getByRole('button', { name: /Лира · Алекс/u }).click();
  await openStoryTool(page, /Лорбук и контекст/u);
  await page.getByLabel('Архив мира').check();
  await expect(page.getByText('Активные сейчас: 1')).toBeVisible();
  await expect(page.getByText('6 токенов')).toBeVisible();
  await expect(page.getByText('Ключ: архив')).toBeVisible();
  await expect(page.getByText('Приоритет: 12')).toBeVisible();
  await expect(page.getByText('Токены: 6')).toBeVisible();
  await openStoryTool(page, /Память и суммаризация/u);
  await expect(
    page.getByText(/Память активной ветки хранится в одном редактируемом документе/u),
  ).toBeVisible();
  const memoryWorkspace = page.locator('.memory-workspace');
  await expect(memoryWorkspace).toBeVisible();
  if (testInfo.project.name === 'desktop') {
    await expect(page.locator('.message-list')).toBeVisible();
    await expect(page.locator('.chat-composer')).toBeVisible();
  } else {
    await expect(page.locator('.message-list')).toBeHidden();
    await expect(page.locator('.chat-composer')).toBeHidden();
  }
  expect(
    await memoryWorkspace.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
  await page.evaluate(async () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    await document.fonts.ready;
  });
  await page.screenshot({
    path: testInfo.outputPath('memory-viewport-current.png'),
    animations: 'disabled',
    caret: 'hide',
    fullPage: false,
  });
  await memoryWorkspace.screenshot({
    path: testInfo.outputPath('memory-panel-current.png'),
    animations: 'disabled',
    caret: 'hide',
  });
  await expectVisualSnapshot(page, 'memory');
  await page.getByLabel('Память разговора').fill('Обещание у маяка сохранено.');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Изменено вручную', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Восстановить' }).click();
  const restoreDialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Предпросмотр восстановления версии' }),
  });
  await expect(restoreDialog.getByText('Старая память у маяка.')).toBeVisible();
  await restoreDialog.getByRole('button', { name: 'Восстановить' }).click();
  await expect(page.getByLabel('Память разговора')).toHaveValue('Старая память у маяка.');
  await page.getByRole('button', { name: 'Пересобрать автоматическую память' }).click();
  const regenerationDialog = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: 'Предпросмотр новой автоматической памяти' }),
  });
  await expect(regenerationDialog.getByText('Старая память у маяка.')).toBeVisible();
  await expect(regenerationDialog.getByText('Полная сводка активной ветки.')).toBeVisible();
  await regenerationDialog.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByLabel('Память разговора')).toHaveValue('Полная сводка активной ветки.');
  await page.getByLabel('Память разговора').fill('Обещание у маяка сохранено.');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await page.getByRole('button', { name: 'Суммировать новые сообщения' }).click();
  await expect(page.getByLabel('Память разговора')).toHaveValue(
    /Обещание у маяка сохранено\.[\s\S]*Резюме последних событий\./u,
  );
  await openStoryTool(page, /Инспектор промпта/u);
  await expect(page.getByText('Инспектор промпта', { exact: true })).toBeVisible();
  await expect(page.getByText(/Модель · velora-balanced · deepseek-chat-v3\.1/u)).toBeVisible();
  await expect(page.getByText('165 входных токенов')).toBeVisible();
  await page.getByText('Образ · Алекс').click();
  await expect(page.getByText('Картограф звёздных маршрутов.')).toBeVisible();
  await page.getByText('Активный лор · 1').click();
  await expect(page.getByText('Скрытая дверь')).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Инструкции диалога' }).click();
  await expect(page.getByText('Пиши кинематографично.')).toBeVisible();
  await openStoryTool(page, /Настройки генерации/u);
  await expect(page.getByRole('radio', { name: /Lunaris Roleplay/u })).toBeVisible();
  await page.locator('.chat-settings-panel').screenshot({
    path: testInfo.outputPath('actual-model-picker.png'),
    animations: 'disabled',
    style: '.toast { display: none !important; }',
  });
  const settingsPanel = page.locator('.chat-settings-panel');
  const settingsScrollContainer =
    testInfo.project.name === 'desktop' ? page.locator('.chat-inspector-slot') : settingsPanel;
  const settingsOverflow = await settingsScrollContainer.evaluate(
    (element) => element.scrollHeight > element.clientHeight,
  );
  if (settingsOverflow) {
    await settingsScrollContainer.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
  }
  const settingsSubmit = settingsPanel.locator('button[type="submit"]');
  await expect(settingsSubmit).toBeVisible();
  const [settingsSubmitBox, bottomNavigationBox] = await Promise.all([
    settingsSubmit.boundingBox(),
    page.getByRole('navigation', { name: 'Основные разделы' }).boundingBox(),
  ]);
  expect(settingsSubmitBox).not.toBeNull();
  expect(bottomNavigationBox).not.toBeNull();
  expect((settingsSubmitBox?.y ?? 0) + (settingsSubmitBox?.height ?? 0)).toBeLessThanOrEqual(
    bottomNavigationBox?.y ?? Number.POSITIVE_INFINITY,
  );
  await settingsPanel.screenshot({
    path: testInfo.outputPath('actual-model-picker-scrolled.png'),
    animations: 'disabled',
    style: '.toast { display: none !important; }',
  });
  await page.getByRole('radio', { name: /Lunaris Roleplay/u }).check();
  await page.getByLabel('Длина ответа').selectOption('DETAILED');
  await page.getByLabel('Инструкции для этого чата').fill('Пиши кинематографично.');
  await page.getByRole('button', { name: 'Сохранить настройки' }).click();
  await expect(page.getByText('Настройки истории сохранены.')).toBeVisible();
  expect(conversationSettings.modelProfileId).toBe('velora-free-roleplay');
  expect(conversationSettings.responseLength).toBe('DETAILED');
  const quickModelButton = page.locator('.chat-model-button:visible');
  await expect(quickModelButton).toContainText('Lunaris Roleplay');
  await quickModelButton.click();
  await expect(page.locator('.chat-settings-panel')).toBeHidden();
  await expect(page.locator('.chat-inspector-slot')).toBeHidden();
  const quickModelPicker = page.locator('.chat-model-picker');
  await expect(quickModelPicker.getByRole('button', { name: /Velora Balanced/u })).toBeVisible();
  await expect(quickModelPicker.getByRole('button', { name: /Velora Nano/u })).toBeVisible();
  await expect(
    quickModelPicker.getByRole('button', { name: /Velora Premium Story/u }),
  ).toBeDisabled();
  if (capturesReferenceEvidence(testInfo)) {
    await expectNoBlockingA11y(page, 'ui-17-model-picker-top');
    await page.screenshot({
      path: testInfo.outputPath('ui-17-model-picker-top-actual.png'),
    });
    await quickModelPicker.locator('.chat-model-picker-list').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(
      quickModelPicker.getByRole('button', { name: 'Открыть полный каталог моделей' }),
    ).toBeVisible();
    await expectNoBlockingA11y(page, 'ui-18-model-picker-lower');
    await page.screenshot({
      path: testInfo.outputPath('ui-18-model-picker-lower-actual.png'),
    });
  }
  await quickModelPicker.getByRole('button', { name: 'Открыть полный каталог моделей' }).click();
  const fullModelCatalog = page.getByRole('dialog', { name: 'Каталог моделей' });
  await expect(fullModelCatalog.getByText('Velora Premium Story')).toBeVisible();
  await expect(fullModelCatalog).toContainText('Контекст: 200 000');
  await expect(fullModelCatalog).toContainText('Провайдер: BotHub');
  await expect(fullModelCatalog).toContainText('Тариф: Минимальный');
  await expect(fullModelCatalog).toContainText(
    'Некоторые темы могут ограничиваться правилами поставщика модели.',
  );
  if (capturesReferenceEvidence(testInfo)) {
    await expectNoBlockingA11y(page, 'ui-19-model-catalog');
    await page.screenshot({
      path: testInfo.outputPath('ui-19-model-catalog-actual.png'),
    });
  }
  await fullModelCatalog.getByRole('button', { name: 'Закрыть каталог моделей' }).click();
  await quickModelButton.click();
  await quickModelPicker.getByRole('button', { name: /Velora Balanced/u }).click();
  await expect(quickModelButton).toContainText('Velora Balanced');
  expect(conversationSettings.modelProfileId).toBe('velora-balanced');
  await quickModelButton.screenshot({
    path: testInfo.outputPath('actual-chat-model-quick-picker.png'),
    animations: 'disabled',
    style: '.toast { display: none !important; }',
  });
  await quickModelButton.click();
  await quickModelPicker.screenshot({
    path: testInfo.outputPath('actual-chat-model-quick-picker-open.png'),
    animations: 'disabled',
    style: '.toast { display: none !important; }',
  });
  await quickModelPicker.getByRole('button', { name: 'Настройки генерации' }).click();
  await expect(page.locator('.chat-settings-panel')).toContainText('Настройки истории');
  await page.keyboard.press('Escape');
  await expect(page.locator('.chat-settings-panel')).toBeHidden();
  expect(conversationSettings.customInstructions).toBe('Пиши кинематографично.');
  conversationMessages = Array.from({ length: longHistoryMessageCount }, (_, index) => ({
    id: `history-${String(index + 1)}`,
    conversationId: 'conversation-1',
    role: index === 499 || index % 2 === 0 ? 'ASSISTANT' : 'USER',
    content:
      index === 499
        ? '**Лира:** «Мы добрались до северной башни раньше бури.»\n\n*Свет маяка скользнул по мокрым камням, и древняя дверь отозвалась тихим металлическим звоном. За ней дышал архив — огромный, тёмный и всё ещё живой.*\n\n**Лира:** «Решать тебе, Алиса. Открываем дверь или сначала проверим карту?»'
        : index === 498
          ? '*Алиса убрала компас в карман и прислушалась к ветру.* «Покажи, где ты видела знак хранителей.»'
          : `Историческое сообщение ${String(index + 1)}`,
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
    generationId: index === longHistoryMessageCount - 1 ? longHistoryGenerationId : null,
    reaction: null,
  }));
  const longHistoryStartedAt = Date.now();
  await page.reload();
  await page.getByRole('button', { name: /Диалоги/u }).click();
  await page.getByRole('button', { name: /Лира · Алекс/u }).click();
  await expect(page.locator('.message-bubble')).toHaveCount(80);
  const messageGeometry = await page.locator('.message-bubble').evaluateAll((elements) => {
    const viewportWidth = window.innerWidth;
    const rectangles = elements.map((element) => element.getBoundingClientRect());
    return {
      maxWidth: Math.max(...rectangles.map((rectangle) => rectangle.width)),
      viewportWidth,
      overflow: rectangles.some(
        (rectangle) => rectangle.left < -1 || rectangle.right > viewportWidth + 1,
      ),
      controlsOutside: elements.some((element) => {
        const bubble = element.getBoundingClientRect();
        const controls = element
          .querySelector<HTMLElement>('.message-meta')
          ?.getBoundingClientRect();
        return controls
          ? controls.left < bubble.left - 1 ||
              controls.right > bubble.right + 1 ||
              controls.bottom > bubble.bottom + 1
          : false;
      }),
      visualTreatments: new Set(
        elements.map((element) => {
          const style = getComputedStyle(element);
          return `${style.backgroundColor}|${style.backgroundImage}`;
        }),
      ).size,
    };
  });
  expect(messageGeometry.maxWidth).toBeLessThanOrEqual(
    Math.min(messageGeometry.viewportWidth * 0.92 + 2, 642),
  );
  expect(messageGeometry.overflow).toBe(false);
  expect(messageGeometry.controlsOutside).toBe(false);
  expect(messageGeometry.visualTreatments).toBeGreaterThanOrEqual(2);
  expect(Date.now() - longHistoryStartedAt).toBeLessThan(15_000);
  if (capturesReferenceEvidence(testInfo)) {
    await expectNoBlockingA11y(page, 'ui-16-active-long-chat');
    await page.screenshot({
      path: testInfo.outputPath('ui-16-active-long-chat-actual.png'),
    });
  }
  const headerReactionTrigger = page.locator('.chat-header .chat-reaction-button:visible');
  await headerReactionTrigger.click();
  const headerReactionMenu = page.locator(
    'body > .chat-header-reaction-portal > .message-reaction-popover',
  );
  await expect(headerReactionMenu).toBeVisible();
  const headerReactionBounds = await headerReactionMenu.boundingBox();
  const headerReactionViewport = page.viewportSize();
  expect(headerReactionBounds).not.toBeNull();
  expect(headerReactionViewport).not.toBeNull();
  if (headerReactionBounds && headerReactionViewport) {
    expect(headerReactionBounds.x).toBeGreaterThanOrEqual(0);
    expect(headerReactionBounds.y).toBeGreaterThanOrEqual(0);
    expect(headerReactionBounds.x + headerReactionBounds.width).toBeLessThanOrEqual(
      headerReactionViewport.width,
    );
    expect(headerReactionBounds.y + headerReactionBounds.height).toBeLessThanOrEqual(
      headerReactionViewport.height,
    );
  }
  await headerReactionTrigger.click();
  await expect(headerReactionMenu).toBeHidden();
  const reactionTarget = page.locator('.message-bubble.is-character').last();
  const reactionTrigger = reactionTarget.getByRole('button', { name: 'Оценить' });
  await reactionTrigger.click();
  const reactionMenu = reactionTarget.getByRole('group', { name: 'Реакция на ответ' });
  await expect(reactionMenu).toBeVisible();
  if (capturesReferenceEvidence(testInfo)) {
    await expectNoBlockingA11y(page, 'ui-20-reaction-popover');
    await page.screenshot({
      path: testInfo.outputPath('ui-20-reaction-popover-actual.png'),
    });
  }
  await reactionMenu.getByRole('button', { name: 'Хороший ответ' }).click();
  await expect.poll(() => reactionRequests).toEqual(['PUT:POSITIVE']);
  await reactionTrigger.click();
  await expect(reactionTarget.getByRole('button', { name: 'Хороший ответ' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await reactionTarget.getByRole('button', { name: 'Хороший ответ' }).click();
  await expect.poll(() => reactionRequests).toEqual(['PUT:POSITIVE', 'DELETE:NONE']);
  await reactionTrigger.click();
  await reactionTarget.getByRole('button', { name: 'Исключительный ответ' }).click();
  await expect
    .poll(() => reactionRequests)
    .toEqual(['PUT:POSITIVE', 'DELETE:NONE', 'PUT:EXCEPTIONAL']);
  await reactionTrigger.click();
  await page.keyboard.press('Escape');
  await expect(reactionMenu).toBeHidden();
  const assistantActionTrigger = reactionTarget.getByRole('button', {
    name: 'Действия с сообщением',
  });
  await assistantActionTrigger.click();
  const assistantActionMenu = page.getByRole('menu', { name: 'Меню сообщения' });
  await expect(assistantActionMenu).toBeVisible();
  await expect(assistantActionMenu).not.toHaveAttribute('data-placement', 'measuring');
  const assistantMenuBounds = await assistantActionMenu.boundingBox();
  const messageMenuViewport = page.viewportSize();
  expect(assistantMenuBounds).not.toBeNull();
  expect(messageMenuViewport).not.toBeNull();
  if (assistantMenuBounds && messageMenuViewport) {
    expect(assistantMenuBounds.x).toBeGreaterThanOrEqual(0);
    expect(assistantMenuBounds.y).toBeGreaterThanOrEqual(0);
    expect(assistantMenuBounds.x + assistantMenuBounds.width).toBeLessThanOrEqual(
      messageMenuViewport.width,
    );
    expect(assistantMenuBounds.y + assistantMenuBounds.height).toBeLessThanOrEqual(
      messageMenuViewport.height,
    );
  }
  if (testInfo.project.name === 'desktop') {
    await expect(assistantActionMenu).toHaveAttribute('data-placement', /anchored-(above|below)/u);
  }
  for (const action of [
    'Копировать',
    'Редактировать',
    'Ответвить отсюда',
    'Перегенерировать',
    'Продолжить',
    'Оценить',
    'Сообщить о проблеме',
    'Удалить',
  ]) {
    await expect(assistantActionMenu.getByRole('menuitem', { name: action })).toBeVisible();
  }
  await expect(reactionTarget.getByRole('button', { name: 'Оценить' })).toBeVisible();
  if (capturesReferenceEvidence(testInfo)) {
    await expectNoBlockingA11y(page, 'ui-21-assistant-message-menu');
    await page.screenshot({
      path: testInfo.outputPath('ui-21-assistant-message-menu-actual.png'),
    });
  }
  await page.keyboard.press('Escape');
  await expect(assistantActionMenu).toBeHidden();
  const userActionTarget = page.locator('.message-bubble.is-user').last();
  await userActionTarget.getByRole('button', { name: 'Действия с сообщением' }).click();
  const userActionMenu = page.getByRole('menu', { name: 'Меню сообщения' });
  await expect(userActionMenu).toBeVisible();
  await expect(userActionMenu.getByRole('menuitem')).toHaveCount(4);
  for (const action of ['Копировать', 'Редактировать', 'Ответвить отсюда', 'Удалить']) {
    await expect(userActionMenu.getByRole('menuitem', { name: action })).toBeVisible();
  }
  for (const assistantOnlyAction of [
    'Перегенерировать',
    'Продолжить',
    'Оценить',
    'Сообщить о проблеме',
  ]) {
    await expect(userActionMenu.getByRole('menuitem', { name: assistantOnlyAction })).toHaveCount(
      0,
    );
  }
  if (capturesReferenceEvidence(testInfo)) {
    await expectNoBlockingA11y(page, 'ui-22-user-message-menu');
    await page.screenshot({
      path: testInfo.outputPath('ui-22-user-message-menu-actual.png'),
    });
  }
  await userActionMenu.getByRole('menuitem', { name: 'Удалить' }).click();
  const deleteUserMessageDialog = page.getByRole('dialog', {
    name: 'Удалить сообщение и продолжение ветки?',
  });
  await expect(deleteUserMessageDialog).toBeVisible();
  await deleteUserMessageDialog.getByRole('button', { name: 'Отмена' }).click({ force: true });
  await userActionTarget.getByRole('button', { name: 'Действия с сообщением' }).click();
  await page.getByRole('menuitem', { name: 'Редактировать' }).click();
  await expect(userActionTarget.getByLabel('Изменённый текст сообщения')).toBeVisible();
  await expect(
    userActionTarget.getByText('Изменение этого сообщения создаст новую ветку разговора.'),
  ).toBeVisible();
  await userActionTarget.getByRole('button', { name: 'Отмена' }).click();
  await userActionTarget.getByRole('button', { name: 'Действия с сообщением' }).click();
  await page.getByLabel('Реплика').click();
  await expect(userActionMenu).toBeHidden();
  const loadEarlier = page.getByRole('button', { name: 'Показать предыдущие сообщения · 420' });
  await expect(loadEarlier).toBeVisible();
  await loadEarlier.click();
  await expect(page.locator('.message-bubble')).toHaveCount(160);
  await expect(
    page.getByRole('button', {
      name: `Показать предыдущие сообщения · ${String(longHistoryMessageCount - 160)}`,
    }),
  ).toBeVisible();
  const longHistoryAssistant = page.locator('.message-bubble.is-character').last();
  await longHistoryAssistant.getByRole('button', { name: 'Действия с сообщением' }).click();
  await page.getByRole('menuitem', { name: 'Перегенерировать' }).click();
  await expect(page.locator('.message-bubble.is-character').last()).toContainText(
    'Архив отвечает эхом.',
  );
  const longHistoryRegeneration = page.locator('.message-bubble.is-character').last();
  await longHistoryRegeneration.getByRole('button', { name: 'Действия с сообщением' }).click();
  await page.getByRole('menuitem', { name: 'Редактировать' }).click();
  await longHistoryRegeneration
    .getByLabel('Изменённый текст сообщения')
    .fill('Архив отвечает после долгой истории.');
  await longHistoryRegeneration.getByRole('button', { name: 'Сохранить' }).click();
  await expect(longHistoryRegeneration.getByLabel('Изменённый текст сообщения')).toBeHidden();
  await expect(page.locator('.message-bubble.is-character').last()).toContainText(
    'Архив отвечает после долгой истории.',
  );
  await expect(page.locator('.message-bubble')).toHaveCount(160);
  await openStoryTool(page, /Память и суммаризация/u);
  await expect(page.getByLabel('Память разговора')).toHaveValue(
    /Обещание у маяка сохранено\.[\s\S]*Резюме последних событий\./u,
  );
  await page.keyboard.press('Escape');
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
  const catalogNavigation = page.getByRole('button', { name: /Главная/u });
  await catalogNavigation.focus();
  expect(
    await catalogNavigation.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).not.toBe('none');
  await catalogNavigation.click();
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
  await page.getByRole('button', { name: 'К модерации' }).click();
  await page.getByRole('button', { name: 'Система' }).click();
  await expect(page.getByRole('heading', { name: 'Состояние системы' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Системные показатели' })).toContainText(
    'Активны за 24 часа',
  );
  await expect(page.locator('.capacity-panel')).toHaveCount(0);
  await expect(page.getByText(/Cloudflare|Worker|D1|R2/u)).toHaveCount(0);
  await page.screenshot({ path: 'test-results/operations-current.png', fullPage: true });
  await page.getByRole('button', { name: 'К модерации' }).click();
  await expect(page.getByRole('heading', { name: 'Очередь модерации' })).toBeVisible();
  await openAppMenuSection(page, 'Настройки');
  await expect(page.getByText('Контент и безопасность')).toBeVisible();
  await expect(page.getByLabel('Безопасный поиск')).toBeChecked();
  await expect(page.getByLabel('Размывать обложки 18+')).toBeChecked();
  await page.getByRole('combobox', { name: /^Язык/u }).selectOption('en');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Chats/u })).toBeVisible();
  await expect(page.getByText('Settings saved.')).toBeVisible();

  const themeSelect = page.getByRole('combobox', { name: 'Theme', exact: true });
  await themeSelect.selectOption('light');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(
    await page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(242, 243, 244)');
  await page.screenshot({ path: testInfo.outputPath('theme-light-actual.png'), fullPage: true });

  await themeSelect.selectOption('amoled');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'amoled');
  expect(
    await page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(0, 0, 0)');
  await page.screenshot({ path: testInfo.outputPath('theme-amoled-actual.png'), fullPage: true });

  await themeSelect.selectOption('dark');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(
    await page.locator('html').evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(9, 10, 12)');
  await page.screenshot({ path: testInfo.outputPath('theme-dark-actual.png'), fullPage: true });
  await expectVisualSnapshot(page, 'settings');
  await page.getByRole('button', { name: /Chats/u }).click();
  await page.getByRole('button', { name: 'Back to chats' }).click();
  await expect(page.getByRole('heading', { name: 'Chats', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Лира · Алекс/u }).click();
  await expect(page.getByRole('button', { name: 'Back to chats' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Story tools' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to chats' }).click();
  await openAppMenuSection(page, 'Personas');
  await expect(page.getByRole('heading', { name: 'Personas', exact: true })).toBeVisible();
  const englishCreatedPersonaCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Странница', exact: true }) });
  await englishCreatedPersonaCard
    .getByRole('button', { name: 'Actions for character “Странница”' })
    .click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit persona' })).toBeVisible();
  await expect(page.getByLabel('Full description')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: /Characters/u }).click();
  await expect(page.getByRole('heading', { name: 'My creations', exact: true })).toBeVisible();
  const englishNightCharacter = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Ночная история' }) });
  await englishNightCharacter.getByRole('button', { name: /Actions for character/u }).click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Character editor' })).toBeVisible();
  await expect(
    page.getByLabel('Description (at least 20 characters)', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: /Lorebooks/u }).click();
  await expect(page.getByRole('heading', { name: 'My creations', exact: true })).toBeVisible();
  const englishWorldArchive = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Архив мира' }) });
  await englishWorldArchive.getByRole('button', { name: /Actions for lorebook/u }).click();
  await page.getByRole('menuitem', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lorebook settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Attached characters' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Entries' })).toBeVisible();
  await expectVisualSnapshot(page, 'lorebook');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('.brand-button').click();
  await expect(page.getByRole('button', { name: 'Edit profile' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit profile' }).click();
  await expect(page.getByRole('heading', { name: 'Edit profile' })).toBeVisible();
  await expect(page.getByLabel('Display name')).toHaveValue('Алиса Велора');
  await expect(page.getByLabel('About')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'by Velora' }).click();
  await expect(page.getByRole('heading', { name: 'Published characters' })).toBeVisible();
  await page.getByRole('button', { name: 'Report' }).click();
  await expect(page.getByLabel('Report reason')).toBeVisible();
  await expect(page.getByLabel('Report description')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Back to Discover' }).click();
  await page.getByRole('button', { name: /Home/u }).click();
  await expect(page.getByRole('heading', { name: 'Find your story' })).toBeVisible();
  await openAppMenuSection(page, 'Premium and Pro plans');
  await expect(
    page.getByRole('heading', { name: 'Premium and Pro', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('No card, subscription, or automatic top-up')).toBeVisible();
  await openAppMenuSection(page, 'Settings');
  await expect(page.getByRole('region', { name: 'Support' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Terms and privacy' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Account management' })).toBeVisible();
  await expect(page.getByText('Chats: 1')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Blocked users' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Delete account', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Request account deletion' }).click();
  const englishDeletionDialog = page.getByRole('alertdialog', { name: 'Delete account?' });
  await expect(englishDeletionDialog).toBeVisible();
  await expect(englishDeletionDialog.getByLabel('Confirmation')).toBeVisible();
  await englishDeletionDialog.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('combobox', { name: /^Language/u }).selectOption('ru');
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
  assertPageDiagnostics();
});

test('authenticated shell and Telegram host events load heavy workspaces safely', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const loadedScripts = new Set<string>();
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.endsWith('.js')) loadedScripts.add(url.pathname);
  });
  await page.route('https://telegram.org/js/telegram-web-app.js?63', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        (() => {
          const handlers = new Map();
          const backHandlers = new Set();
          const emit = (type, event) => {
            for (const handler of handlers.get(type) ?? []) handler(event);
          };
          const backButton = {
            isVisible: false,
            show() { this.isVisible = true; return this; },
            hide() { this.isVisible = false; return this; },
            onClick(handler) { backHandlers.add(handler); return this; },
            offClick(handler) { backHandlers.delete(handler); return this; },
          };
          const app = {
            initData: 'signed-init-data',
            colorScheme: 'dark',
            isActive: true,
            viewportHeight: 720,
            viewportStableHeight: 700,
            safeAreaInset: { top: 11, right: 3, bottom: 17, left: 3 },
            contentSafeAreaInset: { top: 7, right: 2, bottom: 13, left: 2 },
            BackButton: backButton,
            ready() {},
            expand() { window.__veloraExpandCalls = (window.__veloraExpandCalls ?? 0) + 1; },
            setHeaderColor() {},
            setBackgroundColor() {},
            openInvoice() {},
            onEvent(type, handler) {
              const current = handlers.get(type) ?? new Set();
              current.add(handler);
              handlers.set(type, current);
            },
            offEvent(type, handler) { handlers.get(type)?.delete(handler); },
          };
          window.Telegram = { WebApp: app };
          window.__veloraTelegramHost = {
            setViewport(height, stableHeight, stable) {
              app.viewportHeight = height;
              app.viewportStableHeight = stableHeight;
              emit('viewportChanged', { isStateStable: stable });
            },
            setViewportSilently(height, stableHeight) {
              app.viewportHeight = height;
              app.viewportStableHeight = stableHeight;
            },
            setInsets(device, content) {
              app.safeAreaInset = device;
              app.contentSafeAreaInset = content;
              emit('safeAreaChanged');
              emit('contentSafeAreaChanged');
            },
            setTheme(theme) { app.colorScheme = theme; emit('themeChanged'); },
            setActive(active) {
              app.isActive = active;
              emit(active ? 'activated' : 'deactivated');
            },
            clickBack() { for (const handler of backHandlers) handler(); },
            backVisible() { return backButton.isVisible; },
          };
        })();
      `,
    }),
  );
  await page.route('**/health', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }),
  );
  await page.route('**/api/v1/auth/telegram', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ csrfToken: 'csrf-token' }),
    }),
  );
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'bundle-user',
        username: null,
        displayName: 'Bundle user',
        avatarFileId: null,
        locale: 'en',
        role: 'USER',
        moderationState: 'ACTIVE',
        ageGateAccepted: true,
        creditBalanceMicros: 0,
        onboardingCompleted: true,
        plan: 'FREE',
        planDisplayName: 'Free',
        planAccessUntil: null,
        planEntitlements: {
          rateLimitMultiplier: 1,
          characterLimit: 3,
          personaLimit: 1,
          memoryTokenBudget: 1000,
          loreTokenBudget: 500,
          advancedOperationsDaily: 1,
          modelProfiles: ['BALANCED'],
        },
      }),
    }),
  );
  await page.route('**/api/v1/feature-flags/public', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ flags: { public_reviews: false } }),
    }),
  );
  await page.route('**/api/v1/feature-flags', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ flags: { public_reviews: false } }),
    }),
  );
  await page.route('**/api/v1/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"environment":"test","appName":"Velora","telegramBotUsername":"aivel0ra_bot"}',
    }),
  );
  await page.route('**/api/v1/discovery**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const items =
      pathname === '/api/v1/discovery'
        ? Array.from({ length: 6 }, (_, index) => ({
            id: `responsive-character-${String(index + 1)}`,
            avatarFileId: null,
            contentRating: 'SAFE',
            language: 'en',
            updatedAt: index + 1,
            name: `Story ${String(index + 1)}`,
            tagline: 'A readable responsive character card',
            description: 'A bounded character description for responsive layout verification.',
            firstMessage: 'The story begins here.',
            alternateGreetings: [],
            creatorId: 'bundle-user',
            creatorName: 'Bundle user',
            likeCount: index,
            bookmarkCount: 0,
            reviewCount: 0,
            averageRating: null,
            liked: false,
            bookmarked: false,
            myRating: null,
            myReviewText: null,
            tags: ['story'],
          }))
        : [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items,
        totalCount: items.length,
        nextCursor: null,
        contentPreferences: { safeSearch: true, matureImageBlur: true },
      }),
    });
  });
  await page.route('**/api/v1/settings', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"theme":"dark","locale":"en","defaultPersonaId":null,"generationProfile":"BALANCED","nsfwVisible":false,"safeSearch":true,"matureImageBlur":true,"preferences":{}}',
    }),
  );
  await page.route('**/api/v1/personas', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' }),
  );
  await page.route('**/api/v1/notifications**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"items":[],"unreadCount":0,"nextCursor":null}',
    }),
  );
  await page.route('**/api/v1/conversations**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const summary = {
      id: 'host-conversation',
      characterId: 'host-character',
      personaId: null,
      title: 'Lighthouse story',
      activeMessageId: 'host-message',
      state: 'ACTIVE',
      isPreview: false,
      memoryStale: false,
      characterName: 'Lira',
      characterAvatarFileId: null,
      personaName: null,
      lastMessage: 'The lighthouse remembers.',
      messageCount: 1,
      createdAt: 1,
      updatedAt: 2,
    };
    let body: Readonly<Record<string, unknown>>;
    if (pathname === '/api/v1/conversations/models/catalog') {
      body = { selectedProviderCatalogCheckedAt: 1, items: [] };
    } else if (pathname === '/api/v1/conversations/host-conversation/messages') {
      body = {
        activeMessageId: 'host-message',
        items: [
          {
            id: 'host-message',
            conversationId: 'host-conversation',
            role: 'ASSISTANT',
            content: 'The lighthouse remembers.',
            status: 'COMPLETED',
            parentMessageId: null,
            generationGroupId: null,
            generationId: null,
            reaction: null,
            model: 'l3-lunaris-8b',
            provider: 'BotHub',
            metadata: {},
            createdAt: 2,
            editedAt: null,
            variantIndex: 0,
            variantCount: 1,
            variantIds: ['host-message'],
          },
        ],
      };
    } else if (pathname === '/api/v1/conversations/host-conversation/character') {
      body = {
        id: 'host-character',
        avatarFileId: null,
        avatarFocalX: 50,
        avatarFocalY: 50,
        contentRating: 'SAFE',
        language: 'en',
        groupSize: 'SOLO',
        visibility: 'PUBLIC',
        publishState: 'PUBLISHED',
        updatedAt: 2,
        name: 'Lira',
        tagline: 'Keeper of the lighthouse',
        description: 'Lira has tended the lighthouse for thirty winters.',
        personality: 'Patient, watchful, dry humour.',
        firstMessage: 'The lighthouse remembers.',
        alternateGreetings: [],
        creatorId: 'host-user',
        creatorName: 'Host',
        creatorRole: 'USER',
        avatarBotUsername: null,
        likeCount: 12,
        bookmarkCount: 3,
        reviewCount: 0,
        averageRating: null,
        liked: false,
        bookmarked: false,
        tags: ['Drama'],
        isOwner: true,
        interactable: true,
        estimatedTokens: 42,
      };
    } else if (pathname === '/api/v1/conversations/host-conversation') {
      body = {
        ...summary,
        character: {
          name: 'Lira',
          tagline: 'Keeper of the lighthouse',
          avatarFileId: null,
          contentRating: 'SAFE',
        },
        settings: {
          modelProfile: 'BALANCED',
          modelProfileId: 'velora-balanced',
          temperature: 0.8,
          maxOutputTokens: 800,
          responseLength: 'MEDIUM',
          customInstructions: '',
          personaMode: 'SNAPSHOT',
        },
        promptInspectorAvailable: false,
      };
    } else {
      body = { items: [summary], totalCount: 1 };
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: /Chats/u })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as Window & { __veloraExpandCalls?: number }).__veloraExpandCalls,
    ),
  ).toBe(1);
  const rootVariable = (name: string) =>
    page.evaluate((property) => {
      return getComputedStyle(document.documentElement).getPropertyValue(property).trim();
    }, name);
  expect(await rootVariable('--velora-viewport-height')).toBe('720px');
  expect(await rootVariable('--velora-viewport-stable-height')).toBe('700px');
  expect(await rootVariable('--velora-safe-area-bottom')).toBe('17px');
  expect(await rootVariable('--velora-content-safe-area-bottom')).toBe('13px');
  await page.evaluate(() => {
    const host = (
      window as unknown as Window & {
        __veloraTelegramHost: {
          setViewport: (height: number, stableHeight: number, stable: boolean) => void;
          setViewportSilently: (height: number, stableHeight: number) => void;
          setInsets: (
            device: { top: number; right: number; bottom: number; left: number },
            content: { top: number; right: number; bottom: number; left: number },
          ) => void;
          setTheme: (theme: 'light' | 'dark') => void;
          setActive: (active: boolean) => void;
        };
      }
    ).__veloraTelegramHost;
    host.setViewport(640, 612, false);
    host.setInsets(
      { top: 19, right: 5, bottom: 23, left: 5 },
      { top: 9, right: 4, bottom: 15, left: 4 },
    );
    host.setTheme('light');
    host.setActive(false);
    host.setViewportSilently(632, 604);
    window.dispatchEvent(new Event('orientationchange'));
  });
  await expect.poll(() => rootVariable('--velora-viewport-height')).toBe('632px');
  await expect.poll(() => rootVariable('--velora-viewport-stable-height')).toBe('604px');
  await expect.poll(() => rootVariable('--velora-safe-area-bottom')).toBe('23px');
  await expect.poll(() => rootVariable('--velora-content-safe-area-bottom')).toBe('15px');
  await expect(page.locator('html')).toHaveAttribute('data-telegram-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-telegram-active', 'false');
  await page.evaluate(() => {
    const host = (
      window as unknown as Window & {
        __veloraTelegramHost: {
          setTheme: (theme: 'light' | 'dark') => void;
          setActive: (active: boolean) => void;
        };
      }
    ).__veloraTelegramHost;
    host.setTheme('dark');
    host.setActive(true);
  });
  await expect(page.locator('html')).toHaveAttribute('data-telegram-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-telegram-active', 'true');

  const originalViewport = page.viewportSize();
  if (!originalViewport) throw new Error('Expected a browser viewport for responsive checks');
  const responsiveCases = [
    { width: 320, height: 568, columns: 1, drawer: 262, filter: 218 },
    { width: 360, height: 640, columns: 2, drawer: 295, filter: 245 },
    { width: 375, height: 667, columns: 2, drawer: 308, filter: 255 },
    { width: 390, height: 844, columns: 2, drawer: 320, filter: 265 },
    { width: 412, height: 915, columns: 2, drawer: 320, filter: 280 },
    { width: 430, height: 932, columns: 2, drawer: 320, filter: 292 },
    { width: 471, height: 630, columns: 2, drawer: 320, filter: 320 },
    { width: 768, height: 1024, columns: 3, drawer: 320, filter: 400 },
    { width: 1024, height: 768, columns: 4, drawer: 320, filter: 420 },
    { width: 1280, height: 800, columns: 5, drawer: 320, filter: 420 },
    { width: 1440, height: 900, columns: 5, drawer: 320, filter: 420 },
    { width: 1920, height: 1080, columns: 6, drawer: 320, filter: 420 },
  ] as const;
  await expect(page.locator('.story-card')).toHaveCount(6);
  for (const responsiveCase of responsiveCases) {
    await page.setViewportSize({ width: responsiveCase.width, height: responsiveCase.height });
    await page.evaluate(({ height }) => {
      (
        window as unknown as Window & {
          __veloraTelegramHost: {
            setViewport: (height: number, stableHeight: number, stable: boolean) => void;
          };
        }
      ).__veloraTelegramHost.setViewport(height, height, true);
    }, responsiveCase);
    await expect
      .poll(() =>
        page.locator('.card-grid').evaluate((element) => {
          return getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length;
        }),
      )
      .toBe(responsiveCase.columns);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await page.getByRole('button', { name: 'Open menu' }).click();
    const responsiveDrawer = page.getByRole('dialog', { name: 'Velora menu' });
    await expect(responsiveDrawer).toBeVisible();
    const drawerWidth = await responsiveDrawer.evaluate((element) =>
      Math.round(element.getBoundingClientRect().width),
    );
    expect(Math.abs(drawerWidth - responsiveCase.drawer)).toBeLessThanOrEqual(2);
    await page.evaluate(() => {
      (
        window as unknown as Window & { __veloraTelegramHost: { clickBack: () => void } }
      ).__veloraTelegramHost.clickBack();
    });
    await expect(responsiveDrawer).toBeHidden();

    await page.getByRole('button', { name: /^Filters/u }).click();
    const responsiveFilter = page.getByRole('dialog', { name: 'Filters' });
    await expect(responsiveFilter).toBeVisible();
    await responsiveFilter.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map(async (animation) => animation.finished));
    });
    const filterGeometry = await responsiveFilter.evaluate((element) => {
      const rectangle = element.getBoundingClientRect();
      return {
        width: Math.round(rectangle.width),
        rightGap: Math.round(window.innerWidth - rectangle.right),
      };
    });
    expect(Math.abs(filterGeometry.width - responsiveCase.filter)).toBeLessThanOrEqual(2);
    if (responsiveCase.width >= 768) {
      const expectedGap = responsiveCase.width >= 1440 ? 20 : 16;
      expect(Math.abs(filterGeometry.rightGap - expectedGap)).toBeLessThanOrEqual(2);
    }
    await page.getByRole('button', { name: 'Close filters' }).click();
    await expect(responsiveFilter).toBeHidden();

    if (
      testInfo.project.name === 'iphone' &&
      [320, 390, 768, 1280, 1920].includes(responsiveCase.width)
    ) {
      await page.screenshot({
        path: testInfo.outputPath(`responsive-${String(responsiveCase.width)}-actual.png`),
        fullPage: true,
      });
    }
  }
  await page.setViewportSize(originalViewport);
  await page.evaluate(() => {
    (
      window as unknown as Window & {
        __veloraTelegramHost: {
          setViewport: (height: number, stableHeight: number, stable: boolean) => void;
        };
      }
    ).__veloraTelegramHost.setViewport(632, 604, true);
  });

  await page.getByRole('button', { name: 'Open menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Velora menu' });
  await expect(drawer).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        return (
          window as unknown as Window & { __veloraTelegramHost: { backVisible: () => boolean } }
        ).__veloraTelegramHost.backVisible();
      }),
    )
    .toBe(true);
  await page.evaluate(() => {
    (
      window as unknown as Window & { __veloraTelegramHost: { clickBack: () => void } }
    ).__veloraTelegramHost.clickBack();
  });
  await expect(drawer).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => {
        return (
          window as unknown as Window & { __veloraTelegramHost: { backVisible: () => boolean } }
        ).__veloraTelegramHost.backVisible();
      }),
    )
    .toBe(false);
  await page.screenshot({ path: testInfo.outputPath('telegram-host-shell-actual.png') });
  expect([...loadedScripts].some((file) => file.includes('AuthenticatedApp-'))).toBe(true);
  expect([...loadedScripts].some((file) => file.includes('ChatsView-'))).toBe(false);

  await page.getByRole('button', { name: /Chats/u }).click();
  await expect(page.getByRole('heading', { name: 'Chats', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Lighthouse story/u }).click();
  const activeMessage = page.locator('.message-list').getByText('The lighthouse remembers.');
  await expect(activeMessage).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to chats' })).toHaveCount(0);
  const chatResponsiveCases = [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 471, height: 630 },
    { width: 768, height: 1024 },
  ] as const;
  for (const responsiveCase of chatResponsiveCases) {
    await page.setViewportSize(responsiveCase);
    await page.evaluate(({ height }) => {
      (
        window as unknown as Window & {
          __veloraTelegramHost: {
            setViewport: (height: number, stableHeight: number, stable: boolean) => void;
          };
        }
      ).__veloraTelegramHost.setViewport(height, height, true);
    }, responsiveCase);
    const geometry = await page.locator('.chat-view').evaluate((chat) => {
      const header = chat.querySelector<HTMLElement>('.chat-header');
      const list = chat.querySelector<HTMLElement>('.message-list');
      const nav = document.querySelector<HTMLElement>('.bottom-nav');
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        chatBottom: chat.getBoundingClientRect().bottom,
        headerLeft: header?.getBoundingClientRect().left ?? -1,
        headerRight: header?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
        listHeight: list?.getBoundingClientRect().height ?? 0,
        listOverflow: list ? getComputedStyle(list).overflowY : '',
        navTop: nav?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
      };
    });
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.headerLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.headerRight).toBeLessThanOrEqual(responsiveCase.width + 1);
    expect(geometry.listHeight).toBeGreaterThan(0);
    expect(geometry.listOverflow).toBe('auto');
    expect(geometry.chatBottom).toBeLessThanOrEqual(geometry.navTop + 1);
  }
  await page.setViewportSize(originalViewport);
  await page.evaluate(() => {
    (
      window as unknown as Window & {
        __veloraTelegramHost: {
          setViewport: (height: number, stableHeight: number, stable: boolean) => void;
        };
      }
    ).__veloraTelegramHost.setViewport(632, 604, true);
  });
  await page.getByRole('button', { name: 'Story tools' }).click();
  const menuGeometry = await page.locator('.chat-menu').evaluate((menu) => {
    const rows = [...menu.querySelectorAll<HTMLElement>('.chat-menu-row')];
    const heights = rows.map((row) => Math.round(row.getBoundingClientRect().height));
    const widths = rows.map((row) => Math.round(row.getBoundingClientRect().width));
    const scroll = menu.querySelector<HTMLElement>('.chat-menu-scroll');
    return {
      rowCount: rows.length,
      uniqueHeights: [...new Set(heights)].length,
      uniqueWidths: [...new Set(widths)].length,
      minHeight: Math.min(...heights),
      groupCount: menu.querySelectorAll('.chat-menu-group').length,
      menuRight: Math.round(menu.getBoundingClientRect().right),
      overflowY: scroll ? getComputedStyle(scroll).overflowY : '',
    };
  });
  expect(menuGeometry.rowCount).toBeGreaterThanOrEqual(5);
  expect(menuGeometry.uniqueHeights).toBe(1);
  expect(menuGeometry.uniqueWidths).toBe(1);
  expect(menuGeometry.minHeight).toBeGreaterThanOrEqual(44);
  expect(menuGeometry.groupCount).toBe(4);
  expect(menuGeometry.menuRight).toBeLessThanOrEqual(originalViewport.width);
  expect(menuGeometry.overflowY).toBe('auto');
  await page
    .locator('.chat-menu')
    .screenshot({ path: testInfo.outputPath('chat-story-menu-actual.png') });
  await page.getByRole('button', { name: 'Character profile Lira' }).click();
  await expect(page.locator('.character-profile-name')).toHaveText('Lira');
  await expect(page.locator('.character-profile-section').first()).toBeVisible();
  await page
    .locator('.character-profile')
    .screenshot({ path: testInfo.outputPath('chat-character-profile-actual.png') });
  await page.getByRole('button', { name: 'Close profile' }).click();
  await expect(page.locator('.character-profile')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open character profile' }).click();
  await expect(page.locator('.character-profile-name')).toHaveText('Lira');
  await page.getByRole('button', { name: 'Close profile' }).click();
  if (testInfo.project.name === 'desktop') {
    const conversationPane = page.getByRole('complementary', { name: 'Chats' });
    await expect(conversationPane).toBeVisible();
    await expect(
      conversationPane.getByRole('button', { name: /Lighthouse story/u }),
    ).toHaveAttribute('aria-current', 'page');
    const workspaceGeometry = await page
      .locator('.desktop-chat-workspace')
      .evaluate((workspace) => {
        const pane = workspace.querySelector<HTMLElement>('.desktop-conversation-pane');
        const chat = workspace.querySelector<HTMLElement>('.chat-view');
        const columns = getComputedStyle(workspace).gridTemplateColumns.split(' ').filter(Boolean);
        return {
          columns: columns.length,
          paneWidth: pane?.getBoundingClientRect().width ?? 0,
          chatWidth: chat?.getBoundingClientRect().width ?? 0,
        };
      });
    expect(workspaceGeometry.columns).toBe(2);
    expect(workspaceGeometry.paneWidth).toBeGreaterThanOrEqual(260);
    expect(workspaceGeometry.paneWidth).toBeLessThanOrEqual(301);
    expect(workspaceGeometry.chatWidth).toBeGreaterThan(0);
    expect(workspaceGeometry.chatWidth).toBeLessThanOrEqual(901);

    await page.getByRole('button', { name: 'Story tools' }).click();
    await page.getByRole('button', { name: /Generation settings/u }).click();
    const inspector = page.getByRole('region', { name: 'Story inspector' });
    await expect(inspector).toBeVisible();
    const inspectorGeometry = await inspector.evaluate((element) => {
      const rectangle = element.getBoundingClientRect();
      const chat = element.closest('.chat-view')?.getBoundingClientRect();
      return {
        width: rectangle.width,
        rightGap: chat ? Math.abs(chat.right - rectangle.right) : Number.POSITIVE_INFINITY,
      };
    });
    expect(inspectorGeometry.width).toBeGreaterThanOrEqual(260);
    expect(inspectorGeometry.width).toBeLessThanOrEqual(321);
    expect(inspectorGeometry.rightGap).toBeLessThanOrEqual(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expectNoBlockingA11y(page, 'desktop-split-chat');
    await page.screenshot({ path: testInfo.outputPath('desktop-split-chat-actual.png') });
    await page.getByRole('button', { name: 'Collapse inspector' }).click();
    await expect(inspector).toBeHidden();
  }
  const composer = page.getByRole('textbox', { name: 'Message' });
  await composer.fill('Draft survives the keyboard.');
  const expandedViewport = page.viewportSize();
  if (!expandedViewport) throw new Error('Expected an emulated mobile viewport');
  await page.setViewportSize({ width: expandedViewport.width, height: 470 });
  await page.evaluate(() => {
    (
      window as unknown as Window & {
        __veloraTelegramHost: {
          setViewport: (height: number, stableHeight: number, stable: boolean) => void;
        };
      }
    ).__veloraTelegramHost.setViewport(470, 604, false);
  });
  await expect.poll(() => rootVariable('--velora-viewport-height')).toBe('470px');
  await expect(page.locator('html')).toHaveAttribute('data-telegram-keyboard', 'open');
  await expect(composer).toHaveValue('Draft survives the keyboard.');
  await expect(composer).toBeVisible();
  await expect(activeMessage).toBeVisible();
  const chatGeometry = await page.locator('.chat-view').evaluate((chat) => {
    const messageList = chat.querySelector<HTMLElement>('.message-list');
    const input = chat.querySelector<HTMLElement>('.chat-composer');
    const renderedMessages = messageList?.querySelectorAll<HTMLElement>('.message-bubble');
    const lastMessage = renderedMessages
      ? renderedMessages.item(renderedMessages.length - 1)
      : null;
    return {
      chatHeight: chat.getBoundingClientRect().height,
      chatOverflow: getComputedStyle(chat).overflowY,
      listOverflow: messageList ? getComputedStyle(messageList).overflowY : '',
      composerBottom: input?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
      chatBottom: chat.getBoundingClientRect().bottom,
      listTop: messageList?.getBoundingClientRect().top ?? Number.NEGATIVE_INFINITY,
      listBottom: messageList?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
      messageTop: lastMessage?.getBoundingClientRect().top ?? Number.NEGATIVE_INFINITY,
      messageBottom: lastMessage?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
      documentHeight: document.documentElement.scrollHeight,
    };
  });
  expect(chatGeometry.chatHeight).toBeGreaterThanOrEqual(468);
  expect(chatGeometry.chatHeight).toBeLessThanOrEqual(472);
  expect(chatGeometry.chatOverflow).toBe('hidden');
  expect(chatGeometry.listOverflow).toBe('auto');
  expect(chatGeometry.composerBottom).toBeLessThanOrEqual(chatGeometry.chatBottom + 1);
  expect(chatGeometry.composerBottom).toBeLessThanOrEqual(471);
  expect(chatGeometry.messageTop).toBeGreaterThanOrEqual(chatGeometry.listTop - 1);
  expect(chatGeometry.messageBottom).toBeLessThanOrEqual(chatGeometry.listBottom + 1);
  expect(chatGeometry.documentHeight).toBeLessThanOrEqual(471);
  await page.screenshot({ path: testInfo.outputPath('telegram-keyboard-chat-actual.png') });
  await composer.blur();
  await page.setViewportSize(expandedViewport);
  await page.evaluate(() => {
    (
      window as unknown as Window & {
        __veloraTelegramHost: {
          setViewport: (height: number, stableHeight: number, stable: boolean) => void;
        };
      }
    ).__veloraTelegramHost.setViewport(632, 604, true);
  });
  await expect(page.locator('html')).toHaveAttribute('data-telegram-keyboard', 'closed');
  await page.evaluate(() => {
    (
      window as unknown as Window & { __veloraTelegramHost: { clickBack: () => void } }
    ).__veloraTelegramHost.clickBack();
  });
  await expect(page.getByRole('heading', { name: 'Chats', exact: true })).toBeVisible();
  expect([...loadedScripts].some((file) => file.includes('ChatsView-'))).toBe(true);
});

test('@a11y discovery language and group-size filters support Unicode, CJK and RTL', async ({
  page,
}, testInfo) => {
  const discoveryQueries: URLSearchParams[] = [];
  const languages = [
    { code: 'ru', nativeName: 'Русский', direction: 'ltr', usageCount: 80 },
    { code: 'zh', nativeName: '中文', direction: 'ltr', usageCount: 72 },
    { code: 'ja', nativeName: '日本語', direction: 'ltr', usageCount: 68 },
    { code: 'ko', nativeName: '한국어', direction: 'ltr', usageCount: 63 },
    { code: 'ar', nativeName: 'العربية', direction: 'rtl', usageCount: 58 },
    { code: 'en', nativeName: 'English', direction: 'ltr', usageCount: 55 },
    { code: 'de', nativeName: 'Deutsch', direction: 'ltr', usageCount: 47 },
    { code: 'fr', nativeName: 'Français', direction: 'ltr', usageCount: 42 },
    { code: 'es', nativeName: 'Español', direction: 'ltr', usageCount: 38 },
    { code: 'hi', nativeName: 'हिन्दी', direction: 'ltr', usageCount: 33 },
    { code: 'pl', nativeName: 'Polski', direction: 'ltr', usageCount: 28 },
    { code: 'pt', nativeName: 'Português', direction: 'ltr', usageCount: 23 },
    { code: 'it', nativeName: 'Italiano', direction: 'ltr', usageCount: 18 },
    { code: 'tr', nativeName: 'Türkçe', direction: 'ltr', usageCount: 13 },
    { code: 'other', nativeName: 'Другой', direction: 'ltr', usageCount: 5 },
  ];
  const groupSizes = [
    { code: 'single', minimumParticipants: 1, maximumParticipants: 1, usageCount: 81 },
    { code: 'small', minimumParticipants: 2, maximumParticipants: 4, usageCount: 24 },
    { code: 'medium', minimumParticipants: 5, maximumParticipants: 7, usageCount: 9 },
    { code: 'large', minimumParticipants: 8, maximumParticipants: null, usageCount: 3 },
  ];
  await page.route('https://telegram.org/js/telegram-web-app.js?63', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.Telegram={WebApp:{initData:'signed-init-data',colorScheme:'dark',ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){}}};`,
    }),
  );
  await page.route('**/health', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }),
  );
  await page.route('**/api/v1/auth/telegram', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ csrfToken: 'csrf-token' }),
    }),
  );
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'language-user',
        username: null,
        displayName: 'Языковой тест',
        avatarFileId: null,
        locale: 'ru',
        role: 'USER',
        moderationState: 'ACTIVE',
        ageGateAccepted: true,
        creditBalanceMicros: 0,
        onboardingCompleted: true,
        plan: 'FREE',
        planDisplayName: 'Free',
        planAccessUntil: null,
        planEntitlements: {
          rateLimitMultiplier: 1,
          characterLimit: 3,
          personaLimit: 1,
          memoryTokenBudget: 1000,
          loreTokenBudget: 500,
          advancedOperationsDaily: 1,
          modelProfiles: ['BALANCED'],
        },
      }),
    }),
  );
  await page.route('**/api/v1/feature-flags/public', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ flags: { public_reviews: false, groups: true } }),
    }),
  );
  await page.route('**/api/v1/feature-flags', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ flags: { public_reviews: false, groups: true } }),
    }),
  );
  await page.route('**/api/v1/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"environment":"test","appName":"Velora","telegramBotUsername":"aivel0ra_bot"}',
    }),
  );
  await page.route('**/api/v1/notifications**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"items":[],"unreadCount":0}',
    }),
  );
  await page.route('**/api/v1/discovery**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/discovery/languages/catalog') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: languages }),
      });
      return;
    }
    if (url.pathname === '/api/v1/discovery/group-sizes/catalog') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true, items: groupSizes }),
      });
      return;
    }
    if (url.pathname === '/api/v1/discovery/tags/catalog') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
      return;
    }
    discoveryQueries.push(new URLSearchParams(url.search));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [],
        totalCount: 0,
        nextCursor: null,
        contentPreferences: { safeSearch: true, matureImageBlur: true },
      }),
    });
  });
  await page.route('**/api/v1/settings', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"theme":"dark","locale":"ru","defaultPersonaId":null,"generationProfile":"BALANCED","nsfwVisible":false,"safeSearch":true,"matureImageBlur":true,"preferences":{}}',
    }),
  );
  await page.route('**/api/v1/personas', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
  await page.getByRole('button', { name: 'Языки · 0' }).click();
  const languageList = page.getByRole('list', { name: 'Язык' });
  for (const language of languages) {
    await expect(languageList.getByText(language.nativeName, { exact: true })).toHaveCount(1);
  }
  const languageSearch = page.getByRole('searchbox', { name: 'Язык' });
  await languageSearch.fill('日本');
  await expect(languageList.getByRole('listitem')).toHaveCount(1);
  await expect(languageList.getByText('日本語', { exact: true })).toBeVisible();
  await languageSearch.fill('');
  await languageList.evaluate((element) => {
    element.scrollTop = Math.round(element.scrollHeight * 0.5);
  });
  await page.getByRole('checkbox', { name: 'Выбрать язык «العربية»' }).click();
  await expect(languageList.getByText('العربية', { exact: true })).toHaveAttribute('dir', 'rtl');
  await expectNoBlockingA11y(page, 'ui-36-language-filter');
  if (capturesReferenceEvidence(testInfo)) {
    await page.screenshot({ path: testInfo.outputPath('ui-36-language-filter-actual.png') });
  }
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByRole('button', { name: 'Фильтры · 1' })).toBeVisible();
  await expect.poll(() => discoveryQueries.at(-1)?.get('languages')).toBe('ar');
  await page.getByRole('button', { name: 'Фильтры · 1' }).click();
  await page
    .getByRole('dialog', { name: 'Фильтры поиска' })
    .getByRole('button', { name: 'Сбросить' })
    .click();
  await expect(page.getByRole('button', { name: 'Языки · 0' })).toBeVisible();
  await page.getByRole('button', { name: 'Языки · 0' }).click();
  const smallGroup = page.getByRole('checkbox', {
    name: 'Выбрать размер «Малая группа (2–4)»',
  });
  await expect(smallGroup).toBeVisible();
  await smallGroup.click();
  await expect(smallGroup).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Выбрано: 1', { exact: true })).toHaveCount(1);
  await page.locator('.language-filter-section').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expectNoBlockingA11y(page, 'ui-37-group-size-filter');
  if (capturesReferenceEvidence(testInfo)) {
    await page.screenshot({ path: testInfo.outputPath('ui-37-group-size-filter-actual.png') });
  }
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByRole('button', { name: 'Фильтры · 1' })).toBeVisible();
  await expect.poll(() => discoveryQueries.at(-1)?.get('groupSizes')).toBe('small');
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});

test('owner manages moderator appointments without exposing the control to staff', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  let staff: readonly Record<string, unknown>[] = [];
  let smokeRun: Readonly<Record<string, unknown>> | null = null;
  let modelEvalRun: Readonly<Record<string, unknown>> | null = null;
  let defaultRoleplayModelId = 'velora-balanced';
  let roleplayModels: {
    modelProfileId: string;
    displayName: string;
    descriptionRu: string;
    tier: 'free' | 'standard' | 'premium';
    enabled: boolean;
    fallbackIds: string[];
    updatedAt: number | null;
    updatedBy: string | null;
    health: {
      windowHours: number;
      requestCount: number;
      successRatePercent: number | null;
      failureRatePercent: number | null;
      averageLatencyMs: number | null;
      averageTtftMs: number | null;
      recentErrors: { errorCode: string; completedAt: number | null }[];
    };
  }[] = [
    {
      modelProfileId: 'velora-balanced',
      displayName: 'Velora Balanced',
      descriptionRu: 'Stable long-form roleplay model.',
      tier: 'standard',
      enabled: true,
      fallbackIds: [] as string[],
      updatedAt: null,
      updatedBy: null,
      health: {
        windowHours: 24,
        requestCount: 12,
        successRatePercent: 91.7,
        failureRatePercent: 8.3,
        averageLatencyMs: 1800,
        averageTtftMs: 420,
        recentErrors: [{ errorCode: 'BOTHUB_TIMEOUT', completedAt: 1 }],
      },
    },
    {
      modelProfileId: 'velora-free-roleplay',
      displayName: 'Lunaris Roleplay',
      descriptionRu: 'Economical roleplay preview.',
      tier: 'free',
      enabled: true,
      fallbackIds: [] as string[],
      updatedAt: null,
      updatedBy: null,
      health: {
        windowHours: 24,
        requestCount: 3,
        successRatePercent: 100,
        failureRatePercent: 0,
        averageLatencyMs: 730,
        averageTtftMs: 190,
        recentErrors: [],
      },
    },
    {
      modelProfileId: 'velora-free-context',
      displayName: 'Velora Nano',
      descriptionRu: 'Economical long-context preview.',
      tier: 'free',
      enabled: true,
      fallbackIds: ['velora-free-roleplay'],
      updatedAt: null,
      updatedBy: null,
      health: {
        windowHours: 24,
        requestCount: 0,
        successRatePercent: null,
        failureRatePercent: null,
        averageLatencyMs: null,
        averageTtftMs: null,
        recentErrors: [],
      },
    },
  ];
  let userGrants: readonly Record<string, unknown>[] = [];
  let avatarReviewOpen = true;
  let ownerPayments: readonly Record<string, unknown>[] = [
    {
      id: 'payment-1',
      target: { id: 'user-2', telegramId: '7001001', displayName: 'Test buyer' },
      starsAmount: 1,
      state: 'ENTITLEMENT_GRANTED',
      kind: 'CREDITS',
      packCode: 'test-pack',
      planCode: null,
      creditAmountMicros: 10_000,
      createdAt: 1,
      paidAt: 2,
      refund: null,
    },
  ];
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
    if (url.pathname === '/api/v1/config') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"environment":"test","appName":"Velora","telegramBotUsername":"aivel0ra_bot"}',
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
          locale: 'en',
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
        body: '{"items":[],"nextCursor":null,"contentPreferences":{"safeSearch":true,"matureImageBlur":true}}',
      });
      return;
    }
    if (url.pathname === '/api/v1/settings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"theme":"dark","locale":"ru","defaultPersonaId":null,"generationProfile":"BALANCED","nsfwVisible":false,"safeSearch":true,"matureImageBlur":true,"preferences":{}}',
      });
      return;
    }
    if (url.pathname === '/api/v1/personas') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[]}' });
      return;
    }
    if (url.pathname === '/api/v1/notifications') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"items":[],"unreadCount":0,"nextCursor":null}',
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/operations/model-benchmarks') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"items":[]}',
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/moderation/cases') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: avatarReviewOpen
            ? [
                {
                  id: 'case-avatar',
                  reportId: null,
                  targetType: 'AVATAR',
                  targetId: 'avatar-media-1',
                  priority: 30,
                  state: 'OPEN',
                  assignedTo: null,
                  reason: null,
                  description: null,
                  createdAt: 1,
                },
              ]
            : [],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/moderation/cases/case-avatar') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'case-avatar',
          reportId: null,
          targetType: 'AVATAR',
          targetId: 'avatar-media-1',
          priority: 30,
          state: 'OPEN',
          assignedTo: null,
          reason: null,
          description: null,
          createdAt: 1,
          report: null,
          evidence: {
            id: 'avatar-media-1',
            mimeType: 'image/png',
            byteSize: 68,
            width: 1,
            height: 1,
            moderationState: 'PENDING',
          },
          actions: [],
          appeals: [],
          audit: [],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/media/avatar-media-1/content') {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/moderation/cases/case-avatar/assign') {
      expect(request.method()).toBe('POST');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"id":"case-avatar","assignedTo":"owner-1","state":"IN_REVIEW"}',
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/moderation/cases/case-avatar/actions') {
      expect(request.method()).toBe('POST');
      expect(request.postDataJSON()).toMatchObject({ action: 'NO_ACTION' });
      avatarReviewOpen = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"id":"action-avatar","caseId":"case-avatar","state":"RESOLVED"}',
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/support/requests') {
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
          jobsCreated24h: 0,
          productEvents24h: 0,
          mediaObjectsCreated24h: 0,
          mediaBytesCreated24h: 0,
          mediaBytesTotal: 0,
          providerLastSuccessAt: null,
          providerLastFailureAt: null,
          planDistribution: { FREE: 2 },
          ownerAiUsage: ownerAiUsageFixture(),
          capacityProjection: capacityProjectionFixture(),
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
              availableCandidates: ['deepseek-chat-v3.1', 'l3-lunaris-8b'],
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
              availableCandidates: ['deepseek-chat-v3.1', 'l3-lunaris-8b'],
              selectedModel: 'deepseek-chat-v3.1',
              checkedAt: 1,
            },
          }),
        });
      }
      return;
    }
    if (url.pathname === '/api/v1/admin/operations/model-evals') {
      const models = [
        {
          modelProfileId: 'velora-balanced',
          displayName: 'Velora Balanced',
          providerModelId: 'deepseek-chat-v3.1',
          tier: 'standard',
          enabled: true,
        },
        {
          modelProfileId: 'velora-free-roleplay',
          displayName: 'Lunaris Roleplay',
          providerModelId: 'l3-lunaris-8b',
          tier: 'free',
          enabled: true,
        },
        {
          modelProfileId: 'velora-free-context',
          displayName: 'Velora Nano',
          providerModelId: 'mistral-nemo',
          tier: 'free',
          enabled: true,
        },
      ];
      if (request.method() === 'POST') {
        expect(request.postDataJSON()).toEqual({
          modelProfileId: 'velora-free-roleplay',
          confirmation: 'ПОТРАТИТЬ 1 ЗАПРОС НА ПРОВЕРКУ МОДЕЛИ',
        });
        modelEvalRun = {
          runKey: 'BOTHUB_ROLEPLAY_EVAL_V3_velora-free-roleplay',
          modelProfileId: 'velora-free-roleplay',
          displayName: 'Lunaris Roleplay',
          provider: 'BOTHUB',
          model: 'l3-lunaris-8b',
          state: 'COMPLETED',
          inputTokens: 31,
          outputTokens: 18,
          providerReportedCostMicros: 180,
          conservativeCostMicros: 20_002,
          latencyMs: 380,
          outputLength: 91,
          errorCode: null,
          httpStatus: 200,
          startedAt: 1,
          completedAt: 2,
          alreadyAttempted: false,
        };
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ run: modelEvalRun }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ models, items: modelEvalRun ? [modelEvalRun] : [] }),
        });
      }
      return;
    }
    if (url.pathname === '/api/v1/admin/operations/models') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          defaultModelProfileId: defaultRoleplayModelId,
          items: roleplayModels,
        }),
      });
      return;
    }
    if (
      url.pathname.startsWith('/api/v1/admin/operations/models/') &&
      request.method() === 'PATCH'
    ) {
      const modelProfileId = url.pathname.split('/').at(-1);
      const input = request.postDataJSON() as {
        readonly displayName?: string;
        readonly descriptionRu?: string;
        readonly tier?: 'free' | 'standard' | 'premium';
        readonly enabled?: boolean;
        readonly fallbackIds?: string[];
        readonly isDefault?: boolean;
      };
      roleplayModels = roleplayModels.map((model) =>
        model.modelProfileId === modelProfileId
          ? {
              ...model,
              ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
              ...(input.descriptionRu === undefined ? {} : { descriptionRu: input.descriptionRu }),
              ...(input.tier === undefined ? {} : { tier: input.tier }),
              ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
              ...(input.fallbackIds === undefined ? {} : { fallbackIds: input.fallbackIds }),
              updatedAt: 2,
              updatedBy: 'owner-1',
            }
          : model,
      );
      if (input.isDefault) defaultRoleplayModelId = modelProfileId ?? defaultRoleplayModelId;
      const updated = roleplayModels.find((model) => model.modelProfileId === modelProfileId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...updated, isDefault: input.isDefault === true }),
      });
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
    if (url.pathname === '/api/v1/admin/billing/payments' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: ownerPayments }),
      });
      return;
    }
    if (
      url.pathname === '/api/v1/admin/billing/payments/payment-1/refund' &&
      request.method() === 'POST'
    ) {
      const input = request.postDataJSON() as {
        readonly reason: string;
        readonly idempotencyKey: string;
      };
      expect(input.reason).toBe('Owner test refund');
      expect(input.idempotencyKey).toBeTruthy();
      ownerPayments = [
        {
          ...ownerPayments[0],
          state: 'REFUNDED',
          refund: {
            id: 'refund-1',
            state: 'CONFIRMED',
            reason: input.reason,
            updatedAt: 3,
          },
        },
      ];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'refund-1',
          paymentId: 'payment-1',
          state: 'CONFIRMED',
          reason: input.reason,
          createdAt: 2,
          updatedAt: 3,
          alreadySubmitted: false,
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/billing/user-grants') {
      if (request.method() === 'POST') {
        const input = request.postDataJSON() as {
          readonly targetId: string;
          readonly planCode: string;
          readonly durationDays: number;
          readonly creditAmountMicros: number;
          readonly reason: string;
          readonly idempotencyKey: string;
        };
        expect(input.targetId).toBe('1040929628');
        expect(input.planCode).toBe('PLUS');
        expect(input.durationDays).toBe(30);
        expect(input.creditAmountMicros).toBe(1_000_000);
        expect(input.reason).toBe('Staging owner test');
        expect(input.idempotencyKey).toBeTruthy();
        userGrants = [
          {
            id: 'grant-1',
            target: {
              id: 'owner-1',
              telegramId: input.targetId,
              displayName: 'Владелец',
            },
            planCode: input.planCode,
            durationDays: input.durationDays,
            creditAmountMicros: input.creditAmountMicros,
            reason: input.reason,
            createdAt: 1,
            accessStartsAt: 1,
            accessExpiresAt: 2_592_000_001,
            accessRevokedAt: null,
            alreadyApplied: false,
          },
        ];
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(userGrants[0]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: userGrants }),
        });
      }
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

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: /Moderation/u }).click();
  await expect(page.getByRole('heading', { name: 'Moderation queue' })).toBeVisible();
  await page.getByRole('button', { name: /AVATAR/u }).click();
  await expect(page.getByRole('heading', { name: 'Image review' })).toBeVisible();
  await expect(page.getByAltText('Image awaiting review')).toBeVisible();
  await expect(page.getByRole('option', { name: 'Warning' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Assign to me' }).click();
  await page.getByLabel('Rationale').fill('Safe image reviewed by owner.');
  await page.getByRole('button', { name: 'Apply decision' }).click();
  await expect(page.getByRole('heading', { name: 'Queue is empty' })).toBeVisible();
  await page.getByRole('button', { name: 'Support' }).click();
  await expect(page.getByRole('heading', { name: 'Support requests' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to moderation' }).click();
  await page.getByRole('button', { name: 'System' }).click();
  await expect(page.getByText('Plan FREE')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Owner AI usage' })).toBeVisible();
  await expect(page.locator('.ai-usage-panel')).toContainText('7 days');
  await expect(page.locator('.ai-usage-panel')).toContainText('l3-lunaris-8b');
  await expect(page.getByRole('heading', { name: 'Управление ролевыми моделями' })).toBeVisible();
  const modelControlPanel = page.getByRole('region', {
    name: 'Управление ролевыми моделями',
  });
  const controlledLunaris = page
    .locator('.model-control-card')
    .filter({ hasText: 'velora-free-roleplay' });
  await expect(controlledLunaris.getByText('100.0%')).toBeVisible();
  await controlledLunaris.getByLabel('Название').fill('Qwen RP Free');
  await controlledLunaris.getByLabel('По умолчанию').check();
  await controlledLunaris.getByRole('button', { name: 'Сохранить модель' }).click();
  await expect(
    page.getByText('Настройки модели применены без нового развёртывания.'),
  ).toBeVisible();
  await expect(controlledLunaris.getByLabel('Название')).toHaveValue('Qwen RP Free');
  await modelControlPanel.screenshot({
    path: testInfo.outputPath('actual-owner-model-controls.png'),
    animations: 'disabled',
  });
  await expect(page.getByRole('heading', { name: 'BotHub checkpoint' })).toBeVisible();
  const smokeButton = page.getByRole('button', { name: 'Run one V3 request' });
  await expect(smokeButton).toBeDisabled();
  const smokeConsent = page.getByLabel(
    'I approve one paid deepseek-chat-v3.1 staging request with no automatic retry.',
  );
  await smokeConsent.evaluate((element) => {
    element.scrollIntoView({ block: 'center' });
  });
  await smokeConsent.focus();
  await page.keyboard.press('Space');
  await expect(smokeConsent).toBeChecked();
  await smokeButton.evaluate((element) => {
    element.scrollIntoView({ block: 'center' });
  });
  await smokeButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Дверь тихо открылась навстречу лунному саду.')).toBeVisible();
  await expect(page.getByText(/24 input \/ 12 output tokens/u)).toBeVisible();
  await expect(smokeButton).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Roleplay model checks' })).toBeVisible();
  const evalSection = page
    .getByRole('heading', { name: 'Roleplay model checks' })
    .locator('..')
    .locator('..');
  const mistralCard = evalSection.locator('.model-eval-card').filter({ hasText: 'Velora Nano' });
  await expect(mistralCard.getByRole('button', { name: 'Check model' })).toBeDisabled();
  const lunarisCard = evalSection
    .locator('.model-eval-card')
    .filter({ hasText: 'Lunaris Roleplay' });
  const evalButton = lunarisCard.getByRole('button', { name: 'Check model' });
  await expect(evalButton).toBeEnabled();
  await evalButton.click();
  const evalDialog = page.getByRole('dialog', { name: 'Confirm model check?' });
  await expect(evalDialog).toBeVisible();
  await expect(evalDialog).toContainText('I approve one short paid request for this model.');
  await evalDialog.getByRole('button', { name: 'Spend one request' }).click();
  await expect(lunarisCard.getByText('COMPLETED')).toBeVisible();
  await expect(lunarisCard.getByText(/31 input \/ 18 output tokens · 380 ms/u)).toBeVisible();
  await expect(evalButton).toHaveCount(0);
  await evalSection.screenshot({
    path: testInfo.outputPath('actual-owner-model-evals.png'),
    animations: 'disabled',
  });
  const grantSection = page.getByRole('heading', { name: 'Grant access by user ID' }).locator('..');
  await grantSection.getByLabel('Velora ID or Telegram ID').fill('1040929628');
  await grantSection.getByRole('combobox', { name: 'Plan' }).selectOption('PLUS');
  await grantSection.getByLabel('Days').fill('30');
  await grantSection.getByLabel('AI credits, $').fill('1');
  await grantSection.getByLabel('Grant reason').fill('Staging owner test');
  await grantSection.getByRole('button', { name: 'Grant', exact: true }).click();
  await expect(page.getByText('The plan and AI credits were granted to the user.')).toBeVisible();
  await expect(grantSection.getByText('Telegram 1040929628')).toBeVisible();
  const paymentsSection = page
    .getByRole('heading', { name: 'Recent Stars payments' })
    .locator('..');
  await expect(paymentsSection.getByText('1 XTR · ENTITLEMENT_GRANTED')).toBeVisible();
  const dialogHandler = async (dialog: Dialog) => {
    await dialog.accept(dialog.type() === 'prompt' ? 'Owner test refund' : undefined);
  };
  page.on('dialog', dialogHandler);
  await paymentsSection.getByRole('button', { name: 'Refund Stars' }).click();
  await expect(
    page.getByText('Telegram confirmed the refund and the grant was revoked.'),
  ).toBeVisible();
  await expect(paymentsSection.getByText('Refund state: CONFIRMED')).toBeVisible();
  page.off('dialog', dialogHandler);
  await expect(page.getByRole('heading', { name: 'Moderation team' })).toBeVisible();
  await page.getByLabel('Telegram ID', { exact: true }).fill('7001001');
  await page.getByRole('button', { name: 'Assign' }).click();
  await expect(page.getByText('Тестовый модератор')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Revoke', exact: true }).click();
  await expect(page.getByText('Тестовый модератор')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});
