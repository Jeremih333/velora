import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState, type SyntheticEvent } from 'react';
import { apiRequest, apiSse } from './api';
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
  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiRequest<ListResponse<ConversationSummary>>('/api/v1/conversations'),
  });
  return (
    <div className="view-stack">
      <header className="view-header">
        <div>
          <p className="eyebrow">ТВОИ ИСТОРИИ</p>
          <h1>Диалоги</h1>
          <p>Каждая история хранит свою ветку, выбранный образ и память.</p>
        </div>
      </header>
      {conversations.isPending ? (
        <div className="empty-state">
          <h2>Загружаем истории…</h2>
        </div>
      ) : null}
      {conversations.isError ? (
        <p className="error" role="alert">
          {conversations.error.message}
        </p>
      ) : null}
      {conversations.data?.items.length === 0 ? (
        <div className="empty-state">
          <span>✦</span>
          <h2>Диалогов пока нет</h2>
          <p>Открой каталог и начни новую историю.</p>
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
                {conversation.isPreview ? <small className="preview-pill">ТЕСТ</small> : null}
              </strong>
              <small>{conversation.lastMessage ?? 'История только начинается'}</small>
            </span>
            <time>{formatTime(conversation.updatedAt)}</time>
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
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить реплику.');
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
      setError(caught instanceof Error ? caught.message : 'Не удалось создать вариант ответа.');
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
      setError(caught instanceof Error ? caught.message : 'Не удалось переключить ветку.');
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
      setError(caught instanceof Error ? caught.message : 'Не удалось изменить сообщение.');
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
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить сообщение.');
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
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить жалобу.');
    }
  };

  const deleteChat = async () => {
    try {
      await apiRequest(`/api/v1/conversations/${conversationId}`, { method: 'DELETE' });
      await client.invalidateQueries({ queryKey: ['conversations'] });
      onBack();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить диалог.');
    }
  };

  return (
    <div className="chat-view">
      <header className="chat-header">
        <button type="button" aria-label="Назад к диалогам" onClick={onBack}>
          ←
        </button>
        <ChatAvatar
          name={conversation.data?.characterName ?? 'V'}
          fileId={conversation.data?.characterAvatarFileId ?? null}
        />
        <span className="chat-title">
          <strong>{conversation.data?.title ?? 'История'}</strong>
          <small>
            {sending
              ? 'создаёт ответ…'
              : conversation.data?.isPreview
                ? 'Приватный тест черновика'
                : 'ролевая история'}
          </small>
        </span>
        <button
          className="chat-context-button"
          type="button"
          aria-label="Инструменты истории"
          onClick={() => {
            setShowTools((value) => !value);
          }}
        >
          ⋯
        </button>
      </header>
      {showTools ? (
        <nav className="chat-tools" aria-label="Инструменты истории">
          <button
            type="button"
            onClick={() => {
              setShowMemory(false);
              setShowPromptInspector(false);
              setShowSettings(false);
              setShowLore((value) => !value);
            }}
          >
            ⌘ Контекст
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
            М Память
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
              ◫ Промпт
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
            ⚙ Настройки
          </button>
          <button
            className="danger-text"
            type="button"
            onClick={() => {
              setShowDeleteChat(true);
            }}
          >
            🗑 Диалог
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
            Показать предыдущие сообщения · {messageWindow.hiddenCount}
          </button>
        ) : null}
        {messageWindow.visible.map((message) => {
          const content =
            message.content || (message.status === 'FAILED' ? 'Ответ не был завершён.' : '');
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
                    aria-label="Изменённый текст сообщения"
                    value={editDraft}
                    maxLength={16_000}
                    onChange={(event) => {
                      setEditDraft(event.target.value);
                    }}
                  />
                  <span>
                    <button type="submit" disabled={!editDraft.trim() || sending}>
                      Сохранить
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMessageId(null);
                      }}
                    >
                      Отмена
                    </button>
                  </span>
                </form>
              ) : (
                <SafeMarkdown content={content} />
              )}
              <footer className="message-meta">
                {message.editedAt ? <span>изменено</span> : null}
                <time>{formatTime(message.createdAt)}</time>
                <button
                  type="button"
                  aria-label="Действия с сообщением"
                  aria-expanded={actionMessageId === message.id}
                  onClick={() => {
                    setActionMessageId((current) => (current === message.id ? null : message.id));
                  }}
                >
                  ⋯
                </button>
              </footer>
              {variantCount > 1 ? (
                <nav className="message-variants" aria-label="Варианты сообщения">
                  <button
                    type="button"
                    aria-label="Предыдущий вариант"
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
                    aria-label="Следующий вариант"
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
                <nav className="message-actions" aria-label="Меню сообщения">
                  <button
                    type="button"
                    onClick={() => {
                      void copyText(content)
                        .then(() => {
                          setActionMessageId(null);
                        })
                        .catch(() => {
                          setError('Браузер не разрешил скопировать сообщение.');
                        });
                    }}
                  >
                    Копировать
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditDraft(content);
                      setEditingMessageId(message.id);
                      setActionMessageId(null);
                    }}
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void activateVariant(message.id);
                    }}
                  >
                    Ветка отсюда
                  </button>
                  {message.role === 'ASSISTANT' && message.parentMessageId ? (
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => {
                        void runMessageGeneration(message.parentMessageId ?? '', 'REPLY');
                      }}
                    >
                      Другой ответ
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
                      Продолжить ответ
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
                      О модели
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
                      Пожаловаться
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
                    Удалить
                  </button>
                </nav>
              ) : null}
              {modelInfoMessageId === message.id ? (
                <p className="message-model-info">
                  {message.model ?? 'Модель не указана'} ·{' '}
                  {message.provider ?? 'провайдер не указан'}
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
          ↓ К новым сообщениям
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
            <h2 id="delete-message-title">Удалить сообщение и продолжение ветки?</h2>
            <p>Сообщение и ответы после него исчезнут. Память истории потребуется обновить.</p>
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setDeleteMessageId(null);
                }}
              >
                Отмена
              </button>
              <button className="danger" type="button" onClick={() => void deleteMessage()}>
                Удалить
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
            <h2 id="report-message-title">Жалоба на сообщение</h2>
            <label className="field">
              <span>Что произошло?</span>
              <textarea
                aria-label="Описание жалобы на сообщение"
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
                Отмена
              </button>
              <button
                className="primary"
                type="button"
                disabled={reportDetails.trim().length < 10}
                onClick={() => void reportMessage()}
              >
                Отправить
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
            <h2 id="delete-chat-title">Удалить диалог?</h2>
            <p>История будет скрыта, а активная генерация остановлена. Отменить действие нельзя.</p>
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteChat(false);
                }}
              >
                Оставить
              </button>
              <button className="danger" type="button" onClick={() => void deleteChat()}>
                Удалить диалог
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
          aria-label="Реплика"
          placeholder="Напиши продолжение истории…"
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
            aria-label="Остановить генерацию"
            onClick={() => {
              void apiRequest(
                `/api/v1/conversations/${conversationId}/generate/${generationId}/stop`,
                { method: 'POST' },
              ).catch((caught: unknown) => {
                setError(caught instanceof Error ? caught.message : 'Не удалось остановить ответ.');
              });
            }}
          >
            ■
          </button>
        ) : (
          <button type="submit" disabled={sending || !draft.trim()} aria-label="Отправить">
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
        <strong>Настройки истории</strong>
        <small>Применяются только к этому диалогу и не меняют другие истории.</small>
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
            <span>Профиль генерации</span>
            <select name="modelProfile" defaultValue={conversation.settings.modelProfile}>
              {allowedModelProfiles.includes('BALANCED') ? (
                <option value="BALANCED">Сбалансированный</option>
              ) : null}
              {allowedModelProfiles.includes('CREATIVE') ? (
                <option value="CREATIVE">Творческий</option>
              ) : null}
              {allowedModelProfiles.includes('PREMIUM') ? (
                <option value="PREMIUM">Максимальное качество</option>
              ) : null}
            </select>
          </label>
          <label className="field">
            <span>Длина ответа</span>
            <select name="responseLength" defaultValue={conversation.settings.responseLength}>
              <option value="SHORT">Короткий</option>
              <option value="MEDIUM">Средний</option>
              <option value="LONG">Длинный</option>
            </select>
          </label>
          <label className="field">
            <span>Творческая вариативность: 0–2</span>
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
            <span>Максимум токенов ответа</span>
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
            <span>Режим образа</span>
            <select name="personaMode" defaultValue={conversation.settings.personaMode}>
              <option value="SNAPSHOT">Снимок на момент старта</option>
              <option value="LIVE">Всегда актуальный образ</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Инструкции для этого чата</span>
          <textarea
            name="customInstructions"
            rows={5}
            maxLength={8000}
            defaultValue={conversation.settings.customInstructions}
            placeholder="Стиль повествования, POV, темп и ограничения истории"
          />
        </label>
        <p className="settings-cost-note">
          Все профили используют только заранее купленные AI-кредиты. Подписки и автопополнения нет.
        </p>
        {save.error ? (
          <span className="error" role="alert">
            {save.error.message}
          </span>
        ) : null}
        {saved ? (
          <span className="success" role="status">
            Настройки истории сохранены.
          </span>
        ) : null}
        <button className="primary" type="submit" disabled={save.isPending}>
          {save.isPending ? 'Сохраняем…' : 'Сохранить настройки'}
        </button>
      </form>
    </aside>
  );
}

