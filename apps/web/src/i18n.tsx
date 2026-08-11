import { createContext, useContext, type ReactNode } from 'react';

export type Locale = 'ru' | 'en';

const russianMessages = {
  shell: {
    eyebrow: 'ТВОЯ ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ',
    title: 'Войди в мир, который помнит тебя',
    intro:
      'Создавай персонажей, выбирай образ и продолжай истории с живой памятью, ветвлением и атмосферным диалогом.',
    retry: 'Повторить вход',
    preparing: 'Подготавливаем пространство…',
    secure:
      'Telegram подтверждает личность на сервере — клиентские данные не считаются доказательством входа.',
    memory: 'Постоянная память',
    memoryText: 'Открывай, редактируй и восстанавливай версии памяти каждой истории.',
    characters: 'Живые персонажи',
    charactersText: 'Personas, lorebooks и авторские инструкции действительно участвуют в ответе.',
    control: 'Контроль расходов',
    controlText: 'Только заранее купленные roleplay-токены, без автоматического пополнения.',
    standalone:
      'Standalone-режим предназначен только для разработки. Вход требует Telegram Mini App.',
    homeLabel: 'Velora — на главную',
    serviceStatus: 'Состояние сервиса',
    capabilities: 'Возможности Velora',
    offlineTitle: 'Нет подключения',
    offlineText: 'Введённый текст не будет очищен. Повтори отправку после восстановления сети.',
    offlineAuth: 'Нет подключения к сети. Вход продолжится автоматически после восстановления.',
    authFailed: 'Не удалось подтвердить вход.',
  },
  navigation: {
    main: 'Основные разделы',
    credits: 'Открыть AI-кредиты',
    moderation: 'Модерация',
    chats: 'Диалоги',
    catalog: 'Каталог',
    characters: 'Персонажи',
    personas: 'Образы',
    settings: 'Настройки',
  },
  onboarding: {
    step: (current: number) => `шаг ${String(current)} из 4`,
    stepLabel: (current: number) => `Шаг ${String(current)} из 4`,
    welcomeEyebrow: 'ДОБРО ПОЖАЛОВАТЬ',
    welcomeTitle: (name: string) => `${name}, твоя история начинается здесь`,
    welcomeText:
      'Создавай персонажей, выбирай свой образ и веди ролевые истории с памятью и полным контролем над сюжетом.',
    characterPoint: '✦ Персонажи сохраняют заданную роль',
    memoryPoint: '∞ Память удерживает важные события',
    controlPoint: '◒ Ты управляешь ветками и контекстом',
    continue: 'Продолжить',
    safetyEyebrow: 'БЕЗОПАСНОСТЬ',
    safetyTitle: 'Выбери комфортный режим',
    safetyText:
      'Без подтверждения совершеннолетия каталог показывает только безопасные истории. Это можно изменить позже в настройках.',
    adultTitle: 'Мне исполнилось 18 лет',
    adultText: 'Разрешить показ Mature-контента с отдельной маркировкой',
    policyTitle: 'Я принимаю правила сообщества',
    policyText: 'Запрещённый контент и попытки обхода ограничений не допускаются',
    back: 'Назад',
    personaEyebrow: 'ТВОЙ ОБРАЗ · НЕОБЯЗАТЕЛЬНО',
    personaTitle: 'Кем ты будешь в историях?',
    personaText:
      'Образ подставляется в диалоги вместо твоего Telegram-профиля. Его можно пропустить.',
    personaName: 'Имя образа',
    personaNamePlaceholder: 'Например, Странница',
    personaDescription: 'Короткое описание',
    personaDescriptionPlaceholder: 'Что персонажи должны знать о твоём образе?',
    savePersona: 'Сохранить образ',
    skip: 'Пропустить',
    storiesEyebrow: 'ПЕРВЫЕ ИСТОРИИ',
    storiesTitle: 'Выбери, с чего начать',
    storiesText:
      'Это актуальные безопасные персонажи из каталога. Полный поиск откроется сразу после.',
    loadingStories: 'Подбираем истории…',
    start: 'Начать',
    emptyStories: 'Публичные истории скоро появятся — пока можно открыть каталог.',
    saving: 'Сохраняем…',
    openCatalog: 'Открыть каталог',
  },
  settings: {
    loading: 'Загружаем настройки…',
    eyebrow: 'КОНТРОЛЬ',
    title: 'Настройки',
    description: 'Тема, язык и профиль генерации хранятся в твоём аккаунте.',
    theme: 'Тема',
    dark: 'Тёмная',
    amoled: 'AMOLED',
    light: 'Светлая',
    language: 'Язык',
    russian: 'Русский',
    english: 'English',
    generationMode: 'Режим генерации',
    balanced: 'Сбалансированный',
    creative: 'Творческий',
    premium: 'Максимальное качество',
    prepaidTitle: 'Только предоплаченные AI-кредиты',
    prepaidText:
      'Автосписаний и автоматического пополнения нет. Кредиты расходуются исключительно на полноценные ролевые ответы.',
    save: 'Сохранить',
    saved: 'Настройки сохранены.',
  },
  billing: {
    paymentPaid: 'Оплата подтверждена. Баланс обновляется.',
    paymentFailed: 'Telegram не смог завершить оплату. Кредиты не списаны.',
    accessPaid: 'Доступ начислен. Тариф и срок обновляются.',
    accessFailed: 'Telegram не завершил оплату. Доступ не изменён.',
    telegramOnly: 'Счёт можно открыть только внутри Telegram MiniApp.',
    loading: 'Загружаем AI-кредиты…',
    eyebrow: 'AI-КРЕДИТЫ',
    title: 'Разовое пополнение',
    description:
      'Velora работает на Cloudflare Free. Кредиты расходуются только на полноценные ролевые ответы ИИ.',
    termsLabel: 'Условия оплаты',
    assuranceTitle: 'Без карты, подписки и автопополнения',
    assuranceText:
      'Покупка выполняется один раз через Telegram Stars. Повторных списаний нет; новый пакет приобретается только вручную.',
    currentPlanLabel: 'Текущий тариф',
    currentPlan: (plan: string) => `Текущий тариф: ${plan}`,
    accessUntil: (date: string) =>
      `Доступ действует до ${date}. Продления и повторного списания нет.`,
    freeNeverExpires: 'Бесплатный тариф не имеет срока окончания.',
    acceptance:
      'Я принимаю условия разовой покупки и понимаю, что подписка и автоматическое продление не создаются.',
    accessPacks: 'Разовый доступ Plus и Pro',
    duration: (days: number, plan: string) => `${String(days)} дней · ${plan}`,
    buyOnce: 'Купить один раз',
    disabledTitle: 'Покупки пока выключены',
    disabledText:
      'Владелец ещё не включил реальные счета. Бесплатные функции Velora доступны как обычно.',
    noPacksTitle: 'Пакеты ещё не настроены',
    noPacksText: 'До ручной настройки цен владельцем приложение не создаёт платёжные счета.',
    credits: (amount: string) => `${amount} AI-кредитов`,
    buyFor: (stars: number) => `Купить за ${String(stars)} ⭐`,
    history: 'История операций',
    historyLoading: 'Загружаем…',
    noOperations: 'Операций пока нет.',
    stateCreated: 'Создаётся',
    stateInvoiceSent: 'Ожидает оплаты',
    statePaid: 'Оплачено',
    stateFailed: 'Ошибка',
    stateRefunded: 'Возвращено',
  },
  discovery: {
    eyebrow: 'ИССЛЕДУЙ',
    title: 'Найди свою историю',
    description: 'Опубликованные персонажи, доступные для безопасного ролевого диалога.',
    searchPlaceholder: 'Имя, описание или сюжет',
    searchLabel: 'Поиск персонажей',
    search: 'Найти',
    loading: 'Открываем каталог…',
    emptyTitle: 'Пока ничего не найдено',
    emptyText: 'Измени запрос или вернись чуть позже.',
    byCreator: (name: string) => `от ${name}`,
    greeting: 'Начальное приветствие',
    primaryGreeting: 'Основное',
    greetingVariant: (index: number) => `Вариант ${String(index)}`,
    metrics: 'Статистика персонажа',
    liked: '♥ Нравится',
    like: '♡ Нравится',
    saved: '🔖 Сохранено',
    bookmark: '♧ В закладки',
    collapse: 'Свернуть',
    details: 'Подробнее',
    report: '⚑ Пожаловаться',
    reportSent: 'Жалоба отправлена в очередь модерации.',
    blockCreator: 'Заблокировать автора',
    blockConfirmation: 'Подтверждение блокировки',
    blockText:
      'Автор, его персонажи и диалоги станут недоступны вам. Вы сможете снять блокировку в настройках.',
    cancel: 'Отмена',
    block: 'Заблокировать',
    reviews: 'Отзывы',
    yourRating: 'Ваша оценка',
    ratingOutOfFive: (rating: number) => `${String(rating)} из 5`,
    reviewPlaceholder: 'Отзыв необязателен',
    rate: 'Оценить',
    updateReview: 'Обновить отзыв',
    deleteReview: 'Удалить мой отзыв',
    noReviews: 'Отзывов пока нет.',
    opening: 'Открываем…',
    startStory: 'Начать историю',
  },
} as const;

