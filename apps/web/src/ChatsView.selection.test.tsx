// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './api';
import { ChatsView, composeEditableMemory, hasConversationDescendants } from './ChatsView';
import { I18nProvider } from './i18n';
import type { TelegramBackButton, TelegramWebApp } from './telegram';
import type { ConversationMessage, ConversationSummary } from './types';

vi.mock('./api', () => ({ apiRequest: vi.fn(), apiSse: vi.fn() }));

const mockedApiRequest = vi.mocked(apiRequest);

describe('editable memory composition', () => {
  it('shows manual and generated memory in one editable document', () => {
    expect(composeEditableMemory('Важный факт.', 'Активные персонажи:\n- Лена')).toBe(
      'Важный факт.\n\nАктивные персонажи:\n- Лена',
    );
    expect(composeEditableMemory('', 'Сводка')).toBe('Сводка');
  });
});

const conversation = (id: string, name: string): ConversationSummary => ({
  id,
  characterId: `character-${id}`,
  personaId: null,
  title: `История ${name}`,
  activeMessageId: null,
  state: 'ACTIVE',
  isPreview: false,
  memoryStale: false,
  characterName: name,
  characterAvatarFileId: null,
  characterAvatarFocalX: 50,
  characterAvatarFocalY: 50,
  personaName: null,
  lastMessage: 'Последняя реплика',
  messageCount: 3,
  siblingCount: 1,
  createdAt: 1,
  updatedAt: 2,
});