function ChatMemoryPanel({ conversationId }: { readonly conversationId: string }) {
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
        <strong>Постоянная память</strong>
        <small>
          Бесплатная детерминированная сводка активной ветки. AI-кредиты не расходуются.
        </small>
      </div>
      <div className="active-lore-summary">
        <span>{memory.data?.estimatedTokens ?? 0} токенов</span>
        <span>
          {memory.data?.active ? sourceLabel(memory.data.active.sourceType) : 'Память ещё пуста'}
        </span>
      </div>
      {memory.data?.stale ? (
        <p className="memory-warning" role="status">
          История была изменена. Пересобери память или явно оставь текущую версию.
        </p>
      ) : null}
      <textarea
        aria-label="Текст постоянной памяти"
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
          Сохранить
        </button>
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => {
            run.mutate('summarize');
          }}
        >
          Резюмировать новое
        </button>
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => {
            run.mutate('regenerate');
          }}
        >
          Пересобрать полностью
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
            Оставить текущую
          </button>
        ) : null}
      </div>
      {memory.data?.pendingJob ? (
        <small role="status">Задача памяти обрабатывается в фоне…</small>
      ) : null}
      {error ? (
        <span className="error" role="alert">
          {error.message}
        </span>
      ) : null}
    </aside>
  );
}

