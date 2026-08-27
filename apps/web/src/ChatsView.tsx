import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { apiRequest, apiSse } from './api';
import {
  ChatComposer,
  ChatHeader,
  ChatMenuRow,
  MessageActionMenu,
  MessageBubble,
  MessageList,
  MessageMenuItem,
  ModelCatalog,
  ModelQuickPicker,
  ReactionPopover,
  type MessageReaction,
} from './ChatComponents';
import {
  ActionMenu,
  calculateActionMenuPlacement,
  MemoryEditor,
  MemoryVersionList,
  SortDropdown,
} from './ProductComponents';
import { localizedErrorMessage } from './error-localization';
import { persistChatDraft, readChatDraft } from './chat-drafts';
import { getChatMenuMessages } from './chat-menu-i18n';
import { CharacterImage } from './CharacterImage';
import { Dialog, EmptyState, ErrorState, Skeleton } from './CoreComponents';
import { useI18n, type Locale, type WebMessages } from './i18n';
import { selectMessageWindow } from './message-window';
import { SafeMarkdown } from './SafeMarkdown';
import { useTelegramBackButton } from './telegram-hooks';
import { VeloraIcon } from './VeloraIcon';
import type {
  ChatCharacterProfile,
  ConversationDetail,
  ConversationMemory,
  ConversationMessage,
  ConversationSummary,
  Lorebook,
  MemoryJob,
  MemoryRegenerationPreview,
  MemoryVersion,
  PromptInspectorResponse,
  RoleplayModelCatalog,
} from './types';

interface ListResponse<T> {
  readonly items: readonly T[];
}

interface ConversationListResponse extends ListResponse<ConversationSummary> {
  readonly totalCount: number;
}

interface MessageResponse extends ListResponse<ConversationMessage> {
  readonly activeMessageId: string | null;
}

export function hasConversationDescendants(
  messages: readonly ConversationMessage[],
  messageId: string,
): boolean {
  const byId = new Map(messages.map((message) => [message.id, message] as const));
  for (const candidate of messages) {
    const visited = new Set<string>();
    let parentId = candidate.parentMessageId;
    while (parentId && !visited.has(parentId)) {
      if (parentId === messageId) return true;
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentMessageId ?? null;
    }
  }
  return false;
}

export function ChatsView({
  initialConversationId,
  allowedModelProfiles,
  onConversationOpened,
  onDiscover,
  telegramBackBlocked,
}: {
  readonly initialConversationId: string | null;
  readonly allowedModelProfiles: readonly ('BALANCED' | 'CREATIVE' | 'PREMIUM')[];
  readonly onConversationOpened: (id: string | null) => void;
  readonly onDiscover: () => void;
  readonly telegramBackBlocked: boolean;
}) {
  const { messages } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId);
  if (selectedId) {
    return (
      <div className="desktop-chat-workspace">
        <aside className="desktop-conversation-pane" aria-label={messages.chat.title}>
          <ChatList
            compact
            selectedId={selectedId}
            onDiscover={onDiscover}
            onOpen={(id) => {
              setSelectedId(id);
              onConversationOpened(id);
            }}
          />
        </aside>
        <ChatThread
          key={selectedId}
          conversationId={selectedId}
          allowedModelProfiles={allowedModelProfiles}
          telegramBackBlocked={telegramBackBlocked}
          onBack={() => {
            setSelectedId(null);
            onConversationOpened(null);
          }}
        />
      </div>
    );
  }
  return (
    <ChatList
      onDiscover={onDiscover}
      onOpen={(id) => {
        setSelectedId(id);
        onConversationOpened(id);
      }}
    />
  );
}

