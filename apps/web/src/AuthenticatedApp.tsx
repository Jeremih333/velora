import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { renderTemplate } from '@velora/prompts';
import { ru } from '@velora/shared';
import { apiRequest } from './api';
import { allowsCharacterAutosave, pendingAutosaveState } from './character-autosave';
import { ChatsView } from './ChatsView';
import { LorebooksView } from './LorebooksView';
import { openTelegramInvoice, type InvoiceStatus } from './telegram';
import type {
  AccessPackCatalog,
  AccessPack,
  BillingCatalog,
  BlockedUser,
  AdminFeatureFlag,
  AiSmokeRun,
  BotHubModelCapabilities,
  Character,
  CharacterReview,
  CreatorStats,
  DataControls,
  DiscoveryCharacter,
  MeResponse,
  MediaFile,
  ModerationCaseDetail,
  ModerationCaseSummary,
  PaymentHistoryItem,
  PaymentInvoice,
  PlanDefinition,
  Persona,
  PublicFeatureFlags,
  OperationsDashboard,
  Settings,
  StaffAssignment,
  SupportCategory,
  SupportRequest,
  SupportState,
  UserProfile,
} from './types';

type Tab =
  | 'discover'
  | 'chats'
  | 'characters'
  | 'lorebooks'
  | 'personas'
  | 'billing'
  | 'settings'
  | 'profile'
  | 'moderation';

interface ListResponse<T> {
  readonly items: readonly T[];
}
interface DiscoveryResponse extends ListResponse<DiscoveryCharacter> {
  readonly nextCursor: string | null;
}

interface CharacterActionResult {
  readonly publishState?: Character['publishState'];
  readonly message?: string;
}

export function AuthenticatedApp({ initialUser }: { readonly initialUser: MeResponse }) {
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>('discover');
  const [notice, setNotice] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState(initialUser.id);
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => apiRequest<MeResponse>('/api/v1/me'),
    initialData: initialUser,
  });

  if (!me.data.onboardingCompleted) {
    return (
      <OnboardingView
        displayName={me.data.displayName}
        onCompleted={(startedConversationId) => {
          client.setQueryData<MeResponse>(['me'], (current) =>
            current ? { ...current, onboardingCompleted: true } : current,
          );
          if (startedConversationId) {
            setConversationId(startedConversationId);
            setTab('chats');
          } else {
            setTab('discover');
          }
        }}
      />
    );
  }

  return (
    <main className="app-shell product-shell">
      <header className="topbar product-topbar">
        <button
          className="brand brand-button"
          type="button"
          onClick={() => {
            setProfileUserId(me.data.id);
            setTab('profile');
          }}
        >
          <span className="brand-mark">V</span>
          <span>
            <strong>Velora</strong>
            <small>{me.data.displayName}</small>
          </span>
        </button>
        <div className="header-actions">
          <button
            className="balance-pill"
            type="button"
            aria-label="Открыть AI-кредиты"
            onClick={() => {
              setTab('billing');
            }}
          >
            <span>✦</span> {formatCredits(me.data.creditBalanceMicros)}
          </button>
          {['MODERATOR', 'SENIOR_MODERATOR', 'ADMIN', 'OWNER'].includes(me.data.role) ? (
            <button
              className="compact-button lore-symbol"
              type="button"
              onClick={() => {
                setTab('moderation');
              }}
            >
              🛡 Модерация
            </button>
          ) : null}
          <span className="free-pill">Cloudflare Free</span>
        </div>
      </header>

      {notice ? (
        <div className="toast" role="status">
          {notice}
        </div>
      ) : null}
      <section className="workspace" aria-live="polite">
        {tab === 'discover' ? (
          <DiscoveryView
            currentUserId={me.data.id}
            onOpenCreator={(userId) => {
              setProfileUserId(userId);
              setTab('profile');
            }}
            onStarted={(id) => {
              setConversationId(id);
              setTab('chats');
            }}
          />
        ) : null}
        {tab === 'chats' ? (
          <ChatsView
            initialConversationId={conversationId}
            allowedModelProfiles={me.data.planEntitlements.modelProfiles}
            onConversationOpened={setConversationId}
          />
        ) : null}
        {tab === 'characters' ? (
          <CharactersView
            notify={setNotice}
            onStarted={(id) => {
              setConversationId(id);
              setTab('chats');
            }}
            onOpenLorebooks={() => {
              setTab('lorebooks');
            }}
          />
        ) : null}
        {tab === 'lorebooks' ? (
          <LorebooksView
            onBack={() => {
              setTab('characters');
            }}
          />
        ) : null}
        {tab === 'personas' ? <PersonasView notify={setNotice} /> : null}
        {tab === 'billing' ? <BillingView account={me.data} notify={setNotice} /> : null}
        {tab === 'settings' ? <SettingsView account={me.data} notify={setNotice} /> : null}
        {tab === 'profile' ? (
          <ProfileView
            userId={profileUserId}
            currentUserId={me.data.id}
            notify={setNotice}
            onBack={() => {
              setTab('discover');
            }}
          />
        ) : null}
        {tab === 'moderation' ? <ModerationView notify={setNotice} role={me.data.role} /> : null}
      </section>
      <nav className="bottom-nav" aria-label="Основные разделы">
        <NavButton
          active={tab === 'chats'}
          label="Диалоги"
          icon="◌"
          onClick={() => {
            setTab('chats');
          }}
        />
        <NavButton
          active={tab === 'discover'}
          label="Каталог"
          icon="⌕"
          onClick={() => {
            setTab('discover');
          }}
        />
        <NavButton
          active={tab === 'characters'}
          label="Персонажи"
          icon="✦"
          onClick={() => {
            setTab('characters');
          }}
        />
        <NavButton
          active={tab === 'personas'}
          label="Образы"
          icon="◉"
          onClick={() => {
            setTab('personas');
          }}
        />
        <NavButton
          active={tab === 'settings'}
          label="Настройки"
          icon="⚙"
          onClick={() => {
            setTab('settings');
          }}
        />
      </nav>
    </main>
  );
}

function OnboardingView({
  displayName,
  onCompleted,
}: {
  readonly displayName: string;
  readonly onCompleted: (startedConversationId: string | null) => void;
}) {
  const [step, setStep] = useState(0);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [matureEnabled, setMatureEnabled] = useState(false);
  const [personaName, setPersonaName] = useState('');
  const [personaDescription, setPersonaDescription] = useState('');
  const completionKey = useRef(crypto.randomUUID());
  const chatKey = useRef(crypto.randomUUID());
  const recommendations = useQuery({
    queryKey: ['onboarding', 'recommendations'],
    queryFn: () =>
      apiRequest<DiscoveryResponse>('/api/v1/discovery?sort=trending&limit=3&rating=SAFE'),
    enabled: step === 3,
  });
  const complete = useMutation({
    mutationFn: async (characterId: string | null) => {
      await apiRequest('/api/v1/onboarding/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: completionKey.current,
          policyAccepted: true,
          matureEnabled,
          persona:
            personaName.trim().length > 0
              ? {
                  name: personaName,
                  shortDescription: personaDescription,
                }
              : null,
        }),
      });
      if (!characterId) return null;
      const conversation = await apiRequest<{ readonly id: string }>('/api/v1/conversations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          characterId,
          idempotencyKey: chatKey.current,
        }),
      });
      return conversation.id;
    },
    onSuccess: onCompleted,
  });

  return (
    <main className="app-shell onboarding-shell">
      <header className="onboarding-brand">
        <span className="brand-mark">V</span>
        <span>
          <strong>Velora</strong>
          <small>шаг {step + 1} из 4</small>
        </span>
      </header>
      <div className="onboarding-progress" aria-label={`Шаг ${String(step + 1)} из 4`}>
        <span style={{ width: `${String(((step + 1) / 4) * 100)}%` }} />
      </div>

      {step === 0 ? (
        <section className="onboarding-card">
          <p className="eyebrow">ДОБРО ПОЖАЛОВАТЬ</p>
          <h1>{displayName}, твоя история начинается здесь</h1>
          <p className="lead">
            Создавай персонажей, выбирай свой образ и веди ролевые истории с памятью и полным
            контролем над сюжетом.
          </p>
          <ul className="onboarding-points">
            <li>✦ Персонажи сохраняют заданную роль</li>
            <li>∞ Память удерживает важные события</li>
            <li>◒ Ты управляешь ветками и контекстом</li>
          </ul>
          <button
            className="primary"
            type="button"
            onClick={() => {
              setStep(1);
            }}
          >
            Продолжить
          </button>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="onboarding-card">
          <p className="eyebrow">БЕЗОПАСНОСТЬ</p>
          <h1>Выбери комфортный режим</h1>
          <p>
            Без подтверждения совершеннолетия каталог показывает только безопасные истории. Это
            можно изменить позже в настройках.
          </p>
          <label className="choice-card">
            <input
              type="checkbox"
              checked={matureEnabled}
              onChange={(event) => {
                setMatureEnabled(event.target.checked);
              }}
            />
            <span>
              <strong>Мне исполнилось 18 лет</strong>
              <small>Разрешить показ Mature-контента с отдельной маркировкой</small>
            </span>
          </label>
          <label className="choice-card">
            <input
              type="checkbox"
              checked={policyAccepted}
              onChange={(event) => {
                setPolicyAccepted(event.target.checked);
              }}
            />
            <span>
              <strong>Я принимаю правила сообщества</strong>
              <small>Запрещённый контент и попытки обхода ограничений не допускаются</small>
            </span>
          </label>
          <div className="onboarding-actions">
            <button
              type="button"
              onClick={() => {
                setStep(0);
              }}
            >
              Назад
            </button>
            <button
              className="primary"
              type="button"
              disabled={!policyAccepted}
              onClick={() => {
                setStep(2);
              }}
            >
              Продолжить
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="onboarding-card">
          <p className="eyebrow">ТВОЙ ОБРАЗ · НЕОБЯЗАТЕЛЬНО</p>
          <h1>Кем ты будешь в историях?</h1>
          <p>Образ подставляется в диалоги вместо твоего Telegram-профиля. Его можно пропустить.</p>
          <label>
            Имя образа
            <input
              value={personaName}
              maxLength={80}
              placeholder="Например, Странница"
              onChange={(event) => {
                setPersonaName(event.target.value);
              }}
            />
          </label>
          <label>
            Короткое описание
            <textarea
              value={personaDescription}
              maxLength={280}
              placeholder="Что персонажи должны знать о твоём образе?"
              onChange={(event) => {
                setPersonaDescription(event.target.value);
              }}
            />
          </label>
          <div className="onboarding-actions">
            <button
              type="button"
              onClick={() => {
                setStep(1);
              }}
            >
              Назад
            </button>
            <button
              className="primary"
              type="button"
              onClick={() => {
                setStep(3);
              }}
            >
              {personaName.trim() ? 'Сохранить образ' : 'Пропустить'}
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="onboarding-card onboarding-recommendations">
          <p className="eyebrow">ПЕРВЫЕ ИСТОРИИ</p>
          <h1>Выбери, с чего начать</h1>
          <p>
            Это актуальные безопасные персонажи из каталога. Полный поиск откроется сразу после.
          </p>
          {recommendations.isPending ? <p role="status">Подбираем истории…</p> : null}
          {recommendations.isError ? <InlineError error={recommendations.error} /> : null}
          <div className="onboarding-character-list">
            {recommendations.data?.items.map((character) => (
              <article key={character.id} className="onboarding-character">
                <Avatar name={character.name} fileId={character.avatarFileId} />
                <span>
                  <h2>{character.name}</h2>
                  <small>{character.tagline}</small>
                </span>
                <button
                  type="button"
                  disabled={complete.isPending}
                  onClick={() => {
                    complete.mutate(character.id);
                  }}
                >
                  Начать
                </button>
              </article>
            ))}
          </div>
          {recommendations.data?.items.length === 0 ? (
            <p>Публичные истории скоро появятся — пока можно открыть каталог.</p>
          ) : null}
          <button
            className="primary"
            type="button"
            disabled={complete.isPending}
            onClick={() => {
              complete.mutate(null);
            }}
          >
            {complete.isPending ? 'Сохраняем…' : 'Открыть каталог'}
          </button>
          <button
            type="button"
            disabled={complete.isPending}
            onClick={() => {
              setStep(2);
            }}
          >
            Назад
          </button>
          <InlineError error={complete.error} />
        </section>
      ) : null}
    </main>
  );
}

