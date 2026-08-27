import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from './api';
import { CharacterImage } from './CharacterImage';
import { ImageUploadControl } from './ImageUploadControl';
import { localizedErrorMessage } from './error-localization';
import { useI18n } from './i18n';
import { VeloraIcon } from './VeloraIcon';
import type { Character, DiscoveryCharacter, MediaFile, MediaLibraryResponse } from './types';

interface CharacterGroup {
  readonly id: string;
  readonly name: string;
}

interface StartedGroupConversation {
  readonly conversationId: string;
}

interface ListResponse<T> {
  readonly items: readonly T[];
}

type GroupMemberCandidate = Pick<
  Character,
  'id' | 'name' | 'tagline' | 'avatarFileId' | 'avatarFocalX' | 'avatarFocalY'
>;

const copy = {
  ru: {
    eyebrow: 'ТВОЯ ВСЕЛЕННАЯ',
    title: 'Что создаём?',
    intro: 'Выбери формат — редактор откроется здесь, без шторок и лишних переходов.',
    persona: 'Персона',
    personaHint: 'Твой образ и роль в диалогах.',
    character: 'ИИ-персонаж',
    characterHint: 'Характер, голос, история и аватар.',
    group: 'Группа персонажей',
    groupHint: 'Несколько героев в одном живом диалоге.',
    lorebook: 'Lorebook',
    lorebookHint: 'Правила мира, факты и связанный лор.',
    groupTitle: 'Новая группа',
    name: 'Название группы',
    avatar: 'Аватар группы',
    members: 'Персонажи',
    search: 'Найти среди моих персонажей',
    empty: 'Подходящих персонажей нет.',
    add: 'Добавить',
    remove: 'Убрать',
    createCharacter: '+ Создать персонажа',
    characterName: 'Имя персонажа',
    characterTagline: 'Короткое описание',
    characterDescription: 'Описание персонажа',
    characterPersonality: 'Характер и манера поведения',
    characterGreeting: 'Первое сообщение',
    characterAvatar: 'Аватар персонажа',
    saveCharacter: 'Добавить персонажа в группу',
    create: 'Создать группу',
    creating: 'Создаём…',
    cancel: 'Отмена',
    start: 'Начать групповой диалог',
    starting: 'Открываем диалог…',
    required: 'Добавь название и хотя бы одного персонажа.',
    success: 'Группа создана.',
    telegramGuard: 'Telegram-аватар доступен только отдельным ИИ-персонажам, не группам.',
  },
  en: {
    eyebrow: 'YOUR UNIVERSE',
    title: 'What are we creating?',
    intro: 'Choose a format — its editor opens here without drawers or detours.',
    persona: 'Persona',
    personaHint: 'Your identity and role in conversations.',
    character: 'AI character',
    characterHint: 'Personality, voice, story, and avatar.',
    group: 'Character group',
    groupHint: 'Several characters in one living conversation.',
    lorebook: 'Lorebook',
    lorebookHint: 'World rules, facts, and connected lore.',
    groupTitle: 'New group',
    name: 'Group name',
    avatar: 'Group avatar',
    members: 'Characters',
    search: 'Search my characters',
    empty: 'No matching characters.',
    add: 'Add',
    remove: 'Remove',
    createCharacter: '+ Create character',
    characterName: 'Character name',
    characterTagline: 'Short tagline',
    characterDescription: 'Character description',
    characterPersonality: 'Personality and behaviour',
    characterGreeting: 'First message',
    characterAvatar: 'Character avatar',
    saveCharacter: 'Add character to group',
    create: 'Create group',
    creating: 'Creating…',
    cancel: 'Cancel',
    start: 'Start group conversation',
    starting: 'Opening conversation…',
    required: 'Add a name and at least one character.',
    success: 'Group created.',
    telegramGuard: 'Telegram avatars are available only for individual AI characters, not groups.',
  },
} as const;