function ChatList({
  onOpen,
  onDiscover,
  compact = false,
  selectedId = null,
}: {
  readonly onOpen: (id: string) => void;
  readonly onDiscover: () => void;
  readonly compact?: boolean;
  readonly selectedId?: string | null;
}) {
  const { locale, messages } = useI18n();
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'active'>('newest');
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const conversations = useQuery({
    queryKey: ['conversations', submittedQuery, sort, selecting],
    queryFn: () => {
      const parameters = new URLSearchParams({
        q: submittedQuery,
        sort,
        state: selecting ? 'ALL' : 'ACTIVE',
      });
      return apiRequest<ConversationListResponse>(`/api/v1/conversations?${parameters.toString()}`);
    },
  });
  const setConversationState = useMutation({
    mutationFn: ({ id, state }: { readonly id: string; readonly state: 'ACTIVE' | 'ARCHIVED' }) =>
      apiRequest<ConversationSummary>(`/api/v1/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
  const deleteSelected = useMutation({
    mutationFn: async (ids: readonly string[]) => {
      for (const id of ids) {
        await apiRequest(`/api/v1/conversations/${id}`, { method: 'DELETE' });
      }
    },
    onSuccess: async () => {
      setConfirmingDelete(false);
      setSelecting(false);
      setSelectedIds(new Set());
      await client.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: async () => {
      await client.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
  const visibleIds = conversations.data?.items.map((conversation) => conversation.id) ?? [];
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const leaveSelection = () => {
    setConfirmingDelete(false);
    setSelecting(false);
    setSelectedIds(new Set());
  };
  return (
    <div className={`view-stack chat-list-view${compact ? ' is-compact' : ''}`}>
      <header className="view-header">
        <div>
          <p className="eyebrow">{messages.chat.eyebrow}</p>
          <h1>{messages.chat.title}</h1>
          <p>{messages.chat.description}</p>
        </div>
        <button
          className="compact-primary"
          type="button"
          aria-pressed={selecting}
          onClick={() => {
            if (selecting) leaveSelection();
            else setSelecting(true);
          }}
        >
          {selecting ? messages.chat.manageDone : messages.chat.manage}
        </button>
      </header>
      {selecting ? (
        <div className="chat-selection-toolbar" aria-label={messages.chat.selectionTools}>
          <button
            className="chat-select-all"
            type="button"
            aria-pressed={allVisibleSelected}
            disabled={visibleIds.length === 0 || deleteSelected.isPending}
            onClick={() => {
              setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleIds));
            }}
          >
            <span className="chat-select-indicator" aria-hidden="true">
              {allVisibleSelected ? <VeloraIcon name="check" size={16} /> : null}
            </span>
            <span>{messages.chat.selectAll}</span>
          </button>
          <span className="chat-selected-count" role="status">
            {messages.chat.selectedCount(selectedIds.size)}
          </span>
          <button
            className="danger compact-danger"
            type="button"
            disabled={selectedIds.size === 0 || deleteSelected.isPending}
            onClick={() => {
              setConfirmingDelete(true);
            }}
          >
            {messages.chat.deleteSelected}
          </button>
        </div>
      ) : null}
      <form
        className="search-bar chat-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmittedQuery(query.trim());
        }}
      >
        <VeloraIcon name="search" />
        <input
          value={query}
          aria-label={messages.chat.searchLabel}
          placeholder={messages.chat.searchPlaceholder}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
        />
        <button type="submit" aria-label={messages.chat.search}>
          <VeloraIcon className="chat-search-submit-icon" name="search" />
          <span>{messages.chat.search}</span>
        </button>
      </form>
      <div className="chat-list-toolbar">
        <strong>
          {messages.chat.conversationCount(conversations.data ? conversations.data.totalCount : 0)}
        </strong>
        <SortDropdown
          value={sort}
          label={messages.chat.sortLabel}
          options={[
            { value: 'newest', label: messages.chat.newest },
            { value: 'oldest', label: messages.chat.oldest },
            { value: 'active', label: messages.chat.mostActive },
          ]}
          onChange={(value) => {
            setSort(value);
          }}
        />
      </div>
      {selecting ? <p className="meta">{messages.chat.manageHint}</p> : null}
      {deleteSelected.error ? (
        <p className="error" role="alert">
          {messages.chat.bulkDeleteFailed}
        </p>
      ) : null}
      {conversations.isPending ? <Skeleton label={messages.chat.loading} rows={5} /> : null}
      {conversations.isError ? (
        <p className="error" role="alert">
          {localizedErrorMessage(conversations.error, messages)}
        </p>
      ) : null}
      {conversations.data?.items.length === 0 ? (
        <EmptyState
          title={messages.chat.emptyTitle}
          text={messages.chat.emptyText}
          action={
            <button className="compact-primary" type="button" onClick={onDiscover}>
              {messages.chat.openDiscover}
            </button>
          }
        />
      ) : null}
      <div className="list-stack">
        {conversations.data?.items.map((conversation) => (
          <article
            className={`conversation-card${conversation.state === 'ARCHIVED' ? ' is-archived' : ''}${selecting ? ' is-selecting' : ''}${selectedIds.has(conversation.id) ? ' is-selected' : ''}${selectedId === conversation.id ? ' is-active' : ''}`}
            key={conversation.id}
          >
            {selecting ? (
              <input
                className="conversation-checkbox"
                type="checkbox"
                aria-label={messages.chat.selectConversation(conversation.characterName)}
                checked={selectedIds.has(conversation.id)}
                disabled={deleteSelected.isPending}
                onChange={() => {
                  toggleSelected(conversation.id);
                }}
              />
            ) : null}
            <ChatAvatar
              name={conversation.characterName}
              fileId={conversation.characterAvatarFileId}
              focalX={conversation.characterAvatarFocalX}
              focalY={conversation.characterAvatarFocalY}
            />
            <div className="conversation-copy">
              <button
                className="conversation-open"
                type="button"
                aria-current={selectedId === conversation.id ? 'page' : undefined}
                onClick={() => {
                  if (selecting) toggleSelected(conversation.id);
                  else onOpen(conversation.id);
                }}
              >
                <strong>
                  {conversation.characterName}
                  {conversation.personaName ? ` · ${conversation.personaName}` : ''}
                </strong>
                <span>{conversation.title}</span>
                {conversation.isPreview ? (
                  <small className="preview-pill">{messages.chat.preview}</small>
                ) : null}
              </button>
              <div className="conversation-meta">
                <time>{formatTime(conversation.updatedAt, locale)}</time>
                <span>{messages.chat.messageCount(conversation.messageCount)}</span>
                {conversation.state === 'ARCHIVED' ? <span>{messages.chat.archived}</span> : null}
              </div>
              <p className={expandedId === conversation.id ? 'is-expanded' : ''}>
                {conversation.lastMessage ?? messages.chat.beginning}
              </p>
              {!selecting ? (
                <button
                  className="conversation-expand"
                  type="button"
                  aria-expanded={expandedId === conversation.id}
                  onClick={() => {
                    setExpandedId((value) => (value === conversation.id ? null : conversation.id));
                  }}
                >
                  {expandedId === conversation.id
                    ? messages.chat.collapsePreview
                    : messages.chat.expandPreview}
                </button>
              ) : null}
            </div>
            <ActionMenu
              label={messages.chat.conversationActions(conversation.characterName)}
              items={[
                {
                  label: messages.chat.openConversation,
                  onSelect: () => {
                    onOpen(conversation.id);
                  },
                },
                {
                  label:
                    conversation.state === 'ARCHIVED'
                      ? messages.chat.restoreConversation
                      : messages.chat.archiveConversation,
                  disabled:
                    setConversationState.isPending &&
                    setConversationState.variables.id === conversation.id,
                  onSelect: () => {
                    setConversationState.mutate({
                      id: conversation.id,
                      state: conversation.state === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED',
                    });
                  },
                },
              ]}
            />
          </article>
        ))}
      </div>
      {confirmingDelete ? (
        <div
          className="inline-confirm chat-delete-confirm"
          role="alertdialog"
          aria-label={messages.chat.confirmDeleteTitle}
        >
          <strong>{messages.chat.confirmDeleteTitle}</strong>
          <p>{messages.chat.confirmDeleteBody(selectedIds.size)}</p>
          <div className="dialog-actions">
            <button
              type="button"
              disabled={deleteSelected.isPending}
              onClick={() => {
                setConfirmingDelete(false);
              }}
            >
              {messages.chat.manageDone}
            </button>
            <button
              className="danger"
              type="button"
              disabled={deleteSelected.isPending}
              onClick={() => {
                deleteSelected.mutate([...selectedIds]);
              }}
            >
              {deleteSelected.isPending
                ? messages.chat.deletingSelected
                : messages.chat.confirmDeleteAction}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChatThread({
  conversationId,
  allowedModelProfiles,
  onBack,
  telegramBackBlocked,
}: {
  readonly conversationId: string;
  readonly allowedModelProfiles: readonly ('BALANCED' | 'CREATIVE' | 'PREMIUM')[];
  readonly onBack: () => void;
  readonly telegramBackBlocked: boolean;
}) {
  const { locale, messages: translations } = useI18n();
  const menuMessages = getChatMenuMessages(locale);
  const client = useQueryClient();
  const [draft, setDraft] = useState(() => readChatDraft(conversationId));
  const [streaming, setStreaming] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memoryInvalidated, setMemoryInvalidated] = useState(false);
  const [showLore, setShowLore] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showPromptInspector, setShowPromptInspector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showModelCatalog, setShowModelCatalog] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showCharacterProfile, setShowCharacterProfile] = useState(false);
  const [actionMessageId, setActionMessageId] = useState<string | null>(null);
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(null);
  const [headerReactionOpen, setHeaderReactionOpen] = useState(false);
  const headerReactionTrigger = useRef<HTMLButtonElement>(null);
  const headerReactionMenu = useRef<HTMLDivElement>(null);
  const [headerReactionPosition, setHeaderReactionPosition] = useState({ left: 8, top: 8 });
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [deleteMessageId, setDeleteMessageId] = useState<string | null>(null);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [modelInfoMessageId, setModelInfoMessageId] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState<{
    readonly parentMessageId: string;
    readonly mode: 'REPLY' | 'CONTINUE' | 'GREETING';
  } | null>(null);
  const [showDeleteChat, setShowDeleteChat] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const inspectorOpen = showLore || showMemory || showPromptInspector || showSettings;
  useLayoutEffect(() => {
    if (!headerReactionOpen) return;
    const update = () => {
      const anchorRect = headerReactionTrigger.current?.getBoundingClientRect();
      const menuRect = headerReactionMenu.current?.getBoundingClientRect();
      if (!anchorRect || !menuRect) return;
      setHeaderReactionPosition(
        calculateActionMenuPlacement({
          anchor: anchorRect,
          menu: menuRect,
          viewport: {
            width: document.documentElement.clientWidth,
            height: window.visualViewport?.height ?? window.innerHeight,
          },
        }),
      );
    };
    update();
    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        headerReactionTrigger.current?.contains(target) ||
        headerReactionMenu.current?.contains(target)
      ) {
        return;
      }
      setHeaderReactionOpen(false);
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    document.addEventListener('mousedown', closeOutside);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      document.removeEventListener('mousedown', closeOutside);
    };
  }, [headerReactionOpen]);
  const closeInspector = useCallback(() => {
    setShowLore(false);
    setShowMemory(false);
    setShowPromptInspector(false);
    setShowSettings(false);
    setShowTools(false);
  }, []);
  useEffect(() => {
    if (!inspectorOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeInspector();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [closeInspector, inspectorOpen]);
  const handleBack = useCallback(() => {
    if (showCharacterProfile) setShowCharacterProfile(false);
    else if (showModelCatalog) setShowModelCatalog(false);
    else if (showModelPicker) setShowModelPicker(false);
    else if (showLore) setShowLore(false);
    else if (showMemory) setShowMemory(false);
    else if (showPromptInspector) setShowPromptInspector(false);
    else if (showSettings) setShowSettings(false);
    else if (showTools) setShowTools(false);
    else if (headerReactionOpen) setHeaderReactionOpen(false);
    else if (reactionMessageId) setReactionMessageId(null);
    else if (actionMessageId) setActionMessageId(null);
    else if (editingMessageId) setEditingMessageId(null);
    else if (deleteMessageId) setDeleteMessageId(null);
    else if (reportMessageId) setReportMessageId(null);
    else if (modelInfoMessageId) setModelInfoMessageId(null);
    else if (showDeleteChat) setShowDeleteChat(false);
    else onBack();
  }, [
    actionMessageId,
    deleteMessageId,
    editingMessageId,
    headerReactionOpen,
    modelInfoMessageId,
    onBack,
    reactionMessageId,
    reportMessageId,
    showCharacterProfile,
    showDeleteChat,
    showLore,
    showMemory,
    showModelCatalog,
    showModelPicker,
    showPromptInspector,
    showSettings,
    showTools,
  ]);
  const nativeBackVisible = useTelegramBackButton(!telegramBackBlocked, handleBack);
  const [visibleMessageCount, setVisibleMessageCount] = useState(80);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const previousScrollHeightRef = useRef<number | null>(null);
  const conversation = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => apiRequest<ConversationDetail>(`/api/v1/conversations/${conversationId}`),
  });
  const selectGroupSpeaker = useMutation({
    mutationFn: ({
      groupId,
      characterId,
    }: {
      readonly groupId: string;
      readonly characterId: string;
    }) =>
      apiRequest<{ readonly activeCharacterId: string }>(
        `/api/v1/character-groups/${groupId}/conversations/${conversationId}/speaker`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ characterId }),
        },
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
    onError: (caught) => {
      setError(
        caught instanceof Error
          ? localizedErrorMessage(caught, translations)
          : translations.chat.sendFailed,
      );
    },
  });
  const messages = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => apiRequest<MessageResponse>(`/api/v1/conversations/${conversationId}/messages`),
  });
  const modelCatalog = useQuery({
    queryKey: ['roleplay-model-catalog'],
    queryFn: () => apiRequest<RoleplayModelCatalog>('/api/v1/conversations/models/catalog'),
  });
  const selectedModel = modelCatalog.data?.items.find(
    (model) => model.id === conversation.data?.settings.modelProfileId,
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      persistChatDraft(conversationId, draft);
    }, 250);
    return () => {
      window.clearTimeout(timer);
    };
  }, [conversationId, draft]);
  useEffect(() => {
    if (!showModelPicker && !showModelCatalog) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowModelPicker(false);
      setShowModelCatalog(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showModelCatalog, showModelPicker]);
  const selectModel = useMutation({
    mutationFn: (modelProfileId: string) =>
      apiRequest<ConversationDetail>(`/api/v1/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modelProfileId }),
      }),
    onSuccess: async () => {
      setShowModelPicker(false);
      await client.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
  });
  const reactToMessage = useMutation({
    mutationFn: async ({
      message,
      reaction,
    }: {
      readonly message: ConversationMessage;
      readonly reaction: MessageReaction;
    }) => {
      if (!message.generationId) throw new Error(translations.chat.reactionUnavailable);
      const remove = message.reaction === reaction;
      return apiRequest<{
        readonly generationId: string;
        readonly reaction: MessageReaction | null;
      }>(
        `/api/v1/conversations/${conversationId}/generations/${message.generationId}/reaction`,
        remove
          ? { method: 'DELETE' }
          : {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ reaction }),
            },
      );
    },
    onSuccess: async () => {
      setReactionMessageId(null);
      await client.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
    onError: (caught) => {
      setError(
        caught instanceof Error
          ? localizedErrorMessage(caught, translations)
          : translations.chat.reactionFailed,
      );
    },
  });
  useEffect(() => {
    if (!reactionMessageId) return;
    const frame = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    const closeReaction = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') setReactionMessageId(null);
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.message-reaction-popover, .message-reaction-trigger')) return;
      setReactionMessageId(null);
    };
    document.addEventListener('mousedown', closeReaction);
    document.addEventListener('keydown', closeReaction);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', closeReaction);
      document.removeEventListener('keydown', closeReaction);
    };
  }, [reactionMessageId]);
  useEffect(() => {
    if (!actionMessageId) return;
    const closeActions = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') setActionMessageId(null);
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.message-actions, .message-action-trigger')) return;
      setActionMessageId(null);
    };
    document.addEventListener('mousedown', closeActions);
    document.addEventListener('keydown', closeActions);
    return () => {
      document.removeEventListener('mousedown', closeActions);
      document.removeEventListener('keydown', closeActions);
    };
  }, [actionMessageId]);
  const messageWindow = selectMessageWindow(messages.data?.items ?? [], visibleMessageCount);
  const latestRateableMessage = [...messageWindow.visible]
    .reverse()
    .find((message) => message.role === 'ASSISTANT' && Boolean(message.generationId));
  useLayoutEffect(() => {
    const previousHeight = previousScrollHeightRef.current;
    const list = messageListRef.current;
    if (previousHeight === null || !list) return;
    list.scrollTop += list.scrollHeight - previousHeight;
    previousScrollHeightRef.current = null;
  }, [visibleMessageCount]);
  useEffect(() => {
    if (nearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.data, streaming]);

  const streamReply = async (parentMessageId: string, mode: 'REPLY' | 'CONTINUE' | 'GREETING') => {
    setRetryAttempt({ parentMessageId, mode });
    setStreaming('');
    setGenerationId(null);
    await apiSse(
      `/api/v1/conversations/${conversationId}/generate`,
      { parentMessageId, mode, idempotencyKey: crypto.randomUUID() },
      ({ event: eventName, data }) => {
        if (eventName === 'meta' && isRecord(data) && typeof data['generationId'] === 'string') {
          setGenerationId(data['generationId']);
        }
        const streamedText = isRecord(data) ? data['text'] : undefined;
        if (eventName === 'delta' && typeof streamedText === 'string') {
          if (!nearBottomRef.current) setShowJumpToBottom(true);
          setStreaming((value) => value + streamedText);
        }
      },
    );
    setGenerationId(null);
    setStreaming('');
    setRetryAttempt(null);
    await Promise.all([
      client.invalidateQueries({ queryKey: ['messages', conversationId] }),
      client.invalidateQueries({ queryKey: ['conversations'] }),
      client.invalidateQueries({ queryKey: ['me'] }),
    ]);
  };

  const send = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    setStreaming('');
    try {
      const userMessage = await apiRequest<ConversationMessage>(
        `/api/v1/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content, idempotencyKey: crypto.randomUUID() }),
        },
      );
      setDraft('');
      await client.invalidateQueries({ queryKey: ['messages', conversationId] });
      await streamReply(userMessage.id, 'REPLY');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? localizedErrorMessage(caught, translations)
          : translations.chat.sendFailed,
      );
      await client.invalidateQueries({ queryKey: ['messages', conversationId] });
    } finally {
      setGenerationId(null);
      setSending(false);
    }
  };

  const runMessageGeneration = async (
    parentMessageId: string,
    mode: 'REPLY' | 'CONTINUE' | 'GREETING',
  ) => {
    if (sending) return;
    setSending(true);
    setError(null);
    setActionMessageId(null);
    try {
      await streamReply(parentMessageId, mode);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? localizedErrorMessage(caught, translations)
          : translations.chat.variantFailed,
      );
      await client.invalidateQueries({ queryKey: ['messages', conversationId] });
    } finally {
      setGenerationId(null);
      setSending(false);
    }
  };

  const activateVariant = async (messageId: string, descend = false) => {
    setError(null);
    try {
      await apiRequest(
        `/api/v1/conversations/${conversationId}/active-message/${messageId}?descend=${descend ? '1' : '0'}`,
        { method: 'PUT' },
      );
      setActionMessageId(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['messages', conversationId] }),
        client.invalidateQueries({ queryKey: ['conversation', conversationId] }),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? localizedErrorMessage(caught, translations)
          : translations.chat.branchFailed,
      );
    }
  };

  const saveEditedMessage = async (message: ConversationMessage) => {
    const content = editDraft.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const edited = await apiRequest<ConversationMessage>(
        `/api/v1/conversations/${conversationId}/messages/${message.id}/edit`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content, idempotencyKey: crypto.randomUUID() }),
        },
      );
      setEditingMessageId(null);
      setEditDraft('');
      await client.invalidateQueries({ queryKey: ['messages', conversationId] });
      if (message.role === 'USER') await streamReply(edited.id, 'REPLY');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? localizedErrorMessage(caught, translations)
          : translations.chat.editFailed,
      );
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async () => {
    if (!deleteMessageId) return;
    setError(null);
    try {
      await apiRequest(`/api/v1/conversations/${conversationId}/messages/${deleteMessageId}`, {
        method: 'DELETE',
      });
      setDeleteMessageId(null);
      setActionMessageId(null);
      setMemoryInvalidated(true);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['messages', conversationId] }),
        client.invalidateQueries({ queryKey: ['conversation', conversationId] }),
        client.invalidateQueries({ queryKey: ['conversation-memory', conversationId] }),
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? localizedErrorMessage(caught, translations)
          : translations.chat.deleteFailed,
      );
    }
  };

  const reportMessage = async () => {
    if (!reportMessageId || reportDetails.trim().length < 10) return;
    try {
      await apiRequest('/api/v1/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetType: 'GENERATED_MESSAGE',
          targetId: reportMessageId,
          reason: 'OTHER',
          description: reportDetails.trim(),
        }),
      });
      setReportMessageId(null);
      setReportDetails('');
      setActionMessageId(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? localizedErrorMessage(caught, translations)
          : translations.chat.reportFailed,
      );
    }
  };

  const deleteChat = async () => {
    try {
      await apiRequest(`/api/v1/conversations/${conversationId}`, { method: 'DELETE' });
      await client.invalidateQueries({ queryKey: ['conversations'] });
      onBack();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? localizedErrorMessage(caught, translations)
          : translations.chat.deleteChatFailed,
      );
    }
  };
  const activeGroup = conversation.data?.group ?? null;
  const activeMessageId = conversation.data?.activeMessageId ?? null;

  return (
    <div className={`chat-view${inspectorOpen ? ' has-inspector' : ''}`}>
      <ChatHeader>
        {!nativeBackVisible ? (
          <button type="button" aria-label={translations.chat.back} onClick={handleBack}>
            <VeloraIcon name="arrowLeft" />
          </button>
        ) : null}
        <ChatAvatar
          name={conversation.data?.characterName ?? 'V'}
          fileId={conversation.data?.characterAvatarFileId ?? null}
          focalX={conversation.data?.characterAvatarFocalX ?? 50}
          focalY={conversation.data?.characterAvatarFocalY ?? 50}
        />
        <button
          className="chat-title"
          type="button"
          aria-label={menuMessages.openProfile}
          onClick={() => {
            setHeaderReactionOpen(false);
            setShowModelPicker(false);
            setShowTools(false);
            setShowCharacterProfile(true);
          }}
        >
          <strong>{conversation.data?.characterName ?? translations.chat.storyFallback}</strong>
          <small>
            {sending
              ? translations.chat.generating
              : conversation.data?.isPreview
                ? translations.chat.privatePreview
                : (conversation.data?.title ?? translations.chat.roleplayStory)}
          </small>
        </button>
        {latestRateableMessage ? (
          <span className="chat-header-reaction">
            <button
              ref={headerReactionTrigger}
              className="chat-reaction-button"
              type="button"
              aria-label={translations.chat.rateResponse}
              aria-expanded={headerReactionOpen}
              onClick={() => {
                setShowModelPicker(false);
                setShowTools(false);
                setHeaderReactionOpen((value) => !value);
              }}
            >
              <VeloraIcon name="heart" size={17} />
            </button>
            {headerReactionOpen
              ? createPortal(
                  <div
                    ref={headerReactionMenu}
                    className="chat-header-reaction-portal"
                    style={{
                      left: headerReactionPosition.left,
                      top: headerReactionPosition.top,
                    }}
                  >
                    <ReactionPopover
                      label={translations.chat.reactionMenu}
                      current={latestRateableMessage.reaction}
                      pending={reactToMessage.isPending}
                      labels={{
                        POSITIVE: translations.chat.reactionPositive,
                        NEGATIVE: translations.chat.reactionNegative,
                        EXCEPTIONAL: translations.chat.reactionExceptional,
                      }}
                      onSelect={(reaction) => {
                        reactToMessage.mutate({ message: latestRateableMessage, reaction });
                        setHeaderReactionOpen(false);
                      }}
                    />
                  </div>,
                  document.body,
                )
              : null}
          </span>
        ) : null}
        <button
          className="chat-model-button"
          type="button"
          aria-label={translations.chat.quickModelPicker}
          aria-expanded={showModelPicker}
          onClick={() => {
            setHeaderReactionOpen(false);
            setShowTools(false);
            setShowLore(false);
            setShowMemory(false);
            setShowPromptInspector(false);
            setShowSettings(false);
            setShowModelCatalog(false);
            setShowModelPicker((value) => !value);
          }}
        >
          <VeloraIcon name="sparkle" size={17} />
          <span>{selectedModel?.displayName ?? translations.chat.modelUnknown}</span>
          <VeloraIcon name="chevronDown" />
        </button>
        <button
          className="chat-context-button"
          type="button"
          aria-label={translations.chat.storyTools}
          onClick={() => {
            setShowTools((value) => !value);
          }}
        >
          <VeloraIcon name="moreHorizontal" />
        </button>
      </ChatHeader>
      {activeGroup ? (
        <section className="group-chat-controls" aria-label={activeGroup.name}>
          <div className="group-chat-members" role="list">
            {activeGroup.members.map((member) => (
              <button
                type="button"
                role="listitem"
                className={
                  member.characterId === activeGroup.activeCharacterId
                    ? 'group-chat-member is-active'
                    : 'group-chat-member'
                }
                aria-pressed={member.characterId === activeGroup.activeCharacterId}
                disabled={sending || selectGroupSpeaker.isPending}
                onClick={() => {
                  selectGroupSpeaker.mutate({
                    groupId: activeGroup.id,
                    characterId: member.characterId,
                  });
                }}
              >
                <CharacterImage
                  fileId={member.avatarFileId}
                  alt=""
                  focalX={member.avatarFocalX}
                  focalY={member.avatarFocalY}
                  className="group-chat-member-avatar"
                  fallback={
                    <span className="group-chat-member-avatar fallback">
                      {member.name.slice(0, 1)}
                    </span>
                  }
                />
                <span>{member.name}</span>
              </button>
            ))}
          </div>
          <div className="group-chat-actions">
            <small>
              {activeGroup.routingMode === 'CONTEXTUAL'
                ? locale === 'ru'
                  ? 'Ответ по контексту'
                  : 'Context routing'
                : locale === 'ru'
                  ? 'Персонаж выбран вручную'
                  : 'Manual speaker'}
            </small>
            <button
              type="button"
              disabled={sending || !activeMessageId}
              onClick={() => {
                if (activeMessageId) void runMessageGeneration(activeMessageId, 'CONTINUE');
              }}
            >
              {locale === 'ru' ? 'Продолжить' : 'Continue'}
            </button>
          </div>
        </section>
      ) : null}
      {showModelPicker ? (
        <div
          className="chat-model-picker-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowModelPicker(false);
          }}
        >
          <ModelQuickPicker
            label={translations.chat.quickModelPicker}
            models={modelCatalog.data?.items ?? []}
            selectedId={conversation.data?.settings.modelProfileId ?? null}
            pending={selectModel.isPending}
            onSelect={(modelId) => {
              selectModel.mutate(modelId);
            }}
            onClose={() => {
              setShowModelPicker(false);
            }}
            onOpenCatalog={() => {
              setShowModelPicker(false);
              setShowModelCatalog(true);
            }}
            onOpenSettings={() => {
              setShowModelPicker(false);
              setShowTools(true);
              setShowLore(false);
              setShowMemory(false);
              setShowPromptInspector(false);
              setShowSettings(true);
            }}
            labels={{
              selected: translations.chat.selectedModelBadge,
              free: translations.chat.freeTier,
              standard: translations.chat.standardTier,
              premium: translations.chat.premiumTier,
              providerUnavailable: translations.chat.providerUnavailable,
              planUnavailable: translations.chat.planUnavailable,
              openCatalog: translations.chat.openFullModelCatalog,
              generationSettings: translations.chat.openGenerationSettings,
              close: translations.chat.closeModelPicker,
            }}
          />
          {modelCatalog.error ? (
            <span className="error" role="alert">
              {localizedErrorMessage(modelCatalog.error, translations)}
            </span>
          ) : null}
          {selectModel.error ? (
            <span className="error" role="alert">
              {localizedErrorMessage(selectModel.error, translations)}
            </span>
          ) : null}
        </div>
      ) : null}
      {showModelCatalog ? (
        <div
          className="chat-model-picker-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowModelCatalog(false);
          }}
        >
          <ModelCatalog
            label={translations.chat.fullModelCatalog}
            description={translations.chat.fullModelCatalogText}
            models={modelCatalog.data?.items ?? []}
            closeLabel={translations.chat.closeModelCatalog}
            onClose={() => {
              setShowModelCatalog(false);
            }}
            labels={{
              bestFor: translations.chat.bestFor,
              speed: translations.chat.modelSpeed,
              quality: translations.chat.modelQuality,
              roleplay: translations.chat.modelRoleplay,
              memory: translations.chat.modelMemory,
              provider: translations.chat.modelProvider,
              cost: translations.chat.modelCost,
              context: translations.chat.modelContext,
              output: translations.chat.modelOutput,
              free: translations.chat.freeTier,
              standard: translations.chat.standardTier,
              premium: translations.chat.premiumTier,
              providerUnavailable: translations.chat.providerUnavailable,
              planUnavailable: translations.chat.planUnavailable,
              restrictionNotice: translations.chat.modelRestrictionNotice,
            }}
          />
        </div>
      ) : null}
      {showTools ? (
        <Dialog
          backdropClassName="chat-menu-backdrop"
          className="chat-menu"
          label={translations.chat.storyTools}
          onClose={() => {
            setShowTools(false);
          }}
        >
          <>
            <header className="chat-menu-header">
              <span>{translations.chat.storyTools}</span>
              <button
                type="button"
                aria-label={menuMessages.closeMenu}
                onClick={() => {
                  setShowTools(false);
                }}
              >
                <VeloraIcon name="close" />
              </button>
            </header>
            <div className="chat-menu-scroll">
              <p className="chat-menu-group">{menuMessages.groupCharacter}</p>
              <ChatMenuRow
                icon="persona"
                title={menuMessages.profileTool}
                hint={conversation.data?.characterName ?? menuMessages.profileToolHint}
                onClick={() => {
                  closeInspector();
                  setShowCharacterProfile(true);
                }}
              />
              <p className="chat-menu-group">{menuMessages.groupGeneration}</p>
              <ChatMenuRow
                icon="sparkle"
                title={menuMessages.modelTool}
                hint={selectedModel?.displayName ?? menuMessages.modelToolHint}
                onClick={() => {
                  closeInspector();
                  setShowModelPicker(true);
                }}
              />
              <ChatMenuRow
                icon="settings"
                title={menuMessages.settingsTool}
                hint={menuMessages.settingsToolHint}
                selected={showSettings}
                onClick={() => {
                  setShowLore(false);
                  setShowMemory(false);
                  setShowPromptInspector(false);
                  setShowSettings(true);
                  setShowTools(false);
                }}
              />
              <p className="chat-menu-group">{menuMessages.groupContext}</p>
              <ChatMenuRow
                icon="book"
                title={menuMessages.memoryTool}
                hint={
                  conversation.data?.memoryStale
                    ? menuMessages.memoryToolStaleHint
                    : menuMessages.memoryToolHint
                }
                badge={conversation.data?.memoryStale ?? false}
                selected={showMemory}
                onClick={() => {
                  setShowLore(false);
                  setShowPromptInspector(false);
                  setShowSettings(false);
                  setShowMemory(true);
                  setShowTools(false);
                }}
              />
              <ChatMenuRow
                icon="library"
                title={menuMessages.loreTool}
                hint={menuMessages.loreToolHint}
                selected={showLore}
                onClick={() => {
                  setShowMemory(false);
                  setShowPromptInspector(false);
                  setShowSettings(false);
                  setShowLore(true);
                  setShowTools(false);
                }}
              />
              {conversation.data?.promptInspectorAvailable ? (
                <ChatMenuRow
                  icon="info"
                  title={menuMessages.promptTool}
                  hint={menuMessages.promptToolHint}
                  selected={showPromptInspector}
                  onClick={() => {
                    setShowLore(false);
                    setShowMemory(false);
                    setShowSettings(false);
                    setShowPromptInspector(true);
                    setShowTools(false);
                  }}
                />
              ) : null}
              <p className="chat-menu-group">{menuMessages.groupDanger}</p>
              <ChatMenuRow
                icon="delete"
                title={menuMessages.deleteChatTool}
                hint={menuMessages.deleteChatToolHint}
                danger
                onClick={() => {
                  closeInspector();
                  setShowDeleteChat(true);
                }}
              />
            </div>
          </>
        </Dialog>
      ) : null}
      {inspectorOpen ? (
        <section className="chat-inspector-slot" aria-label={translations.chat.desktopInspector}>
          <button
            className="chat-inspector-close"
            type="button"
            aria-label={translations.chat.closeInspector}
            onClick={closeInspector}
          >
            <VeloraIcon name="close" />
          </button>
          {showLore ? <LoreInspector conversationId={conversationId} /> : null}
          {showMemory ? <ChatMemoryPanel conversationId={conversationId} /> : null}
          {showPromptInspector ? <ChatPromptInspector conversationId={conversationId} /> : null}
          {showSettings && conversation.data ? (
            <ChatSettingsPanel
              conversation={conversation.data}
              allowedModelProfiles={allowedModelProfiles}
              onRequestDelete={() => {
                setShowDeleteChat(true);
              }}
            />
          ) : null}
        </section>
      ) : null}
      <MessageList
        aria-live="polite"
        ref={messageListRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          nearBottomRef.current = nearBottom;
          if (nearBottom) setShowJumpToBottom(false);
        }}
      >
        {messageWindow.hiddenCount > 0 ? (
          <button
            className="load-earlier-messages"
            type="button"
            onClick={() => {
              previousScrollHeightRef.current = messageListRef.current?.scrollHeight ?? null;
              setVisibleMessageCount((count) => count + 80);
            }}
          >
            {translations.chat.showEarlier(messageWindow.hiddenCount)}
          </button>
        ) : null}
        {messageWindow.visible.map((message) => {
          const content =
            message.content || (message.status === 'FAILED' ? translations.chat.unfinished : '');
          const variants = message.variantIds;
          const variantCount = message.variantCount;
          const variantIndex = message.variantIndex;
          const editCreatesBranch =
            message.role === 'USER' &&
            hasConversationDescendants(messages.data?.items ?? [], message.id);
          return (
            <MessageBubble
              key={message.id}
              role={message.role === 'USER' ? 'USER' : 'ASSISTANT'}
              body={
                editingMessageId === message.id ? (
                  <form
                    className="message-edit-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveEditedMessage(message);
                    }}
                  >
                    <textarea
                      aria-label={translations.chat.editedText}
                      value={editDraft}
                      maxLength={16_000}
                      onChange={(event) => {
                        setEditDraft(event.target.value);
                      }}
                    />
                    {editCreatesBranch ? (
                      <p className="message-edit-branch-warning" role="note">
                        {translations.chat.editCreatesBranch}
                      </p>
                    ) : null}
                    <div
                      className="message-edit-preview"
                      aria-label={translations.chat.editPreview}
                    >
                      <SafeMarkdown content={editDraft} />
                    </div>
                    <span>
                      <button type="submit" disabled={!editDraft.trim() || sending}>
                        {translations.chat.save}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMessageId(null);
                        }}
                      >
                        {translations.chat.cancel}
                      </button>
                    </span>
                  </form>
                ) : (
                  <SafeMarkdown content={content} />
                )
              }
              editedLabel={message.editedAt ? translations.chat.edited : null}
              timeLabel={formatTime(message.createdAt, locale)}
              actionLabel={translations.chat.messageActions}
              actionOpen={actionMessageId === message.id}
              onToggleActions={() => {
                setReactionMessageId(null);
                setActionMessageId((current) => (current === message.id ? null : message.id));
              }}
              {...(message.role === 'ASSISTANT' && message.generationId
                ? {
                    reaction: {
                      label: translations.chat.rateResponse,
                      current: message.reaction,
                      open: reactionMessageId === message.id,
                      onToggle: () => {
                        setActionMessageId(null);
                        setReactionMessageId((current) =>
                          current === message.id ? null : message.id,
                        );
                      },
                    },
                  }
                : {})}
              {...(variantCount > 1
                ? {
                    variants: {
                      label: translations.chat.variants,
                      previousLabel: translations.chat.previousVariant,
                      nextLabel: translations.chat.nextVariant,
                      index: variantIndex,
                      count: variantCount,
                      onPrevious: () => {
                        const previous = variants[variantIndex - 1];
                        if (previous) void activateVariant(previous, true);
                      },
                      onNext: () => {
                        const next = variants[variantIndex + 1];
                        if (next) void activateVariant(next, true);
                      },
                    },
                  }
                : {})}
            >
              {reactionMessageId === message.id && message.generationId ? (
                <ReactionPopover
                  label={translations.chat.reactionMenu}
                  current={message.reaction}
                  pending={reactToMessage.isPending}
                  labels={{
                    POSITIVE: translations.chat.reactionPositive,
                    NEGATIVE: translations.chat.reactionNegative,
                    EXCEPTIONAL: translations.chat.reactionExceptional,
                  }}
                  onSelect={(reaction) => {
                    reactToMessage.mutate({ message, reaction });
                  }}
                />
              ) : null}
              {actionMessageId === message.id ? (
                <MessageActionMenu
                  label={translations.chat.messageMenu}
                  align={message.role === 'ASSISTANT' ? 'end' : 'start'}
                >
                  <MessageMenuItem
                    icon="copy"
                    onClick={() => {
                      void copyText(content)
                        .then(() => {
                          setActionMessageId(null);
                        })
                        .catch(() => {
                          setError(translations.chat.copyFailed);
                        });
                    }}
                  >
                    {translations.chat.copy}
                  </MessageMenuItem>
                  <MessageMenuItem
                    icon="edit"
                    onClick={() => {
                      setEditDraft(content);
                      setEditingMessageId(message.id);
                      setActionMessageId(null);
                    }}
                  >
                    {translations.chat.edit}
                  </MessageMenuItem>
                  {!message.isGreeting ? (
                    <MessageMenuItem
                      icon="branch"
                      onClick={() => {
                        void activateVariant(message.id);
                      }}
                    >
                      {translations.chat.branchHere}
                    </MessageMenuItem>
                  ) : null}
                  {message.isGreeting ? (
                    <MessageMenuItem
                      icon="regenerate"
                      disabled={sending}
                      onClick={() => {
                        void runMessageGeneration(message.id, 'GREETING');
                      }}
                    >
                      {translations.chat.regenerateGreeting}
                    </MessageMenuItem>
                  ) : message.role === 'ASSISTANT' && message.parentMessageId ? (
                    <MessageMenuItem
                      icon="regenerate"
                      disabled={sending}
                      onClick={() => {
                        void runMessageGeneration(message.parentMessageId ?? '', 'REPLY');
                      }}
                    >
                      {translations.chat.regenerate}
                    </MessageMenuItem>
                  ) : null}
                  {message.role === 'ASSISTANT' && !message.isGreeting ? (
                    <MessageMenuItem
                      icon="fastForward"
                      disabled={sending}
                      onClick={() => {
                        void runMessageGeneration(message.id, 'CONTINUE');
                      }}
                    >
                      {translations.chat.continueAnswer}
                    </MessageMenuItem>
                  ) : null}
                  {!message.isGreeting && (message.model || message.provider) ? (
                    <MessageMenuItem
                      icon="info"
                      onClick={() => {
                        setModelInfoMessageId((current) =>
                          current === message.id ? null : message.id,
                        );
                      }}
                    >
                      {translations.chat.modelInfo}
                    </MessageMenuItem>
                  ) : null}
                  {message.role === 'ASSISTANT' && !message.isGreeting ? (
                    <MessageMenuItem
                      icon="star"
                      onClick={() => {
                        setActionMessageId(null);
                        setReactionMessageId(message.id);
                      }}
                    >
                      {translations.chat.rateResponse}
                    </MessageMenuItem>
                  ) : null}
                  {message.role === 'ASSISTANT' && !message.isGreeting ? (
                    <MessageMenuItem
                      icon="flag"
                      onClick={() => {
                        setReportMessageId(message.id);
                        setActionMessageId(null);
                      }}
                    >
                      {translations.chat.report}
                    </MessageMenuItem>
                  ) : null}
                  {!message.isGreeting ? (
                    <MessageMenuItem
                      icon="delete"
                      className="danger-text"
                      onClick={() => {
                        setDeleteMessageId(message.id);
                        setActionMessageId(null);
                      }}
                    >
                      {translations.chat.delete}
                    </MessageMenuItem>
                  ) : null}
                </MessageActionMenu>
              ) : null}
              {modelInfoMessageId === message.id ? (
                <p className="message-model-info">
                  {message.model ?? translations.chat.modelUnknown} ·{' '}
                  {message.provider ?? translations.chat.providerUnknown}
                </p>
              ) : null}
            </MessageBubble>
          );
        })}
        {streaming ? (
          <article className="message-bubble is-character is-streaming">
            <SafeMarkdown content={streaming} streaming />
            <span className="typing-dot" aria-hidden="true" />
          </article>
        ) : null}
        <div ref={bottomRef} />
      </MessageList>
      {showJumpToBottom ? (
        <button
          className="jump-to-bottom"
          type="button"
          onClick={() => {
            nearBottomRef.current = true;
            setShowJumpToBottom(false);
            bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }}
        >
          {translations.chat.jumpToBottom}
        </button>
      ) : null}
      {showCharacterProfile ? (
        <CharacterProfileSheet
          conversationId={conversationId}
          onClose={() => {
            setShowCharacterProfile(false);
          }}
        />
      ) : null}
      {deleteMessageId ? (
        <Dialog
          backdropClassName="chat-dialog-backdrop"
          className="chat-dialog"
          labelledBy="delete-message-title"
          onClose={() => {
            setDeleteMessageId(null);
          }}
        >
          <h2 id="delete-message-title">{translations.chat.deleteMessageTitle}</h2>
          <p>{translations.chat.deleteMessageText}</p>
          <div className="dialog-actions">
            <button
              type="button"
              onClick={() => {
                setDeleteMessageId(null);
              }}
            >
              {translations.chat.cancel}
            </button>
            <button className="danger" type="button" onClick={() => void deleteMessage()}>
              {translations.chat.delete}
            </button>
          </div>
        </Dialog>
      ) : null}
      {reportMessageId ? (
        <Dialog
          backdropClassName="chat-dialog-backdrop"
          className="chat-dialog"
          labelledBy="report-message-title"
          onClose={() => {
            setReportMessageId(null);
            setReportDetails('');
          }}
        >
          <h2 id="report-message-title">{translations.chat.reportTitle}</h2>
          <label className="field">
            <span>{translations.chat.reportReason}</span>
            <textarea
              aria-label={translations.chat.reportDescription}
              value={reportDetails}
              minLength={10}
              maxLength={2_000}
              onChange={(event) => {
                setReportDetails(event.target.value);
              }}
            />
          </label>
          <div className="dialog-actions">
            <button
              type="button"
              onClick={() => {
                setReportMessageId(null);
                setReportDetails('');
              }}
            >
              {translations.chat.cancel}
            </button>
            <button
              className="primary"
              type="button"
              disabled={reportDetails.trim().length < 10}
              onClick={() => void reportMessage()}
            >
              {translations.chat.submit}
            </button>
          </div>
        </Dialog>
      ) : null}
      {showDeleteChat ? (
        <Dialog
          backdropClassName="chat-dialog-backdrop"
          className="chat-dialog"
          labelledBy="delete-chat-title"
          onClose={() => {
            setShowDeleteChat(false);
          }}
        >
          <h2 id="delete-chat-title">{translations.chat.deleteChatTitle}</h2>
          <p>{translations.chat.deleteChatText}</p>
          <div className="dialog-actions">
            <button
              type="button"
              onClick={() => {
                setShowDeleteChat(false);
              }}
            >
              {translations.chat.keepChat}
            </button>
            <button className="danger" type="button" onClick={() => void deleteChat()}>
              {translations.chat.deleteChat}
            </button>
          </div>
        </Dialog>
      ) : null}
      {error ? (
        <div className="chat-error" role="alert">
          <p>{error}</p>
          {retryAttempt ? (
            <div className="chat-error-actions">
              <button
                type="button"
                disabled={sending}
                onClick={() => {
                  setSending(true);
                  setError(null);
                  void streamReply(retryAttempt.parentMessageId, retryAttempt.mode)
                    .catch((caught: unknown) => {
                      setError(
                        caught instanceof Error
                          ? localizedErrorMessage(caught, translations)
                          : translations.chat.sendFailed,
                      );
                    })
                    .finally(() => {
                      setSending(false);
                    });
                }}
              >
                {translations.chat.retryGeneration}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowModelPicker(true);
                }}
              >
                {translations.chat.chooseAnotherModel}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {memoryInvalidated ? (
        <p className="chat-memory-notice" role="status">
          {translations.chat.memoryStale}
        </p>
      ) : null}
      <ChatComposer
        onSubmit={(event) => {
          void send(event);
        }}
      >
        <textarea
          aria-label={translations.chat.messageLabel}
          placeholder={translations.chat.messagePlaceholder}
          value={draft}
          maxLength={8000}
          rows={1}
          disabled={sending}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        {sending && generationId ? (
          <button
            className="stop-generation"
            type="button"
            aria-label={translations.chat.stopGeneration}
            onClick={() => {
              void apiRequest(
                `/api/v1/conversations/${conversationId}/generate/${generationId}/stop`,
                { method: 'POST' },
              ).catch((caught: unknown) => {
                setError(caught instanceof Error ? caught.message : translations.chat.stopFailed);
              });
            }}
          >
            <VeloraIcon name="stop" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label={translations.chat.send}
          >
            <VeloraIcon name="send" size={20} />
          </button>
        )}
      </ChatComposer>
    </div>
  );
}

function ProfileSection({
  title,
  body,
  collapsible = false,
}: {
  readonly title: string;
  readonly body: string;
  readonly collapsible?: boolean;
}) {
  const { locale } = useI18n();
  const profileMessages = getChatMenuMessages(locale);
  const [expanded, setExpanded] = useState(false);
  const overflowing = collapsible && body.length > 320;
  return (
    <section className="character-profile-section">
      <h3>{title}</h3>
      <div
        className={
          overflowing && !expanded ? 'character-profile-body is-clamped' : 'character-profile-body'
        }
      >
        <SafeMarkdown content={body} />
      </div>
      {overflowing ? (
        <button
          className="character-profile-more"
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          {expanded ? profileMessages.showLess : profileMessages.showMore}
          <VeloraIcon name={expanded ? 'chevronUp' : 'chevronDown'} size={16} />
        </button>
      ) : null}
    </section>
  );
}

function CharacterProfileSheet({
  conversationId,
  onClose,
}: {
  readonly conversationId: string;
  readonly onClose: () => void;
}) {
  const { locale } = useI18n();
  const profileMessages = getChatMenuMessages(locale);
  const profile = useQuery({
    queryKey: ['conversation', conversationId, 'character'],
    queryFn: () =>
      apiRequest<ChatCharacterProfile>(`/api/v1/conversations/${conversationId}/character`),
  });
  const data = profile.data;
  return (
    <Dialog
      backdropClassName="character-profile-backdrop"
      className="character-profile"
      label={profileMessages.profileTitle}
      onClose={onClose}
    >
      <>
        <header className="character-profile-header">
          <button type="button" aria-label={profileMessages.profileClose} onClick={onClose}>
            <VeloraIcon name="arrowLeft" />
          </button>
          <strong>{data?.name ?? profileMessages.profileTitle}</strong>
        </header>
        <div className="character-profile-scroll">
          {profile.isPending ? <Skeleton label={profileMessages.profileLoading} rows={4} /> : null}
          {profile.isError ? (
            <ErrorState error={profile.error} retry={() => void profile.refetch()} />
          ) : null}
          {data ? (
            <>
              <CharacterImage
                fileId={data.avatarFileId}
                alt={data.name}
                focalX={data.avatarFocalX}
                focalY={data.avatarFocalY}
                className="character-profile-hero"
                previewable
                fallback={
                  <span className="character-profile-hero fallback">{data.name.slice(0, 1)}</span>
                }
              />
              <h2 className="character-profile-name">{data.name}</h2>
              <p className="character-profile-creator">
                {profileMessages.author}: {data.creatorName}
              </p>
              <ul className="character-profile-stats">
                <li>
                  <VeloraIcon name="heart" size={15} />
                  {profileMessages.likes(data.likeCount)}
                </li>
                <li>
                  <VeloraIcon name="bookmark" size={15} />
                  {profileMessages.bookmarks(data.bookmarkCount)}
                </li>
                <li>
                  <VeloraIcon name="info" size={15} />
                  {profileMessages.tokens(data.estimatedTokens)}
                </li>
              </ul>
              {data.tagline ? <p className="character-profile-tagline">{data.tagline}</p> : null}
              <ul className="character-profile-tags">
                {!data.interactable ? (
                  <li className="is-flag">{profileMessages.privateCharacter}</li>
                ) : null}
                {data.contentRating === 'MATURE' ? (
                  <li className="is-flag">{profileMessages.mature}</li>
                ) : null}
                {data.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
                {data.tags.length === 0 ? (
                  <li className="is-empty">{profileMessages.noTags}</li>
                ) : null}
              </ul>
              <ProfileSection
                title={profileMessages.greeting}
                body={data.firstMessage}
                collapsible
              />
              {data.alternateGreetings.map((greeting, index) => (
                <ProfileSection
                  key={greeting.slice(0, 40) + String(index)}
                  title={profileMessages.alternateGreeting(index + 1)}
                  body={greeting}
                  collapsible
                />
              ))}
              <ProfileSection
                title={profileMessages.description}
                body={data.description}
                collapsible
              />
              <ProfileSection
                title={profileMessages.personality}
                body={data.personality ?? profileMessages.personalityHidden}
                collapsible
              />
              {data.avatarBotUsername ? (
                <a
                  className="character-profile-avatar-bot"
                  href={`https://t.me/${data.avatarBotUsername}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {profileMessages.avatarBot}
                </a>
              ) : null}
            </>
          ) : null}
        </div>
      </>
    </Dialog>
  );
}

