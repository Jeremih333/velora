import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { apiRequest } from './api';
import { EmptyState, EntityTabs, Skeleton } from './CoreComponents';
import { ActionMenu, SortDropdown } from './ProductComponents';
import { CharacterImage } from './CharacterImage';
import { ImageUploadControl } from './ImageUploadControl';
import { useI18n, type WebMessages } from './i18n';
import type {
  Character,
  Lorebook,
  LorebookTransfer,
  LoreEntry,
  MediaFile,
  MediaLibraryResponse,
} from './types';
import { VeloraIcon } from './VeloraIcon';
import { parseLibraryUrlState, writeLibraryUrlState, type LibrarySort } from './library-url-state';

interface ListResponse<T> {
  readonly items: readonly T[];
}

export function LorebookCard({ children }: { readonly children: ReactNode }) {
  return <article className="list-card lorebook-list-card">{children}</article>;
}

export function LorebooksView({
  onBack,
  createRequest = 0,
}: {
  readonly onBack: () => void;
  readonly createRequest?: number;
}) {
  const { messages } = useI18n();
  const client = useQueryClient();
  const [editing, setEditing] = useState<Lorebook | 'new' | null>(createRequest > 0 ? 'new' : null);
  const [transferNotice, setTransferNotice] = useState<string | null>(null);
  const [initialUrlState] = useState(() =>
    parseLibraryUrlState(typeof window === 'undefined' ? '' : window.location.search),
  );
  const [query, setQuery] = useState(initialUrlState.query);
  const [sort, setSort] = useState<LibrarySort>(initialUrlState.sort);
  useEffect(() => {
    const search = writeLibraryUrlState(window.location.search, {
      query,
      sort,
      visibility: 'ALL',
      kind: 'ALL',
    });
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${search}${window.location.hash}`,
    );
  }, [query, sort]);
  const importInput = useRef<HTMLInputElement>(null);
  const books = useQuery({
    queryKey: ['lorebooks', query, sort],
    queryFn: () => {
      const parameters = new URLSearchParams({ q: query, sort });
      return apiRequest<ListResponse<Lorebook>>(`/api/v1/lorebooks?${parameters.toString()}`);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/v1/lorebooks/${id}`, { method: 'DELETE' }),
    onSuccess: async () => client.invalidateQueries({ queryKey: ['lorebooks'] }),
  });
  const importBook = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 4 * 1024 * 1024) throw new Error(messages.lorebooks.importTooLarge);
      let transfer: unknown;
      try {
        transfer = JSON.parse(await file.text()) as unknown;
      } catch {
        throw new Error(messages.lorebooks.invalidJson);
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
      setTransferNotice(messages.lorebooks.imported(result.importedEntries));
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
      setTransferNotice(messages.lorebooks.exported);
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
    <div className="view-stack library-view lorebooks-library">
      <header className="view-header library-view-header">
        <div>
          <p className="eyebrow">{messages.lorebooks.eyebrow}</p>
          <h1>{messages.characters.title}</h1>
          <p>{messages.lorebooks.description}</p>
        </div>
        <div className="header-actions">
          <button
            className="compact-primary"
            type="button"
            onClick={() => {
              setEditing('new');
            }}
          >
            {messages.lorebooks.create}
          </button>
          <button
            className="secondary compact-button"
            type="button"
            disabled={importBook.isPending}
            onClick={() => importInput.current?.click()}
          >
            {messages.lorebooks.import}
          </button>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            aria-label={messages.lorebooks.importLabel}
            onChange={(event) => {
              importSelectedFile(event, importBook.mutate);
            }}
          />
        </div>
      </header>
      <EntityTabs
        label={messages.navigation.myLibrary}
        value="lorebooks"
        items={[
          { id: 'characters', label: messages.navigation.characters },
          { id: 'lorebooks', label: messages.lorebooks.title },
        ]}
        onChange={(value) => {
          if (value === 'characters') onBack();
        }}
      />
      <div className="library-controls lorebook-controls">
        <label className="library-search">
          <VeloraIcon name="search" />
          <input
            value={query}
            aria-label={messages.lorebooks.searchLabel}
            placeholder={messages.lorebooks.searchPlaceholder}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
            }}
          />
        </label>
        <SortDropdown
          value={sort}
          onChange={setSort}
          options={[
            { value: 'newest', label: messages.lorebooks.newest },
            { value: 'oldest', label: messages.lorebooks.oldest },
          ]}
          label={messages.lorebooks.sortLabel}
        />
      </div>
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
        <EmptyState
          title={messages.lorebooks.emptyTitle}
          text={messages.lorebooks.emptyText}
          action={
            <button
              className="compact-primary"
              type="button"
              onClick={() => {
                setEditing('new');
              }}
            >
              {messages.lorebooks.create}
            </button>
          }
        />
      ) : null}
      {books.isError ? (
        <p className="error" role="alert">
          {books.error.message}
        </p>
      ) : null}
      {books.isPending ? <Skeleton label={messages.lorebooks.loading} /> : null}
      <div className="list-stack">
        {books.data?.items.map((book) => (
          <LorebookCard key={book.id}>
            <div className="lorebook-cover">
              <CharacterImage
                fileId={book.coverMediaFileId}
                alt={book.name}
                fallback={<VeloraIcon name="book" />}
                previewable
              />
            </div>
            <div className="list-copy">
              <h2>{book.name}</h2>
              <small className="library-owner">{messages.lorebooks.ownerYou}</small>
              <p>{book.description || messages.lorebooks.noDescription}</p>
              <div className="tag-list">
                <span>{visibilityLabel(book.visibility, messages)}</span>
                <span>{messages.lorebooks.entryCount(book.entryCount ?? 0)}</span>
              </div>
            </div>
            <div className="card-actions">
              <ActionMenu
                label={messages.lorebooks.ownerActions(book.name)}
                items={[
                  {
                    label: messages.lorebooks.open,
                    onSelect: () => {
                      setEditing(book);
                    },
                  },
                  {
                    label: messages.lorebooks.export,
                    disabled: exportBook.isPending,
                    onSelect: () => {
                      exportBook.mutate(book);
                    },
                  },
                  {
                    label: messages.lorebooks.remove,
                    danger: true,
                    onSelect: () => {
                      if (window.confirm(messages.lorebooks.removeBookConfirm(book.name)))
                        remove.mutate(book.id);
                    },
                  },
                ]}
              />
            </div>
          </LorebookCard>
        ))}
      </div>
      <p className="meta">{messages.lorebooks.importHint}</p>
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
  const { messages } = useI18n();
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
      title={messages.lorebooks.newBook}
      pending={create.isPending}
      error={create.error}
      onCancel={onCancel}
      onSubmit={(body) => {
        create.mutate(body);
      }}
    />
  );
}