function BillingView({
  account,
  notify,
}: {
  readonly account: MeResponse;
  readonly notify: (message: string | null) => void;
}) {
  const client = useQueryClient();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const catalog = useQuery({
    queryKey: ['billing', 'packs'],
    queryFn: () => apiRequest<BillingCatalog>('/api/v1/billing/packs'),
  });
  const accessCatalog = useQuery({
    queryKey: ['billing', 'access-packs'],
    queryFn: () => apiRequest<AccessPackCatalog>('/api/v1/billing/access-packs'),
  });
  const history = useQuery({
    queryKey: ['billing', 'payments'],
    queryFn: () =>
      apiRequest<{ readonly items: readonly PaymentHistoryItem[] }>('/api/v1/billing/payments'),
  });
  const invoice = useMutation({
    mutationFn: (packCode: string) =>
      apiRequest<PaymentInvoice>('/api/v1/billing/invoices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          packCode,
          termsAccepted: true,
          idempotencyKey: crypto.randomUUID(),
        }),
      }),
    onSuccess: (result) => {
      const handleClosed = (status: InvoiceStatus) => {
        if (status === 'paid') notify('Оплата подтверждена. Баланс обновляется.');
        if (status === 'failed') notify('Telegram не смог завершить оплату. Кредиты не списаны.');
        void client.invalidateQueries({ queryKey: ['me'] });
        void client.invalidateQueries({ queryKey: ['billing', 'payments'] });
      };
      if (!openTelegramInvoice(result.invoiceUrl, handleClosed)) {
        notify('Счёт можно открыть только внутри Telegram MiniApp.');
      }
    },
  });
  const accessInvoice = useMutation({
    mutationFn: (packCode: string) =>
      apiRequest<PaymentInvoice>('/api/v1/billing/access-invoices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          packCode,
          termsAccepted: true,
          idempotencyKey: crypto.randomUUID(),
        }),
      }),
    onSuccess: (result) => {
      const handleClosed = (status: InvoiceStatus) => {
        if (status === 'paid') notify('Доступ начислен. Тариф и срок обновляются.');
        if (status === 'failed') notify('Telegram не завершил оплату. Доступ не изменён.');
        void client.invalidateQueries({ queryKey: ['me'] });
        void client.invalidateQueries({ queryKey: ['billing', 'payments'] });
      };
      if (!openTelegramInvoice(result.invoiceUrl, handleClosed)) {
        notify('Счёт можно открыть только внутри Telegram MiniApp.');
      }
    },
  });
  if (catalog.isPending) return <EmptyState title="Загружаем AI-кредиты…" />;
  if (catalog.isError)
    return <ErrorState error={catalog.error} retry={() => void catalog.refetch()} />;
  return (
    <div className="view-stack">
      <ViewHeader
        eyebrow="AI-КРЕДИТЫ"
        title="Разовое пополнение"
        description="Velora работает на Cloudflare Free. Кредиты расходуются только на полноценные ролевые ответы ИИ."
      />
      <section className="billing-assurance" aria-label="Условия оплаты">
        <strong>Без карты, подписки и автопополнения</strong>
        <p>
          Покупка выполняется один раз через Telegram Stars. Повторных списаний нет; новый пакет
          приобретается только вручную.
        </p>
      </section>
      <section className="billing-assurance" aria-label="Текущий тариф">
        <strong>Текущий тариф: {account.planDisplayName}</strong>
        <p>
          {account.planAccessUntil
            ? `Доступ действует до ${new Date(account.planAccessUntil).toLocaleDateString('ru-RU')}. Продления и повторного списания нет.`
            : 'Бесплатный тариф не имеет срока окончания.'}
        </p>
      </section>
      {catalog.data.paymentsEnabled &&
      (catalog.data.items.length > 0 || (accessCatalog.data?.items.length ?? 0) > 0) ? (
        <label className="terms-check">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(event) => {
              setTermsAccepted(event.currentTarget.checked);
            }}
          />
          <span>
            Я принимаю условия разовой покупки и понимаю, что подписка и автоматическое продление не
            создаются.
          </span>
        </label>
      ) : null}
      {accessCatalog.isError ? <InlineError error={accessCatalog.error} /> : null}
      {accessCatalog.data?.items.length ? (
        <section className="view-stack" aria-labelledby="access-packs-title">
          <h2 id="access-packs-title">Разовый доступ Plus и Pro</h2>
          <div className="billing-grid">
            {accessCatalog.data.items.map((pack) => (
              <article className="billing-pack" key={pack.code}>
                <span className="pack-stars">{pack.starsAmount} ⭐</span>
                <h2>{pack.displayName}</h2>
                <p>{pack.description}</p>
                <strong>
                  {pack.durationDays} дней · {pack.planCode}
                </strong>
                <button
                  className="primary"
                  type="button"
                  disabled={
                    !catalog.data.paymentsEnabled || !termsAccepted || accessInvoice.isPending
                  }
                  onClick={() => {
                    accessInvoice.mutate(pack.code);
                  }}
                >
                  Купить один раз
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {!catalog.data.paymentsEnabled ? (
        <section className="billing-disabled" role="status">
          <strong>Покупки пока выключены</strong>
          <p>
            Владелец ещё не включил реальные счета. Бесплатные функции Velora доступны как обычно.
          </p>
        </section>
      ) : catalog.data.items.length === 0 ? (
        <section className="billing-disabled" role="status">
          <strong>Пакеты ещё не настроены</strong>
          <p>До ручной настройки цен владельцем приложение не создаёт платёжные счета.</p>
        </section>
      ) : (
        <>
          <div className="billing-grid">
            {catalog.data.items.map((pack) => (
              <article className="billing-pack" key={pack.code}>
                <span className="pack-stars">{pack.starsAmount} ⭐</span>
                <h2>{pack.displayName}</h2>
                <p>{pack.description}</p>
                <strong>{formatCredits(pack.creditAmountMicros)} AI-кредитов</strong>
                <button
                  className="primary"
                  type="button"
                  disabled={!termsAccepted || invoice.isPending}
                  onClick={() => {
                    invoice.mutate(pack.code);
                  }}
                >
                  Купить за {pack.starsAmount} ⭐
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      <InlineError error={invoice.error} />
      <InlineError error={accessInvoice.error} />
      <section className="payment-history">
        <h2>История операций</h2>
        {history.isPending ? <p>Загружаем…</p> : null}
        {history.isError ? <InlineError error={history.error} /> : null}
        {history.data?.items.length === 0 ? <p>Операций пока нет.</p> : null}
        {history.data?.items.map((item) => (
          <div className="payment-row" key={item.id}>
            <span>
              <strong>{item.amount} ⭐</strong>
              <small>{formatPaymentState(item.state)}</small>
            </span>
            <time dateTime={new Date(item.createdAt).toISOString()}>
              {new Date(item.createdAt).toLocaleDateString('ru-RU')}
            </time>
          </div>
        ))}
      </section>
    </div>
  );
}

function formatCredits(valueMicros: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(
    valueMicros / 1_000_000,
  );
}

function formatPaymentState(state: string): string {
  const labels: Readonly<Record<string, string>> = {
    CREATED: 'Создаётся',
    INVOICE_SENT: 'Ожидает оплаты',
    PAID: 'Оплачено',
    FAILED: 'Ошибка',
    REFUNDED: 'Возвращено',
  };
  return labels[state] ?? state;
}

function NavButton({
  active,
  label,
  icon,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly icon: string;
  readonly onClick: () => void;
}) {
  return (
    <button className={active ? 'nav-item is-active' : 'nav-item'} type="button" onClick={onClick}>
      <span>{icon}</span>
      <small>{label}</small>
    </button>
  );
}

function DiscoveryView({
  currentUserId,
  onStarted,
  onOpenCreator,
}: {
  readonly currentUserId: string;
  readonly onStarted: (id: string) => void;
  readonly onOpenCreator: (userId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const discovery = useQuery({
    queryKey: ['discovery', submittedQuery],
    queryFn: () =>
      apiRequest<DiscoveryResponse>(
        `/api/v1/discovery?q=${encodeURIComponent(submittedQuery)}&rating=SAFE&limit=20`,
      ),
  });
  const featureFlags = useQuery({
    queryKey: ['feature-flags'],
    queryFn: () => apiRequest<PublicFeatureFlags>('/api/v1/feature-flags'),
  });
  return (
    <div className="view-stack">
      <ViewHeader
        eyebrow="ИССЛЕДУЙ"
        title="Найди свою историю"
        description="Опубликованные персонажи, доступные для безопасного ролевого диалога."
      />
      <form
        className="search-bar"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmittedQuery(query.trim());
        }}
      >
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Имя, описание или сюжет"
          aria-label="Поиск персонажей"
        />
        <button type="submit">Найти</button>
      </form>
      {discovery.isPending ? <EmptyState title="Открываем каталог…" /> : null}
      {discovery.isError ? (
        <ErrorState error={discovery.error} retry={() => void discovery.refetch()} />
      ) : null}
      {discovery.data?.items.length === 0 ? (
        <EmptyState title="Пока ничего не найдено" text="Измени запрос или вернись чуть позже." />
      ) : null}
      <div className="card-grid">
        {discovery.data?.items.map((character) => (
          <DiscoveryCard
            key={character.id}
            character={character}
            currentUserId={currentUserId}
            onStarted={onStarted}
            onOpenCreator={onOpenCreator}
            publicReviews={featureFlags.data?.flags.public_reviews ?? false}
          />
        ))}
      </div>
    </div>
  );
}

function DiscoveryCard({
  character,
  currentUserId,
  onStarted,
  onOpenCreator,
  publicReviews,
}: {
  readonly character: DiscoveryCharacter;
  readonly currentUserId: string;
  readonly onStarted: (id: string) => void;
  readonly onOpenCreator: (userId: string) => void;
  readonly publicReviews: boolean;
}) {
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [greetingIndex, setGreetingIndex] = useState(0);
  const reviews = useQuery({
    queryKey: ['character-reviews', character.id],
    queryFn: () =>
      apiRequest<ListResponse<CharacterReview>>(`/api/v1/discovery/${character.id}/reviews`),
    enabled: expanded && publicReviews,
  });
  const interaction = useMutation({
    mutationFn: ({
      kind,
      enabled,
    }: {
      readonly kind: 'like' | 'bookmark';
      readonly enabled: boolean;
    }) =>
      apiRequest(`/api/v1/discovery/${character.id}/${kind}`, {
        method: enabled ? 'PUT' : 'DELETE',
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['discovery'] });
      await client.invalidateQueries({ queryKey: ['creator-stats'] });
    },
  });
  const review = useMutation({
    mutationFn: (body: { readonly rating: number; readonly text: string }) =>
      apiRequest(`/api/v1/discovery/${character.id}/review`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['discovery'] }),
        client.invalidateQueries({ queryKey: ['character-reviews', character.id] }),
        client.invalidateQueries({ queryKey: ['creator-stats'] }),
      ]);
    },
  });
  const removeReview = useMutation({
    mutationFn: () => apiRequest(`/api/v1/discovery/${character.id}/review`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['discovery'] }),
        client.invalidateQueries({ queryKey: ['character-reviews', character.id] }),
        client.invalidateQueries({ queryKey: ['creator-stats'] }),
      ]);
    },
  });
  const start = useMutation({
    mutationFn: () =>
      apiRequest<{ readonly id: string }>('/api/v1/conversations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          characterId: character.id,
          greetingIndex,
          idempotencyKey: crypto.randomUUID(),
        }),
      }),
    onSuccess: (conversation) => {
      onStarted(conversation.id);
    },
  });
  const blockCreator = useMutation({
    mutationFn: () => apiRequest(`/api/v1/blocks/${character.creatorId}`, { method: 'PUT' }),
    onSuccess: async () => {
      setConfirmingBlock(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['discovery'] }),
        client.invalidateQueries({ queryKey: ['blocks'] }),
      ]);
    },
  });
  return (
    <article className="story-card">
      <div className="story-cover">
        {character.avatarFileId ? (
          <img src={`/api/v1/media/${character.avatarFileId}/content`} alt="" />
        ) : (
          <span>{character.name.slice(0, 1).toUpperCase()}</span>
        )}
        <b>{character.language.toUpperCase()}</b>
      </div>
      <div className="story-body">
        <button
          className="creator-link"
          type="button"
          onClick={() => {
            onOpenCreator(character.creatorId);
          }}
        >
          от {character.creatorName}
        </button>
        <h2>{character.name}</h2>
        <p className="tagline">{character.tagline}</p>
        {expanded ? <p className="description">{character.description}</p> : null}
        {expanded && character.alternateGreetings.length > 0 ? (
          <label className="field greeting-picker">
            <span>Начальное приветствие</span>
            <select
              aria-label="Начальное приветствие"
              value={greetingIndex}
              onChange={(event) => {
                setGreetingIndex(Number(event.currentTarget.value));
              }}
            >
              <option value={0}>Основное</option>
              {character.alternateGreetings.map((_, index) => (
                <option key={index} value={index + 1}>
                  Вариант {index + 1}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="tag-list">
          {character.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className="character-metrics" aria-label="Статистика персонажа">
          <span>♡ {character.likeCount}</span>
          <span>🔖 {character.bookmarkCount}</span>
          {publicReviews ? (
            <span>
              ★ {character.averageRating?.toFixed(1) ?? '—'} · {character.reviewCount}
            </span>
          ) : null}
        </div>
        <div className="character-interactions">
          <button
            className={character.liked ? 'is-selected' : ''}
            type="button"
            aria-pressed={character.liked}
            disabled={interaction.isPending}
            onClick={() => {
              interaction.mutate({ kind: 'like', enabled: !character.liked });
            }}
          >
            {character.liked ? '♥ Нравится' : '♡ Нравится'}
          </button>
          <button
            className={character.bookmarked ? 'is-selected' : ''}
            type="button"
            aria-pressed={character.bookmarked}
            disabled={interaction.isPending}
            onClick={() => {
              interaction.mutate({ kind: 'bookmark', enabled: !character.bookmarked });
            }}
          >
            {character.bookmarked ? '🔖 Сохранено' : '♧ В закладки'}
          </button>
        </div>
        {interaction.error ? <InlineError error={interaction.error} /> : null}
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          {expanded ? 'Свернуть' : 'Подробнее'}
        </button>
        {expanded && publicReviews ? (
          <button
            className="text-button report-link"
            type="button"
            onClick={() => {
              setReportSent(false);
              setReporting((value) => !value);
            }}
          >
            ⚑ Пожаловаться
          </button>
        ) : null}
        {reporting ? (
          <ReportForm
            targetId={character.id}
            onDone={() => {
              setReporting(false);
              setReportSent(true);
            }}
          />
        ) : null}
        {reportSent ? (
          <span className="success" role="status">
            Жалоба отправлена в очередь модерации.
          </span>
        ) : null}
        {expanded && character.creatorId !== currentUserId ? (
          <button
            className="text-button danger-link"
            type="button"
            onClick={() => {
              setConfirmingBlock(true);
            }}
          >
            Заблокировать автора
          </button>
        ) : null}
        {confirmingBlock ? (
          <div className="inline-confirm" role="alertdialog" aria-label="Подтверждение блокировки">
            <p>
              Автор, его персонажи и диалоги станут недоступны вам. Вы сможете снять блокировку в
              настройках.
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setConfirmingBlock(false);
                }}
              >
                Отмена
              </button>
              <button
                className="danger"
                type="button"
                disabled={blockCreator.isPending}
                onClick={() => {
                  blockCreator.mutate();
                }}
              >
                Заблокировать
              </button>
            </div>
            {blockCreator.error ? <InlineError error={blockCreator.error} /> : null}
          </div>
        ) : null}
        {expanded ? (
          <section className="review-panel" aria-label="Отзывы">
            <h3>Отзывы</h3>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                review.mutate({
                  rating: Number(data.get('rating')),
                  text: getFormString(data, 'reviewText'),
                });
              }}
            >
              <label>
                <span>Ваша оценка</span>
                <select name="rating" defaultValue={character.myRating ?? 5}>
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option value={rating} key={rating}>
                      {rating} из 5
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                name="reviewText"
                maxLength={1000}
                defaultValue={character.myReviewText ?? ''}
                placeholder="Отзыв необязателен"
              />
              <button className="compact-button" type="submit" disabled={review.isPending}>
                {character.myRating === null ? 'Оценить' : 'Обновить отзыв'}
              </button>
              {character.myRating !== null ? (
                <button
                  className="text-button danger-link"
                  type="button"
                  disabled={removeReview.isPending}
                  onClick={() => {
                    removeReview.mutate();
                  }}
                >
                  Удалить мой отзыв
                </button>
              ) : null}
            </form>
            {(review.error ?? removeReview.error) ? (
              <InlineError error={review.error ?? removeReview.error} />
            ) : null}
            {reviews.data?.items.map((item) => (
              <article className="review-row" key={item.userId}>
                <strong>{item.displayName}</strong>
                <span>{'★'.repeat(item.rating)}</span>
                {item.reviewText ? <p>{item.reviewText}</p> : null}
              </article>
            ))}
            {reviews.data?.items.length === 0 ? <p className="meta">Отзывов пока нет.</p> : null}
          </section>
        ) : null}
        <button
          className="compact-primary story-start"
          type="button"
          disabled={start.isPending}
          onClick={() => {
            start.mutate();
          }}
        >
          {start.isPending ? 'Открываем…' : 'Начать историю'}
        </button>
        {start.error ? <InlineError error={start.error} /> : null}
      </div>
    </article>
  );
}

function ProfileView({
  userId,
  currentUserId,
  notify,
  onBack,
}: {
  readonly userId: string;
  readonly currentUserId: string;
  readonly notify: (message: string | null) => void;
  readonly onBack: () => void;
}) {
  const client = useQueryClient();
  const isOwn = userId === currentUserId;
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const profile = useQuery({
    queryKey: ['profile', userId],
    queryFn: () =>
      apiRequest<UserProfile>(isOwn ? '/api/v1/profiles/me' : `/api/v1/profiles/${userId}`),
  });
  const media = useQuery({
    queryKey: ['media'],
    queryFn: () => apiRequest<ListResponse<MediaFile>>('/api/v1/media'),
    enabled: isOwn && editing,
  });
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest<UserProfile>('/api/v1/profiles/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      setEditing(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['profile', userId] }),
        client.invalidateQueries({ queryKey: ['discovery'] }),
      ]);
      notify(ru.profile.saved);
    },
  });
  const block = useMutation({
    mutationFn: () => apiRequest(`/api/v1/blocks/${userId}`, { method: 'PUT' }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['blocks'] }),
        client.invalidateQueries({ queryKey: ['discovery'] }),
      ]);
      notify(ru.profile.blocked);
      onBack();
    },
  });
  if (profile.isPending) return <EmptyState title={ru.profile.loading} />;
  if (profile.isError)
    return <ErrorState error={profile.error} retry={() => void profile.refetch()} />;
  if (editing && profile.data.isOwn) {
    return (
      <form
        className="editor-card profile-editor"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const avatarFileId = getFormString(data, 'avatarFileId');
          save.mutate({
            displayName: getFormString(data, 'displayName'),
            bio: getFormString(data, 'bio'),
            avatarFileId: avatarFileId || null,
            visibility: getFormString(data, 'visibility'),
          });
        }}
      >
        <ViewHeader
          eyebrow="ПРОФИЛЬ"
          title="Редактировать профиль"
          description={ru.profile.editDescription}
        />
        <Field
          label="Отображаемое имя"
          name="displayName"
          defaultValue={profile.data.displayName}
          required
          maxLength={80}
        />
        <TextArea label="О себе" name="bio" defaultValue={profile.data.bio} maxLength={1000} />
        <label className="field">
          <span>Аватар из личной медиатеки</span>
          <select name="avatarFileId" defaultValue={profile.data.avatarFileId ?? ''}>
            <option value="">Без аватара</option>
            {media.data?.items
              .filter(
                (item) => item.mimeType.startsWith('image/') && item.moderationState !== 'REJECTED',
              )
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.originalName ?? `Изображение ${item.id.slice(0, 8)}`} ·{' '}
                  {item.moderationState}
                </option>
              ))}
          </select>
        </label>
        <Select
          label="Видимость"
          name="visibility"
          defaultValue={profile.data.visibility}
          options={[
            ['PUBLIC', 'Публичный профиль'],
            ['PRIVATE', 'Только мне'],
          ]}
        />
        <p className="meta">{ru.profile.avatarPendingOwn}</p>
        {save.error ? <InlineError error={save.error} /> : null}
        <div className="dialog-actions">
          <button
            type="button"
            onClick={() => {
              setEditing(false);
            }}
          >
            Отмена
          </button>
          <button className="primary" type="submit" disabled={save.isPending}>
            Сохранить профиль
          </button>
        </div>
      </form>
    );
  }
  return (
    <div className="view-stack">
      <button className="text-button profile-back" type="button" onClick={onBack}>
        ← В каталог
      </button>
      <article className="editor-card public-profile">
        <div className="profile-identity">
          <Avatar name={profile.data.displayName} fileId={profile.data.avatarFileId} />
          <div>
            <p className="eyebrow">{profile.data.isOwn ? 'МОЙ ПРОФИЛЬ' : 'АВТОР'}</p>
            <h1>{profile.data.displayName}</h1>
            <span className="status-pill">
              {profile.data.visibility === 'PUBLIC' ? 'Публичный' : 'Приватный'}
            </span>
          </div>
        </div>
        <p className="profile-bio">{profile.data.bio || ru.profile.emptyBio}</p>
        {profile.data.avatarPending ? <p className="meta">{ru.profile.avatarPending}</p> : null}
        <div className="creator-stats" aria-label="Статистика профиля">
          <span>
            <strong>{profile.data.stats.characters}</strong> персонажей
          </span>
          <span>
            <strong>{profile.data.stats.likes}</strong> отметок нравится
          </span>
          <span>
            <strong>{profile.data.stats.chats}</strong> начатых историй
          </span>
        </div>
        {profile.data.isOwn ? (
          <button
            className="secondary"
            type="button"
            onClick={() => {
              setEditing(true);
            }}
          >
            Редактировать профиль
          </button>
        ) : (
          <div className="profile-actions">
            <button
              className="text-button report-link"
              type="button"
              onClick={() => {
                setReporting((value) => !value);
              }}
            >
              ⚑ Пожаловаться
            </button>
            <button
              className="text-button danger-link"
              type="button"
              onClick={() => {
                setConfirmingBlock(true);
              }}
            >
              Заблокировать
            </button>
          </div>
        )}
        {reporting ? (
          <ReportForm
            targetId={profile.data.userId}
            targetType="USER_PROFILE"
            onDone={() => {
              setReporting(false);
              notify(ru.profile.reportSent);
            }}
          />
        ) : null}
        {confirmingBlock ? (
          <div
            className="inline-confirm"
            role="alertdialog"
            aria-label="Подтверждение блокировки профиля"
          >
            <p>{ru.profile.blockWarning}</p>
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setConfirmingBlock(false);
                }}
              >
                Отмена
              </button>
              <button
                className="danger"
                type="button"
                disabled={block.isPending}
                onClick={() => {
                  block.mutate();
                }}
              >
                Заблокировать
              </button>
            </div>
          </div>
        ) : null}
      </article>
      <section className="profile-characters" aria-labelledby="profile-characters-title">
        <h2 id="profile-characters-title">Опубликованные персонажи</h2>
        {profile.data.characters.length === 0 ? (
          <p className="meta">Публичных персонажей пока нет.</p>
        ) : null}
        <div className="list-stack">
          {profile.data.characters.map((character) => (
            <article className="profile-character" key={character.id}>
              <Avatar name={character.name} fileId={character.avatarFileId} />
              <div>
                <strong>{character.name}</strong>
                <small>{character.tagline}</small>
              </div>
              <span className="status-pill">{character.contentRating}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReportForm({
  targetId,
  targetType = 'CHARACTER',
  onDone,
}: {
  readonly targetId: string;
  readonly targetType?: 'CHARACTER' | 'USER_PROFILE';
  readonly onDone: () => void;
}) {
  const [reason, setReason] = useState('ABUSE_HARASSMENT');
  const [description, setDescription] = useState('');
  const report = useMutation({
    mutationFn: () =>
      apiRequest('/api/v1/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, reason, description }),
      }),
    onSuccess: onDone,
  });
  return (
    <form
      className="report-form"
      onSubmit={(event) => {
        event.preventDefault();
        report.mutate();
      }}
    >
      <label className="field">
        <span>Причина</span>
        <select
          aria-label="Причина жалобы"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        >
          <option value="UNDERAGE">Несовершеннолетний возраст</option>
          <option value="SEXUAL_CONTENT_INVOLVING_MINORS">Сексуализация несовершеннолетних</option>
          <option value="ABUSE_HARASSMENT">Оскорбления или преследование</option>
          <option value="NON_CONSENSUAL_EXPLOITATIVE_MATERIAL">Эксплуатация без согласия</option>
          <option value="ILLEGAL_CONTENT">Незаконный контент</option>
          <option value="IMPERSONATION">Выдаёт себя за другого</option>
          <option value="HATE">Разжигание ненависти</option>
          <option value="SELF_HARM_CONCERN">Риск самоповреждения</option>
          <option value="SPAM">Спам</option>
          <option value="COPYRIGHT">Нарушение авторских прав</option>
          <option value="OTHER">Другое</option>
        </select>
      </label>
      <label className="field">
        <span>Описание</span>
        <textarea
          aria-label="Описание жалобы"
          maxLength={2000}
          rows={3}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
      </label>
      <div className="form-actions">
        <button className="compact-primary" type="submit" disabled={report.isPending}>
          {report.isPending ? 'Отправляем…' : 'Отправить жалобу'}
        </button>
        <button className="compact-button" type="button" onClick={onDone}>
          Отмена
        </button>
      </div>
      {report.error ? <InlineError error={report.error} /> : null}
    </form>
  );
}

function ModerationView({
  notify,
  role,
}: {
  readonly notify: (message: string | null) => void;
  readonly role: MeResponse['role'];
}) {
  const client = useQueryClient();
  const [section, setSection] = useState<'queue' | 'operations' | 'support'>('queue');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState('OPEN');
  const [action, setAction] = useState('WARNING');
  const [reason, setReason] = useState('');
  const cases = useQuery({
    queryKey: ['moderation-cases', stateFilter],
    queryFn: () =>
      apiRequest<ListResponse<ModerationCaseSummary>>(
        `/api/v1/admin/moderation/cases?state=${encodeURIComponent(stateFilter)}`,
      ),
    enabled: section === 'queue',
  });
  const detail = useQuery({
    queryKey: ['moderation-case', selectedId],
    enabled: selectedId !== null,
    queryFn: () =>
      apiRequest<ModerationCaseDetail>(`/api/v1/admin/moderation/cases/${selectedId ?? ''}`),
  });
  const isMatureReview = detail.data?.reportId === null && detail.data.targetType === 'CHARACTER';
  const assign = useMutation({
    mutationFn: (caseId: string) =>
      apiRequest(`/api/v1/admin/moderation/cases/${caseId}/assign`, { method: 'POST' }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['moderation-cases'] }),
        client.invalidateQueries({ queryKey: ['moderation-case', selectedId] }),
      ]);
      notify('Дело назначено вам.');
    },
  });
  const decide = useMutation({
    mutationFn: (caseId: string) =>
      apiRequest(`/api/v1/admin/moderation/cases/${caseId}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      }),
    onSuccess: async () => {
      setSelectedId(null);
      setReason('');
      await client.invalidateQueries({ queryKey: ['moderation-cases'] });
      notify('Решение записано в журнал действий.');
    },
  });
  if (section === 'operations') {
    return (
      <OperationsView
        role={role}
        onBack={() => {
          setSection('queue');
        }}
        notify={notify}
      />
    );
  }
  if (section === 'support') {
    return (
      <SupportQueueView
        onBack={() => {
          setSection('queue');
        }}
        notify={notify}
      />
    );
  }
  if (selectedId) {
    return (
      <div className="view-stack">
        <div className="editor-heading">
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
            }}
          >
            ← К очереди
          </button>
          <h1>Дело модерации</h1>
        </div>
        {detail.isPending ? <EmptyState title="Загружаем материалы…" /> : null}
        {detail.isError ? (
          <ErrorState error={detail.error} retry={() => void detail.refetch()} />
        ) : null}
        {detail.data ? (
          <article className="moderation-detail">
            <div className="section-heading">
              <div>
                <span className="status-pill">{detail.data.state}</span>
                <h2>{isMatureReview ? ru.character.matureReviewTitle : detail.data.targetType}</h2>
              </div>
              <strong>Приоритет {detail.data.priority}</strong>
            </div>
            <div className="evidence-panel">
              <strong>Материалы</strong>
              <pre>{JSON.stringify(detail.data.evidence, null, 2)}</pre>
            </div>
            <button
              className="compact-button"
              type="button"
              disabled={assign.isPending || detail.data.assignedTo !== null}
              onClick={() => {
                assign.mutate(detail.data.id);
              }}
            >
              {detail.data.assignedTo ? 'Дело назначено' : 'Взять в работу'}
            </button>
            <form
              className="decision-form"
              onSubmit={(event) => {
                event.preventDefault();
                decide.mutate(detail.data.id);
              }}
            >
              <label className="field">
                <span>Действие</span>
                <select
                  value={action}
                  onChange={(event) => {
                    setAction(event.target.value);
                  }}
                >
                  <option value="NO_ACTION">
                    {isMatureReview ? ru.character.matureReviewApproveAction : 'Нарушения нет'}
                  </option>
                  {!isMatureReview ? <option value="WARNING">Предупреждение</option> : null}
                  <option value="CONTENT_HIDE">Скрыть контент</option>
                  <option value="CONTENT_REMOVE">Удалить контент</option>
                  {!isMatureReview ? (
                    <>
                      <option value="TEMP_RESTRICTION">Ограничить аккаунт</option>
                      <option value="ACCOUNT_SUSPEND">Приостановить аккаунт</option>
                      <option value="ACCOUNT_BAN">Заблокировать аккаунт</option>
                    </>
                  ) : null}
                  <option value="ESCALATE">Эскалировать</option>
                </select>
              </label>
              <label className="field">
                <span>Обоснование</span>
                <textarea
                  minLength={5}
                  maxLength={2000}
                  required
                  rows={4}
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                  }}
                />
              </label>
              <button className="compact-primary" type="submit" disabled={decide.isPending}>
                Применить решение
              </button>
              <InlineError error={assign.error ?? decide.error} />
            </form>
          </article>
        ) : null}
      </div>
    );
  }
  return (
    <div className="view-stack">
      <ViewHeader
        eyebrow="БЕЗОПАСНОСТЬ"
        title="Очередь модерации"
        description="Только необходимые материалы, решения по ролям и неизменяемый журнал действий."
        action={
          <div className="header-actions">
            {role === 'ADMIN' || role === 'OWNER' ? (
              <>
                <button
                  className="compact-button"
                  type="button"
                  onClick={() => {
                    setSection('support');
                  }}
                >
                  Поддержка
                </button>
                <button
                  className="compact-button"
                  type="button"
                  onClick={() => {
                    setSection('operations');
                  }}
                >
                  Система
                </button>
              </>
            ) : null}
            <label className="compact-filter">
              <span>Очередь</span>
              <select
                aria-label="Состояние очереди"
                value={stateFilter}
                onChange={(event) => {
                  setStateFilter(event.target.value);
                }}
              >
                <option value="OPEN">Новые</option>
                <option value="TRIAGED">Приоритетные</option>
                <option value="IN_REVIEW">В работе</option>
                <option value="APPEALED">Обжалованы</option>
                <option value="RESOLVED">Решены</option>
                <option value="CLOSED">Закрыты</option>
              </select>
            </label>
          </div>
        }
      />
      {cases.isPending ? <EmptyState title="Проверяем очередь…" /> : null}
      {cases.isError ? <ErrorState error={cases.error} retry={() => void cases.refetch()} /> : null}
      {cases.data?.items.length === 0 ? (
        <EmptyState title="Очередь пуста" text="Новых жалоб в этой категории нет." />
      ) : null}
      <div className="list-stack">
        {cases.data?.items.map((moderationCase) => (
          <button
            className="moderation-case-card"
            type="button"
            key={moderationCase.id}
            onClick={() => {
              setAction(
                moderationCase.reportId === null && moderationCase.targetType === 'CHARACTER'
                  ? 'NO_ACTION'
                  : 'WARNING',
              );
              setSelectedId(moderationCase.id);
            }}
          >
            <span>
              <strong>{moderationCase.reason ?? moderationCase.targetType}</strong>
              <small>
                {moderationCase.description && moderationCase.description.length > 0
                  ? moderationCase.description
                  : moderationCase.targetType}
              </small>
            </span>
            <b>{moderationCase.priority}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

function SupportQueueView({
  onBack,
  notify,
}: {
  readonly onBack: () => void;
  readonly notify: (message: string | null) => void;
}) {
  const client = useQueryClient();
  const [state, setState] = useState<SupportState>('OPEN');
  const [notes, setNotes] = useState<Readonly<Record<string, string>>>({});
  const requests = useQuery({
    queryKey: ['admin-support', state],
    queryFn: () =>
      apiRequest<ListResponse<SupportRequest>>(
        `/api/v1/admin/support/requests?state=${encodeURIComponent(state)}`,
      ),
  });
  const update = useMutation({
    mutationFn: (input: { readonly id: string; readonly state: SupportState }) =>
      apiRequest<SupportRequest>(`/api/v1/admin/support/requests/${input.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: input.state, resolutionNote: notes[input.id] ?? '' }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin-support'] });
      notify(ru.support.updated);
    },
  });
  return (
    <div className="view-stack">
      <div className="editor-heading">
        <button type="button" onClick={onBack}>
          ← К модерации
        </button>
        <h1>{ru.support.queueTitle}</h1>
      </div>
      <label className="field">
        <span>Статус</span>
        <select
          value={state}
          onChange={(event) => {
            setState(event.target.value as SupportState);
          }}
        >
          <option value="OPEN">Новые</option>
          <option value="IN_REVIEW">В работе</option>
          <option value="RESOLVED">Решены</option>
          <option value="CLOSED">Закрыты</option>
        </select>
      </label>
      {requests.isPending ? <EmptyState title="Загружаем обращения…" /> : null}
      {requests.error ? <InlineError error={requests.error} /> : null}
      {requests.data?.items.length === 0 ? <EmptyState title="Обращений нет" /> : null}
      <div className="list-stack">
        {requests.data?.items.map((item) => (
          <article className="editor-card support-card" key={item.id}>
            <span className="status-pill">{supportStateLabel(item.state)}</span>
            <h2>{item.subject}</h2>
            <p className="meta">{supportCategoryLabel(item.category)}</p>
            <p>{item.message}</p>
            <label className="field">
              <span>Ответ или заметка</span>
              <textarea
                maxLength={4000}
                rows={3}
                value={notes[item.id] ?? item.resolutionNote}
                onChange={(event) => {
                  setNotes((current) => ({ ...current, [item.id]: event.target.value }));
                }}
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                disabled={update.isPending}
                onClick={() => {
                  update.mutate({ id: item.id, state: 'IN_REVIEW' });
                }}
              >
                В работу
              </button>
              <button
                className="primary"
                type="button"
                disabled={update.isPending}
                onClick={() => {
                  update.mutate({ id: item.id, state: 'RESOLVED' });
                }}
              >
                Решено
              </button>
            </div>
          </article>
        ))}
      </div>
      {update.error ? <InlineError error={update.error} /> : null}
    </div>
  );
}