function ChatSettingsPanel({
  conversation,
  onRequestDelete,
}: {
  readonly conversation: ConversationDetail;
  readonly allowedModelProfiles: readonly ('BALANCED' | 'CREATIVE' | 'PREMIUM')[];
  readonly onRequestDelete: () => void;
}) {
  const { messages } = useI18n();
  const client = useQueryClient();
  const [saved, setSaved] = useState(false);
  const models = useQuery({
    queryKey: ['roleplay-model-catalog'],
    queryFn: () => apiRequest<RoleplayModelCatalog>('/api/v1/conversations/models/catalog'),
  });
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest<ConversationDetail>(`/api/v1/conversations/${conversation.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      setSaved(true);
      await client.invalidateQueries({ queryKey: ['conversation', conversation.id] });
    },
  });
  return (
    <aside className="chat-lore-panel chat-settings-panel">
      <div>
        <strong>{messages.chat.settingsTitle}</strong>
        <small>{messages.chat.settingsText}</small>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(false);
          const data = new FormData(event.currentTarget);
          save.mutate({
            modelProfile: formString(data, 'modelProfile'),
            modelProfileId: formString(data, 'modelProfileId'),
            responseLength: formString(data, 'responseLength'),
            temperature: Number(formString(data, 'temperature')),
            maxOutputTokens: Number(formString(data, 'maxOutputTokens')),
            customInstructions: formString(data, 'customInstructions'),
            personaMode: formString(data, 'personaMode'),
          });
        }}
      >
        <input type="hidden" name="modelProfile" value={conversation.settings.modelProfile} />
        <fieldset className="model-catalog-fieldset">
          <legend>{messages.chat.modelChoice}</legend>
          <p>{messages.chat.modelChoiceText}</p>
          {models.isLoading ? <Skeleton label={messages.chat.loading} rows={2} /> : null}
          {models.error ? (
            <span className="error" role="alert">
              {localizedErrorMessage(models.error, messages)}
            </span>
          ) : null}
          <div className="model-choice-list">
            {models.data?.items.map((model) => {
              const selectable = model.available && model.allowed;
              return (
                <label
                  className={`model-choice-card${selectable ? '' : ' model-choice-disabled'}`}
                  key={model.id}
                >
                  <input
                    type="radio"
                    name="modelProfileId"
                    value={model.id}
                    defaultChecked={conversation.settings.modelProfileId === model.id}
                    disabled={!selectable}
                  />
                  <span className="model-choice-copy">
                    <span className="model-choice-title">
                      <strong>{model.displayName}</strong>
                      <span className={`status-pill model-tier-${model.tier}`}>{model.tier}</span>
                      {model.experimental ? (
                        <span className="status-pill">{messages.chat.experimental}</span>
                      ) : null}
                    </span>
                    <span>{model.descriptionRu}</span>
                    <small>{messages.chat.bestFor(model.bestForRu)}</small>
                    <span className="model-choice-meta">
                      <small>{messages.chat.modelSpeed(model.speedLabel)}</small>
                      <small>{messages.chat.modelRoleplay(model.roleplayLabel)}</small>
                      <small>{messages.chat.modelMemory(model.memoryLabel)}</small>
                    </span>
                    {!model.available ? (
                      <small className="error">{messages.chat.providerUnavailable}</small>
                    ) : !model.allowed ? (
                      <small className="error">{messages.chat.planUnavailable}</small>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="chat-settings-grid">
          <label className="field">
            <span>{messages.chat.responseLength}</span>
            <select name="responseLength" defaultValue={conversation.settings.responseLength}>
              <option value="SHORT">{messages.chat.short}</option>
              <option value="MEDIUM">{messages.chat.medium}</option>
              <option value="DETAILED">{messages.chat.detailed}</option>
              <option value="LONG">{messages.chat.longRoleplay}</option>
            </select>
          </label>
          <label className="field">
            <span>{messages.chat.temperature}</span>
            <input
              name="temperature"
              type="number"
              min="0"
              max="2"
              step="0.05"
              defaultValue={conversation.settings.temperature}
            />
          </label>
          <label className="field">
            <span>{messages.chat.maxTokens}</span>
            <input
              name="maxOutputTokens"
              type="number"
              min="64"
              max="8192"
              step="1"
              defaultValue={conversation.settings.maxOutputTokens}
            />
          </label>
          <label className="field">
            <span>{messages.chat.personaMode}</span>
            <select name="personaMode" defaultValue={conversation.settings.personaMode}>
              <option value="SNAPSHOT">{messages.chat.snapshot}</option>
              <option value="LIVE">{messages.chat.live}</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>{messages.chat.customInstructions}</span>
          <textarea
            name="customInstructions"
            rows={5}
            maxLength={8000}
            defaultValue={conversation.settings.customInstructions}
            placeholder={messages.chat.customInstructionsPlaceholder}
          />
        </label>
        <p className="settings-cost-note">{messages.chat.prepaidNote}</p>
        {save.error ? (
          <span className="error" role="alert">
            {localizedErrorMessage(save.error, messages)}
          </span>
        ) : null}
        {saved ? (
          <span className="success" role="status">
            {messages.chat.settingsSaved}
          </span>
        ) : null}
        <button className="primary" type="submit" disabled={save.isPending}>
          {save.isPending ? messages.chat.saving : messages.chat.saveSettings}
        </button>
      </form>
      <button className="danger-text" type="button" onClick={onRequestDelete}>
        {messages.chat.deleteChat}
      </button>
    </aside>
  );
}

export function composeEditableMemory(manualContext: string, autoSummary: string): string {
  return [manualContext.trim(), autoSummary.trim()].filter(Boolean).join('\n\n');
}

function ChatMemoryPanel({ conversationId }: { readonly conversationId: string }) {
  const { locale, messages } = useI18n();
  const client = useQueryClient();
  const memory = useQuery({
    queryKey: ['conversation-memory', conversationId],
    queryFn: () => apiRequest<ConversationMemory>(`/api/v1/conversations/${conversationId}/memory`),
    refetchInterval: (query) => (query.state.data?.pendingJob ? 1_500 : false),
  });
  const versions = useQuery({
    queryKey: ['conversation-memory-versions', conversationId],
    queryFn: () =>
      apiRequest<ListResponse<MemoryVersion>>(
        `/api/v1/conversations/${conversationId}/memory/versions`,
      ),
  });
  const [draft, setDraft] = useState<string | null>(null);
  const [regenerationPreview, setRegenerationPreview] = useState<MemoryRegenerationPreview | null>(
    null,
  );
  const [restorePreview, setRestorePreview] = useState<MemoryVersion | null>(null);
  const draftValue =
    draft ??
    composeEditableMemory(memory.data?.manualContext ?? '', memory.data?.autoSummary ?? '');
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['conversation-memory', conversationId] }),
      client.invalidateQueries({ queryKey: ['conversation-memory-versions', conversationId] }),
    ]);
  };
  const save = useMutation({
    mutationFn: () =>
      apiRequest(`/api/v1/conversations/${conversationId}/memory`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ manualContext: draftValue, idempotencyKey: crypto.randomUUID() }),
      }),
    onSuccess: async () => {
      setDraft(null);
      await refresh();
    },
  });
  const run = useMutation({
    mutationFn: (action: 'summarize' | 'regenerate' | 'keep') =>
      apiRequest<MemoryJob | { readonly stale: false }>(
        `/api/v1/conversations/${conversationId}/memory/${action}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
        },
      ),
    onSuccess: async () => {
      setDraft(null);
      await refresh();
    },
  });
  const previewRegeneration = useMutation({
    mutationFn: () =>
      apiRequest<MemoryRegenerationPreview>(
        `/api/v1/conversations/${conversationId}/memory/regenerate/preview`,
        { method: 'POST' },
      ),
    onSuccess: setRegenerationPreview,
  });
  const restore = useMutation({
    mutationFn: (versionId: string) =>
      apiRequest<MemoryVersion>(
        `/api/v1/conversations/${conversationId}/memory/versions/${versionId}/restore`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
        },
      ),
    onSuccess: async () => {
      setRestorePreview(null);
      setDraft(null);
      await refresh();
    },
  });
  const pending =
    save.isPending ||
    run.isPending ||
    restore.isPending ||
    previewRegeneration.isPending ||
    Boolean(memory.data?.pendingJob);
  const error =
    save.error ??
    run.error ??
    restore.error ??
    previewRegeneration.error ??
    memory.error ??
    versions.error;
  if (memory.isPending || versions.isPending) {
    return <Skeleton label={messages.chat.memoryLoading} rows={2} />;
  }
  return (
    <div className="memory-workspace">
      <MemoryEditor
        title={messages.chat.memoryTitle}
        description={messages.chat.memoryText}
        tokenLabel={messages.chat.tokens(memory.data?.estimatedTokens ?? 0)}
        sourceLabel={
          memory.data?.active
            ? sourceLabel(memory.data.active.sourceType, messages)
            : messages.chat.memoryEmpty
        }
        staleMessage={memory.data?.stale ? messages.chat.memoryStale : null}
        manualInputLabel={messages.chat.memoryManualInput}
        manualValue={draftValue}
        pending={pending}
        pendingMessage={memory.data?.pendingJob ? messages.chat.memoryPending : null}
        errorMessage={error ? localizedErrorMessage(error, messages) : null}
        labels={{
          save: messages.chat.save,
          summarize: messages.chat.summarize,
          regenerate: messages.chat.regenerateMemory,
          keep: messages.chat.keepMemory,
        }}
        onChange={setDraft}
        onSave={() => {
          save.mutate();
        }}
        onSummarize={() => {
          run.mutate('summarize');
        }}
        onRegenerate={() => {
          previewRegeneration.mutate();
        }}
        onKeep={() => {
          run.mutate('keep');
        }}
      />
      <MemoryVersionList
        versions={versions.data?.items ?? []}
        activeId={memory.data?.active?.id ?? null}
        pending={pending}
        labels={{
          title: messages.chat.memoryVersions,
          empty: messages.chat.memoryVersionsEmpty,
          active: messages.chat.memoryVersionActive,
          restore: messages.chat.memoryVersionRestore,
          describe: (version) =>
            messages.chat.memoryVersionLabel(
              sourceLabel(version.sourceType, messages),
              new Date(version.createdAt).toLocaleString(locale),
            ),
        }}
        onRestore={(versionId) => {
          setRestorePreview(
            versions.data?.items.find((version) => version.id === versionId) ?? null,
          );
        }}
      />
      {regenerationPreview ? (
        <MemoryPreviewDialog
          title={messages.chat.memoryRegenerationPreviewTitle}
          current={regenerationPreview.currentAutoSummary}
          generated={regenerationPreview.generatedAutoSummary}
          currentLabel={messages.chat.memoryPreviewCurrent}
          generatedLabel={messages.chat.memoryPreviewGenerated}
          applyLabel={messages.chat.memoryPreviewApply}
          cancelLabel={messages.chat.memoryPreviewCancel}
          pending={run.isPending}
          onCancel={() => {
            setRegenerationPreview(null);
          }}
          onApply={() => {
            setRegenerationPreview(null);
            run.mutate('regenerate');
          }}
        />
      ) : null}
      {restorePreview ? (
        <MemoryPreviewDialog
          title={messages.chat.memoryRestorePreviewTitle}
          current={memory.data?.autoSummary ?? ''}
          generated={restorePreview.autoSummary}
          currentLabel={messages.chat.memoryPreviewCurrent}
          generatedLabel={messages.chat.memoryPreviewRestored}
          applyLabel={messages.chat.memoryVersionRestore}
          cancelLabel={messages.chat.memoryPreviewCancel}
          pending={restore.isPending}
          onCancel={() => {
            setRestorePreview(null);
          }}
          onApply={() => {
            restore.mutate(restorePreview.id);
          }}
        />
      ) : null}
    </div>
  );
}