function ChatPromptInspector({ conversationId }: { readonly conversationId: string }) {
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
        <strong>Собираю фактический контекст…</strong>
      </aside>
    );
  }
  if (inspector.error || !inspector.data) {
    return (
      <aside className="chat-lore-panel prompt-inspector">
        <strong>Инспектор промпта</strong>
        <span className="error" role="alert">
          {inspector.error?.message ?? 'Контекст недоступен.'}
        </span>
      </aside>
    );
  }
  const data = inspector.data;
  const characterSections = [
    ['Описание', data.character.description],
    ['Характер', data.character.personality],
    ['Сценарий', data.character.scenario],
    ['Стиль речи', data.character.speechStyle],
    ['Внешность', data.character.appearance],
    ['Предыстория', data.character.background],
    ['Цели', data.character.goals],
    ['Правила поведения', data.character.behaviourRules],
    ['Инструкции создателя', data.character.systemInstructions],
    ['Инструкции после истории', data.character.postHistoryInstructions],
  ].filter((entry) => entry[1]);
  return (
    <aside className="chat-lore-panel prompt-inspector">
      <div>
        <strong>Инспектор промпта</strong>
        <small>
          Фактические секции активной ветки. Доступны только создателю персонажа и администрации.
        </small>
      </div>
      <div className="active-lore-summary">
        <span>{data.tokenEstimates['totalInput'] ?? 0} входных токенов</span>
        <span>{data.tokenEstimates['outputReserved'] ?? 0} зарезервировано на ответ</span>
        <span>{data.tokenEstimates['contextLimit'] ?? 0} контекст</span>
      </div>
      <details open>
        <summary>Персонаж · {data.character.name}</summary>
        {characterSections.map(([label, value]) => (
          <section key={label}>
            <strong>{label}</strong>
            <pre>{value}</pre>
          </section>
        ))}
      </details>
      <details>
        <summary>Память · {data.tokenEstimates['memory'] ?? 0} токенов</summary>
        <pre>{data.memory || 'Память пока пуста.'}</pre>
      </details>
      <details>
        <summary>Активный лор · {data.lore.length}</summary>
        {data.lore.length > 0 ? (
          data.lore.map((entry) => (
            <section key={entry.id}>
              <strong>{entry.title}</strong>
              <pre>{entry.content}</pre>
            </section>
          ))
        ) : (
          <p>Для текущей ветки записи лора не активированы.</p>
        )}
      </details>
      <details>
        <summary>Последние сообщения · {data.recentMessages.length}</summary>
        {data.recentMessages.map((message, index) => (
          <section key={`${message.role}-${String(index)}`}>
            <strong>{message.role === 'USER' ? 'Пользователь' : 'Персонаж'}</strong>
            <pre>{message.content}</pre>
          </section>
        ))}
      </details>
      <details>
        <summary>Оценка токенов</summary>
        <dl className="prompt-token-grid">
          {Object.entries(data.tokenEstimates).map(([name, value]) => (
            <div key={name}>
              <dt>{promptTokenLabel(name)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <small>
          Отброшено сообщений: {data.droppedHistoryMessages}; примеров:{' '}
          {data.droppedExampleMessages}.
        </small>
      </details>
    </aside>
  );
}

function promptTokenLabel(name: string): string {
  const labels: Readonly<Record<string, string>> = {
    platformPolicy: 'Политика платформы',
    character: 'Персонаж',
    creatorInstructions: 'Инструкции создателя',
    persona: 'Персона пользователя',
    memory: 'Память',
    lore: 'Лор',
    chatInstructions: 'Инструкции диалога',
    examples: 'Примеры',
    recentMessages: 'Последние сообщения',
    postHistoryInstructions: 'Инструкции после истории',
    totalInput: 'Всего на входе',
    outputReserved: 'Резерв ответа',
    contextLimit: 'Лимит контекста',
  };
  return labels[name] ?? name;
}

function sourceLabel(source: string): string {
  const labels: Readonly<Record<string, string>> = {
    AUTO_SUMMARY: 'Автоматическая сводка',
    FULL_REGENERATION: 'Полная пересборка',
    MANUAL_EDIT: 'Изменено вручную',
    RESTORE: 'Восстановленная версия',
  };
  return labels[source] ?? source;
}

function ChatLorePanel({ conversationId }: { readonly conversationId: string }) {
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
        <strong>Контекст истории</strong>
        <small>Книги подключаются только к этому диалогу.</small>
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
          <span className="meta">Создай книгу мира в разделе персонажей.</span>
        ) : null}
      </div>
      {change.isError ? (
        <span className="error" role="alert">
          {change.error.message}
        </span>
      ) : null}
      <div className="active-lore-summary">
        <span>Активные сейчас: {active.data?.entries.length ?? 0}</span>
        <span>{active.data?.totalTokens ?? 0} токенов</span>
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

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
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
