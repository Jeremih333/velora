import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState, type SyntheticEvent } from 'react';
import { apiRequest, apiSse } from './api';
import { localizedErrorMessage } from './error-localization';
import { useI18n, type Locale, type WebMessages } from './i18n';
import { selectMessageWindow } from './message-window';
import { SafeMarkdown } from './SafeMarkdown';
import type {
  ConversationDetail,
  ConversationMemory,
  ConversationMessage,
  ConversationSummary,
  Lorebook,
  MemoryJob,
  PromptInspectorResponse,
} from './types';

interface ListResponse<T> {
  readonly items: readonly T[];
}

interface MessageResponse extends ListResponse<ConversationMessage> {
  readonly activeMessageId: string | null;
}

export function ChatsView({
  initialConversationId,
  allowedModelProfiles,
  onConversationOpened,
}: {
  readonly initialConversationId: string | null;
  readonly allowedModelProfiles: readonly ('BALANCED' | 'CREATIVE' | 'PREMIUM')[];
  readonly onConversationOpened: (id: string | null) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId);
  if (selectedId) {
    return (
      <ChatThread
        key={selectedId}
        conversationId={selectedId}
        allowedModelProfiles={allowedModelProfiles}
        onBack={() => {
          setSelectedId(null);
          onConversationOpened(null);
        }}
      />
    );
  }
  return (
    <ChatList
      onOpen={(id) => {
        setSelectedId(id);
        onConversationOpened(id);
      }}
    />
  );
}