function MemoryPreviewDialog({
  title,
  current,
  generated,
  currentLabel,
  generatedLabel,
  applyLabel,
  cancelLabel,
  pending,
  onApply,
  onCancel,
}: {
  readonly title: string;
  readonly current: string;
  readonly generated: string;
  readonly currentLabel: string;
  readonly generatedLabel: string;
  readonly applyLabel: string;
  readonly cancelLabel: string;
  readonly pending: boolean;
  readonly onApply: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <Dialog
      backdropClassName="chat-dialog-backdrop"
      className="chat-dialog memory-preview-dialog"
      label={title}
      onClose={() => {
        if (!pending) onCancel();
      }}
    >
      <h3>{title}</h3>
      <div className="memory-preview-columns">
        <section>
          <strong>{currentLabel}</strong>
          <pre>{current || '—'}</pre>
        </section>
        <section>
          <strong>{generatedLabel}</strong>
          <pre>{generated || '—'}</pre>
        </section>
      </div>
      <div className="dialog-actions">
        <button type="button" className="secondary" disabled={pending} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="primary" disabled={pending} onClick={onApply}>
          {applyLabel}
        </button>
      </div>
    </Dialog>
  );
}

function ChatPromptInspector({ conversationId }: { readonly conversationId: string }) {
  const { messages } = useI18n();
  const inspector = useQuery({
    queryKey: ['prompt-inspector', conversationId],
    queryFn: () =>
      apiRequest<PromptInspectorResponse>(
        `/api/v1/conversations/${conversationId}/prompt-inspector`,
      ),
  });
  if (inspector.isLoading) {
    return (
      <aside className="chat-lore-panel prompt-inspector" aria-live="polite">
        <strong>{messages.chat.inspectorLoading}</strong>
      </aside>
    );
  }
  if (inspector.error || !inspector.data) {
    return (
      <aside className="chat-lore-panel prompt-inspector">
        <strong>{messages.chat.inspectorTitle}</strong>
        <span className="error" role="alert">
          {inspector.error?.message ?? messages.chat.contextUnavailable}
        </span>
      </aside>
    );
  }
  const data = inspector.data;
  const characterSections = [
    [messages.chat.sectionDescription, data.character.description],
    [messages.chat.sectionPersonality, data.character.personality],
    [messages.chat.sectionScenario, data.character.scenario],
    [messages.chat.sectionSpeechStyle, data.character.speechStyle],
    [messages.chat.sectionAppearance, data.character.appearance],
    [messages.chat.sectionBackground, data.character.background],
    [messages.chat.sectionGoals, data.character.goals],
    [messages.chat.sectionBehaviour, data.character.behaviourRules],
    [messages.chat.sectionCreator, data.character.systemInstructions],
    [messages.chat.sectionPostHistory, data.character.postHistoryInstructions],
  ].filter((entry) => entry[1]);
  return (
    <aside className="chat-lore-panel prompt-inspector">
      <div>
        <strong>{messages.chat.inspectorTitle}</strong>
        <small>{messages.chat.inspectorText}</small>
      </div>
      <div className="active-lore-summary">
        <span>
          {messages.chat.selectedModel(
            data.selectedModel.profileId,
            data.selectedModel.providerModelId,
          )}
        </span>
        <span>{messages.chat.inputTokens(data.tokenEstimates['totalInput'] ?? 0)}</span>
        <span>{messages.chat.reservedTokens(data.tokenEstimates['outputReserved'] ?? 0)}</span>
        <span>{messages.chat.contextTokens(data.tokenEstimates['contextLimit'] ?? 0)}</span>
      </div>
      <details open>
        <summary>{messages.chat.characterSummary(data.character.name)}</summary>
        {characterSections.map(([label, value]) => (
          <section key={label}>
            <strong>{label}</strong>
            <pre>{value}</pre>
          </section>
        ))}
      </details>
      <details>
        <summary>{messages.chat.personaSummary(data.persona?.['name'] ?? '')}</summary>
        {data.persona ? (
          Object.entries(data.persona)
            .filter((entry): entry is [string, string] => Boolean(entry[1]))
            .map(([label, value]) => (
              <section key={label}>
                <strong>{promptPersonaLabel(label, messages)}</strong>
                <pre>{value}</pre>
              </section>
            ))
        ) : (
          <p>{messages.chat.personaInactive}</p>
        )}
      </details>
      <details>
        <summary>{messages.chat.memorySummary(data.tokenEstimates['memory'] ?? 0)}</summary>
        <pre>{data.memory || messages.chat.memoryContentEmpty}</pre>
      </details>
      <details>
        <summary>{messages.chat.loreSummary(data.lore.length)}</summary>
        {data.lore.length > 0 ? (
          data.lore.map((entry) => (
            <section key={entry.id}>
              <strong>{entry.title}</strong>
              <pre>{entry.content}</pre>
            </section>
          ))
        ) : (
          <p>{messages.chat.loreInactive}</p>
        )}
      </details>
      <details>
        <summary>{messages.chat.chatInstructionsSummary}</summary>
        <pre>{data.chatInstructions || messages.chat.chatInstructionsEmpty}</pre>
      </details>
      <details>
        <summary>{messages.chat.recentSummary(data.recentMessages.length)}</summary>
        {data.recentMessages.map((message, index) => (
          <section key={`${message.role}-${String(index)}`}>
            <strong>
              {message.role === 'USER' ? messages.chat.userRole : messages.chat.characterRole}
            </strong>
            <pre>{message.content}</pre>
          </section>
        ))}
      </details>
      <details>
        <summary>{messages.chat.tokenEstimate}</summary>
        <dl className="prompt-token-grid">
          {Object.entries(data.tokenEstimates).map(([name, value]) => (
            <div key={name}>
              <dt>{promptTokenLabel(name, messages)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <small>
          {messages.chat.droppedContext(data.droppedHistoryMessages, data.droppedExampleMessages)}
        </small>
      </details>
    </aside>
  );
}

function promptPersonaLabel(name: string, messages: WebMessages): string {
  const labels: Readonly<Record<string, string>> = {
    name: messages.personas.name,
    shortDescription: messages.personas.shortDescription,
    longDescription: messages.personas.longDescription,
    personality: messages.personas.personality,
    appearance: messages.personas.appearance,
    speakingStyle: messages.personas.speakingStyle,
    background: messages.personas.background,
    pronouns: messages.personas.pronouns,
    representedAge: messages.personas.representedAge,
    customNotes: messages.personas.customNotes,
  };
  return labels[name] ?? name;
}

function promptTokenLabel(name: string, messages: WebMessages): string {
  const labels: Readonly<Record<string, string>> = {
    platformPolicy: messages.chat.tokenPlatform,
    character: messages.chat.tokenCharacter,
    creatorInstructions: messages.chat.tokenCreator,
    persona: messages.chat.tokenPersona,
    memory: messages.chat.tokenMemory,
    lore: messages.chat.tokenLore,
    chatInstructions: messages.chat.tokenChat,
    examples: messages.chat.tokenExamples,
    recentMessages: messages.chat.tokenRecent,
    postHistoryInstructions: messages.chat.tokenPostHistory,
    totalInput: messages.chat.tokenTotal,
    outputReserved: messages.chat.tokenReserved,
    contextLimit: messages.chat.tokenLimit,
  };
  return labels[name] ?? name;
}

function sourceLabel(source: string, messages: WebMessages): string {
  const labels: Readonly<Record<string, string>> = {
    AUTO_SUMMARY: messages.chat.sourceAuto,
    FULL_REGENERATION: messages.chat.sourceRegenerated,
    MANUAL_EDIT: messages.chat.sourceManual,
    RESTORE: messages.chat.sourceRestored,
  };
  return labels[source] ?? source;
}

export function LoreInspector({ conversationId }: { readonly conversationId: string }) {
  const { messages } = useI18n();
  const client = useQueryClient();
  const [pendingSelection, setPendingSelection] = useState<{
    readonly id: string;
    readonly enabled: boolean;
  } | null>(null);
  const books = useQuery({
    queryKey: ['lorebooks'],
    queryFn: () => apiRequest<ListResponse<Lorebook>>('/api/v1/lorebooks'),
  });
  const attached = useQuery({
    queryKey: ['conversation-lorebooks', conversationId],
    queryFn: () =>
      apiRequest<ListResponse<Lorebook & { readonly enabled: boolean }>>(
        `/api/v1/conversations/${conversationId}/lorebooks`,
      ),
  });
  const active = useQuery({
    queryKey: ['active-lore', conversationId],
    queryFn: () =>
      apiRequest<{
        readonly entries: readonly {
          readonly id: string;
          readonly title: string;
          readonly matchedKeys: readonly string[];
          readonly priority: number;
          readonly tokenEstimate: number;
        }[];
        readonly totalTokens: number;
      }>(`/api/v1/conversations/${conversationId}/lore/active`),
  });
  const change = useMutation({
    mutationFn: ({ id, enabled }: { readonly id: string; readonly enabled: boolean }) =>
      enabled
        ? apiRequest(`/api/v1/conversations/${conversationId}/lorebooks/${id}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: '{"enabled":true}',
          })
        : apiRequest(`/api/v1/conversations/${conversationId}/lorebooks/${id}`, {
            method: 'DELETE',
          }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['conversation-lorebooks', conversationId] }),
        client.invalidateQueries({ queryKey: ['active-lore', conversationId] }),
      ]);
    },
    onSettled: () => {
      setPendingSelection(null);
    },
  });
  const attachedIds = new Set(
    attached.data?.items.filter((book) => book.enabled).map((book) => book.id),
  );
  return (
    <aside className="chat-lore-panel">
      <div>
        <strong>{messages.chat.loreTitle}</strong>
        <small>{messages.chat.loreText}</small>
      </div>
      <div className="check-list">
        {books.data?.items.map((book) => (
          <label key={book.id}>
            <input
              type="checkbox"
              checked={
                pendingSelection?.id === book.id
                  ? pendingSelection.enabled
                  : attachedIds.has(book.id)
              }
              disabled={change.isPending}
              onChange={(event) => {
                const enabled = event.target.checked;
                setPendingSelection({ id: book.id, enabled });
                change.mutate({ id: book.id, enabled });
              }}
            />
            <span>{book.name}</span>
          </label>
        ))}
        {books.data?.items.length === 0 ? (
          <span className="meta">{messages.chat.loreEmpty}</span>
        ) : null}
      </div>
      {change.isError ? (
        <span className="error" role="alert">
          {localizedErrorMessage(change.error, messages)}
        </span>
      ) : null}
      <div className="active-lore-summary">
        <span>{messages.chat.loreActive(active.data?.entries.length ?? 0)}</span>
        <span>{messages.chat.tokens(active.data?.totalTokens ?? 0)}</span>
      </div>
      {active.data?.entries.map((entry) => (
        <article className="active-lore-entry" key={entry.id}>
          <strong>{entry.title}</strong>
          <small>{messages.chat.loreTriggeredBy(entry.matchedKeys.join(', '))}</small>
          <small>{messages.chat.lorePriority(entry.priority)}</small>
          <small>{messages.chat.loreTokens(entry.tokenEstimate)}</small>
        </article>
      ))}
    </aside>
  );
}

function ChatAvatar({
  name,
  fileId,
  focalX,
  focalY,
}: {
  readonly name: string;
  readonly fileId: string | null;
  readonly focalX: number;
  readonly focalY: number;
}) {
  return (
    <span className="chat-avatar">
      <CharacterImage
        fileId={fileId}
        alt={name}
        focalX={focalX}
        focalY={focalY}
        fallback={name.slice(0, 1).toUpperCase()}
        previewable
      />
    </span>
  );
}

function formatTime(timestamp: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formString(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}