function renderChats(onDiscover = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider locale="ru">
        <ChatsView
          initialConversationId={null}
          allowedModelProfiles={['BALANCED']}
          onConversationOpened={vi.fn()}
          onDiscover={onDiscover}
          telegramBackBlocked={false}
        />
      </I18nProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

afterEach(() => {
  cleanup();
  mockedApiRequest.mockReset();
  delete window.Telegram;
});

describe('chat selection state machine', () => {
  it('detects direct and nested descendants without looping on malformed branches', () => {
    const message = (
      id: string,
      role: ConversationMessage['role'],
      parentMessageId: string | null,
    ): ConversationMessage => ({
      id,
      conversationId: 'conversation-1',
      role,
      content: id,
      contentFormat: 'MARKDOWN',
      status: 'COMPLETED',
      isGreeting: false,
      editedByUser: false,
      origin: role === 'ASSISTANT' ? 'AI_GENERATION' : 'USER_INPUT',
      parentMessageId,
      generationGroupId: null,
      generationId: null,
      reaction: null,
      model: null,
      provider: null,
      metadata: {},
      createdAt: 1,
      updatedAt: 1,
      editedAt: null,
      variantIndex: 0,
      variantCount: 1,
      variantIds: [id],
    });
    const messages = [
      message('root', 'USER', null),
      message('answer', 'ASSISTANT', 'root'),
      message('reply', 'USER', 'answer'),
    ];

    expect(hasConversationDescendants(messages, 'root')).toBe(true);
    expect(hasConversationDescendants(messages, 'answer')).toBe(true);
    expect(hasConversationDescendants(messages, 'reply')).toBe(false);
    expect(
      hasConversationDescendants(
        [message('cycle-a', 'USER', 'cycle-b'), message('cycle-b', 'ASSISTANT', 'cycle-a')],
        'missing',
      ),
    ).toBe(false);
  });

  it('selects all or individual chats and returns to normal through Cancel', async () => {
    const items = [conversation('one', 'Лира'), conversation('two', 'Архивариус')];
    mockedApiRequest.mockResolvedValue({ items, totalCount: items.length });
    const queryClient = renderChats();

    await screen.findByText('2 диалога', { exact: true });
    fireEvent.click(screen.getByRole('button', { name: 'Управление диалогами' }));
    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
    });
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Удалить выбранное' }).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Выбрать диалог «Лира»' }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Выбрано: 1');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать все' }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Выбрано: 2');
    });
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', {
        name: 'Выбрать диалог «Лира»',
      }).checked,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', {
        name: 'Выбрать диалог «Архивариус»',
      }).checked,
    ).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Выбрать диалог «Лира»' }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Выбрано: 1');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByRole('button', { name: 'Выбрать все' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Управление диалогами' })).not.toBeNull();
  });

  it('confirms deletion, exposes DELETING, and returns to the normal empty list', async () => {
    const item = conversation('one', 'Лира');
    let deleted = false;
    let deleteRequestStarted = false;
    let releaseDelete: () => void = () => {
      throw new Error('Delete request was not started');
    };
    mockedApiRequest.mockImplementation((path, init) => {
      if (path === '/api/v1/conversations/one' && init?.method === 'DELETE') {
        deleteRequestStarted = true;
        return new Promise<void>((resolve) => {
          releaseDelete = () => {
            deleted = true;
            resolve();
          };
        });
      }
      if (path.startsWith('/api/v1/conversations?')) {
        const items = deleted ? [] : [item];
        return Promise.resolve({ items, totalCount: items.length });
      }
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });
    const onDiscover = vi.fn();
    renderChats(onDiscover);

    await screen.findByText('1 диалог', { exact: true });
    fireEvent.click(screen.getByRole('button', { name: 'Управление диалогами' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Выбрать диалог «Лира»' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить выбранное' }));

    const dialog = screen.getByRole('alertdialog', {
      name: 'Удалить выбранные диалоги?',
    });
    expect(dialog.textContent).toContain('Будет удалено: 1');
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(
      (await screen.findByRole<HTMLButtonElement>('button', { name: 'Удаляем…' })).disabled,
    ).toBe(true);

    expect(deleteRequestStarted).toBe(true);
    releaseDelete();
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(await screen.findByRole('heading', { name: 'Диалогов пока нет' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть каталог' }));
    expect(onDiscover).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Управление диалогами' })).not.toBeNull();
    expect(mockedApiRequest).toHaveBeenCalledWith('/api/v1/conversations/one', {
      method: 'DELETE',
    });
  });

  it('uses Telegram BackButton for an active chat without rendering a duplicate header arrow', async () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    let visible = false;
    let backHandler: (() => void) | null = null;
    const backButton: TelegramBackButton = {
      get isVisible() {
        return visible;
      },
      show() {
        visible = true;
        return this;
      },
      hide() {
        visible = false;
        return this;
      },
      onClick(handler) {
        backHandler = handler;
        return this;
      },
      offClick(handler) {
        if (backHandler === handler) backHandler = null;
        return this;
      },
    };
    const webApp: TelegramWebApp = {
      initData: 'signed-test-data',
      colorScheme: 'dark',
      BackButton: backButton,
      ready: vi.fn(),
      expand: vi.fn(),
      setHeaderColor: vi.fn(),
      setBackgroundColor: vi.fn(),
      openInvoice: vi.fn(),
    };
    window.Telegram = { WebApp: webApp };
    mockedApiRequest.mockImplementation((path) => {
      if (path === '/api/v1/conversations/one') {
        return Promise.resolve({
          ...conversation('one', 'Lira'),
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
        });
      }
      if (path === '/api/v1/conversations/one/messages') {
        return Promise.resolve({ items: [], activeMessageId: null });
      }
      if (path === '/api/v1/conversations/models/catalog') {
        return Promise.resolve({ selectedProviderCatalogCheckedAt: null, items: [] });
      }
      if (path.startsWith('/api/v1/conversations?')) {
        return Promise.resolve({ items: [conversation('one', 'Lira')], totalCount: 1 });
      }
      return Promise.reject(new Error(`Unexpected API request: ${path}`));
    });
    const onConversationOpened = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider locale="en">
          <ChatsView
            initialConversationId="one"
            allowedModelProfiles={['BALANCED']}
            onConversationOpened={onConversationOpened}
            onDiscover={vi.fn()}
            telegramBackBlocked={false}
          />
        </I18nProvider>
      </QueryClientProvider>,
    );

    await screen.findAllByText('История Lira');
    expect(visible).toBe(true);
    expect(screen.queryByRole('button', { name: 'Back to chats' })).toBeNull();
    const desktopPane = screen.getByRole('complementary', { name: 'Chats' });
    expect(
      within(desktopPane)
        .getByRole('button', { name: /История Lira/u })
        .getAttribute('aria-current'),
    ).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Story tools' }));
    fireEvent.click(screen.getByRole('button', { name: /Generation settings/u }));
    expect(screen.getByRole('region', { name: 'Story inspector' })).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Story inspector' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Story tools' }));
    fireEvent.click(screen.getByRole('button', { name: /Generation settings/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse inspector' }));
    expect(screen.queryByRole('region', { name: 'Story inspector' })).toBeNull();
    // The registered handler stays the same object on purpose -- it reads the
    // current state through a ref -- so what matters is what it now does.
    expect(backHandler).not.toBeNull();
    act(() => {
      backHandler?.();
    });
    await screen.findByRole('heading', { name: 'Chats' });
    expect(onConversationOpened).toHaveBeenCalledWith(null);
    expect(visible).toBe(false);
  });
});