function ChatList({ onOpen }: { readonly onOpen: (id: string) => void }) {
  const { locale, messages } = useI18n();
  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiRequest<ListResponse<ConversationSummary>>('/api/v1/conversations'),
  });
  return (
    <div className="view-stack">
      <header className="view-header">
        <div>
          <p className="eyebrow">{messages.chat.eyebrow}</p>
          <h1>{messages.chat.title}</h1>
          <p>{messages.chat.description}</p>
        </div>
      </header>
      {conversations.isPending ? (
        <div className="empty-state">
          <h2>{messages.chat.loading}</h2>
        </div>
      ) : null}
      {conversations.isError ? (
        <p className="error" role="alert">
          {localizedErrorMessage(conversations.error, messages)}
        </p>
      ) : null}
      {conversations.data?.items.length === 0 ? (
        <div className="empty-state">
          <span>✦</span>
          <h2>{messages.chat.emptyTitle}</h2>
          <p>{messages.chat.emptyText}</p>
        </div>
      ) : null}
      <div className="list-stack">
        {conversations.data?.items.map((conversation) => (
          <button
            className="conversation-card"
            type="button"
            key={conversation.id}
            onClick={() => {
              onOpen(conversation.id);
            }}
          >
            <ChatAvatar
              name={conversation.characterName}
              fileId={conversation.characterAvatarFileId}
            />
            <span>
              <strong>
                {conversation.title}
                {conversation.isPreview ? (
                  <small className="preview-pill">{messages.chat.preview}</small>
                ) : null}
              </strong>
              <small>{conversation.lastMessage ?? messages.chat.beginning}</small>
            </span>
            <time>{formatTime(conversation.updatedAt, locale)}</time>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatThread({
  conversationId,
  allowedModelProfiles,
  onBack,
}: {
  readonly conversationId: string;
  readonly allowedModelProfiles: readonly ('BALANCED' | 'CREATIVE' | 'PREMIUM')[];
  readonly onBack: () => void;
}) {
  const { locale, messages: translations } = useI18n();
  const client = useQueryClient();
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLore, setShowLore] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showPromptInspector, setShowPromptInspector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [actionMessageId, setActionMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [deleteMessageId, setDeleteMessageId] = useState<string | null>(null);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [modelInfoMessageId, setModelInfoMessageId] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [showDeleteChat, setShowDeleteChat] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [visibleMessageCount, setVisibleMessageCount] = useState(80);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const previousScrollHeightRef = useRef<number | null>(null);
  const conversation = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => apiRequest<ConversationDetail>(`/api/v1/conversations/${conversationId}`),
  });
  const messages = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => apiRequest<MessageResponse>(`/api/v1/conversations/${conversationId}/messages`),
  });
  const messageWindow = selectMessageWindow(messages.data?.items ?? [], visibleMessageCount);
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

  const streamReply = async (parentMessageId: string, mode: 'REPLY' | 'CONTINUE') => {
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
        if (eventName === 'error' && isRecord(data) && typeof data['message'] === 'string') {
          throw new Error(data['message']);
        }
      },
    );
    setGenerationId(null);
    setStreaming('');
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

  const runMessageGeneration = async (parentMessageId: string, mode: 'REPLY' | 'CONTINUE') => {
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
      await client.invalidateQueries({ queryKey: ['messages', conversationId] });
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

  return (
    <div className="chat-view">
      <header className="chat-header">
        <button type="button" aria-label={translations.chat.back} onClick={onBack}>
          ←
        </button>
        <ChatAvatar
          name={conversation.data?.characterName ?? 'V'}
          fileId={conversation.data?.characterAvatarFileId ?? null}
        />
        <span className="chat-title">
          <strong>{conversation.data?.title ?? translations.chat.storyFallback}</strong>
          <small>
            {sending
              ? translations.chat.generating
              : conversation.data?.isPreview
                ? translations.chat.privatePreview
                : translations.chat.roleplayStory}
          </small>
        </span>
        <button
          className="chat-context-button"
          type="button"
          aria-label={translations.chat.storyTools}
          onClick={() => {
            setShowTools((value) => !value);
          }}
        >
          ⋯
        </button>
      </header>
      {showTools ? (
        <nav className="chat-tools" aria-label={translations.chat.storyTools}>
          <button
            type="button"
            onClick={() => {
              setShowMemory(false);
              setShowPromptInspector(false);
              setShowSettings(false);
              setShowLore((value) => !value);
            }}
          >
            {translations.chat.loreTool}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowLore(false);
              setShowPromptInspector(false);
              setShowSettings(false);
              setShowMemory((value) => !value);
            }}
          >
            {translations.chat.memoryTool}
          </button>
          {conversation.data?.promptInspectorAvailable ? (
            <button
              type="button"
              onClick={() => {
                setShowLore(false);
                setShowMemory(false);
                setShowSettings(false);
                setShowPromptInspector((value) => !value);
              }}
            >
              {translations.chat.promptTool}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setShowLore(false);
              setShowMemory(false);
              setShowPromptInspector(false);
              setShowSettings((value) => !value);
            }}
          >
            {translations.chat.settingsTool}
          </button>
          <button
            className="danger-text"
            type="button"
            onClick={() => {
              setShowDeleteChat(true);
            }}
          >
            {translations.chat.deleteChatTool}
          </button>
        </nav>
      ) : null}
      {showLore ? <ChatLorePanel conversationId={conversationId} /> : null}
      {showMemory ? <ChatMemoryPanel conversationId={conversationId} /> : null}
      {showPromptInspector ? <ChatPromptInspector conversationId={conversationId} /> : null}
      {showSettings && conversation.data ? (
        <ChatSettingsPanel
          conversation={conversation.data}
          allowedModelProfiles={allowedModelProfiles}
        />
      ) : null}
      <div
        className="message-list"
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
          return (
            <article
              className={`message-bubble ${message.role === 'USER' ? 'is-user' : 'is-character'}`}
              key={message.id}
            >
              {editingMessageId === message.id ? (
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
              )}
              <footer className="message-meta">
                {message.editedAt ? <span>{translations.chat.edited}</span> : null}
                <time>{formatTime(message.createdAt, locale)}</time>
                <button
                  type="button"
                  aria-label={translations.chat.messageActions}
                  aria-expanded={actionMessageId === message.id}
                  onClick={() => {
                    setActionMessageId((current) => (current === message.id ? null : message.id));
                  }}
                >
                  ⋯
                </button>
              </footer>
              {variantCount > 1 ? (
                <nav className="message-variants" aria-label={translations.chat.variants}>
                  <button
                    type="button"
                    aria-label={translations.chat.previousVariant}
                    disabled={variantIndex <= 0}
                    onClick={() => {
                      const previous = variants[variantIndex - 1];
                      if (previous) void activateVariant(previous, true);
                    }}
                  >
                    ‹
                  </button>
                  <span>
                    {variantIndex + 1} / {variantCount}
                  </span>
                  <button
                    type="button"
                    aria-label={translations.chat.nextVariant}
                    disabled={variantIndex >= variantCount - 1}
                    onClick={() => {
                      const next = variants[variantIndex + 1];
                      if (next) void activateVariant(next, true);
                    }}
                  >
                    ›
                  </button>
                </nav>
              ) : null}
              {actionMessageId === message.id ? (
                <nav className="message-actions" aria-label={translations.chat.messageMenu}>
                  <button
                    type="button"
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
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditDraft(content);
                      setEditingMessageId(message.id);
                      setActionMessageId(null);
                    }}
                  >
                    {translations.chat.edit}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void activateVariant(message.id);
                    }}
                  >
                    {translations.chat.branchHere}
                  </button>
                  {message.role === 'ASSISTANT' && message.parentMessageId ? (
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => {
                        void runMessageGeneration(message.parentMessageId ?? '', 'REPLY');
                      }}
                    >
                      {translations.chat.regenerate}
                    </button>
                  ) : null}
                  {message.role === 'ASSISTANT' ? (
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => {
                        void runMessageGeneration(message.id, 'CONTINUE');
                      }}
                    >
                      {translations.chat.continueAnswer}
                    </button>
                  ) : null}
                  {message.model || message.provider ? (
                    <button
                      type="button"
                      onClick={() => {
                        setModelInfoMessageId((current) =>
                          current === message.id ? null : message.id,
                        );
                      }}
                    >
                      {translations.chat.modelInfo}
                    </button>
                  ) : null}
                  {message.role === 'ASSISTANT' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setReportMessageId(message.id);
                        setActionMessageId(null);
                      }}
                    >
                      {translations.chat.report}
                    </button>
                  ) : null}
                  <button
                    className="danger-text"
                    type="button"
                    onClick={() => {
                      setDeleteMessageId(message.id);
                      setActionMessageId(null);
                    }}
                  >
                    {translations.chat.delete}
                  </button>
                </nav>
              ) : null}
              {modelInfoMessageId === message.id ? (
                <p className="message-model-info">
                  {message.model ?? translations.chat.modelUnknown} ·{' '}
                  {message.provider ?? translations.chat.providerUnknown}
                </p>
              ) : null}
            </article>
          );
        })}
        {streaming ? (
          <article className="message-bubble is-character is-streaming">
            <SafeMarkdown content={streaming} streaming />
            <span className="typing-dot">●</span>
          </article>
        ) : null}
        <div ref={bottomRef} />
      </div>
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
      {deleteMessageId ? (
        <div className="chat-dialog-backdrop" role="presentation">
          <section
            className="chat-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-message-title"
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
          </section>
        </div>
      ) : null}
      {reportMessageId ? (
        <div className="chat-dialog-backdrop" role="presentation">
          <section
            className="chat-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-message-title"
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
          </section>
        </div>
      ) : null}
      {showDeleteChat ? (
        <div className="chat-dialog-backdrop" role="presentation">
          <section
            className="chat-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-chat-title"
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
          </section>
        </div>
      ) : null}
      {error ? (
        <p className="chat-error" role="alert">
          {error}
        </p>
      ) : null}
      <form
        className="chat-composer"
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
            ■
          </button>
        ) : (
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label={translations.chat.send}
          >
            ➤
          </button>
        )}
      </form>
    </div>
  );
}