type Localized<T> = {
  readonly [Key in keyof T]: T[Key] extends string
    ? string
    : T[Key] extends (...arguments_: infer Arguments) => string
      ? (...arguments_: Arguments) => string
      : Localized<T[Key]>;
};

export type WebMessages = Localized<typeof russianMessages>;

const englishMessages: WebMessages = {
  shell: {
    eyebrow: 'YOUR STORY STARTS HERE',
    title: 'Enter a world that remembers you',
    intro:
      'Create characters, choose your persona, and continue stories with living memory, branches, and atmospheric dialogue.',
    retry: 'Retry sign-in',
    preparing: 'Preparing your space…',
    secure:
      'Telegram identity is verified on the server — client data is never accepted as proof of sign-in.',
    memory: 'Persistent memory',
    memoryText: 'Open, edit, and restore memory versions for every story.',
    characters: 'Living characters',
    charactersText:
      'Personas, lorebooks, and author instructions are included in the actual response.',
    control: 'Cost control',
    controlText: 'Only prepaid roleplay tokens, with no automatic top-ups.',
    standalone: 'Standalone mode is for development only. Sign-in requires the Telegram Mini App.',
    homeLabel: 'Velora — home',
    serviceStatus: 'Service status',
    capabilities: 'Velora capabilities',
    offlineTitle: 'No connection',
    offlineText: 'Your draft will be preserved. Retry sending after the connection is restored.',
    offlineAuth: 'No network connection. Sign-in will resume automatically when it is restored.',
    authFailed: 'Could not verify sign-in.',
  },
  navigation: {
    main: 'Main sections',
    credits: 'Open AI credits',
    moderation: 'Moderation',
    chats: 'Chats',
    catalog: 'Discover',
    characters: 'Characters',
    personas: 'Personas',
    settings: 'Settings',
  },
  onboarding: {
    step: (current) => `step ${String(current)} of 4`,
    stepLabel: (current) => `Step ${String(current)} of 4`,
    welcomeEyebrow: 'WELCOME',
    welcomeTitle: (name) => `${name}, your story starts here`,
    welcomeText:
      'Create characters, choose your persona, and build roleplay stories with memory and full control over the plot.',
    characterPoint: '✦ Characters stay true to their roles',
    memoryPoint: '∞ Memory keeps important events',
    controlPoint: '◒ You control branches and context',
    continue: 'Continue',
    safetyEyebrow: 'SAFETY',
    safetyTitle: 'Choose your comfort level',
    safetyText:
      'Without adult confirmation, the catalog shows only safe stories. You can change this later in Settings.',
    adultTitle: 'I am at least 18 years old',
    adultText: 'Allow separately labeled Mature content',
    policyTitle: 'I accept the community rules',
    policyText: 'Prohibited content and attempts to bypass restrictions are not allowed',
    back: 'Back',
    personaEyebrow: 'YOUR PERSONA · OPTIONAL',
    personaTitle: 'Who will you be in your stories?',
    personaText:
      'Your persona is used in conversations instead of your Telegram profile. You can skip this step.',
    personaName: 'Persona name',
    personaNamePlaceholder: 'For example, The Wanderer',
    personaDescription: 'Short description',
    personaDescriptionPlaceholder: 'What should characters know about your persona?',
    savePersona: 'Save persona',
    skip: 'Skip',
    storiesEyebrow: 'FIRST STORIES',
    storiesTitle: 'Choose where to begin',
    storiesText:
      'These are current safe characters from the catalog. Full discovery opens immediately afterward.',
    loadingStories: 'Finding stories…',
    start: 'Start',
    emptyStories: 'Public stories are coming soon — you can open the catalog for now.',
    saving: 'Saving…',
    openCatalog: 'Open catalog',
  },
  settings: {
    loading: 'Loading settings…',
    eyebrow: 'CONTROL',
    title: 'Settings',
    description: 'Theme, language, and generation profile are stored in your account.',
    theme: 'Theme',
    dark: 'Dark',
    amoled: 'AMOLED',
    light: 'Light',
    language: 'Language',
    russian: 'Русский',
    english: 'English',
    generationMode: 'Generation mode',
    balanced: 'Balanced',
    creative: 'Creative',
    premium: 'Maximum quality',
    prepaidTitle: 'Prepaid AI credits only',
    prepaidText:
      'There are no automatic charges or top-ups. Credits are spent exclusively on full roleplay responses.',
    save: 'Save',
    saved: 'Settings saved.',
  },
  billing: {
    paymentPaid: 'Payment confirmed. Your balance is updating.',
    paymentFailed: 'Telegram could not complete the payment. No credits were charged.',
    accessPaid: 'Access granted. Your plan and expiry are updating.',
    accessFailed: 'Telegram did not complete the payment. Access was not changed.',
    telegramOnly: 'The invoice can be opened only inside the Telegram Mini App.',
    loading: 'Loading AI credits…',
    eyebrow: 'AI CREDITS',
    title: 'One-time top-up',
    description:
      'Velora runs on Cloudflare Free. Credits are spent only on full AI roleplay responses.',
    termsLabel: 'Payment terms',
    assuranceTitle: 'No card, subscription, or automatic top-up',
    assuranceText:
      'The purchase is made once with Telegram Stars. There are no repeat charges; another pack is purchased manually.',
    currentPlanLabel: 'Current plan',
    currentPlan: (plan) => `Current plan: ${plan}`,
    accessUntil: (date) => `Access is active until ${date}. There is no renewal or repeat charge.`,
    freeNeverExpires: 'The Free plan does not expire.',
    acceptance:
      'I accept the terms of this one-time purchase and understand that no subscription or automatic renewal is created.',
    accessPacks: 'One-time Plus and Pro access',
    duration: (days, plan) => `${String(days)} days · ${plan}`,
    buyOnce: 'Buy once',
    disabledTitle: 'Purchases are currently disabled',
    disabledText:
      'The owner has not enabled real invoices yet. Velora’s free features remain available.',
    noPacksTitle: 'Packs are not configured yet',
    noPacksText: 'The app will not create payment invoices until the owner configures prices.',
    credits: (amount) => `${amount} AI credits`,
    buyFor: (stars) => `Buy for ${String(stars)} ⭐`,
    history: 'Transaction history',
    historyLoading: 'Loading…',
    noOperations: 'No transactions yet.',
    stateCreated: 'Creating',
    stateInvoiceSent: 'Awaiting payment',
    statePaid: 'Paid',
    stateFailed: 'Failed',
    stateRefunded: 'Refunded',
  },
  discovery: {
    eyebrow: 'EXPLORE',
    title: 'Find your story',
    description: 'Published characters available for safe roleplay conversations.',
    searchPlaceholder: 'Name, description, or scenario',
    searchLabel: 'Search characters',
    search: 'Search',
    loading: 'Opening the catalog…',
    emptyTitle: 'Nothing found yet',
    emptyText: 'Change your search or come back a little later.',
    byCreator: (name) => `by ${name}`,
    greeting: 'Opening greeting',
    primaryGreeting: 'Primary',
    greetingVariant: (index) => `Variant ${String(index)}`,
    metrics: 'Character statistics',
    liked: '♥ Liked',
    like: '♡ Like',
    saved: '🔖 Saved',
    bookmark: '♧ Bookmark',
    collapse: 'Collapse',
    details: 'Details',
    report: '⚑ Report',
    reportSent: 'The report was added to the moderation queue.',
    blockCreator: 'Block creator',
    blockConfirmation: 'Confirm block',
    blockText:
      'The creator, their characters, and conversations will become unavailable to you. You can unblock them in Settings.',
    cancel: 'Cancel',
    block: 'Block',
    reviews: 'Reviews',
    yourRating: 'Your rating',
    ratingOutOfFive: (rating) => `${String(rating)} out of 5`,
    reviewPlaceholder: 'Review is optional',
    rate: 'Rate',
    updateReview: 'Update review',
    deleteReview: 'Delete my review',
    noReviews: 'No reviews yet.',
    opening: 'Opening…',
    startStory: 'Start story',
  },
};

const dictionaries: Readonly<Record<Locale, WebMessages>> = {
  ru: russianMessages,
  en: englishMessages,
};

export function normalizeWebLocale(value: string | null | undefined): Locale {
  return value?.trim().toLowerCase().split(/[-_]/u, 1)[0] === 'en' ? 'en' : 'ru';
}

export function detectWebLocale(): Locale {
  return typeof navigator === 'undefined' ? 'ru' : normalizeWebLocale(navigator.language);
}

export function getWebMessages(locale: Locale): WebMessages {
  return dictionaries[locale];
}

const I18nContext = createContext<{ readonly locale: Locale; readonly messages: WebMessages }>({
  locale: 'ru',
  messages: russianMessages,
});

export function I18nProvider({
  locale,
  children,
}: {
  readonly locale: Locale;
  readonly children: ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ locale, messages: getWebMessages(locale) }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