function supportCategoryLabel(category: SupportCategory): string {
  return {
    GENERAL: 'Общий вопрос',
    TECHNICAL: 'Техническая проблема',
    PAYMENT: 'Оплата и Stars',
    SAFETY: 'Безопасность',
    DATA: 'Персональные данные',
  }[category];
}

function supportStateLabel(state: SupportState): string {
  return {
    OPEN: 'Новое',
    IN_REVIEW: 'В работе',
    RESOLVED: 'Решено',
    CLOSED: 'Закрыто',
  }[state];
}

function OperationsView({
  role,
  onBack,
  notify,
}: {
  readonly role: MeResponse['role'];
  readonly onBack: () => void;
  readonly notify: (message: string | null) => void;
}) {
  const client = useQueryClient();
  const dashboard = useQuery({
    queryKey: ['operations-dashboard'],
    queryFn: () => apiRequest<OperationsDashboard>('/api/v1/admin/operations/dashboard'),
  });
  const flags = useQuery({
    queryKey: ['admin-feature-flags'],
    queryFn: () => apiRequest<ListResponse<AdminFeatureFlag>>('/api/v1/admin/feature-flags'),
    enabled: role === 'OWNER',
  });
  const updateFlag = useMutation({
    mutationFn: (input: {
      readonly key: AdminFeatureFlag['key'];
      readonly enabled: boolean;
      readonly rolloutPercent: number;
    }) =>
      apiRequest(`/api/v1/admin/feature-flags/${input.key}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: input.enabled,
          rolloutPercent: input.rolloutPercent,
        }),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-feature-flags'] }),
        client.invalidateQueries({ queryKey: ['feature-flags'] }),
      ]);
      notify('Feature flag обновлён и применяется без повторного деплоя.');
    },
  });
  return (
    <div className="view-stack">
      <div className="editor-heading">
        <button type="button" onClick={onBack}>
          ← К модерации
        </button>
        <h1>Состояние системы</h1>
      </div>
      <p className="section-description">
        Агрегированные показатели без текстов личных диалогов и без идентификаторов читателей.
      </p>
      {dashboard.isPending ? <EmptyState title="Собираем показатели…" /> : null}
      {dashboard.isError ? (
        <ErrorState error={dashboard.error} retry={() => void dashboard.refetch()} />
      ) : null}
      {dashboard.data ? (
        <section className="operations-grid" aria-label="Системные показатели">
          <Metric label="Пользователи" value={dashboard.data.users} />
          <Metric label="Активны за 24 часа" value={dashboard.data.activeUsers24h} />
          <Metric label="Сообщения за 24 часа" value={dashboard.data.messages24h} />
          <Metric label="AI-запросы за 24 часа" value={dashboard.data.aiRequests24h} />
          <Metric label="Ошибки генерации" value={dashboard.data.failedGenerations24h} />
          <Metric
            label="Расчётная AI-стоимость"
            value={`$${formatCredits(dashboard.data.aiCostMicros24h)}`}
          />
          <Metric label="Ошибки оплаты" value={dashboard.data.paymentFailures24h} />
          <Metric label="Очередь модерации" value={dashboard.data.moderationBacklog} />
          <Metric label="Фоновые задания" value={dashboard.data.jobBacklog} />
          <Metric label="События продукта" value={dashboard.data.productEvents24h} />
          {Object.entries(dashboard.data.planDistribution)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([planCode, users]) => (
              <Metric key={planCode} label={`Тариф ${planCode}`} value={users} />
            ))}
        </section>
      ) : null}
      {role === 'OWNER' ? <StaffManagement notify={notify} /> : null}
      {role === 'OWNER' ? <OwnerBillingConfiguration notify={notify} /> : null}
      {role === 'OWNER' ? <AiSmokePanel notify={notify} /> : null}
      {role === 'OWNER' ? (
        <section className="feature-flags-panel">
          <div className="section-heading">
            <div>
              <span className="status-pill">OWNER</span>
              <h2>Feature flags</h2>
            </div>
          </div>
          <p className="section-description">
            Процент назначается стабильно по внутреннему ID пользователя. Изменения записываются в
            audit log.
          </p>
          {flags.data?.items.map((flag) => (
            <form
              className="feature-flag-row"
              key={flag.key}
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                updateFlag.mutate({
                  key: flag.key,
                  enabled: data.get('enabled') === 'on',
                  rolloutPercent: Number(data.get('rolloutPercent')),
                });
              }}
            >
              <label>
                <input name="enabled" type="checkbox" defaultChecked={flag.enabled} />
                <span>{flag.key}</span>
              </label>
              <label>
                <span>Охват, %</span>
                <input
                  name="rolloutPercent"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={flag.rolloutPercent}
                />
              </label>
              <button className="compact-button" type="submit" disabled={updateFlag.isPending}>
                Сохранить
              </button>
            </form>
          ))}
          <InlineError error={flags.error ?? updateFlag.error} />
        </section>
      ) : null}
    </div>
  );
}

function OwnerBillingConfiguration({
  notify,
}: {
  readonly notify: (message: string | null) => void;
}) {
  const client = useQueryClient();
  const formString = getFormString;
  const plans = useQuery({
    queryKey: ['admin-billing-plans'],
    queryFn: () => apiRequest<ListResponse<PlanDefinition>>('/api/v1/admin/billing/plans'),
  });
  const packs = useQuery({
    queryKey: ['admin-billing-access-packs'],
    queryFn: () => apiRequest<ListResponse<AccessPack>>('/api/v1/admin/billing/access-packs'),
  });
  const savePlan = useMutation({
    mutationFn: (input: { readonly code: string; readonly body: Record<string, unknown> }) =>
      apiRequest(`/api/v1/admin/billing/plans/${input.code}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input.body),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-billing-plans'] }),
        client.invalidateQueries({ queryKey: ['billing'] }),
        client.invalidateQueries({ queryKey: ['me'] }),
      ]);
      notify('Настройки тарифа сохранены в audit log.');
    },
  });
  const savePack = useMutation({
    mutationFn: (input: {
      readonly code: string;
      readonly create: boolean;
      readonly body: Record<string, unknown>;
    }) =>
      apiRequest(
        input.create
          ? '/api/v1/admin/billing/access-packs'
          : `/api/v1/admin/billing/access-packs/${input.code}`,
        {
          method: input.create ? 'POST' : 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input.create ? { code: input.code, ...input.body } : input.body),
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-billing-access-packs'] }),
        client.invalidateQueries({ queryKey: ['billing', 'access-packs'] }),
      ]);
      notify('Разовый пакет доступа сохранён. Автопродление не создаётся.');
    },
  });
  const packBody = (data: FormData) => ({
    displayName: formString(data, 'displayName'),
    description: formString(data, 'description'),
    starsAmount: Number(formString(data, 'starsAmount')),
    planCode: formString(data, 'planCode'),
    durationDays: Number(formString(data, 'durationDays')),
    active: data.get('active') === 'on',
    sortOrder: Number(formString(data, 'sortOrder')),
  });
  return (
    <section className="feature-flags-panel" aria-labelledby="billing-configuration-title">
      <div className="section-heading">
        <div>
          <span className="status-pill">OWNER · XTR</span>
          <h2 id="billing-configuration-title">Тарифы и разовый доступ</h2>
        </div>
      </div>
      <p className="section-description">
        Только разовая оплата Telegram Stars. Банковские карты, подписка, автопродление и
        автопополнение не создаются.
      </p>
      {plans.isPending || packs.isPending ? <p>Загружаем конфигурацию…</p> : null}
      {plans.error || packs.error ? <InlineError error={plans.error ?? packs.error} /> : null}
      <div className="view-stack">
        {plans.data?.items.map((plan) => (
          <form
            className="editor-card"
            key={plan.code}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              savePlan.mutate({
                code: plan.code,
                body: {
                  displayName: formString(data, 'displayName'),
                  active: data.get('active') === 'on',
                  rank: Number(formString(data, 'rank')),
                  entitlements: {
                    rateLimitMultiplier: Number(formString(data, 'rateLimitMultiplier')),
                    characterLimit: Number(formString(data, 'characterLimit')),
                    personaLimit: Number(formString(data, 'personaLimit')),
                    memoryTokenBudget: Number(formString(data, 'memoryTokenBudget')),
                    loreTokenBudget: Number(formString(data, 'loreTokenBudget')),
                    advancedOperationsDaily: Number(formString(data, 'advancedOperationsDaily')),
                    modelProfiles: data.getAll('modelProfiles').map(String),
                  },
                },
              });
            }}
          >
            <h3>{plan.code}</h3>
            <Field label="Название" name="displayName" defaultValue={plan.displayName} required />
            <div className="field-row">
              <Field label="Ранг" name="rank" type="number" defaultValue={String(plan.rank)} />
              <Field
                label="Множитель лимитов"
                name="rateLimitMultiplier"
                type="number"
                defaultValue={String(plan.entitlements.rateLimitMultiplier)}
              />
            </div>
            <div className="field-row">
              <Field
                label="Персонажи"
                name="characterLimit"
                type="number"
                defaultValue={String(plan.entitlements.characterLimit)}
              />
              <Field
                label="Образы"
                name="personaLimit"
                type="number"
                defaultValue={String(plan.entitlements.personaLimit)}
              />
            </div>
            <div className="field-row">
              <Field
                label="Память, токены"
                name="memoryTokenBudget"
                type="number"
                defaultValue={String(plan.entitlements.memoryTokenBudget)}
              />
              <Field
                label="Лор, токены"
                name="loreTokenBudget"
                type="number"
                defaultValue={String(plan.entitlements.loreTokenBudget)}
              />
            </div>
            <Field
              label="Продвинутые операции в день"
              name="advancedOperationsDaily"
              type="number"
              defaultValue={String(plan.entitlements.advancedOperationsDaily)}
            />
            <div className="terms-check">
              {(['BALANCED', 'CREATIVE', 'PREMIUM'] as const).map((profile) => (
                <label key={profile}>
                  <input
                    type="checkbox"
                    name="modelProfiles"
                    value={profile}
                    defaultChecked={plan.entitlements.modelProfiles.includes(profile)}
                  />{' '}
                  {profile}
                </label>
              ))}
              <label>
                <input type="checkbox" name="active" defaultChecked={plan.active} /> Активен
              </label>
            </div>
            <button className="compact-primary" type="submit" disabled={savePlan.isPending}>
              Сохранить тариф
            </button>
          </form>
        ))}
      </div>
      <h3>Пакеты доступа</h3>
      {[...(packs.data?.items ?? []), null].map((pack, index) => (
        <form
          className="editor-card"
          key={pack?.code ?? 'new-access-pack'}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const code = pack?.code ?? formString(data, 'code');
            savePack.mutate({ code, create: pack === null, body: packBody(data) });
          }}
        >
          <h4>{pack ? pack.code : 'Новый пакет'}</h4>
          {!pack ? <Field label="Код" name="code" required /> : null}
          <Field label="Название" name="displayName" defaultValue={pack?.displayName} required />
          <Field label="Описание" name="description" defaultValue={pack?.description} required />
          <div className="field-row">
            <Field
              label="Stars"
              name="starsAmount"
              type="number"
              defaultValue={String(pack?.starsAmount ?? 1)}
            />
            <Field
              label="Дней"
              name="durationDays"
              type="number"
              defaultValue={String(pack?.durationDays ?? 30)}
            />
          </div>
          <Select
            label="Тариф"
            name="planCode"
            defaultValue={pack?.planCode ?? 'PLUS'}
            options={(plans.data?.items ?? [])
              .filter((plan) => plan.code !== 'FREE')
              .map((plan) => [plan.code, plan.displayName] as const)}
          />
          <Field
            label="Порядок"
            name="sortOrder"
            type="number"
            defaultValue={String(pack?.sortOrder ?? index)}
          />
          <label className="terms-check">
            <input type="checkbox" name="active" defaultChecked={pack?.active ?? false} /> Активен
          </label>
          <button className="compact-primary" type="submit" disabled={savePack.isPending}>
            {pack ? 'Сохранить пакет' : 'Создать пакет'}
          </button>
        </form>
      ))}
      <InlineError error={savePlan.error ?? savePack.error} />
    </section>
  );
}

