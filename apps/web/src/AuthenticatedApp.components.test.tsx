// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './api';
import type * as ApiModule from './api';
import {
  AppDrawer,
  applyCharacterAssistValue,
  CharacterCard,
  PersonaChooser,
  characterIdFromLaunchSearch,
  resolveAutomaticPersona,
  telegramAvatarBotGroupUrl,
  telegramCharacterShareUrl,
} from './AuthenticatedApp';
import { I18nProvider } from './i18n';
import type { DiscoveryCharacter, Persona, Settings } from './types';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, apiRequest: vi.fn() };
});

const mockedApiRequest = vi.mocked(apiRequest);
const character: DiscoveryCharacter = {
  id: 'character-1',
  avatarFileId: null,
  avatarFocalX: 50,
  avatarFocalY: 50,
  contentRating: 'SAFE',
  language: 'ru',
  groupSize: 'single',
  updatedAt: 1,
  name: 'Лира',
  tagline: 'Хранительница маяка',
  description: 'Спокойная мистическая история.',
  firstMessage: 'Ты пришёл.',
  alternateGreetings: ['Второе приветствие'],
  creatorId: 'creator-1',
  creatorName: 'Velora',
  creatorRole: 'OWNER',
  avatarBotUsername: null,
  likeCount: 7,
  bookmarkCount: 2,
  reviewCount: 0,
  averageRating: null,
  liked: false,
  bookmarked: false,
  myRating: null,
  myReviewText: null,
  tags: ['мистика'],
};

afterEach(() => {
  cleanup();
  mockedApiRequest.mockReset();
});

describe('character AI assistant', () => {
  it('changes only the explicitly selected field and emits an input event', () => {
    const form = document.createElement('form');
    const description = document.createElement('textarea');
    description.name = 'description';
    description.value = 'Исходное описание';
    const personality = document.createElement('textarea');
    personality.name = 'personality';
    personality.value = 'Исходный характер';
    form.append(description, personality);
    document.body.append(form);
    const onInput = vi.fn();
    description.addEventListener('input', onInput);

    expect(applyCharacterAssistValue(form, 'description', 'Новый отдельный вариант')).toBe(true);
    expect(description.value).toBe('Новый отдельный вариант');
    expect(personality.value).toBe('Исходный характер');
    expect(onInput).toHaveBeenCalledOnce();
  });
});

