// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './api';
import { I18nProvider } from './i18n';
import { LorebookEditor } from './LorebooksView';

vi.mock('./api', () => ({ apiRequest: vi.fn() }));

const mockedApiRequest = vi.mocked(apiRequest);

afterEach(() => {
  cleanup();
  mockedApiRequest.mockReset();
});

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onBack = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider locale="ru">
        <LorebookEditor id="book-1" onBack={onBack} />
      </I18nProvider>
    </QueryClientProvider>,
  );
  return { onBack };
}

describe('LorebookEditor', () => {
  it('loads real book state, persists settings and attaches a character', async () => {
    const calls: { readonly url: string; readonly init: RequestInit | undefined }[] = [];
    mockedApiRequest.mockImplementation((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === '/api/v1/lorebooks/book-1') {
        if (init?.method === 'PATCH') {
          return Promise.resolve({
            id: 'book-1',
            ownerId: 'owner-1',
            name: 'Ночной город',
            description: 'Обновлено',
            visibility: 'PRIVATE',
            entries: [],
            createdAt: 1,
            updatedAt: 2,
          });
        }
        return Promise.resolve({
          id: 'book-1',
          ownerId: 'owner-1',
          name: 'Ночной город',
          description: 'Старые улицы',
          visibility: 'PRIVATE',
          entries: [],
          createdAt: 1,
          updatedAt: 1,
        });
      }
      if (url === '/api/v1/characters') {
        return Promise.resolve({ items: [{ id: 'character-1', name: 'Лира' }] });
      }
      if (url === '/api/v1/lorebooks/book-1/attachments') {
        return Promise.resolve({ characters: [{ id: 'character-1', enabled: false }] });
      }
      if (url === '/api/v1/media')
        return Promise.resolve({ items: [], capabilities: { directUpload: true } });
      if (url === '/api/v1/characters/character-1/lorebooks/book-1')
        return Promise.resolve(undefined);
      return Promise.reject(new Error(`Unexpected API call: ${url}`));
    });
    renderEditor();
    await expect(screen.findByDisplayValue('Ночной город')).resolves.toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Описание' }), {
      target: { value: 'Обновлено' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => {
      expect(
        calls.some(
          ({ url, init }) =>
            url === '/api/v1/lorebooks/book-1' &&
            init?.method === 'PATCH' &&
            typeof init.body === 'string' &&
            init.body.includes('Обновлено'),
        ),
      ).toBe(true);
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Лира' }));
    await waitFor(() => {
      expect(
        calls.some(
          ({ url, init }) =>
            url === '/api/v1/characters/character-1/lorebooks/book-1' && init?.method === 'PUT',
        ),
      ).toBe(true);
    });
  });

  it('opens an existing lore entry and returns through the editor', async () => {
    mockedApiRequest.mockImplementation((url: string) => {
      if (url === '/api/v1/lorebooks/book-1') {
        return Promise.resolve({
          id: 'book-1',
          ownerId: 'owner-1',
          name: 'Ночной город',
          description: '',
          visibility: 'PRIVATE',
          entries: [
            {
              id: 'entry-1',
              lorebookId: 'book-1',
              title: 'Башня',
              content: 'Башня открывается ночью.',
              keys: ['башня'],
              secondaryKeys: [],
              enabled: true,
              priority: 1,
              position: 0,
              caseSensitive: false,
              matchWholeWord: false,
              scanDepth: 20,
              tokenBudget: 200,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        });
      }
      if (url === '/api/v1/characters') return Promise.resolve({ items: [] });
      if (url === '/api/v1/lorebooks/book-1/attachments')
        return Promise.resolve({ characters: [] });
      if (url === '/api/v1/media')
        return Promise.resolve({ items: [], capabilities: { directUpload: true } });
      return Promise.reject(new Error(`Unexpected API call: ${url}`));
    });
    renderEditor();
    await expect(screen.findByRole('heading', { name: 'Башня' })).resolves.toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }));
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Заголовок' }).value).toBe(
      'Башня',
    );
    fireEvent.click(screen.getByRole('button', { name: 'К книге' }));
    await expect(screen.findByRole('heading', { name: 'Башня' })).resolves.toBeTruthy();
  });

  it('renders the maximum 100-entry Lorebook without losing the last entry', async () => {
    const entries = Array.from({ length: 100 }, (_, index) => ({
      id: `entry-${String(index + 1)}`,
      lorebookId: 'book-1',
      title: `Запись ${String(index + 1)}`,
      content: `Содержание записи ${String(index + 1)}.`,
      keys: [`ключ-${String(index + 1)}`],
      secondaryKeys: [],
      enabled: true,
      priority: index,
      position: index,
      caseSensitive: false,
      matchWholeWord: false,
      scanDepth: 20,
      tokenBudget: 200,
      createdAt: 1,
      updatedAt: 1,
    }));
    mockedApiRequest.mockImplementation((url: string) => {
      if (url === '/api/v1/lorebooks/book-1') {
        return Promise.resolve({
          id: 'book-1',
          ownerId: 'owner-1',
          name: 'Большая книга',
          description: '',
          visibility: 'PRIVATE',
          entries,
          createdAt: 1,
          updatedAt: 1,
        });
      }
      if (url === '/api/v1/characters') return Promise.resolve({ items: [] });
      if (url === '/api/v1/lorebooks/book-1/attachments')
        return Promise.resolve({ characters: [] });
      if (url === '/api/v1/media')
        return Promise.resolve({ items: [], capabilities: { directUpload: true } });
      return Promise.reject(new Error(`Unexpected API call: ${url}`));
    });
    renderEditor();
    await expect(screen.findByRole('heading', { name: 'Запись 100' })).resolves.toBeTruthy();
    expect(screen.getAllByRole('article')).toHaveLength(100);
  });
});