function ChatSettingsPanel({
  conversation,
  allowedModelProfiles,
}: {
  readonly conversation: ConversationDetail;
  readonly allowedModelProfiles: readonly ('BALANCED' | 'CREATIVE' | 'PREMIUM')[];
}) {
  const { messages } = useI18n();
  const client = useQueryClient();
  const [saved, setSaved] = useState(false);
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
            responseLength: formString(data, 'responseLength'),
            temperature: Number(formString(data, 'temperature')),
            maxOutputTokens: Number(formString(data, 'maxOutputTokens')),
            customInstructions: formString(data, 'customInstructions'),
            personaMode: formString(data, 'personaMode'),
          });
        }}
      >
        <div className="chat-settings-grid">
          <label className="field">
            <span>{messages.chat.generationProfile}</span>
            <select name="modelProfile" defaultValue={conversation.settings.modelProfile}>
              {allowedModelProfiles.includes('BALANCED') ? (
                <option value="BALANCED">{messages.chat.balanced}</option>
              ) : null}
              {allowedModelProfiles.includes('CREATIVE') ? (
                <option value="CREATIVE">{messages.chat.creative}</option>
              ) : null}
              {allowedModelProfiles.includes('PREMIUM') ? (
                <option value="PREMIUM">{messages.chat.premium}</option>
              ) : null}
            </select>
          </label>
          <label className="field">
            <span>{messages.chat.responseLength}</span>
            <select name="responseLength" defaultValue={conversation.settings.responseLength}>
              <option value="SHORT">{messages.chat.short}</option>
              <option value="MEDIUM">{messages.chat.medium}</option>
              <option value="LONG">{messages.chat.long}</option>
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
    </aside>
  );
}