function renderCard(
  overrides: Partial<DiscoveryCharacter> = {},
  options: {
    readonly initiallyExpanded?: boolean;
    readonly shareUrl?: string;
    readonly onExpansionChange?: (expanded: boolean) => void;
    readonly publicReviews?: boolean;
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onRequestStart = vi.fn();
  const onOpenCreator = vi.fn();
  const rendered = render(
    <QueryClientProvider client={client}>
      <I18nProvider locale="ru">
        <CharacterCard
          character={{ ...character, ...overrides }}
          currentUserId="viewer-1"
          onRequestStart={onRequestStart}
          onOpenCreator={onOpenCreator}
          startPending={false}
          publicReviews={options.publicReviews ?? false}
          blurMatureImages={false}
          initiallyExpanded={options.initiallyExpanded}
          shareUrl={options.shareUrl}
          onExpansionChange={options.onExpansionChange}
        />
      </I18nProvider>
    </QueryClientProvider>,
  );
  return { onRequestStart, onOpenCreator, container: rendered.container };
}

describe('CharacterCard', () => {
  it('offers the connected avatar bot only on an expanded character profile', () => {
    renderCard({ avatarBotUsername: '@alice_avatar_bot' }, { initiallyExpanded: true });
    const link = screen.getByRole('link', { name: 'Добавить персонажа в чат' });
    expect(link.getAttribute('href')).toBe('https://t.me/alice_avatar_bot?startgroup=velora');
    expect(telegramAvatarBotGroupUrl('@alice_avatar_bot')).toBe(
      'https://t.me/alice_avatar_bot?startgroup=velora',
    );
  });

  it('renders the creator focal point without stretching the source image', () => {
    renderCard({ avatarFileId: 'image-id', avatarFocalX: 18, avatarFocalY: 82 });
    const image = screen.getByRole('img', { name: character.name });
    expect(image.getAttribute('style')).toContain('object-fit: cover');
    expect(image.getAttribute('style')).toContain('object-position: 18% 82%');
  });

  it('opens the creator and toggles a character like through the real endpoint', async () => {
    mockedApiRequest.mockResolvedValue(undefined);
    const { onOpenCreator } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'от Velora' }));
    expect(onOpenCreator).toHaveBeenCalledExactlyOnceWith('creator-1');
    fireEvent.click(screen.getByRole('button', { name: 'Нравится' }));
    await waitFor(() => {
      expect(mockedApiRequest).toHaveBeenCalledWith('/api/v1/discovery/character-1/like', {
        method: 'PUT',
      });
    });
  });

  it('shows a like immediately while the server request is pending', async () => {
    let finishRequest: (() => void) | undefined;
    mockedApiRequest.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRequest = resolve;
        }),
    );
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Нравится' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Нравится' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      expect(screen.queryByText('8')).toBeNull();
    });
    finishRequest?.();
  });

  it('rolls an optimistic bookmark back when the server rejects it', async () => {
    mockedApiRequest.mockRejectedValue(new Error('NETWORK_ERROR'));
    renderCard();
    const actions = screen.getByRole('button', { name: 'Действия с персонажем «Лира»' });
    fireEvent.click(actions);
    const bookmark = screen.getByRole('menuitem', { name: 'В закладки' });

    fireEvent.click(bookmark);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    fireEvent.click(actions);
    expect(screen.getByRole('menuitem', { name: 'В закладки' })).toBeTruthy();
  });

  it('uses the selected greeting when requesting a story', () => {
    const { onRequestStart } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Подробнее' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Начальное приветствие' }), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Начать историю' }));
    expect(onRequestStart).toHaveBeenCalledExactlyOnceWith(character, 1);
  });

  it('starts persona selection from the card copy but keeps the avatar preview independent', () => {
    const characterWithAvatar = { ...character, avatarFileId: 'image-id' };
    const { onRequestStart } = renderCard(characterWithAvatar);
    fireEvent.click(screen.getByRole('heading', { name: character.name }));
    expect(onRequestStart).toHaveBeenCalledExactlyOnceWith(characterWithAvatar, 0);
    fireEvent.click(screen.getByRole('img', { name: character.name }));
    expect(onRequestStart).toHaveBeenCalledTimes(1);
  });

  it('applies mature-image blur only when requested', () => {
    const { container } = renderCard({ contentRating: 'MATURE' });
    expect(container.querySelector('.is-mature-blurred')).toBeNull();
    cleanup();
    const client = new QueryClient();
    const blurred = render(
      <QueryClientProvider client={client}>
        <I18nProvider locale="ru">
          <CharacterCard
            character={{ ...character, contentRating: 'MATURE' }}
            currentUserId="viewer-1"
            onRequestStart={vi.fn()}
            onOpenCreator={vi.fn()}
            startPending={false}
            publicReviews={false}
            blurMatureImages
          />
        </I18nProvider>
      </QueryClientProvider>,
    );
    expect(blurred.container.querySelector('.is-mature-blurred')).not.toBeNull();
  });

  it('loads catalogue cover media lazily and decodes it asynchronously', () => {
    const { container } = renderCard({
      avatarFileId: '11111111-1111-4111-8111-111111111111',
    });
    const image = container.querySelector('img');
    expect(image?.getAttribute('loading')).toBe('lazy');
    expect(image?.getAttribute('decoding')).toBe('async');
  });

  it('shares an exact Telegram character deep link from the expanded public profile', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    const shareUrl = telegramCharacterShareUrl('@aivel0ra_bot', character.id);
    renderCard({}, { initiallyExpanded: true, shareUrl });
    fireEvent.click(screen.getByRole('button', { name: 'Поделиться' }));
    await waitFor(() => {
      expect(share).toHaveBeenCalledExactlyOnceWith({
        title: 'Лира',
        text: 'Хранительница маяка',
        url: 'https://t.me/aivel0ra_bot?startapp=character_character-1',
      });
    });
    expect(screen.getByText('Ссылка на персонажа готова к отправке.').textContent).toBe(
      'Ссылка на персонажа готова к отправке.',
    );
  });

  it('opens reporting only after an in-flight review update has settled', async () => {
    let settleReview: (() => void) | undefined;
    mockedApiRequest.mockImplementation((pathname) => {
      if (pathname === '/api/v1/discovery/character-1/review') {
        return new Promise((resolve) => {
          settleReview = () => {
            resolve(undefined);
          };
        });
      }
      if (pathname === '/api/v1/discovery/character-1/reviews') {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve(undefined);
    });
    renderCard({}, { initiallyExpanded: true, publicReviews: true });

    fireEvent.click(screen.getByRole('button', { name: 'Оценить' }));
    const report = screen.getByRole('button', { name: 'Пожаловаться' });
    await waitFor(() => {
      expect((report as HTMLButtonElement).disabled).toBe(true);
    });
    settleReview?.();
    await waitFor(() => {
      expect((report as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(report);
    expect(screen.getByLabelText('Причина жалобы')).toBeTruthy();
  });

  it('uses the chat markdown renderer for collapsed and expanded greetings', async () => {
    const { container } = renderCard(
      {
        firstMessage:
          '**Ты всё-таки пришёл.**\n\n*Маяк вспыхнул над морем.*\n\nДлинное продолжение приветствия раскрывается без показа сырой разметки.',
      },
      { initiallyExpanded: true },
    );
    const greeting = screen.getByRole('region', { name: 'Приветствие' });
    const start = screen.getByRole('button', { name: 'Начать историю' });
    expect(start.compareDocumentPosition(greeting) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    await waitFor(
      () => {
        expect(greeting.querySelector('strong')?.textContent).toBe('Ты всё-таки пришёл.');
        expect(greeting.querySelector('em')?.textContent).toBe('Маяк вспыхнул над морем.');
      },
      { timeout: 5_000 },
    );
    expect(container.querySelector('.greeting-copy.is-collapsed')).not.toBeNull();
    const toggle = screen.getByRole('button', { name: 'Показать полностью' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(container.querySelector('.greeting-copy.is-collapsed')).toBeNull();
    expect(screen.getByRole('button', { name: 'Свернуть приветствие' })).toBeTruthy();
  });
});

describe('character deep links', () => {
  it('restores both internal and Telegram launch parameters', () => {
    expect(characterIdFromLaunchSearch('?character=character-1')).toBe('character-1');
    expect(characterIdFromLaunchSearch('?tgWebAppStartParam=character_character-2')).toBe(
      'character-2',
    );
    expect(characterIdFromLaunchSearch('?tgWebAppStartParam=unsupported')).toBeNull();
  });
});

describe('PersonaChooser', () => {
  const persona: Persona = {
    id: 'persona-1',
    name: 'Проводница',
    avatarFileId: null,
    shortDescription: 'Ищет забытые истории.',
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
  };
  const settings: Settings = {
    theme: 'dark',
    locale: 'ru',
    defaultPersonaId: persona.id,
    generationProfile: 'BALANCED',
    nsfwVisible: false,
    safeSearch: true,
    matureImageBlur: true,
    preferences: { autoUseDefaultPersona: true },
  };

  it('resolves automatic selection only for a live persisted default persona', () => {
    expect(resolveAutomaticPersona(settings, [persona])).toBe(persona);
    expect(resolveAutomaticPersona({ ...settings, preferences: {} }, [persona])).toBeNull();
    expect(resolveAutomaticPersona(settings, [])).toBeNull();
  });

  it('searches, selects, closes and opens real persona management callbacks', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const onManage = vi.fn();
    const onQueryChange = vi.fn();
    const { rerender } = render(
      <I18nProvider locale="ru">
        <PersonaChooser
          character={character}
          personas={[persona]}
          defaultPersonaId={persona.id}
          selectedPersonaId={null}
          query=""
          remember={false}
          loading={false}
          pending={false}
          error={null}
          onQueryChange={onQueryChange}
          onSelect={onSelect}
          onRememberChange={vi.fn()}
          onClose={onClose}
          onManage={onManage}
          onConfirm={vi.fn()}
        />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по образам' }), {
      target: { value: 'Провод' },
    });
    expect(onQueryChange).toHaveBeenCalledWith('Провод');
    fireEvent.click(screen.getByRole('radio', { name: /Проводница/u }));
    expect(onSelect).toHaveBeenCalledWith(persona.id);
    fireEvent.click(screen.getByRole('button', { name: 'Управление образами' }));
    expect(onManage).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть выбор образа' }));
    expect(onClose).toHaveBeenCalledOnce();
    rerender(<div />);
  });
});

describe('AppDrawer', () => {
  function renderDrawer(overrides: { readonly createExpanded?: boolean } = {}) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const callbacks = {
      onCreateExpanded: vi.fn(),
      onLibraryExpanded: vi.fn(),
      onClose: vi.fn(),
      onNavigate: vi.fn(),
      onCreateCharacter: vi.fn(),
      onCreatePersona: vi.fn(),
      onCreateGroup: vi.fn(),
      onCreateLorebook: vi.fn(),
      onNavigateSettingsSection: vi.fn(),
    };
    const rendered = render(
      <QueryClientProvider client={client}>
        <I18nProvider locale="ru">
          <AppDrawer
            activeTab="discover"
            createExpanded={overrides.createExpanded ?? false}
            libraryExpanded
            {...callbacks}
          />
        </I18nProvider>
      </QueryClientProvider>,
    );
    return { ...callbacks, container: rendered.container };
  }

  it('renders every production-ready creation and library destination', () => {
    const callbacks = renderDrawer({ createExpanded: true });
    expect(screen.getByRole('dialog', { name: 'Меню Velora' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Персонаж' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Lorebook' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Образ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Группа' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Персонаж' }));
    expect(callbacks.onCreateCharacter).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Группа' }));
    expect(callbacks.onCreateGroup).toHaveBeenCalledOnce();
    fireEvent.click(screen.getAllByRole('button', { name: 'Образы' }).at(-1) ?? document.body);
    expect(callbacks.onNavigate).toHaveBeenCalledWith('personas');
    fireEvent.click(screen.getByRole('button', { name: 'Диалоги' }));
    expect(callbacks.onNavigate).toHaveBeenCalledWith('chats');
    fireEvent.click(screen.getByRole('button', { name: 'Заблокированные пользователи' }));
    expect(callbacks.onNavigateSettingsSection).toHaveBeenCalledWith('blocks-title');
    fireEvent.click(screen.getByRole('button', { name: 'Поддержка' }));
    expect(callbacks.onNavigateSettingsSection).toHaveBeenCalledWith('support-title');
    fireEvent.click(screen.getByRole('button', { name: 'Условия и конфиденциальность' }));
    expect(callbacks.onNavigateSettingsSection).toHaveBeenCalledWith('legal-title');
  });

  it('closes with Escape, backdrop, and the explicit close control', () => {
    const callbacks = renderDrawer();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(callbacks.onClose).toHaveBeenCalledOnce();
    const backdrop = callbacks.container.querySelector('.app-drawer-backdrop');
    if (!backdrop) throw new Error('Drawer backdrop was not rendered');
    fireEvent.mouseDown(backdrop);
    expect(callbacks.onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть меню' }));
    expect(callbacks.onClose).toHaveBeenCalledTimes(3);
  });
});