function AiSmokePanel({ notify }: { readonly notify: (message: string | null) => void }) {
  const client = useQueryClient();
  const [consented, setConsented] = useState(false);
  interface AiSmokeState {
    readonly run: AiSmokeRun | null;
    readonly history: readonly AiSmokeRun[];
    readonly capabilities: BotHubModelCapabilities | null;
  }
  const smoke = useQuery({
    queryKey: ['admin-ai-smoke'],
    queryFn: () => apiRequest<AiSmokeState>('/api/v1/admin/operations/ai-smoke'),
  });
  const run = useMutation({
    mutationFn: () =>
      apiRequest<{ readonly run: AiSmokeRun }>('/api/v1/admin/operations/ai-smoke', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: ru.aiSmoke.confirmation }),
      }),
    onSuccess: (result) => {
      client.setQueryData<AiSmokeState>(['admin-ai-smoke'], (previous) => ({
        run: result.run,
        history: [
          result.run,
          ...(previous?.history.filter((item) => item.runKey !== result.run.runKey) ?? []),
        ],
        capabilities: previous?.capabilities ?? null,
      }));
      setConsented(false);
      notify(
        result.run.alreadyAttempted
          ? 'Контрольный запрос уже был выполнен ранее; повторного списания не произошло.'
          : 'Единственный контрольный запрос завершён и записан в аудит.',
      );
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['admin-ai-smoke'] }),
  });
  const result = run.data?.run ?? smoke.data?.run ?? null;
  const capabilities = smoke.data?.capabilities ?? null;
  const v3ModelAvailable =
    capabilities?.availableCandidates.includes('deepseek-chat-v3.1') ?? false;
  const previousRuns = (smoke.data?.history ?? []).filter((item) => item.runKey !== result?.runKey);
  return (
    <section className="feature-flags-panel ai-smoke-panel" aria-labelledby="ai-smoke-title">
      <div className="section-heading">
        <div>
          <span className="status-pill">OWNER · BOTHUB</span>
          <h2 id="ai-smoke-title">{ru.aiSmoke.title}</h2>
        </div>
      </div>
      <p className="section-description">{ru.aiSmoke.description}</p>
      <p className="section-description">
        Доступные проверенные модели:{' '}
        {capabilities && capabilities.availableCandidates.length > 0
          ? capabilities.availableCandidates.join(', ')
          : 'проверка ещё не завершена'}
      </p>
      {!v3ModelAvailable && !result ? (
        <p className="memory-warning" role="status">
          V3 заблокирован до подтверждения доступности deepseek-chat-v3.1. Платный запрос не будет
          отправлен.
        </p>
      ) : null}
      {smoke.isPending ? <p className="section-description">Проверяем состояние…</p> : null}
      {!smoke.isPending && !result ? (
        <>
          <p>{ru.aiSmoke.neverRun}</p>
          <label className="ai-smoke-consent">
            <input
              type="checkbox"
              checked={consented}
              disabled={!v3ModelAvailable}
              onChange={(event) => {
                setConsented(event.currentTarget.checked);
              }}
            />
            <span>{ru.aiSmoke.consent}</span>
          </label>
          <button
            type="button"
            disabled={!v3ModelAvailable || !consented || run.isPending}
            onClick={() => {
              run.mutate();
            }}
          >
            {run.isPending ? 'Выполняется один запрос…' : ru.aiSmoke.run}
          </button>
        </>
      ) : null}
      {result ? (
        <div className="ai-smoke-result" aria-live="polite">
          <strong>{result.state}</strong>
          <span>
            {result.model} · {result.inputTokens} входных / {result.outputTokens} выходных токенов
          </span>
          <span>
            Протокол: {result.protocolVariant} · HTTP {result.httpStatus ?? 'нет ответа'}
          </span>
          <span>
            Provider: ${(result.providerReportedCostMicros / 1_000_000).toFixed(6)} · резерв: $
            {(result.conservativeCostMicros / 1_000_000).toFixed(6)}
          </span>
          {result.output ? <blockquote>{result.output}</blockquote> : null}
          {result.errorCode ? <span>Код ошибки: {result.errorCode}</span> : null}
        </div>
      ) : null}
      {previousRuns.length > 0 ? (
        <details>
          <summary>Предыдущие контрольные попытки</summary>
          {previousRuns.map((item) => (
            <div className="ai-smoke-result" key={item.runKey}>
              <strong>
                {item.runKey} · {item.state}
              </strong>
              <span>
                {item.errorCode ?? 'без ошибки'} · HTTP {item.httpStatus ?? 'не был сохранён'} ·{' '}
                {item.latencyMs ?? 0} мс
              </span>
            </div>
          ))}
        </details>
      ) : null}
      <InlineError error={smoke.error ?? run.error} />
    </section>
  );
}