function ChatMemoryPanel({ conversationId }: { readonly conversationId: string }) {
  const { messages } = useI18n();
  const client = useQueryClient();
  const memory = useQuery({
    queryKey: ['conversation-memory', conversationId],
    queryFn: () => apiRequest<ConversationMemory>(`/api/v1/conversations/${conversationId}/memory`),
    refetchInterval: (query) => (query.state.data?.pendingJob ? 1_500 : false),
  });
  const [draft, setDraft] = useState<string | null>(null);
  const draftValue = draft ?? memory.data?.active?.content ?? '';
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['conversation-memory', conversationId] });
  };
  const save = useMutation({
    mutationFn: () =>
      apiRequest(`/api/v1/conversations/${conversationId}/memory`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: draftValue, idempotencyKey: crypto.randomUUID() }),
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
  const pending = save.isPending || run.isPending || Boolean(memory.data?.pendingJob);
  const error = save.error ?? run.error ?? memory.error;
  return (
    <aside className="chat-lore-panel memory-panel">
      <div>
        <strong>{messages.chat.memoryTitle}</strong>
        <small>{messages.chat.memoryText}</small>
      </div>
      <div className="active-lore-summary">
        <span>{messages.chat.tokens(memory.data?.estimatedTokens ?? 0)}</span>
        <span>
          {memory.data?.active
            ? sourceLabel(memory.data.active.sourceType, messages)
            : messages.chat.memoryEmpty}
        </span>
      </div>
      {memory.data?.stale ? (
        <p className="memory-warning" role="status">
          {messages.chat.memoryStale}
        </p>
      ) : null}
      <textarea
        aria-label={messages.chat.memoryInput}
        rows={7}
        maxLength={64_000}
        value={draftValue}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
      />
      <div className="memory-actions">
        <button
          type="button"
          className="primary"
          disabled={pending}
          onClick={() => {
            save.mutate();
          }}
        >
          {messages.chat.save}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => {
            run.mutate('summarize');
          }}
        >
          {messages.chat.summarize}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => {
            run.mutate('regenerate');
          }}
        >
          {messages.chat.regenerateMemory}
        </button>
        {memory.data?.stale ? (
          <button
            type="button"
            className="secondary"
            disabled={pending}
            onClick={() => {
              run.mutate('keep');
            }}
          >
            {messages.chat.keepMemory}
          </button>
        ) : null}
      </div>
      {memory.data?.pendingJob ? <small role="status">{messages.chat.memoryPending}</small> : null}
      {error ? (
        <span className="error" role="alert">
          {localizedErrorMessage(error, messages)}
        </span>
      ) : null}
    </aside>
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

function ChatLorePanel({ conversationId }: { readonly conversationId: string }) {
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
        readonly entries: readonly { readonly id: string; readonly title: string }[];
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
        <span className="active-lore-entry" key={entry.id}>
          {entry.title}
        </span>
      ))}
    </aside>
  );
}

function ChatAvatar({ name, fileId }: { readonly name: string; readonly fileId: string | null }) {
  return (
    <span className="chat-avatar">
      {fileId ? (
        <img src={`/api/v1/media/${fileId}/content`} alt="" />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
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