export function LorebookEditor({
  id,
  onBack,
}: {
  readonly id: string;
  readonly onBack: () => void;
}) {
  const { messages } = useI18n();
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
  if (!book.data) return <Skeleton label={messages.lorebooks.loading} />;
  if (entryEditor)
    return (
      <LorebookEntryEditor
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
        title={messages.lorebooks.bookSettings}
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
            <h2>{messages.lorebooks.attachedCharacters}</h2>
            <p>{messages.lorebooks.attachedCharactersHint}</p>
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
            <p className="meta">{messages.lorebooks.createCharacterFirst}</p>
          ) : null}
        </div>
      </section>
      <section className="editor-card">
        <div className="section-heading">
          <div>
            <h2>{messages.lorebooks.entries}</h2>
            <p>{messages.lorebooks.entriesHint}</p>
          </div>
          <button
            className="compact-primary"
            type="button"
            onClick={() => {
              setEntryEditor('new');
            }}
          >
            {messages.lorebooks.addEntry}
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
                  {!entry.enabled ? <span>{messages.lorebooks.disabled}</span> : null}
                </div>
              </div>
              <div className="card-actions">
                <button
                  type="button"
                  onClick={() => {
                    setEntryEditor(entry);
                  }}
                >
                  {messages.lorebooks.edit}
                </button>
                <button
                  className="danger-link"
                  type="button"
                  onClick={() => {
                    if (window.confirm(messages.lorebooks.removeEntryConfirm))
                      removeEntry.mutate(entry.id);
                  }}
                >
                  {messages.lorebooks.remove}
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
  const { messages } = useI18n();
  const [coverMediaFileId, setCoverMediaFileId] = useState(initial?.coverMediaFileId ?? '');
  const media = useQuery({
    queryKey: ['media'],
    queryFn: () => apiRequest<MediaLibraryResponse>('/api/v1/media'),
  });
  const images = (media.data?.items ?? []).filter((item) => item.mimeType.startsWith('image/'));
  const selectedCover = images.find((item) => item.id === coverMediaFileId) ?? null;
  const submit = (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({
      name: text(data, 'name'),
      description: text(data, 'description'),
      visibility: text(data, 'visibility'),
      coverMediaFileId: coverMediaFileId || null,
    });
  };
  return (
    <div className="view-stack">
      <div className="editor-heading">
        <button type="button" onClick={onCancel}>
          {messages.lorebooks.back}
        </button>
        <h1>{title}</h1>
      </div>
      <form className="editor-card lorebook-editor-card" onSubmit={submit}>
        <section className="lorebook-cover-editor" aria-labelledby="lorebook-cover-label">
          <div className="lorebook-cover-preview">
            <CharacterImage
              fileId={selectedCover?.id ?? null}
              alt={messages.lorebooks.cover}
              fallback={<VeloraIcon name="book" />}
            />
          </div>
          <div className="lorebook-cover-controls">
            <label className="field">
              <span id="lorebook-cover-label">{messages.lorebooks.cover}</span>
              <select
                value={coverMediaFileId}
                onChange={(event) => {
                  setCoverMediaFileId(event.currentTarget.value);
                }}
              >
                <option value="">{messages.profile.noAvatar}</option>
                {images.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.originalName ?? item.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <ImageUploadControl
          capabilities={media.data?.capabilities}
          aspectRatio={4 / 3}
          onUploaded={(uploaded: MediaFile) => {
            setCoverMediaFileId(uploaded.id);
          }}
        />
        <label className="field">
          <span>{messages.lorebooks.name}</span>
          <input name="name" defaultValue={initial?.name} required maxLength={120} />
        </label>
        <label className="field">
          <span>{messages.lorebooks.bookDescription}</span>
          <textarea
            name="description"
            defaultValue={initial?.description}
            rows={3}
            maxLength={4000}
          />
        </label>
        <label className="field">
          <span>{messages.lorebooks.visibility}</span>
          <select name="visibility" defaultValue={initial?.visibility ?? 'PRIVATE'}>
            <option value="PRIVATE">{messages.lorebooks.onlyMe}</option>
            <option value="UNLISTED">{messages.lorebooks.unlisted}</option>
            <option value="PUBLIC">{messages.lorebooks.public}</option>
          </select>
        </label>
        {error ? (
          <p className="error" role="alert">
            {error.message}
          </p>
        ) : null}
        <div className="editor-actions">
          <button className="secondary" type="button" onClick={onCancel}>
            {messages.lorebooks.cancel}
          </button>
          <button className="primary" type="submit" disabled={pending}>
            {messages.lorebooks.save}
          </button>
        </div>
      </form>
    </div>
  );
}

