import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ChangeEvent, type SyntheticEvent } from 'react';
import { apiRequest } from './api';
import type { Character, Lorebook, LorebookTransfer, LoreEntry } from './types';

interface ListResponse<T> {
  readonly items: readonly T[];
}

export function LorebooksView({ onBack }: { readonly onBack: () => void }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState<Lorebook | 'new' | null>(null);
  const [transferNotice, setTransferNotice] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const books = useQuery({
    queryKey: ['lorebooks'],
    queryFn: () => apiRequest<ListResponse<Lorebook>>('/api/v1/lorebooks'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/v1/lorebooks/${id}`, { method: 'DELETE' }),
    onSuccess: async () => client.invalidateQueries({ queryKey: ['lorebooks'] }),
  });
  const importBook = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 4 * 1024 * 1024) throw new Error('Файл импорта превышает 4 МБ.');
      let transfer: unknown;
      try {
        transfer = JSON.parse(await file.text()) as unknown;
      } catch {
        throw new Error('Файл не является корректным JSON.');
      }
      const result = await apiRequest<{ readonly id: string; readonly importedEntries: number }>(
        '/api/v1/lorebooks/import',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), transfer }),
        },
      );
      return {
        result,
        book: await apiRequest<Lorebook>(`/api/v1/lorebooks/${result.id}`),
      };
    },
    onSuccess: async ({ book, result }) => {
      await client.invalidateQueries({ queryKey: ['lorebooks'] });
      setTransferNotice(
        `Книга импортирована приватно. Записей: ${String(result.importedEntries)}.`,
      );
      setEditing(book);
    },
  });
  const exportBook = useMutation({
    mutationFn: async (book: Lorebook) => ({
      book,
      transfer: await apiRequest<LorebookTransfer>(`/api/v1/lorebooks/${book.id}/export`),
    }),
    onSuccess: ({ book, transfer }) => {
      downloadTransfer(book.name, transfer);
      setTransferNotice('Экспорт подготовлен. В файл не включены внутренние ID и привязки.');
    },
  });
  if (editing === 'new') {
    return (
      <NewLorebook
        onCancel={() => {
          setEditing(null);
        }}
        onCreated={(book) => {
          setEditing(book);
        }}
      />
    );
  }
  if (editing)
    return (
      <LorebookEditor
        id={editing.id}
        onBack={() => {
          setEditing(null);
        }}
      />
    );
  return (
    <div className="view-stack">
      <header className="view-header">
        <div>
          <p className="eyebrow">WORLD INFO</p>
          <h1>Книги мира</h1>
          <p>
            Детерминированный контекст: записи включаются только при совпадении заданных ключей.
          </p>
        </div>
        <div className="header-actions">
          <button className="secondary compact-button" type="button" onClick={onBack}>
            ← Персонажи
          </button>
          <button
            className="compact-primary"
            type="button"
            onClick={() => {
              setEditing('new');
            }}
          >
            ＋ Создать
          </button>
          <button
            className="secondary compact-button"
            type="button"
            disabled={importBook.isPending}
            onClick={() => importInput.current?.click()}
          >
            ⇩ Импорт
          </button>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            aria-label="Импортировать книгу мира"
            onChange={(event) => {
              importSelectedFile(event, importBook.mutate);
            }}
          />
        </div>
      </header>
      <p className="meta">
        Импорт поддерживает формат Velora v1 и до 100 записей. Новая книга всегда создаётся
        приватной — проверь её перед публикацией.
      </p>
      {transferNotice ? (
        <p className="success" role="status">
          {transferNotice}
        </p>
      ) : null}
      {importBook.error || exportBook.error ? (
        <p className="error" role="alert">
          {(importBook.error ?? exportBook.error)?.message}
        </p>
      ) : null}
      {books.data?.items.length === 0 ? (
        <div className="empty-state">
          <span>⌘</span>
          <h2>Книг мира пока нет</h2>
          <p>Создай первую и добавь ключевые сведения о мире.</p>
        </div>
      ) : null}
      {books.isError ? (
        <p className="error" role="alert">
          {books.error.message}
        </p>
      ) : null}
      <div className="list-stack">
        {books.data?.items.map((book) => (
          <article className="list-card" key={book.id}>
            <div className="avatar lore-symbol">⌘</div>
            <div className="list-copy">
              <h2>{book.name}</h2>
              <p>{book.description || 'Без описания'}</p>
              <div className="tag-list">
                <span>{visibilityLabel(book.visibility)}</span>
                <span>Записей: {book.entryCount ?? 0}</span>
              </div>
            </div>
            <div className="card-actions">
              <button
                type="button"
                onClick={() => {
                  setEditing(book);
                }}
              >
                Открыть
              </button>
              <button
                type="button"
                disabled={exportBook.isPending}
                onClick={() => {
                  exportBook.mutate(book);
                }}
              >
                Экспорт
              </button>
              <button
                className="danger-link"
                type="button"
                onClick={() => {
                  if (window.confirm(`Удалить книгу «${book.name}»?`)) remove.mutate(book.id);
                }}
              >
                Удалить
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function NewLorebook({
  onCancel,
  onCreated,
}: {
  readonly onCancel: () => void;
  readonly onCreated: (book: Lorebook) => void;
}) {
  const client = useQueryClient();
  const create = useMutation({
    mutationFn: (body: object) =>
      apiRequest<Lorebook>('/api/v1/lorebooks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: async (book) => {
      await client.invalidateQueries({ queryKey: ['lorebooks'] });
      onCreated(book);
    },
  });
  return (
    <BookForm
      title="Новая книга мира"
      pending={create.isPending}
      error={create.error}
      onCancel={onCancel}
      onSubmit={(body) => {
        create.mutate(body);
      }}
    />
  );
}

function LorebookEditor({ id, onBack }: { readonly id: string; readonly onBack: () => void }) {
  const client = useQueryClient();
  const [entryEditor, setEntryEditor] = useState<LoreEntry | 'new' | null>(null);
  const book = useQuery({
    queryKey: ['lorebook', id],
    queryFn: () => apiRequest<Lorebook>(`/api/v1/lorebooks/${id}`),
  });
  const characters = useQuery({
    queryKey: ['characters'],
    queryFn: () => apiRequest<ListResponse<Character>>('/api/v1/characters'),
  });
  const attachments = useQuery({
    queryKey: ['lorebook-attachments', id],
    queryFn: () =>
      apiRequest<{
        readonly characters: readonly { readonly id: string; readonly enabled: boolean }[];
      }>(`/api/v1/lorebooks/${id}/attachments`),
  });
  const save = useMutation({
    mutationFn: (body: object) =>
      apiRequest<Lorebook>(`/api/v1/lorebooks/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['lorebook', id] }),
        client.invalidateQueries({ queryKey: ['lorebooks'] }),
      ]);
    },
  });
  const attach = useMutation({
    mutationFn: ({
      characterId,
      enabled,
    }: {
      readonly characterId: string;
      readonly enabled: boolean;
    }) =>
      enabled
        ? apiRequest(`/api/v1/characters/${characterId}/lorebooks/${id}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: '{"enabled":true}',
          })
        : apiRequest(`/api/v1/characters/${characterId}/lorebooks/${id}`, { method: 'DELETE' }),
    onSuccess: async () => client.invalidateQueries({ queryKey: ['lorebook-attachments', id] }),
  });
  const removeEntry = useMutation({
    mutationFn: (entryId: string) =>
      apiRequest(`/api/v1/lorebooks/${id}/entries/${entryId}`, { method: 'DELETE' }),
    onSuccess: async () => client.invalidateQueries({ queryKey: ['lorebook', id] }),
  });
  if (!book.data)
    return (
      <div className="empty-state">
        <h2>Загружаем книгу мира…</h2>
      </div>
    );
  if (entryEditor)
    return (
      <LoreEntryForm
        bookId={id}
        entry={entryEditor}
        onBack={() => {
          setEntryEditor(null);
          void client.invalidateQueries({ queryKey: ['lorebook', id] });
        }}
      />
    );
  const attachedIds = new Set(
    attachments.data?.characters.filter((item) => item.enabled).map((item) => item.id),
  );
  return (
    <div className="view-stack">
      <BookForm
        title="Настройки книги"
        initial={book.data}
        pending={save.isPending}
        error={save.error}
        onCancel={onBack}
        onSubmit={(body) => {
          save.mutate(body);
        }}
      />
      <section className="editor-card">
        <div className="section-heading">
          <div>
            <h2>Привязанные персонажи</h2>
            <p>Их диалоги смогут активировать записи этой книги.</p>
          </div>
        </div>
        <div className="check-list">
          {characters.data?.items.map((character) => (
            <label key={character.id}>
              <input
                type="checkbox"
                checked={attachedIds.has(character.id)}
                disabled={attach.isPending}
                onChange={(event) => {
                  attach.mutate({ characterId: character.id, enabled: event.target.checked });
                }}
              />
              <span>{character.name}</span>
            </label>
          ))}
          {characters.data?.items.length === 0 ? (
            <p className="meta">Сначала создай персонажа.</p>
          ) : null}
        </div>
      </section>
      <section className="editor-card">
        <div className="section-heading">
          <div>
            <h2>Записи</h2>
            <p>Primary keys — «или»; при secondary keys требуется совпадение в обеих группах.</p>
          </div>
          <button
            className="compact-primary"
            type="button"
            onClick={() => {
              setEntryEditor('new');
            }}
          >
            ＋ Запись
          </button>
        </div>
        <div className="list-stack">
          {book.data.entries?.map((entry) => (
            <article className="lore-entry-card" key={entry.id}>
              <div>
                <h3>{entry.title}</h3>
                <p>{entry.content}</p>
                <div className="tag-list">
                  {entry.keys.map((key) => (
                    <span key={key}>{key}</span>
                  ))}
                  {!entry.enabled ? <span>Выключена</span> : null}
                </div>
              </div>
              <div className="card-actions">
                <button
                  type="button"
                  onClick={() => {
                    setEntryEditor(entry);
                  }}
                >
                  Изменить
                </button>
                <button
                  className="danger-link"
                  type="button"
                  onClick={() => {
                    if (window.confirm('Удалить эту запись?')) removeEntry.mutate(entry.id);
                  }}
                >
                  Удалить
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function BookForm({
  title,
  initial,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  readonly title: string;
  readonly initial?: Lorebook;
  readonly pending: boolean;
  readonly error: Error | null;
  readonly onCancel: () => void;
  readonly onSubmit: (body: object) => void;
}) {
  const submit = (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({
      name: text(data, 'name'),
      description: text(data, 'description'),
      visibility: text(data, 'visibility'),
    });
  };
  return (
    <div className="view-stack">
      <div className="editor-heading">
        <button type="button" onClick={onCancel}>
          ← Назад
        </button>
        <h1>{title}</h1>
      </div>
      <form className="editor-card" onSubmit={submit}>
        <label className="field">
          <span>Название</span>
          <input name="name" defaultValue={initial?.name} required maxLength={120} />
        </label>
        <label className="field">
          <span>Описание</span>
          <textarea
            name="description"
            defaultValue={initial?.description}
            rows={3}
            maxLength={4000}
          />
        </label>
        <label className="field">
          <span>Видимость</span>
          <select name="visibility" defaultValue={initial?.visibility ?? 'PRIVATE'}>
            <option value="PRIVATE">Только мне</option>
            <option value="UNLISTED">По ссылке</option>
            <option value="PUBLIC">Публичная</option>
          </select>
        </label>
        {error ? (
          <p className="error" role="alert">
            {error.message}
          </p>
        ) : null}
        <div className="editor-actions">
          <button className="secondary" type="button" onClick={onCancel}>
            Отменить
          </button>
          <button className="primary" type="submit" disabled={pending}>
            Сохранить
          </button>
        </div>
      </form>
    </div>
  );
}

function LoreEntryForm({
  bookId,
  entry,
  onBack,
}: {
  readonly bookId: string;
  readonly entry: LoreEntry | 'new';
  readonly onBack: () => void;
}) {
  const existing = entry === 'new' ? null : entry;
  const save = useMutation({
    mutationFn: (body: object) =>
      apiRequest<LoreEntry>(
        existing
          ? `/api/v1/lorebooks/${bookId}/entries/${existing.id}`
          : `/api/v1/lorebooks/${bookId}/entries`,
        {
          method: existing ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    onSuccess: onBack,
  });
  const submit = (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    save.mutate({
      title: text(data, 'title'),
      content: text(data, 'content'),
      keys: splitKeys(text(data, 'keys')),
      secondaryKeys: splitKeys(text(data, 'secondaryKeys')),
      enabled: data.get('enabled') === 'on',
      priority: Number(data.get('priority')),
      position: Number(data.get('position')),
      caseSensitive: data.get('caseSensitive') === 'on',
      matchWholeWord: data.get('matchWholeWord') === 'on',
      scanDepth: Number(data.get('scanDepth')),
      tokenBudget: Number(data.get('tokenBudget')),
    });
  };
  return (
    <div className="view-stack">
      <div className="editor-heading">
        <button type="button" onClick={onBack}>
          ← К книге
        </button>
        <h1>{existing ? 'Изменить запись' : 'Новая запись'}</h1>
      </div>
      <form className="editor-card" onSubmit={submit}>
        <label className="field">
          <span>Заголовок</span>
          <input name="title" defaultValue={existing?.title} required />
        </label>
        <label className="field">
          <span>Содержание</span>
          <textarea name="content" defaultValue={existing?.content} rows={7} required />
        </label>
        <label className="field">
          <span>Основные ключи через запятую</span>
          <input name="keys" defaultValue={existing?.keys.join(', ')} required />
        </label>
        <label className="field">
          <span>Дополнительные ключи через запятую</span>
          <input name="secondaryKeys" defaultValue={existing?.secondaryKeys.join(', ')} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Приоритет</span>
            <input
              name="priority"
              type="number"
              defaultValue={existing?.priority ?? 0}
              min={-10000}
              max={10000}
            />
          </label>
          <label className="field">
            <span>Позиция</span>
            <input name="position" type="number" defaultValue={existing?.position ?? 0} min={0} />
          </label>
          <label className="field">
            <span>Глубина сообщений</span>
            <input
              name="scanDepth"
              type="number"
              defaultValue={existing?.scanDepth ?? 20}
              min={1}
              max={200}
            />
          </label>
          <label className="field">
            <span>Лимит токенов</span>
            <input
              name="tokenBudget"
              type="number"
              defaultValue={existing?.tokenBudget ?? 400}
              min={1}
              max={8192}
            />
          </label>
        </div>
        <div className="check-list inline-checks">
          <label>
            <input name="enabled" type="checkbox" defaultChecked={existing?.enabled ?? true} />
            <span>Включена</span>
          </label>
          <label>
            <input name="caseSensitive" type="checkbox" defaultChecked={existing?.caseSensitive} />
            <span>Учитывать регистр</span>
          </label>
          <label>
            <input
              name="matchWholeWord"
              type="checkbox"
              defaultChecked={existing?.matchWholeWord}
            />
            <span>Только целое слово</span>
          </label>
        </div>
        {save.error ? (
          <p className="error" role="alert">
            {save.error.message}
          </p>
        ) : null}
        <div className="editor-actions">
          <button className="secondary" type="button" onClick={onBack}>
            Отменить
          </button>
          <button className="primary" type="submit" disabled={save.isPending}>
            Сохранить
          </button>
        </div>
      </form>
    </div>
  );
}

function splitKeys(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}
function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}
function visibilityLabel(value: Lorebook['visibility']): string {
  return value === 'PUBLIC' ? 'Публичная' : value === 'UNLISTED' ? 'По ссылке' : 'Личная';
}

function importSelectedFile(
  event: ChangeEvent<HTMLInputElement>,
  importFile: (file: File) => void,
): void {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (file) importFile(file);
}

function downloadTransfer(name: string, transfer: LorebookTransfer): void {
  const blob = new Blob([JSON.stringify(transfer, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = name.replaceAll(/[^\p{L}\p{N}._-]+/gu, '-').replaceAll(/^-+|-+$/gu, '');
  anchor.href = url;
  anchor.download = `${safeName || 'velora-lorebook'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