export function CreateHubView(props: {
  readonly initialEditor?: 'GROUP' | null;
  readonly onCreatePersona: () => void;
  readonly onCreateCharacter: () => void;
  readonly onCreateLorebook: () => void;
  readonly onStarted: (conversationId: string) => void;
}) {
  const { locale, messages } = useI18n();
  const labels = copy[locale];
  const client = useQueryClient();
  const [editor, setEditor] = useState<'GROUP' | null>(props.initialEditor ?? null);
  const [name, setName] = useState('');
  const [avatarFileId, setAvatarFileId] = useState<string | null>(null);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [createdGroup, setCreatedGroup] = useState<CharacterGroup | null>(null);
  const [inlineCharacterOpen, setInlineCharacterOpen] = useState(false);
  const [inlineCharacter, setInlineCharacter] = useState({
    name: '',
    tagline: '',
    description: '',
    personality: '',
    firstMessage: '',
    avatarFileId: null as string | null,
  });
  const characters = useQuery({
    queryKey: ['characters', 'create-group'],
    queryFn: () => apiRequest<ListResponse<Character>>('/api/v1/characters?limit=100&sort=newest'),
    enabled: editor === 'GROUP',
  });
  const media = useQuery({
    queryKey: ['media'],
    queryFn: () => apiRequest<MediaLibraryResponse>('/api/v1/media?limit=1'),
    enabled: editor === 'GROUP',
  });
  const publicCharacters = useQuery({
    queryKey: ['discovery', 'create-group', search],
    queryFn: () =>
      apiRequest<ListResponse<DiscoveryCharacter>>(
        `/api/v1/discovery?q=${encodeURIComponent(search.trim())}&limit=20`,
      ),
    enabled: editor === 'GROUP' && search.trim().length >= 2,
  });
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(locale);
    const combined = new Map<string, GroupMemberCandidate>();
    for (const character of characters.data?.items ?? []) combined.set(character.id, character);
    for (const character of publicCharacters.data?.items ?? [])
      combined.set(character.id, character);
    return [...combined.values()].filter(
      (character) =>
        needle === '' ||
        `${character.name} ${character.tagline}`.toLocaleLowerCase(locale).includes(needle),
    );
  }, [characters.data, locale, publicCharacters.data, search]);
  const createGroup = useMutation({
    mutationFn: () =>
      apiRequest<CharacterGroup>('/api/v1/character-groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, avatarFileId, characterIds: selected }),
      }),
    onSuccess: async (group) => {
      await client.invalidateQueries({ queryKey: ['character-groups'] });
      setNotice(labels.success);
      setCreatedGroup(group);
    },
    onError: (error: Error) => {
      setNotice(localizedErrorMessage(error, messages));
    },
  });
  const createInlineCharacter = useMutation({
    mutationFn: () =>
      apiRequest<Character>('/api/v1/characters', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...inlineCharacter,
          avatarFocalX: 50,
          avatarFocalY: 50,
          scenario: '',
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
          language: locale,
          groupSize: 'single',
          visibility: 'PRIVATE',
          contentRating: 'SAFE',
          tags: [],
        }),
      }),
    onSuccess: async (character) => {
      setSelected((current) => [...current, character.id]);
      setInlineCharacterOpen(false);
      setInlineCharacter({
        name: '',
        tagline: '',
        description: '',
        personality: '',
        firstMessage: '',
        avatarFileId: null,
      });
      await client.invalidateQueries({ queryKey: ['characters'] });
    },
    onError: (error: Error) => {
      setNotice(localizedErrorMessage(error, messages));
    },
  });
  const startGroup = useMutation({
    mutationFn: (groupId: string) =>
      apiRequest<StartedGroupConversation>(`/api/v1/character-groups/${groupId}/conversations`, {
        method: 'POST',
      }),
    onSuccess: ({ conversationId }) => {
      props.onStarted(conversationId);
    },
    onError: (error: Error) => {
      setNotice(localizedErrorMessage(error, messages));
    },
  });
  const openGroup = () => {
    setNotice(null);
    setEditor('GROUP');
  };
  if (editor === 'GROUP')
    return (
      <section className="create-hub create-group-editor">
        <header className="section-heading">
          <span>{labels.eyebrow}</span>
          <h1>{labels.groupTitle}</h1>
        </header>
        {notice ? (
          <p className="form-notice" role="status">
            {notice}
          </p>
        ) : null}
        <label className="create-field">
          <span>{labels.name}</span>
          <input
            value={name}
            maxLength={80}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
        <section className="create-group-block">
          <h2>{labels.avatar}</h2>
          <ImageUploadControl
            capabilities={media.data?.capabilities}
            aspectRatio={1}
            onUploaded={(file: MediaFile) => {
              setAvatarFileId(file.id);
            }}
          />
        </section>
        <section className="create-group-block">
          <div className="create-group-heading">
            <h2>{labels.members}</h2>
            <span>{selected.length}/12</span>
          </div>
          <input
            className="group-search"
            type="search"
            value={search}
            placeholder={labels.search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
          <div className="group-member-list">
            {visible.map((character) => {
              const active = selected.includes(character.id);
              return (
                <article
                  className={active ? 'group-member is-selected' : 'group-member'}
                  key={character.id}
                >
                  <CharacterImage
                    fileId={character.avatarFileId}
                    alt={character.name}
                    focalX={character.avatarFocalX}
                    focalY={character.avatarFocalY}
                    className="group-member-avatar"
                    fallback={
                      <span className="group-member-avatar fallback">
                        {character.name.slice(0, 1)}
                      </span>
                    }
                    previewable
                  />
                  <span>
                    <strong>{character.name}</strong>
                    <small>{character.tagline}</small>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected((current) =>
                        active
                          ? current.filter((id) => id !== character.id)
                          : current.length < 12
                            ? [...current, character.id]
                            : current,
                      );
                    }}
                  >
                    {active ? labels.remove : labels.add}
                  </button>
                </article>
              );
            })}
            {visible.length === 0 ? <p>{labels.empty}</p> : null}
          </div>
          <button
            className="secondary-button animated-create-character"
            type="button"
            onClick={() => {
              setInlineCharacterOpen((current) => !current);
            }}
          >
            {labels.createCharacter}
          </button>
          {inlineCharacterOpen ? (
            <div className="inline-character-editor">
              <label>
                <span>{labels.characterName}</span>
                <input
                  value={inlineCharacter.name}
                  onChange={(event) => {
                    setInlineCharacter((current) => ({ ...current, name: event.target.value }));
                  }}
                />
              </label>
              <label>
                <span>{labels.characterTagline}</span>
                <input
                  value={inlineCharacter.tagline}
                  onChange={(event) => {
                    setInlineCharacter((current) => ({ ...current, tagline: event.target.value }));
                  }}
                />
              </label>
              <label className="inline-character-wide">
                <span>{labels.characterDescription}</span>
                <textarea
                  value={inlineCharacter.description}
                  onChange={(event) => {
                    setInlineCharacter((current) => ({
                      ...current,
                      description: event.target.value,
                    }));
                  }}
                />
              </label>
              <label className="inline-character-wide">
                <span>{labels.characterPersonality}</span>
                <textarea
                  value={inlineCharacter.personality}
                  onChange={(event) => {
                    setInlineCharacter((current) => ({
                      ...current,
                      personality: event.target.value,
                    }));
                  }}
                />
              </label>
              <label className="inline-character-wide">
                <span>{labels.characterGreeting}</span>
                <textarea
                  value={inlineCharacter.firstMessage}
                  onChange={(event) => {
                    setInlineCharacter((current) => ({
                      ...current,
                      firstMessage: event.target.value,
                    }));
                  }}
                />
              </label>
              <section className="inline-character-wide">
                <strong>{labels.characterAvatar}</strong>
                <ImageUploadControl
                  capabilities={media.data?.capabilities}
                  aspectRatio={1}
                  onUploaded={(file) => {
                    setInlineCharacter((current) => ({ ...current, avatarFileId: file.id }));
                  }}
                />
              </section>
              <div className="inline-character-wide editor-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setInlineCharacterOpen(false);
                  }}
                >
                  {labels.cancel}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={createInlineCharacter.isPending}
                  onClick={() => {
                    createInlineCharacter.mutate();
                  }}
                >
                  {labels.saveCharacter}
                </button>
              </div>
            </div>
          ) : null}
        </section>
        <p className="group-telegram-guard">
          <VeloraIcon name="shield" /> {labels.telegramGuard}
        </p>
        <div className="editor-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setEditor(null);
            }}
          >
            {labels.cancel}
          </button>
          {createdGroup ? (
            <button
              type="button"
              className="primary-button"
              disabled={startGroup.isPending}
              onClick={() => {
                startGroup.mutate(createdGroup.id);
              }}
            >
              {startGroup.isPending ? labels.starting : labels.start}
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              disabled={createGroup.isPending || name.trim() === '' || selected.length === 0}
              onClick={() => {
                if (name.trim() === '' || selected.length === 0) {
                  setNotice(labels.required);
                  return;
                }
                createGroup.mutate();
              }}
            >
              {createGroup.isPending ? labels.creating : labels.create}
            </button>
          )}
        </div>
      </section>
    );
  const options = [
    {
      icon: 'persona' as const,
      title: labels.persona,
      hint: labels.personaHint,
      action: props.onCreatePersona,
    },
    {
      icon: 'sparkle' as const,
      title: labels.character,
      hint: labels.characterHint,
      action: props.onCreateCharacter,
    },
    { icon: 'list' as const, title: labels.group, hint: labels.groupHint, action: openGroup },
    {
      icon: 'library' as const,
      title: labels.lorebook,
      hint: labels.lorebookHint,
      action: props.onCreateLorebook,
    },
  ];
  return (
    <section className="create-hub">
      <header className="section-heading">
        <span>{labels.eyebrow}</span>
        <h1>{labels.title}</h1>
        <p>{labels.intro}</p>
      </header>
      <div className="create-option-grid">
        {options.map((option) => (
          <button
            type="button"
            className="create-option-card"
            key={option.title}
            onClick={option.action}
          >
            <span className="create-option-icon">
              <VeloraIcon name={option.icon} />
            </span>
            <span>
              <strong>{option.title}</strong>
              <small>{option.hint}</small>
            </span>
            <VeloraIcon name="chevronRight" />
          </button>
        ))}
      </div>
    </section>
  );
}