export function LorebookEntryEditor({
  bookId,
  entry,
  onBack,
}: {
  readonly bookId: string;
  readonly entry: LoreEntry | 'new';
  readonly onBack: () => void;
}) {
  const { messages } = useI18n();
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
          {messages.lorebooks.backToBook}
        </button>
        <h1>{existing ? messages.lorebooks.editEntry : messages.lorebooks.newEntry}</h1>
      </div>
      <form className="editor-card lorebook-editor-card" onSubmit={submit}>
        <label className="field">
          <span>{messages.lorebooks.entryTitle}</span>
          <input name="title" defaultValue={existing?.title} required />
        </label>
        <label className="field">
          <span>{messages.lorebooks.content}</span>
          <textarea name="content" defaultValue={existing?.content} rows={7} required />
        </label>
        <label className="field">
          <span>{messages.lorebooks.primaryKeys}</span>
          <input name="keys" defaultValue={existing?.keys.join(', ')} required />
        </label>
        <label className="field">
          <span>{messages.lorebooks.secondaryKeys}</span>
          <input name="secondaryKeys" defaultValue={existing?.secondaryKeys.join(', ')} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>{messages.lorebooks.priority}</span>
            <input
              name="priority"
              type="number"
              defaultValue={existing?.priority ?? 0}
              min={-10000}
              max={10000}
            />
          </label>
          <label className="field">
            <span>{messages.lorebooks.position}</span>
            <input name="position" type="number" defaultValue={existing?.position ?? 0} min={0} />
          </label>
          <label className="field">
            <span>{messages.lorebooks.scanDepth}</span>
            <input
              name="scanDepth"
              type="number"
              defaultValue={existing?.scanDepth ?? 20}
              min={1}
              max={200}
            />
          </label>
          <label className="field">
            <span>{messages.lorebooks.tokenBudget}</span>
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
            <span>{messages.lorebooks.enabled}</span>
          </label>
          <label>
            <input name="caseSensitive" type="checkbox" defaultChecked={existing?.caseSensitive} />
            <span>{messages.lorebooks.caseSensitive}</span>
          </label>
          <label>
            <input
              name="matchWholeWord"
              type="checkbox"
              defaultChecked={existing?.matchWholeWord}
            />
            <span>{messages.lorebooks.wholeWord}</span>
          </label>
        </div>
        {save.error ? (
          <p className="error" role="alert">
            {save.error.message}
          </p>
        ) : null}
        <div className="editor-actions">
          <button className="secondary" type="button" onClick={onBack}>
            {messages.lorebooks.cancel}
          </button>
          <button className="primary" type="submit" disabled={save.isPending}>
            {messages.lorebooks.save}
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
function visibilityLabel(value: Lorebook['visibility'], messages: WebMessages): string {
  return value === 'PUBLIC'
    ? messages.lorebooks.public
    : value === 'UNLISTED'
      ? messages.lorebooks.unlisted
      : messages.lorebooks.private;
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
