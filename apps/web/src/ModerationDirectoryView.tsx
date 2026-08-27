import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiRequest } from './api';
import { ErrorState, Skeleton } from './CoreComponents';
import { useI18n } from './i18n';

interface ListResponse<T> {
  readonly items: readonly T[];
}
interface UserItem {
  readonly id: string;
  readonly telegramId: string;
  readonly username: string | null;
  readonly displayName: string;
  readonly role: string;
  readonly moderationState: string;
}
interface CharacterItem {
  readonly id: string;
  readonly name: string;
  readonly publishState: string;
  readonly visibility: string;
  readonly ownerName: string;
}

export function ModerationDirectoryView({
  mode,
  onBack,
  notify,
}: {
  readonly mode: 'users' | 'characters';
  readonly onBack: () => void;
  readonly notify: (message: string | null) => void;
}) {
  const { locale, messages } = useI18n();
  const searchLabel =
    locale === 'ru' ? 'Поиск по имени, ID или Telegram ID' : 'Search by name, ID, or Telegram ID';
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const directory = useQuery<ListResponse<UserItem | CharacterItem>>({
    queryKey: ['moderation-directory', mode, query],
    queryFn: () => apiRequest(`/api/v1/admin/moderation/${mode}?q=${encodeURIComponent(query)}`),
  });
  const changeUserState = useMutation({
    mutationFn: (input: { readonly userId: string; readonly state: 'ACTIVE' | 'BANNED' }) =>
      apiRequest(`/api/v1/admin/moderation/users/${input.userId}/state`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: input.state }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['moderation-directory', 'users'] });
      notify(messages.moderation.decisionNotice);
    },
  });
  return (
    <div className="view-stack moderation-directory">
      <header className="view-header">
        <div>
          <p className="eyebrow">{messages.moderation.eyebrow}</p>
          <h1>{mode === 'users' ? messages.operations.users : messages.navigation.characters}</h1>
          <p>{searchLabel}</p>
        </div>
        <button className="compact-button" type="button" onClick={onBack}>
          {messages.moderation.backToQueue}
        </button>
      </header>
      <label className="search-bar">
        <span className="sr-only">{searchLabel}</span>
        <input
          type="search"
          value={query}
          placeholder={searchLabel}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
        />
      </label>
      {directory.isPending ? <Skeleton label={messages.moderation.loadingQueue} /> : null}
      {directory.isError ? (
        <ErrorState error={directory.error} retry={() => void directory.refetch()} />
      ) : null}
      <div className="list-stack">
        {mode === 'users'
          ? (directory.data?.items as readonly UserItem[] | undefined)?.map((user) => (
              <article className="moderation-directory-card" key={user.id}>
                <div>
                  <strong>{user.displayName}</strong>
                  <small>
                    {user.telegramId} {user.username ? `@${user.username}` : ''} · {user.role}
                  </small>
                  <span className="status-pill">{user.moderationState}</span>
                </div>
                <button
                  className={user.moderationState === 'BANNED' ? 'compact-button' : 'danger-text'}
                  type="button"
                  disabled={changeUserState.isPending}
                  onClick={() => {
                    changeUserState.mutate({
                      userId: user.id,
                      state: user.moderationState === 'BANNED' ? 'ACTIVE' : 'BANNED',
                    });
                  }}
                >
                  {user.moderationState === 'BANNED'
                    ? messages.dataControls.unblock
                    : messages.profile.block}
                </button>
              </article>
            ))
          : (directory.data?.items as readonly CharacterItem[] | undefined)?.map((character) => (
              <article className="moderation-directory-card" key={character.id}>
                <div>
                  <strong>{character.name}</strong>
                  <small>
                    {character.ownerName} · {character.id}
                  </small>
                </div>
                <span className="status-pill">{character.publishState}</span>
              </article>
            ))}
      </div>
      {changeUserState.error ? (
        <p className="error" role="alert">
          {changeUserState.error.message}
        </p>
      ) : null}
    </div>
  );
}