function StaffManagement({ notify }: { readonly notify: (message: string | null) => void }) {
  const client = useQueryClient();
  const [telegramId, setTelegramId] = useState('');
  const [role, setRole] = useState<'MODERATOR' | 'SENIOR_MODERATOR'>('MODERATOR');
  const staff = useQuery({
    queryKey: ['admin-staff'],
    queryFn: () => apiRequest<ListResponse<StaffAssignment>>('/api/v1/admin/staff'),
  });
  const assign = useMutation({
    mutationFn: () =>
      apiRequest('/api/v1/admin/staff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ telegramId, role }),
      }),
    onSuccess: async () => {
      setTelegramId('');
      await client.invalidateQueries({ queryKey: ['admin-staff'] });
      notify('Модератор назначен. Действие записано в журнал аудита.');
    },
  });
  const revoke = useMutation({
    mutationFn: (targetTelegramId: string) =>
      apiRequest(`/api/v1/admin/staff/${encodeURIComponent(targetTelegramId)}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin-staff'] });
      notify('Полномочия модератора отозваны.');
    },
  });
  return (
    <section className="feature-flags-panel" aria-labelledby="staff-title">
      <div className="section-heading">
        <div>
          <span className="status-pill">OWNER</span>
          <h2 id="staff-title">Команда модерации</h2>
        </div>
      </div>
      <p className="section-description">
        Назначение доступно только владельцу. Пользователь должен один раз открыть Velora, а
        модераторы не видят и не могут изменять других сотрудников.
      </p>
      <form
        className="decision-form"
        onSubmit={(event) => {
          event.preventDefault();
          assign.mutate();
        }}
      >
        <label className="field">
          <span>Telegram ID</span>
          <input
            inputMode="numeric"
            pattern="[0-9]{5,20}"
            required
            value={telegramId}
            onChange={(event) => {
              setTelegramId(event.target.value.replace(/\D/gu, ''));
            }}
          />
        </label>
        <label className="field">
          <span>Роль</span>
          <select
            value={role}
            onChange={(event) => {
              setRole(event.target.value as 'MODERATOR' | 'SENIOR_MODERATOR');
            }}
          >
            <option value="MODERATOR">Модератор</option>
            <option value="SENIOR_MODERATOR">Старший модератор</option>
          </select>
        </label>
        <button className="compact-primary" type="submit" disabled={assign.isPending}>
          Назначить
        </button>
        <InlineError error={assign.error} />
      </form>
      {staff.isPending ? <EmptyState title="Загружаем команду…" /> : null}
      {staff.isError ? <ErrorState error={staff.error} retry={() => void staff.refetch()} /> : null}
      <div className="list-stack">
        {staff.data?.items.map((member) => (
          <article className="moderation-case-card" key={member.id}>
            <span>
              <strong>{member.displayName}</strong>
              <small>
                {member.telegramId} {member.username ? `@${member.username}` : ''} ·{' '}
                {member.role === 'SENIOR_MODERATOR' ? 'старший модератор' : 'модератор'}
              </small>
            </span>
            <button
              className="compact-button"
              type="button"
              disabled={revoke.isPending}
              onClick={() => {
                if (window.confirm(`Снять полномочия у ${member.displayName}?`)) {
                  revoke.mutate(member.telegramId);
                }
              }}
            >
              Снять
            </button>
          </article>
        ))}
      </div>
      <InlineError error={revoke.error} />
    </section>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string | number }) {
  return (
    <article className="metric-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function PersonasView({ notify }: { readonly notify: (message: string | null) => void }) {
  const client = useQueryClient();
  const personas = useQuery({
    queryKey: ['personas'],
    queryFn: () => apiRequest<ListResponse<Persona>>('/api/v1/personas'),
  });
  const [editing, setEditing] = useState<Persona | 'new' | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ readonly deleted: boolean }>(`/api/v1/personas/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['personas'] });
      notify('Образ удалён.');
    },
  });
  const makeDefault = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/v1/personas/${id}/default`, { method: 'POST' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['personas'] });
      notify('Основной образ изменён.');
    },
  });
  if (editing)
    return (
      <PersonaEditor
        persona={editing}
        onClose={() => {
          setEditing(null);
        }}
        notify={notify}
      />
    );
  return (
    <div className="view-stack">
      <ViewHeader
        eyebrow="ТВОЯ РОЛЬ"
        title="Образы"
        description="Выбери, кем ты входишь в историю. Первый образ становится основным автоматически."
        action={
          <button
            className="compact-primary"
            type="button"
            onClick={() => {
              setEditing('new');
            }}
          >
            ＋ Создать
          </button>
        }
      />
      {personas.isError ? (
        <ErrorState error={personas.error} retry={() => void personas.refetch()} />
      ) : null}
      {personas.data?.items.length === 0 ? (
        <EmptyState title="Создай первый образ" text="Он будет использоваться в новых историях." />
      ) : null}
      <div className="list-stack">
        {personas.data?.items.map((persona) => (
          <article className="list-card" key={persona.id}>
            <Avatar name={persona.name} fileId={persona.avatarFileId} />
            <div className="list-copy">
              <h2>{persona.name}</h2>
              <p>{persona.shortDescription || 'Описание ещё не добавлено'}</p>
              <div className="tag-list">
                <span>{persona.visibility === 'PUBLIC' ? 'Публичный' : 'Личный'}</span>
                {persona.isDefault ? <span>Основной</span> : null}
              </div>
            </div>
            <div className="card-actions">
              <button
                type="button"
                onClick={() => {
                  setEditing(persona);
                }}
              >
                Изменить
              </button>
              {!persona.isDefault ? (
                <button
                  type="button"
                  onClick={() => {
                    makeDefault.mutate(persona.id);
                  }}
                >
                  Сделать основным
                </button>
              ) : null}
              <button
                className="danger-link"
                type="button"
                onClick={() => {
                  if (window.confirm(`Удалить образ «${persona.name}»?`)) remove.mutate(persona.id);
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

function PersonaEditor({
  persona,
  onClose,
  notify,
}: {
  readonly persona: Persona | 'new';
  readonly onClose: () => void;
  readonly notify: (message: string | null) => void;
}) {
  const client = useQueryClient();
  const existing = persona === 'new' ? null : persona;
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest<Persona>(existing ? `/api/v1/personas/${existing.id}` : '/api/v1/personas', {
        method: existing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['personas'] });
      notify(existing ? 'Изменения сохранены.' : 'Образ создан.');
      onClose();
    },
  });
  const submit = (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const representedAge = getFormString(data, 'representedAge');
    save.mutate({
      name: getFormString(data, 'name'),
      shortDescription: getFormString(data, 'shortDescription'),
      longDescription: getFormString(data, 'longDescription'),
      personality: getFormString(data, 'personality'),
      appearance: getFormString(data, 'appearance'),
      speakingStyle: getFormString(data, 'speakingStyle'),
      background: getFormString(data, 'background'),
      pronouns: getFormString(data, 'pronouns'),
      representedAge: representedAge.length > 0 ? representedAge : null,
      customNotes: getFormString(data, 'customNotes'),
      visibility: getFormString(data, 'visibility'),
    });
  };
  return (
    <Editor
      title={existing ? 'Редактировать образ' : 'Новый образ'}
      onCancel={onClose}
      onSubmit={submit}
      pending={save.isPending}
      error={save.error}
    >
      <Field label="Имя" name="name" defaultValue={existing?.name} required maxLength={80} />
      <Field
        label="Коротко о себе"
        name="shortDescription"
        defaultValue={existing?.shortDescription}
        maxLength={280}
      />
      <TextArea
        label="Полное описание"
        name="longDescription"
        defaultValue={existing?.longDescription}
      />
      <TextArea label="Характер" name="personality" defaultValue={existing?.personality} />
      <TextArea label="Внешность" name="appearance" defaultValue={existing?.appearance} />
      <TextArea label="Стиль речи" name="speakingStyle" defaultValue={existing?.speakingStyle} />
      <TextArea label="Предыстория" name="background" defaultValue={existing?.background} />
      <Field label="Местоимения" name="pronouns" defaultValue={existing?.pronouns} maxLength={80} />
      <Field
        label="Возраст образа"
        name="representedAge"
        defaultValue={existing?.representedAge ?? ''}
        maxLength={80}
      />
      <TextArea label="Личные заметки" name="customNotes" defaultValue={existing?.customNotes} />
      <Select
        label="Видимость"
        name="visibility"
        defaultValue={existing?.visibility ?? 'PRIVATE'}
        options={[
          ['PRIVATE', 'Только мне'],
          ['PUBLIC', 'Публичный'],
        ]}
      />
    </Editor>
  );
}

function CharactersView({
  notify,
  onStarted,
  onOpenLorebooks,
}: {
  readonly notify: (message: string | null) => void;
  readonly onStarted: (id: string) => void;
  readonly onOpenLorebooks: () => void;
}) {
  const client = useQueryClient();
  const characters = useQuery({
    queryKey: ['characters'],
    queryFn: () => apiRequest<ListResponse<Character>>('/api/v1/characters'),
  });
  const stats = useQuery({
    queryKey: ['creator-stats'],
    queryFn: () => apiRequest<CreatorStats>('/api/v1/discovery/creator-stats/me'),
  });
  const [editing, setEditing] = useState<Character | 'new' | null>(null);
  const preview = useMutation({
    mutationFn: (characterId: string) =>
      apiRequest<{ readonly id: string }>('/api/v1/conversations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          characterId,
          preview: true,
          idempotencyKey: crypto.randomUUID(),
        }),
      }),
    onSuccess: async (conversation) => {
      await client.invalidateQueries({ queryKey: ['conversations'] });
      onStarted(conversation.id);
    },
  });
  const action = useMutation({
    mutationFn: ({
      id,
      command,
    }: {
      readonly id: string;
      readonly command: 'publish' | 'unpublish' | 'duplicate' | 'delete';
    }) => {
      if (command === 'delete') {
        return apiRequest<CharacterActionResult>(`/api/v1/characters/${id}`, {
          method: 'DELETE',
        });
      }
      if (command === 'publish') {
        return apiRequest<CharacterActionResult>(`/api/v1/characters/${id}/publish`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ visibility: 'PUBLIC' }),
        });
      }
      return apiRequest<CharacterActionResult>(`/api/v1/characters/${id}/${command}`, {
        method: 'POST',
      });
    },
    onSuccess: async (result, variables) => {
      await client.invalidateQueries({ queryKey: ['characters'] });
      await client.invalidateQueries({ queryKey: ['discovery'] });
      notify(
        variables.command === 'publish'
          ? result.publishState === 'MODERATION_PENDING'
            ? (result.message ?? ru.character.matureReviewPending)
            : 'Персонаж опубликован.'
          : 'Готово.',
      );
    },
  });
  if (editing)
    return (
      <CharacterEditor
        character={editing}
        onClose={() => {
          setEditing(null);
        }}
        notify={notify}
      />
    );
  return (
    <div className="view-stack">
      <ViewHeader
        eyebrow="ТВОИ МИРЫ"
        title="Персонажи"
        description="Черновики версионируются: конфликтующие изменения не перезапишут твою работу."
        action={
          <div className="header-actions">
            <button className="secondary compact-button" type="button" onClick={onOpenLorebooks}>
              ⌘ Книги мира
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
          </div>
        }
      />
      {characters.isError ? (
        <ErrorState error={characters.error} retry={() => void characters.refetch()} />
      ) : null}
      <InlineError error={preview.error} />
      {stats.data ? (
        <section className="creator-stats" aria-label="Статистика автора">
          <span>
            <strong>{stats.data.chatsStarted}</strong> начато чатов
          </span>
          <span>
            <strong>{stats.data.likes}</strong> лайков
          </span>
          <span>
            <strong>{stats.data.bookmarks}</strong> закладок
          </span>
          <span>
            <strong>{stats.data.averageRating?.toFixed(1) ?? '—'}</strong> рейтинг
          </span>
        </section>
      ) : null}
      {characters.data?.items.length === 0 ? (
        <EmptyState
          title="Здесь появятся персонажи"
          text="Создай первого и опубликуй, когда он будет готов."
        />
      ) : null}
      <div className="list-stack">
        {characters.data?.items.map((character) => (
          <article className="list-card" key={character.id}>
            <Avatar name={character.name} fileId={character.avatarFileId} />
            <div className="list-copy">
              <h2>{character.name}</h2>
              <p>{character.tagline}</p>
              <div className="tag-list">
                <span>v{character.version}</span>
                <span>
                  {character.publishState === 'PUBLISHED'
                    ? 'Опубликован'
                    : character.publishState === 'MODERATION_PENDING'
                      ? 'На проверке'
                      : character.publishState === 'HIDDEN' || character.publishState === 'REJECTED'
                        ? 'Скрыт модерацией'
                        : 'Черновик'}
                </span>
                {character.tags.slice(0, 2).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            </div>
            <div className="card-actions">
              <button
                className="compact-primary"
                type="button"
                disabled={preview.isPending}
                onClick={() => {
                  preview.mutate(character.id);
                }}
              >
                {preview.isPending && preview.variables === character.id
                  ? 'Открываем тест…'
                  : 'Тестовый диалог'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(character);
                }}
              >
                Редактировать
              </button>
              {character.publishState === 'PUBLISHED' ||
              character.publishState === 'MODERATION_PENDING' ? (
                <button
                  type="button"
                  onClick={() => {
                    action.mutate({ id: character.id, command: 'unpublish' });
                  }}
                >
                  {character.publishState === 'MODERATION_PENDING' ? 'Отменить проверку' : 'Снять'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    action.mutate({ id: character.id, command: 'publish' });
                  }}
                >
                  Опубликовать
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  action.mutate({ id: character.id, command: 'duplicate' });
                }}
              >
                Копия
              </button>
              <button
                className="danger-link"
                type="button"
                onClick={() => {
                  if (window.confirm(`Удалить «${character.name}»?`))
                    action.mutate({ id: character.id, command: 'delete' });
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

function CharacterEditor({
  character,
  onClose,
  notify,
}: {
  readonly character: Character | 'new';
  readonly onClose: () => void;
  readonly notify: (message: string | null) => void;
}) {
  const client = useQueryClient();
  const existing = character === 'new' ? null : character;
  const currentCharacter = useRef<Character | null>(existing);
  const formRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const revisionRef = useRef(0);
  const dirtyRef = useRef(existing === null);
  const [saveState, setSaveState] = useState<
    'INCOMPLETE' | 'DIRTY' | 'SAVING' | 'SAVED' | 'FAILED'
  >(existing ? 'SAVED' : 'INCOMPLETE');
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [previewName, setPreviewName] = useState(existing?.name ?? 'Персонаж');
  const [previewGreeting, setPreviewGreeting] = useState(
    existing?.firstMessage ?? 'Привет, {{user}}.',
  );
  const autosaveEnabled = allowsCharacterAutosave(existing?.publishState ?? null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const readBody = (form: HTMLFormElement) => {
    const data = new FormData(form);
    return {
      name: getFormString(data, 'name'),
      tagline: getFormString(data, 'tagline'),
      description: getFormString(data, 'description'),
      personality: getFormString(data, 'personality'),
      scenario: getFormString(data, 'scenario'),
      firstMessage: getFormString(data, 'firstMessage'),
      speechStyle: getFormString(data, 'speechStyle'),
      appearance: getFormString(data, 'appearance'),
      background: getFormString(data, 'background'),
      exampleDialogues: getFormString(data, 'exampleDialogues'),
      creatorNotes: getFormString(data, 'creatorNotes'),
      goals: getFormString(data, 'goals'),
      behaviourRules: getFormString(data, 'behaviourRules'),
      systemInstructions: getFormString(data, 'systemInstructions'),
      postHistoryInstructions: getFormString(data, 'postHistoryInstructions'),
      alternateGreetings: parseAlternateGreetingInput(getFormString(data, 'alternateGreetings')),
      language: getFormString(data, 'language'),
      contentRating: getFormString(data, 'contentRating'),
      tags: getFormString(data, 'tags')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    };
  };

  async function persistForm(reportValidity: boolean): Promise<boolean> {
    const form = formRef.current;
    if (!form) return false;
    if (!form.checkValidity()) {
      setSaveState('INCOMPLETE');
      if (reportValidity) form.reportValidity();
      return false;
    }
    if (!dirtyRef.current) return true;
    if (savingRef.current) return false;
    savingRef.current = true;
    const savedRevision = revisionRef.current;
    setSaveState('SAVING');
    setSaveError(null);
    try {
      const current = currentCharacter.current;
      const body = readBody(form);
      const saved = await apiRequest<Character>(
        current ? `/api/v1/characters/${current.id}` : '/api/v1/characters',
        {
          method: current ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            current
              ? { ...body, baseVersion: current.version }
              : { ...body, visibility: 'PRIVATE' },
          ),
        },
      );
      currentCharacter.current = saved;
      if (savedRevision === revisionRef.current) {
        dirtyRef.current = false;
        setSaveState('SAVED');
      } else {
        scheduleAutosave();
      }
      await client.invalidateQueries({ queryKey: ['characters'] });
      return true;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error('Не удалось сохранить.');
      setSaveError(normalized);
      setSaveState('FAILED');
      return false;
    } finally {
      savingRef.current = false;
    }
  }

  async function runAutosave(): Promise<void> {
    timerRef.current = null;
    if (!autosaveEnabled) return;
    if (savingRef.current) {
      timerRef.current = window.setTimeout(() => {
        void runAutosave();
      }, 300);
      return;
    }
    await persistForm(false);
  }

  function scheduleAutosave(): void {
    dirtyRef.current = true;
    revisionRef.current += 1;
    setSaveState(pendingAutosaveState(formRef.current?.checkValidity() ?? false));
    if (!autosaveEnabled) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void runAutosave();
    }, 900);
  }

  const submit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const createdInitially = currentCharacter.current === null;
    if (await persistForm(true)) {
      notify(createdInitially ? 'Персонаж создан.' : 'Новая версия сохранена.');
      onClose();
    }
  };
  return (
    <Editor
      title={existing ? 'Редактор персонажа' : 'Новый персонаж'}
      onCancel={onClose}
      onSubmit={(event) => {
        void submit(event);
      }}
      pending={saveState === 'SAVING'}
      error={saveError}
      formRef={formRef}
      onInput={scheduleAutosave}
      status={
        <span className={`save-status is-${saveState.toLowerCase()}`} role="status">
          {saveState === 'SAVING'
            ? 'Сохраняем…'
            : saveState === 'SAVED'
              ? '✓ Сохранено'
              : saveState === 'FAILED'
                ? 'Не удалось сохранить'
                : saveState === 'INCOMPLETE'
                  ? 'Заполни обязательные поля'
                  : 'Изменения ожидают сохранения'}
        </span>
      }
    >
      <fieldset className="editor-section">
        <legend>Основное</legend>
        <Field
          label="Имя"
          name="name"
          defaultValue={existing?.name}
          required
          maxLength={100}
          onChange={(value) => {
            setPreviewName(value || 'Персонаж');
          }}
        />
        <Field
          label="Короткая фраза"
          name="tagline"
          defaultValue={existing?.tagline}
          required
          maxLength={180}
        />
        <TextArea
          label="Описание (не менее 20 символов)"
          name="description"
          defaultValue={existing?.description}
          required
          minLength={20}
        />
      </fieldset>
      <fieldset className="editor-section">
        <legend>Характер</legend>
        <TextArea
          label="Характер (не менее 20 символов)"
          name="personality"
          defaultValue={existing?.personality}
          required
          minLength={20}
        />
        <TextArea label="Стиль речи" name="speechStyle" defaultValue={existing?.speechStyle} />
      </fieldset>
      <fieldset className="editor-section">
        <legend>Сценарий</legend>
        <TextArea label="Сценарий" name="scenario" defaultValue={existing?.scenario} />
        <TextArea label="Цели" name="goals" defaultValue={existing?.goals} />
        <TextArea
          label="Правила поведения"
          name="behaviourRules"
          defaultValue={existing?.behaviourRules}
        />
      </fieldset>
      <fieldset className="editor-section">
        <legend>Первое сообщение</legend>
        <TextArea
          label="Первое сообщение"
          name="firstMessage"
          defaultValue={existing?.firstMessage}
          required
          maxLength={16_000}
          onChange={setPreviewGreeting}
        />
        <TextArea
          label="Альтернативные приветствия"
          name="alternateGreetings"
          defaultValue={existing?.alternateGreetings.join('\n---\n')}
          placeholder="Разделяй варианты отдельной строкой ---"
        />
        <section className="template-preview" aria-label="Предпросмотр приветствия">
          <span>ПРЕДПРОСМОТР С ОБРАЗОМ «ТВОЙ ОБРАЗ»</span>
          <strong>{previewName}</strong>
          <p>
            {renderTemplate(previewGreeting, {
              char: previewName,
              user: 'Твой образ',
              persona: 'Твой образ',
              scenario: '',
              description: '',
              memory: '',
            }).value || 'Приветствие пока пусто.'}
          </p>
        </section>
      </fieldset>
      <fieldset className="editor-section">
        <legend>Примеры</legend>
        <p>
          Здесь работают безопасные переменные <code>{'{{char}}'}</code> и <code>{'{{user}}'}</code>
          . JavaScript и неизвестные команды не исполняются.
        </p>
        <TextArea
          label="Примеры диалогов"
          name="exampleDialogues"
          defaultValue={existing?.exampleDialogues}
          placeholder={'{{user}}: Привет\n{{char}}: Привет. Я рад тебя видеть.'}
        />
      </fieldset>
      <fieldset className="editor-section">
        <legend>Инструкции</legend>
        <TextArea
          label="Инструкции автора"
          name="systemInstructions"
          defaultValue={existing?.systemInstructions}
        />
        <TextArea
          label="Инструкции после истории"
          name="postHistoryInstructions"
          defaultValue={existing?.postHistoryInstructions}
        />
        <TextArea
          label="Заметки автора"
          name="creatorNotes"
          defaultValue={existing?.creatorNotes}
        />
      </fieldset>
      <fieldset className="editor-section">
        <legend>Лор</legend>
        <p>
          Книги мира подключаются после первого сохранения в разделе «Книги мира». Тестовый диалог
          использует выбранный снимок черновика.
        </p>
      </fieldset>
      <fieldset className="editor-section">
        <legend>Внешность</legend>
        <TextArea label="Внешность" name="appearance" defaultValue={existing?.appearance} />
        <TextArea label="Предыстория" name="background" defaultValue={existing?.background} />
      </fieldset>
      <fieldset className="editor-section">
        <legend>Публикация</legend>
        <Field label="Теги через запятую" name="tags" defaultValue={existing?.tags.join(', ')} />
        <div className="field-row">
          <Select
            label="Язык"
            name="language"
            defaultValue={existing?.language ?? 'ru'}
            options={[
              ['ru', 'Русский'],
              ['en', 'English'],
            ]}
          />
          <Select
            label="Рейтинг"
            name="contentRating"
            defaultValue={existing?.contentRating ?? 'SAFE'}
            options={[
              ['SAFE', 'Безопасный'],
              ['MATURE', '18+'],
            ]}
          />
        </div>
        {!autosaveEnabled ? (
          <p className="meta">
            Опубликованный персонаж сохраняется только по кнопке, чтобы изменения не отправились на
            модерацию случайно.
          </p>
        ) : null}
      </fieldset>
    </Editor>
  );
}

function SettingsView({
  account,
  notify,
}: {
  readonly account: MeResponse;
  readonly notify: (message: string | null) => void;
}) {
  const client = useQueryClient();
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionConfirmation, setDeletionConfirmation] = useState('');
  const [supportCategory, setSupportCategory] = useState<SupportCategory>('GENERAL');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiRequest<Settings>('/api/v1/settings'),
  });
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest<Settings>('/api/v1/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ['settings'] });
      document.documentElement.dataset['theme'] = result.theme;
      notify('Настройки сохранены.');
    },
  });
  const dataControls = useQuery({
    queryKey: ['data-controls'],
    queryFn: () => apiRequest<DataControls>('/api/v1/data-controls'),
  });
  const blocks = useQuery({
    queryKey: ['blocks'],
    queryFn: () => apiRequest<ListResponse<BlockedUser>>('/api/v1/blocks'),
  });
  const supportRequests = useQuery({
    queryKey: ['support-requests'],
    queryFn: () => apiRequest<ListResponse<SupportRequest>>('/api/v1/support/requests'),
  });
  const createSupportRequest = useMutation({
    mutationFn: () =>
      apiRequest<SupportRequest>('/api/v1/support/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category: supportCategory,
          subject: supportSubject,
          message: supportMessage,
        }),
      }),
    onSuccess: async () => {
      setSupportSubject('');
      setSupportMessage('');
      await client.invalidateQueries({ queryKey: ['support-requests'] });
      notify(ru.support.created);
    },
  });
  const requestDeletion = useMutation({
    mutationFn: () =>
      apiRequest('/api/v1/data-controls/account-deletion', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          confirmation: deletionConfirmation,
          idempotencyKey: crypto.randomUUID(),
        }),
      }),
    onSuccess: async () => {
      setShowDeletionDialog(false);
      setDeletionConfirmation('');
      await client.invalidateQueries({ queryKey: ['data-controls'] });
      notify('Заявка создана. Аккаунт можно восстановить в течение 7 дней.');
    },
  });
  const cancelDeletion = useMutation({
    mutationFn: () => apiRequest('/api/v1/data-controls/account-deletion', { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['data-controls'] });
      notify('Удаление аккаунта отменено.');
    },
  });
  const unblock = useMutation({
    mutationFn: (userId: string) => apiRequest(`/api/v1/blocks/${userId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['blocks'] }),
        client.invalidateQueries({ queryKey: ['discovery'] }),
      ]);
      notify('Пользователь разблокирован.');
    },
  });
  const exportData = useMutation({
    mutationFn: () => apiRequest<unknown>('/api/v1/data-export'),
    onSuccess: (result) => {
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'velora-export.json';
      link.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 0);
    },
  });
  useEffect(() => {
    if (settings.data) document.documentElement.dataset['theme'] = settings.data.theme;
  }, [settings.data]);
  if (settings.isPending) return <EmptyState title="Загружаем настройки…" />;
  if (settings.isError)
    return <ErrorState error={settings.error} retry={() => void settings.refetch()} />;
  return (
    <div className="view-stack">
      <ViewHeader
        eyebrow="КОНТРОЛЬ"
        title="Настройки"
        description="Тема, язык и профиль генерации хранятся в твоём аккаунте."
      />
      <form
        className="editor-card"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          save.mutate({
            theme: data.get('theme'),
            locale: data.get('locale'),
            generationProfile: data.get('generationProfile'),
          });
        }}
      >
        <Select
          label="Тема"
          name="theme"
          defaultValue={settings.data.theme}
          options={[
            ['dark', 'Тёмная'],
            ['amoled', 'AMOLED'],
            ['light', 'Светлая'],
          ]}
        />
        <Select
          label="Язык"
          name="locale"
          defaultValue={settings.data.locale}
          options={[
            ['ru', 'Русский'],
            ['en', 'English'],
          ]}
        />
        <Select
          label="Режим генерации"
          name="generationProfile"
          defaultValue={settings.data.generationProfile}
          options={(
            [
              ['BALANCED', 'Сбалансированный'],
              ['CREATIVE', 'Творческий'],
              ['PREMIUM', 'Максимальное качество'],
            ] as const
          ).filter(([code]) => account.planEntitlements.modelProfiles.includes(code))}
        />
        <div className="budget-note">
          <strong>Только предоплаченные AI-кредиты</strong>
          <p>
            Автосписаний и автоматического пополнения нет. Кредиты расходуются исключительно на
            полноценные ролевые ответы.
          </p>
        </div>
        {save.error ? <InlineError error={save.error} /> : null}
        <button className="primary" type="submit" disabled={save.isPending}>
          Сохранить
        </button>
      </form>
      <section className="editor-card account-controls" aria-labelledby="support-title">
        <div>
          <p className="eyebrow">ПОМОЩЬ</p>
          <h2 id="support-title">{ru.support.title}</h2>
          <p className="meta">{ru.support.privacyNote}</p>
        </div>
        <form
          className="view-stack"
          onSubmit={(event) => {
            event.preventDefault();
            createSupportRequest.mutate();
          }}
        >
          <label className="field">
            <span>Категория</span>
            <select
              name="supportCategory"
              value={supportCategory}
              onChange={(event) => {
                setSupportCategory(event.target.value as SupportCategory);
              }}
            >
              <option value="GENERAL">Общий вопрос</option>
              <option value="TECHNICAL">Техническая проблема</option>
              <option value="PAYMENT">Оплата и Stars</option>
              <option value="SAFETY">Безопасность</option>
              <option value="DATA">Персональные данные</option>
            </select>
          </label>
          <label className="field">
            <span>Тема</span>
            <input
              required
              minLength={3}
              maxLength={120}
              value={supportSubject}
              onChange={(event) => {
                setSupportSubject(event.target.value);
              }}
            />
          </label>
          <label className="field">
            <span>Сообщение</span>
            <textarea
              required
              minLength={20}
              maxLength={4000}
              rows={5}
              value={supportMessage}
              onChange={(event) => {
                setSupportMessage(event.target.value);
              }}
            />
          </label>
          <button className="primary" type="submit" disabled={createSupportRequest.isPending}>
            {createSupportRequest.isPending ? 'Отправляем…' : 'Отправить обращение'}
          </button>
          {createSupportRequest.error ? <InlineError error={createSupportRequest.error} /> : null}
        </form>
        <div className="list-stack" aria-label="Мои обращения">
          {supportRequests.data?.items.map((item) => (
            <article className="support-card" key={item.id}>
              <span className="status-pill">{supportStateLabel(item.state)}</span>
              <strong>{item.subject}</strong>
              <p>{item.message}</p>
              {item.resolutionNote ? <p className="meta">Ответ: {item.resolutionNote}</p> : null}
            </article>
          ))}
        </div>
        {supportRequests.error ? <InlineError error={supportRequests.error} /> : null}
      </section>

      <section className="editor-card account-controls" aria-labelledby="legal-title">
        <div>
          <p className="eyebrow">ПРАВОВАЯ ИНФОРМАЦИЯ</p>
          <h2 id="legal-title">Условия и конфиденциальность</h2>
        </div>
        <details>
          <summary>Условия использования</summary>
          <p>{ru.support.terms}</p>
        </details>
        <details>
          <summary>Политика конфиденциальности</summary>
          <p>{ru.support.privacy}</p>
        </details>
        <p className="meta">Редакция от 11 августа 2026 года.</p>
      </section>
      <section className="editor-card account-controls" aria-labelledby="data-controls-title">
        <div>
          <p className="eyebrow">ДАННЫЕ И ДОСТУП</p>
          <h2 id="data-controls-title">Управление аккаунтом</h2>
          <p className="meta">
            План: {account.plan} · AI-кредиты: {formatCredits(account.creditBalanceMicros)}
          </p>
        </div>
        {dataControls.isPending ? <p className="meta">Собираем сведения об аккаунте…</p> : null}
        {dataControls.error ? <InlineError error={dataControls.error} /> : null}
        {dataControls.data ? (
          <div className="export-summary">
            <span>Диалоги: {dataControls.data.export.counts.conversations}</span>
            <span>Персонажи: {dataControls.data.export.counts.characters}</span>
            <span>Лорбуки: {dataControls.data.export.counts.lorebooks}</span>
            <span>Обращения: {dataControls.data.export.counts.supportRequests}</span>
          </div>
        ) : null}
        <div className="data-actions">
          <button
            className="secondary"
            type="button"
            disabled={exportData.isPending}
            onClick={() => {
              exportData.mutate();
            }}
          >
            {exportData.isPending ? 'Подготавливаем…' : 'Скачать данные'}
          </button>
        </div>
        {exportData.error ? <InlineError error={exportData.error} /> : null}
        <p className="meta">
          Экспорт подготовлен как переносимый манифест диалогов, персонажей и лорбуков. Полные
          ресурсы доступны по указанным в нём API-маршрутам.
        </p>
      </section>

      <section className="editor-card account-controls" aria-labelledby="blocks-title">
        <div>
          <p className="eyebrow">КОНФИДЕНЦИАЛЬНОСТЬ</p>
          <h2 id="blocks-title">Заблокированные пользователи</h2>
        </div>
        {blocks.isPending ? <p className="meta">Загружаем список…</p> : null}
        {blocks.error ? <InlineError error={blocks.error} /> : null}
        {blocks.data?.items.length === 0 ? (
          <p className="meta">Вы пока никого не блокировали.</p>
        ) : null}
        <div className="blocked-list">
          {blocks.data?.items.map((user) => (
            <article key={user.userId}>
              <div>
                <strong>{user.displayName}</strong>
                <small>{user.username ? `@${user.username}` : 'Без публичного username'}</small>
              </div>
              <button
                type="button"
                disabled={unblock.isPending}
                onClick={() => {
                  unblock.mutate(user.userId);
                }}
              >
                Разблокировать
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="editor-card deletion-zone" aria-labelledby="deletion-title">
        <div>
          <p className="eyebrow">ОПАСНАЯ ЗОНА</p>
          <h2 id="deletion-title">Удаление аккаунта</h2>
        </div>
        {dataControls.data?.deletion?.state === 'PENDING' ? (
          <>
            <p>
              Удаление запланировано на{' '}
              <strong>{new Date(dataControls.data.deletion.executeAfter).toLocaleString()}</strong>.
              До этого момента заявку можно отменить.
            </p>
            <button
              className="secondary"
              type="button"
              disabled={cancelDeletion.isPending}
              onClick={() => {
                cancelDeletion.mutate();
              }}
            >
              Отменить удаление
            </button>
          </>
        ) : (
          <>
            <p>
              После 7-дневного периода отмены профиль и пользовательский контент будут удалены или
              обезличены. Платёжные записи, доказательства модерации и аудит сохраняются только в
              объёме, необходимом для споров, защиты от мошенничества и безопасности.
            </p>
            {account.role === 'OWNER' ? (
              <p className="warning-copy">
                Владелец должен сначала передать роль и операционные обязанности.
              </p>
            ) : (
              <button
                className="danger-text"
                type="button"
                onClick={() => {
                  setShowDeletionDialog(true);
                }}
              >
                Запросить удаление аккаунта
              </button>
            )}
          </>
        )}
        {(requestDeletion.error ?? cancelDeletion.error) ? (
          <InlineError error={requestDeletion.error ?? cancelDeletion.error} />
        ) : null}
      </section>

      {showDeletionDialog ? (
        <div
          className="account-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowDeletionDialog(false);
          }}
        >
          <section
            className="account-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-deletion-title"
          >
            <h2 id="confirm-deletion-title">Удалить аккаунт?</h2>
            <p>
              У вас будет 7 дней на отмену. После срока пользовательский контент восстановить
              нельзя. Для подтверждения введите <strong>УДАЛИТЬ</strong>.
            </p>
            <label className="field">
              <span>Подтверждение</span>
              <input
                autoFocus
                value={deletionConfirmation}
                onChange={(event) => {
                  setDeletionConfirmation(event.currentTarget.value);
                }}
              />
            </label>
            {requestDeletion.error ? <InlineError error={requestDeletion.error} /> : null}
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setShowDeletionDialog(false);
                  setDeletionConfirmation('');
                }}
              >
                Отмена
              </button>
              <button
                className="danger"
                type="button"
                disabled={deletionConfirmation !== 'УДАЛИТЬ' || requestDeletion.isPending}
                onClick={() => {
                  requestDeletion.mutate();
                }}
              >
                Запланировать удаление
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ViewHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly action?: React.ReactNode;
}) {
  return (
    <header className="view-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
function Avatar({ name, fileId }: { readonly name: string; readonly fileId: string | null }) {
  return (
    <div className="avatar">
      {fileId ? (
        <img src={`/api/v1/media/${fileId}/content`} alt="" />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </div>
  );
}
function EmptyState({ title, text }: { readonly title: string; readonly text?: string }) {
  return (
    <div className="empty-state">
      <span>✦</span>
      <h2>{title}</h2>
      {text ? <p>{text}</p> : null}
    </div>
  );
}
function ErrorState({ error, retry }: { readonly error: Error; readonly retry: () => void }) {
  return (
    <div className="error-panel" role="alert">
      <strong>Не удалось загрузить раздел</strong>
      <p>{error.message}</p>
      <button type="button" onClick={retry}>
        Попробовать снова
      </button>
    </div>
  );
}
function InlineError({ error }: { readonly error: Error | null }) {
  return error ? (
    <p className="error" role="alert">
      {error.message}
    </p>
  ) : null;
}
function Editor({
  title,
  onCancel,
  onSubmit,
  pending,
  error,
  formRef,
  onInput,
  status,
  children,
}: {
  readonly title: string;
  readonly onCancel: () => void;
  readonly onSubmit: (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => void;
  readonly pending: boolean;
  readonly error: Error | null;
  readonly formRef?: React.RefObject<HTMLFormElement | null>;
  readonly onInput?: () => void;
  readonly status?: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="view-stack">
      <div className="editor-heading">
        <button type="button" onClick={onCancel}>
          ← Назад
        </button>
        <h1>{title}</h1>
      </div>
      <form className="editor-card" ref={formRef} onInput={onInput} onSubmit={onSubmit}>
        {status}
        {children}
        <InlineError error={error} />
        <div className="editor-actions">
          <button className="secondary" type="button" onClick={onCancel}>
            Отменить
          </button>
          <button className="primary" type="submit" disabled={pending}>
            {pending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
}
function Field({
  label,
  name,
  defaultValue = '',
  onChange,
  ...props
}: {
  readonly label: string;
  readonly name: string;
  readonly defaultValue?: string | undefined;
  readonly required?: boolean;
  readonly maxLength?: number;
  readonly type?: 'text' | 'number';
  readonly onChange?: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        {...props}
        onChange={(event) => {
          onChange?.(event.currentTarget.value);
        }}
      />
    </label>
  );
}
function TextArea({
  label,
  name,
  defaultValue = '',
  onChange,
  ...props
}: {
  readonly label: string;
  readonly name: string;
  readonly defaultValue?: string | undefined;
  readonly required?: boolean;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly placeholder?: string;
  readonly onChange?: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={4}
        {...props}
        onChange={(event) => {
          onChange?.(event.currentTarget.value);
        }}
      />
    </label>
  );
}
function Select({
  label,
  name,
  defaultValue,
  options,
}: {
  readonly label: string;
  readonly name: string;
  readonly defaultValue: string;
  readonly options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={defaultValue}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function getFormString(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}

function parseAlternateGreetingInput(value: string): readonly string[] {
  return value
    .split(/\n\s*---\s*\n/gu)
    .map((greeting) => greeting.trim())
    .filter(Boolean)
    .slice(0, 10);
}
