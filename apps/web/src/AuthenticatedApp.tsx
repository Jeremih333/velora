import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { renderTemplate } from '@velora/prompts';
import { ru } from '@velora/shared';
import { apiRequest } from './api';
import { allowsCharacterAutosave, pendingAutosaveState } from './character-autosave';
import { ChatsView } from './ChatsView';
import { localizedErrorMessage } from './error-localization';
import { LorebooksView } from './LorebooksView';
import { getWebMessages, useI18n, type Locale, type WebMessages } from './i18n';
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
  OwnerUserGrant,
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

export function AuthenticatedApp({
  initialUser,
  onLocaleChange,
}: {
  readonly initialUser: MeResponse;
  readonly onLocaleChange: (locale: Locale) => void;
}) {
  const { locale, messages } = useI18n();
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
            aria-label={messages.navigation.credits}
            onClick={() => {
              setTab('billing');
            }}
          >
            <span>✦</span> {formatCredits(me.data.creditBalanceMicros, locale)}
          </button>
          {['MODERATOR', 'SENIOR_MODERATOR', 'ADMIN', 'OWNER'].includes(me.data.role) ? (
            <button
              className="compact-button lore-symbol"
              type="button"
              onClick={() => {
                setTab('moderation');
              }}
            >
              🛡 {messages.navigation.moderation}
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
        {tab === 'settings' ? (
          <SettingsView account={me.data} notify={setNotice} onLocaleChange={onLocaleChange} />
        ) : null}
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
      <nav className="bottom-nav" aria-label={messages.navigation.main}>
        <NavButton
          active={tab === 'chats'}
          label={messages.navigation.chats}
          icon="◌"
          onClick={() => {
            setTab('chats');
          }}
        />
        <NavButton
          active={tab === 'discover'}
          label={messages.navigation.catalog}
          icon="⌕"
          onClick={() => {
            setTab('discover');
          }}
        />
        <NavButton
          active={tab === 'characters'}
          label={messages.navigation.characters}
          icon="✦"
          onClick={() => {
            setTab('characters');
          }}
        />
        <NavButton
          active={tab === 'personas'}
          label={messages.navigation.personas}
          icon="◉"
          onClick={() => {
            setTab('personas');
          }}
        />
        <NavButton
          active={tab === 'settings'}
          label={messages.navigation.settings}
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
  const { messages } = useI18n();
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
          <small>{messages.onboarding.step(step + 1)}</small>
        </span>
      </header>
      <div className="onboarding-progress" aria-label={messages.onboarding.stepLabel(step + 1)}>
        <span style={{ width: `${String(((step + 1) / 4) * 100)}%` }} />
      </div>

      {step === 0 ? (
        <section className="onboarding-card">
          <p className="eyebrow">{messages.onboarding.welcomeEyebrow}</p>
          <h1>{messages.onboarding.welcomeTitle(displayName)}</h1>
          <p className="lead">{messages.onboarding.welcomeText}</p>
          <ul className="onboarding-points">
            <li>{messages.onboarding.characterPoint}</li>
            <li>{messages.onboarding.memoryPoint}</li>
            <li>{messages.onboarding.controlPoint}</li>
          </ul>
          <button
            className="primary"
            type="button"
            onClick={() => {
              setStep(1);
            }}
          >
            {messages.onboarding.continue}
          </button>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="onboarding-card">
          <p className="eyebrow">{messages.onboarding.safetyEyebrow}</p>
          <h1>{messages.onboarding.safetyTitle}</h1>
          <p>{messages.onboarding.safetyText}</p>
          <label className="choice-card">
            <input
              type="checkbox"
              checked={matureEnabled}
              onChange={(event) => {
                setMatureEnabled(event.target.checked);
              }}
            />
            <span>
              <strong>{messages.onboarding.adultTitle}</strong>
              <small>{messages.onboarding.adultText}</small>
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
              <strong>{messages.onboarding.policyTitle}</strong>
              <small>{messages.onboarding.policyText}</small>
            </span>
          </label>
          <div className="onboarding-actions">
            <button
              type="button"
              onClick={() => {
                setStep(0);
              }}
            >
              {messages.onboarding.back}
            </button>
            <button
              className="primary"
              type="button"
              disabled={!policyAccepted}
              onClick={() => {
                setStep(2);
              }}
            >
              {messages.onboarding.continue}
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="onboarding-card">
          <p className="eyebrow">{messages.onboarding.personaEyebrow}</p>
          <h1>{messages.onboarding.personaTitle}</h1>
          <p>{messages.onboarding.personaText}</p>
          <label>
            {messages.onboarding.personaName}
            <input
              value={personaName}
              maxLength={80}
              placeholder={messages.onboarding.personaNamePlaceholder}
              onChange={(event) => {
                setPersonaName(event.target.value);
              }}
            />
          </label>
          <label>
            {messages.onboarding.personaDescription}
            <textarea
              value={personaDescription}
              maxLength={280}
              placeholder={messages.onboarding.personaDescriptionPlaceholder}
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
              {messages.onboarding.back}
            </button>
            <button
              className="primary"
              type="button"
              onClick={() => {
                setStep(3);
              }}
            >
              {personaName.trim() ? messages.onboarding.savePersona : messages.onboarding.skip}
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="onboarding-card onboarding-recommendations">
          <p className="eyebrow">{messages.onboarding.storiesEyebrow}</p>
          <h1>{messages.onboarding.storiesTitle}</h1>
          <p>{messages.onboarding.storiesText}</p>
          {recommendations.isPending ? (
            <p role="status">{messages.onboarding.loadingStories}</p>
          ) : null}
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
                  {messages.onboarding.start}
                </button>
              </article>
            ))}
          </div>
          {recommendations.data?.items.length === 0 ? (
            <p>{messages.onboarding.emptyStories}</p>
          ) : null}
          <button
            className="primary"
            type="button"
            disabled={complete.isPending}
            onClick={() => {
              complete.mutate(null);
            }}
          >
            {complete.isPending ? messages.onboarding.saving : messages.onboarding.openCatalog}
          </button>
          <button
            type="button"
            disabled={complete.isPending}
            onClick={() => {
              setStep(2);
            }}
          >
            {messages.onboarding.back}
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
  const { locale, messages } = useI18n();
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
        if (status === 'paid') notify(messages.billing.paymentPaid);
        if (status === 'failed') notify(messages.billing.paymentFailed);
        void client.invalidateQueries({ queryKey: ['me'] });
        void client.invalidateQueries({ queryKey: ['billing', 'payments'] });
      };
      if (!openTelegramInvoice(result.invoiceUrl, handleClosed)) {
        notify(messages.billing.telegramOnly);
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
        if (status === 'paid') notify(messages.billing.accessPaid);
        if (status === 'failed') notify(messages.billing.accessFailed);
        void client.invalidateQueries({ queryKey: ['me'] });
        void client.invalidateQueries({ queryKey: ['billing', 'payments'] });
      };
      if (!openTelegramInvoice(result.invoiceUrl, handleClosed)) {
        notify(messages.billing.telegramOnly);
      }
    },
  });
  if (catalog.isPending) return <EmptyState title={messages.billing.loading} />;
  if (catalog.isError)
    return <ErrorState error={catalog.error} retry={() => void catalog.refetch()} />;
  return (
    <div className="view-stack">
      <ViewHeader
        eyebrow={messages.billing.eyebrow}
        title={messages.billing.title}
        description={messages.billing.description}
      />
      <section className="billing-assurance" aria-label={messages.billing.termsLabel}>
        <strong>{messages.billing.assuranceTitle}</strong>
        <p>{messages.billing.assuranceText}</p>
      </section>
      <section className="billing-assurance" aria-label={messages.billing.currentPlanLabel}>
        <strong>{messages.billing.currentPlan(account.planDisplayName)}</strong>
        <p>
          {account.planAccessUntil
            ? messages.billing.accessUntil(
                new Date(account.planAccessUntil).toLocaleDateString(locale),
              )
            : messages.billing.freeNeverExpires}
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
          <span>{messages.billing.acceptance}</span>
        </label>
      ) : null}
      {accessCatalog.isError ? <InlineError error={accessCatalog.error} /> : null}
      {accessCatalog.data?.items.length ? (
        <section className="view-stack" aria-labelledby="access-packs-title">
          <h2 id="access-packs-title">{messages.billing.accessPacks}</h2>
          <div className="billing-grid">
            {accessCatalog.data.items.map((pack) => (
              <article className="billing-pack" key={pack.code}>
                <span className="pack-stars">{pack.starsAmount} ⭐</span>
                <h2>{pack.displayName}</h2>
                <p>{pack.description}</p>
                <strong>{messages.billing.duration(pack.durationDays, pack.planCode)}</strong>
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
                  {messages.billing.buyOnce}
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {!catalog.data.paymentsEnabled ? (
        <section className="billing-disabled" role="status">
          <strong>{messages.billing.disabledTitle}</strong>
          <p>{messages.billing.disabledText}</p>
        </section>
      ) : catalog.data.items.length === 0 ? (
        <section className="billing-disabled" role="status">
          <strong>{messages.billing.noPacksTitle}</strong>
          <p>{messages.billing.noPacksText}</p>
        </section>
      ) : (
        <>
          <div className="billing-grid">
            {catalog.data.items.map((pack) => (
              <article className="billing-pack" key={pack.code}>
                <span className="pack-stars">{pack.starsAmount} ⭐</span>
                <h2>{pack.displayName}</h2>
                <p>{pack.description}</p>
                <strong>
                  {messages.billing.credits(formatCredits(pack.creditAmountMicros, locale))}
                </strong>
                <button
                  className="primary"
                  type="button"
                  disabled={!termsAccepted || invoice.isPending}
                  onClick={() => {
                    invoice.mutate(pack.code);
                  }}
                >
                  {messages.billing.buyFor(pack.starsAmount)}
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      <InlineError error={invoice.error} />
      <InlineError error={accessInvoice.error} />
      <section className="payment-history">
        <h2>{messages.billing.history}</h2>
        {history.isPending ? <p>{messages.billing.historyLoading}</p> : null}
        {history.isError ? <InlineError error={history.error} /> : null}
        {history.data?.items.length === 0 ? <p>{messages.billing.noOperations}</p> : null}
        {history.data?.items.map((item) => (
          <div className="payment-row" key={item.id}>
            <span>
              <strong>{item.amount} ⭐</strong>
              <small>{formatPaymentState(item.state, messages)}</small>
            </span>
            <time dateTime={new Date(item.createdAt).toISOString()}>
              {new Date(item.createdAt).toLocaleDateString(locale)}
            </time>
          </div>
        ))}
      </section>
    </div>
  );
}

function formatCredits(valueMicros: number, locale: Locale = 'ru'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    valueMicros / 1_000_000,
  );
}

function formatPaymentState(state: string, messages: ReturnType<typeof getWebMessages>): string {
  const labels: Readonly<Record<string, string>> = {
    CREATED: messages.billing.stateCreated,
    INVOICE_SENT: messages.billing.stateInvoiceSent,
    PAID: messages.billing.statePaid,
    FAILED: messages.billing.stateFailed,
    REFUNDED: messages.billing.stateRefunded,
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
  const { messages } = useI18n();
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
        eyebrow={messages.discovery.eyebrow}
        title={messages.discovery.title}
        description={messages.discovery.description}
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
          placeholder={messages.discovery.searchPlaceholder}
          aria-label={messages.discovery.searchLabel}
        />
        <button type="submit">{messages.discovery.search}</button>
      </form>
      {discovery.isPending ? <EmptyState title={messages.discovery.loading} /> : null}
      {discovery.isError ? (
        <ErrorState error={discovery.error} retry={() => void discovery.refetch()} />
      ) : null}
      {discovery.data?.items.length === 0 ? (
        <EmptyState title={messages.discovery.emptyTitle} text={messages.discovery.emptyText} />
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
  const { messages } = useI18n();
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
          {messages.discovery.byCreator(character.creatorName)}
        </button>
        <h2>{character.name}</h2>
        <p className="tagline">{character.tagline}</p>
        {expanded ? <p className="description">{character.description}</p> : null}
        {expanded && character.alternateGreetings.length > 0 ? (
          <label className="field greeting-picker">
            <span>{messages.discovery.greeting}</span>
            <select
              aria-label={messages.discovery.greeting}
              value={greetingIndex}
              onChange={(event) => {
                setGreetingIndex(Number(event.currentTarget.value));
              }}
            >
              <option value={0}>{messages.discovery.primaryGreeting}</option>
              {character.alternateGreetings.map((_, index) => (
                <option key={index} value={index + 1}>
                  {messages.discovery.greetingVariant(index + 1)}
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
        <div className="character-metrics" aria-label={messages.discovery.metrics}>
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
            {character.liked ? messages.discovery.liked : messages.discovery.like}
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
            {character.bookmarked ? messages.discovery.saved : messages.discovery.bookmark}
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
          {expanded ? messages.discovery.collapse : messages.discovery.details}
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
            {messages.discovery.report}
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
            {messages.discovery.reportSent}
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
            {messages.discovery.blockCreator}
          </button>
        ) : null}
        {confirmingBlock ? (
          <div
            className="inline-confirm"
            role="alertdialog"
            aria-label={messages.discovery.blockConfirmation}
          >
            <p>{messages.discovery.blockText}</p>
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setConfirmingBlock(false);
                }}
              >
                {messages.discovery.cancel}
              </button>
              <button
                className="danger"
                type="button"
                disabled={blockCreator.isPending}
                onClick={() => {
                  blockCreator.mutate();
                }}
              >
                {messages.discovery.block}
              </button>
            </div>
            {blockCreator.error ? <InlineError error={blockCreator.error} /> : null}
          </div>
        ) : null}
        {expanded ? (
          <section className="review-panel" aria-label={messages.discovery.reviews}>
            <h3>{messages.discovery.reviews}</h3>
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
                <span>{messages.discovery.yourRating}</span>
                <select name="rating" defaultValue={character.myRating ?? 5}>
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option value={rating} key={rating}>
                      {messages.discovery.ratingOutOfFive(rating)}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                name="reviewText"
                maxLength={1000}
                defaultValue={character.myReviewText ?? ''}
                placeholder={messages.discovery.reviewPlaceholder}
              />
              <button className="compact-button" type="submit" disabled={review.isPending}>
                {character.myRating === null
                  ? messages.discovery.rate
                  : messages.discovery.updateReview}
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
                  {messages.discovery.deleteReview}
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
            {reviews.data?.items.length === 0 ? (
              <p className="meta">{messages.discovery.noReviews}</p>
            ) : null}
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
          {start.isPending ? messages.discovery.opening : messages.discovery.startStory}
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
  const { messages } = useI18n();
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
      notify(messages.profile.saved);
    },
  });
  const block = useMutation({
    mutationFn: () => apiRequest(`/api/v1/blocks/${userId}`, { method: 'PUT' }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['blocks'] }),
        client.invalidateQueries({ queryKey: ['discovery'] }),
      ]);
      notify(messages.profile.blocked);
      onBack();
    },
  });
  if (profile.isPending) return <EmptyState title={messages.profile.loading} />;
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
          eyebrow={messages.profile.editEyebrow}
          title={messages.profile.editTitle}
          description={messages.profile.editDescription}
        />
        <Field
          label={messages.profile.displayName}
          name="displayName"
          defaultValue={profile.data.displayName}
          required
          maxLength={80}
        />
        <TextArea
          label={messages.profile.bio}
          name="bio"
          defaultValue={profile.data.bio}
          maxLength={1000}
        />
        <label className="field">
          <span>{messages.profile.avatarLibrary}</span>
          <select name="avatarFileId" defaultValue={profile.data.avatarFileId ?? ''}>
            <option value="">{messages.profile.noAvatar}</option>
            {media.data?.items
              .filter(
                (item) => item.mimeType.startsWith('image/') && item.moderationState !== 'REJECTED',
              )
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.originalName ?? messages.profile.imageFallback(item.id)} ·{' '}
                  {item.moderationState}
                </option>
              ))}
          </select>
        </label>
        <Select
          label={messages.profile.visibility}
          name="visibility"
          defaultValue={profile.data.visibility}
          options={[
            ['PUBLIC', messages.profile.publicProfile],
            ['PRIVATE', messages.profile.onlyMe],
          ]}
        />
        <p className="meta">{messages.profile.avatarPendingOwn}</p>
        {save.error ? <InlineError error={save.error} /> : null}
        <div className="dialog-actions">
          <button
            type="button"
            onClick={() => {
              setEditing(false);
            }}
          >
            {messages.profile.cancel}
          </button>
          <button className="primary" type="submit" disabled={save.isPending}>
            {messages.profile.saveProfile}
          </button>
        </div>
      </form>
    );
  }
  return (
    <div className="view-stack">
      <button className="text-button profile-back" type="button" onClick={onBack}>
        {messages.profile.backToCatalog}
      </button>
      <article className="editor-card public-profile">
        <div className="profile-identity">
          <Avatar name={profile.data.displayName} fileId={profile.data.avatarFileId} />
          <div>
            <p className="eyebrow">
              {profile.data.isOwn ? messages.profile.ownEyebrow : messages.profile.authorEyebrow}
            </p>
            <h1>{profile.data.displayName}</h1>
            <span className="status-pill">
              {profile.data.visibility === 'PUBLIC'
                ? messages.profile.public
                : messages.profile.private}
            </span>
          </div>
        </div>
        <p className="profile-bio">{profile.data.bio || messages.profile.emptyBio}</p>
        {profile.data.avatarPending ? (
          <p className="meta">{messages.profile.avatarPending}</p>
        ) : null}
        <div className="creator-stats" aria-label={messages.profile.stats}>
          <span>
            <strong>{profile.data.stats.characters}</strong> {messages.profile.characters}
          </span>
          <span>
            <strong>{profile.data.stats.likes}</strong> {messages.profile.likes}
          </span>
          <span>
            <strong>{profile.data.stats.chats}</strong> {messages.profile.chats}
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
            {messages.profile.edit}
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
              {messages.profile.report}
            </button>
            <button
              className="text-button danger-link"
              type="button"
              onClick={() => {
                setConfirmingBlock(true);
              }}
            >
              {messages.profile.block}
            </button>
          </div>
        )}
        {reporting ? (
          <ReportForm
            targetId={profile.data.userId}
            targetType="USER_PROFILE"
            onDone={() => {
              setReporting(false);
              notify(messages.profile.reportSent);
            }}
          />
        ) : null}
        {confirmingBlock ? (
          <div
            className="inline-confirm"
            role="alertdialog"
            aria-label={messages.profile.blockConfirmation}
          >
            <p>{messages.profile.blockWarning}</p>
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setConfirmingBlock(false);
                }}
              >
                {messages.profile.cancel}
              </button>
              <button
                className="danger"
                type="button"
                disabled={block.isPending}
                onClick={() => {
                  block.mutate();
                }}
              >
                {messages.profile.block}
              </button>
            </div>
          </div>
        ) : null}
      </article>
      <section className="profile-characters" aria-labelledby="profile-characters-title">
        <h2 id="profile-characters-title">{messages.profile.publishedCharacters}</h2>
        {profile.data.characters.length === 0 ? (
          <p className="meta">{messages.profile.noPublicCharacters}</p>
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
  const { messages } = useI18n();
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
        <span>{messages.reports.reason}</span>
        <select
          aria-label={messages.reports.reasonLabel}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        >
          <option value="UNDERAGE">{messages.reports.underage}</option>
          <option value="SEXUAL_CONTENT_INVOLVING_MINORS">{messages.reports.sexualMinors}</option>
          <option value="ABUSE_HARASSMENT">{messages.reports.harassment}</option>
          <option value="NON_CONSENSUAL_EXPLOITATIVE_MATERIAL">
            {messages.reports.exploitative}
          </option>
          <option value="ILLEGAL_CONTENT">{messages.reports.illegal}</option>
          <option value="IMPERSONATION">{messages.reports.impersonation}</option>
          <option value="HATE">{messages.reports.hate}</option>
          <option value="SELF_HARM_CONCERN">{messages.reports.selfHarm}</option>
          <option value="SPAM">{messages.reports.spam}</option>
          <option value="COPYRIGHT">{messages.reports.copyright}</option>
          <option value="OTHER">{messages.reports.other}</option>
        </select>
      </label>
      <label className="field">
        <span>{messages.reports.description}</span>
        <textarea
          aria-label={messages.reports.descriptionLabel}
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
          {report.isPending ? messages.reports.sending : messages.reports.send}
        </button>
        <button className="compact-button" type="button" onClick={onDone}>
          {messages.reports.cancel}
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
  const { messages } = useI18n();
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
      notify(messages.moderation.assignedNotice);
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
      notify(messages.moderation.decisionNotice);
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
            {messages.moderation.backToQueue}
          </button>
          <h1>{messages.moderation.caseTitle}</h1>
        </div>
        {detail.isPending ? <EmptyState title={messages.moderation.loadingEvidence} /> : null}
        {detail.isError ? (
          <ErrorState error={detail.error} retry={() => void detail.refetch()} />
        ) : null}
        {detail.data ? (
          <article className="moderation-detail">
            <div className="section-heading">
              <div>
                <span className="status-pill">{detail.data.state}</span>
                <h2>
                  {isMatureReview ? messages.moderation.matureReviewTitle : detail.data.targetType}
                </h2>
              </div>
              <strong>{messages.moderation.priority(detail.data.priority)}</strong>
            </div>
            <div className="evidence-panel">
              <strong>{messages.moderation.evidence}</strong>
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
              {detail.data.assignedTo ? messages.moderation.assigned : messages.moderation.assign}
            </button>
            <form
              className="decision-form"
              onSubmit={(event) => {
                event.preventDefault();
                decide.mutate(detail.data.id);
              }}
            >
              <label className="field">
                <span>{messages.moderation.action}</span>
                <select
                  value={action}
                  onChange={(event) => {
                    setAction(event.target.value);
                  }}
                >
                  <option value="NO_ACTION">
                    {isMatureReview
                      ? messages.moderation.approveMature
                      : messages.moderation.noViolation}
                  </option>
                  {!isMatureReview ? (
                    <option value="WARNING">{messages.moderation.warning}</option>
                  ) : null}
                  <option value="CONTENT_HIDE">{messages.moderation.hideContent}</option>
                  <option value="CONTENT_REMOVE">{messages.moderation.removeContent}</option>
                  {!isMatureReview ? (
                    <>
                      <option value="TEMP_RESTRICTION">
                        {messages.moderation.restrictAccount}
                      </option>
                      <option value="ACCOUNT_SUSPEND">{messages.moderation.suspendAccount}</option>
                      <option value="ACCOUNT_BAN">{messages.moderation.banAccount}</option>
                    </>
                  ) : null}
                  <option value="ESCALATE">{messages.moderation.escalate}</option>
                </select>
              </label>
              <label className="field">
                <span>{messages.moderation.rationale}</span>
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
                {messages.moderation.applyDecision}
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
        eyebrow={messages.moderation.eyebrow}
        title={messages.moderation.queueTitle}
        description={messages.moderation.queueDescription}
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
                  {messages.moderation.support}
                </button>
                <button
                  className="compact-button"
                  type="button"
                  onClick={() => {
                    setSection('operations');
                  }}
                >
                  {messages.moderation.system}
                </button>
              </>
            ) : null}
            <label className="compact-filter">
              <span>{messages.moderation.queue}</span>
              <select
                aria-label={messages.moderation.queueStateLabel}
                value={stateFilter}
                onChange={(event) => {
                  setStateFilter(event.target.value);
                }}
              >
                <option value="OPEN">{messages.moderation.stateOpen}</option>
                <option value="TRIAGED">{messages.moderation.stateTriaged}</option>
                <option value="IN_REVIEW">{messages.moderation.stateInReview}</option>
                <option value="APPEALED">{messages.moderation.stateAppealed}</option>
                <option value="RESOLVED">{messages.moderation.stateResolved}</option>
                <option value="CLOSED">{messages.moderation.stateClosed}</option>
              </select>
            </label>
          </div>
        }
      />
      {cases.isPending ? <EmptyState title={messages.moderation.loadingQueue} /> : null}
      {cases.isError ? <ErrorState error={cases.error} retry={() => void cases.refetch()} /> : null}
      {cases.data?.items.length === 0 ? (
        <EmptyState
          title={messages.moderation.emptyQueue}
          text={messages.moderation.emptyQueueText}
        />
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
  const { messages } = useI18n();
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
      notify(messages.support.updated);
    },
  });
  return (
    <div className="view-stack">
      <div className="editor-heading">
        <button type="button" onClick={onBack}>
          {messages.support.backToModeration}
        </button>
        <h1>{messages.support.queueTitle}</h1>
      </div>
      <label className="field">
        <span>{messages.support.status}</span>
        <select
          value={state}
          onChange={(event) => {
            setState(event.target.value as SupportState);
          }}
        >
          <option value="OPEN">{messages.support.filterOpen}</option>
          <option value="IN_REVIEW">{messages.support.filterInReview}</option>
          <option value="RESOLVED">{messages.support.filterResolved}</option>
          <option value="CLOSED">{messages.support.filterClosed}</option>
        </select>
      </label>
      {requests.isPending ? <EmptyState title={messages.support.loadingRequests} /> : null}
      {requests.error ? <InlineError error={requests.error} /> : null}
      {requests.data?.items.length === 0 ? (
        <EmptyState title={messages.support.noRequests} />
      ) : null}
      <div className="list-stack">
        {requests.data?.items.map((item) => (
          <article className="editor-card support-card" key={item.id}>
            <span className="status-pill">{supportStateLabel(item.state, messages)}</span>
            <h2>{item.subject}</h2>
            <p className="meta">{supportCategoryLabel(item.category, messages)}</p>
            <p>{item.message}</p>
            <label className="field">
              <span>{messages.support.responseOrNote}</span>
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
                {messages.support.takeInReview}
              </button>
              <button
                className="primary"
                type="button"
                disabled={update.isPending}
                onClick={() => {
                  update.mutate({ id: item.id, state: 'RESOLVED' });
                }}
              >
                {messages.support.markResolved}
              </button>
            </div>
          </article>
        ))}
      </div>
      {update.error ? <InlineError error={update.error} /> : null}
    </div>
  );
}

function supportCategoryLabel(category: SupportCategory, messages: WebMessages): string {
  return {
    GENERAL: messages.support.categoryGeneral,
    TECHNICAL: messages.support.categoryTechnical,
    PAYMENT: messages.support.categoryPayment,
    SAFETY: messages.support.categorySafety,
    DATA: messages.support.categoryData,
  }[category];
}

function supportStateLabel(state: SupportState, messages: WebMessages): string {
  return {
    OPEN: messages.support.stateOpen,
    IN_REVIEW: messages.support.stateInReview,
    RESOLVED: messages.support.stateResolved,
    CLOSED: messages.support.stateClosed,
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
  const { messages } = useI18n();
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
      notify(messages.operations.flagUpdated);
    },
  });
  return (
    <div className="view-stack">
      <div className="editor-heading">
        <button type="button" onClick={onBack}>
          {messages.operations.backToModeration}
        </button>
        <h1>{messages.operations.title}</h1>
      </div>
      <p className="section-description">{messages.operations.description}</p>
      {dashboard.isPending ? <EmptyState title={messages.operations.loading} /> : null}
      {dashboard.isError ? (
        <ErrorState error={dashboard.error} retry={() => void dashboard.refetch()} />
      ) : null}
      {dashboard.data ? (
        <section className="operations-grid" aria-label={messages.operations.metricsLabel}>
          <Metric label={messages.operations.users} value={dashboard.data.users} />
          <Metric
            label={messages.operations.activeUsers24h}
            value={dashboard.data.activeUsers24h}
          />
          <Metric label={messages.operations.messages24h} value={dashboard.data.messages24h} />
          <Metric label={messages.operations.aiRequests24h} value={dashboard.data.aiRequests24h} />
          <Metric
            label={messages.operations.failedGenerations}
            value={dashboard.data.failedGenerations24h}
          />
          <Metric
            label={messages.operations.aiCost}
            value={`$${formatCredits(dashboard.data.aiCostMicros24h)}`}
          />
          <Metric
            label={messages.operations.paymentFailures}
            value={dashboard.data.paymentFailures24h}
          />
          <Metric
            label={messages.operations.moderationBacklog}
            value={dashboard.data.moderationBacklog}
          />
          <Metric label={messages.operations.jobBacklog} value={dashboard.data.jobBacklog} />
          <Metric
            label={messages.operations.productEvents}
            value={dashboard.data.productEvents24h}
          />
          {Object.entries(dashboard.data.planDistribution)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([planCode, users]) => (
              <Metric key={planCode} label={messages.operations.plan(planCode)} value={users} />
            ))}
        </section>
      ) : null}
      {role === 'OWNER' ? <StaffManagement notify={notify} /> : null}
      {role === 'OWNER' ? <AiSmokePanel notify={notify} /> : null}
      {role === 'OWNER' ? <OwnerBillingConfiguration notify={notify} /> : null}
      {role === 'OWNER' ? (
        <section className="feature-flags-panel">
          <div className="section-heading">
            <div>
              <span className="status-pill">OWNER</span>
              <h2>Feature flags</h2>
            </div>
          </div>
          <p className="section-description">{messages.operations.flagsDescription}</p>
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
                <span>{messages.operations.rollout}</span>
                <input
                  name="rolloutPercent"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={flag.rolloutPercent}
                />
              </label>
              <button className="compact-button" type="submit" disabled={updateFlag.isPending}>
                {messages.operations.save}
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
  const { locale, messages } = useI18n();
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
  const grants = useQuery({
    queryKey: ['admin-billing-user-grants'],
    queryFn: () => apiRequest<ListResponse<OwnerUserGrant>>('/api/v1/admin/billing/user-grants'),
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
      notify(messages.billingAdmin.planSaved);
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
      notify(messages.billingAdmin.packSaved);
    },
  });
  const grantUser = useMutation({
    mutationFn: (body: {
      readonly targetId: string;
      readonly planCode?: string;
      readonly durationDays?: number;
      readonly creditAmountMicros: number;
      readonly reason: string;
      readonly idempotencyKey: string;
    }) =>
      apiRequest<OwnerUserGrant>('/api/v1/admin/billing/user-grants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-billing-user-grants'] }),
        client.invalidateQueries({ queryKey: ['operations-dashboard'] }),
        client.invalidateQueries({ queryKey: ['me'] }),
      ]);
      notify(messages.billingAdmin.grantSaved);
    },
  });
  const revokeGrant = useMutation({
    mutationFn: (grantId: string) =>
      apiRequest(`/api/v1/admin/billing/user-grants/${encodeURIComponent(grantId)}/access`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-billing-user-grants'] }),
        client.invalidateQueries({ queryKey: ['operations-dashboard'] }),
        client.invalidateQueries({ queryKey: ['me'] }),
      ]);
      notify(messages.billingAdmin.grantRevoked);
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
          <h2 id="billing-configuration-title">{messages.billingAdmin.title}</h2>
        </div>
      </div>
      <p className="section-description">{messages.billingAdmin.description}</p>
      {plans.isPending || packs.isPending ? <p>{messages.billingAdmin.loading}</p> : null}
      {plans.error || packs.error ? <InlineError error={plans.error ?? packs.error} /> : null}
      <section className="editor-card" aria-labelledby="owner-user-grant-title">
        <h3 id="owner-user-grant-title">{messages.billingAdmin.userGrants}</h3>
        <p className="section-description">{messages.billingAdmin.userGrantsDescription}</p>
        <form
          className="view-stack"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const planCode = formString(data, 'grantPlanCode');
            const creditUsd = Number(formString(data, 'creditUsd'));
            grantUser.mutate({
              targetId: formString(data, 'targetId'),
              ...(planCode
                ? {
                    planCode,
                    durationDays: Number(formString(data, 'grantDurationDays')),
                  }
                : {}),
              creditAmountMicros: Math.round(creditUsd * 1_000_000),
              reason: formString(data, 'grantReason'),
              idempotencyKey: crypto.randomUUID(),
            });
          }}
        >
          <Field label={messages.billingAdmin.targetId} name="targetId" required />
          <label className="field">
            <span>{messages.billingAdmin.plan}</span>
            <select name="grantPlanCode" defaultValue="">
              <option value="">{messages.billingAdmin.noPlan}</option>
              {(plans.data?.items ?? [])
                .filter((plan) => plan.code !== 'FREE' && plan.active)
                .map((plan) => (
                  <option value={plan.code} key={plan.code}>
                    {plan.displayName}
                  </option>
                ))}
            </select>
          </label>
          <div className="field-row">
            <Field
              label={messages.billingAdmin.days}
              name="grantDurationDays"
              type="number"
              defaultValue="30"
              min={1}
              max={366}
            />
            <Field
              label={messages.billingAdmin.creditsUsd}
              name="creditUsd"
              type="number"
              defaultValue="0"
              min={0}
              max={1000}
              step="0.01"
            />
          </div>
          <Field label={messages.billingAdmin.reason} name="grantReason" required />
          <button className="compact-primary" type="submit" disabled={grantUser.isPending}>
            {messages.billingAdmin.grant}
          </button>
          <InlineError error={grantUser.error} />
        </form>
        <h4>{messages.billingAdmin.recentGrants}</h4>
        {grants.isPending ? <p>{messages.billingAdmin.loading}</p> : null}
        {grants.data?.items.length === 0 ? <p>{messages.billingAdmin.noGrants}</p> : null}
        <div className="list-stack">
          {grants.data?.items.map((grant) => (
            <article className="moderation-card" key={grant.id}>
              <strong>{grant.target.displayName}</strong>
              <span>
                {grant.target.id} · Telegram {grant.target.telegramId}
              </span>
              <span>
                {grant.planCode ?? messages.billingAdmin.noPlan} · $
                {formatCredits(grant.creditAmountMicros)}
              </span>
              {grant.accessExpiresAt ? (
                <span>
                  {grant.accessRevokedAt
                    ? messages.billingAdmin.revoked
                    : `${messages.billingAdmin.activeUntil} ${new Date(grant.accessExpiresAt).toLocaleDateString(locale)}`}
                </span>
              ) : null}
              <small>{grant.reason}</small>
              {grant.accessExpiresAt && !grant.accessRevokedAt ? (
                <button
                  className="compact-button danger"
                  type="button"
                  disabled={revokeGrant.isPending}
                  onClick={() => {
                    if (window.confirm(`${messages.billingAdmin.revokeAccess}?`)) {
                      revokeGrant.mutate(grant.id);
                    }
                  }}
                >
                  {messages.billingAdmin.revokeAccess}
                </button>
              ) : null}
            </article>
          ))}
        </div>
        <InlineError error={grants.error ?? revokeGrant.error} />
      </section>
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
            <Field
              label={messages.billingAdmin.name}
              name="displayName"
              defaultValue={plan.displayName}
              required
            />
            <div className="field-row">
              <Field
                label={messages.billingAdmin.rank}
                name="rank"
                type="number"
                defaultValue={String(plan.rank)}
              />
              <Field
                label={messages.billingAdmin.limitMultiplier}
                name="rateLimitMultiplier"
                type="number"
                defaultValue={String(plan.entitlements.rateLimitMultiplier)}
              />
            </div>
            <div className="field-row">
              <Field
                label={messages.billingAdmin.characters}
                name="characterLimit"
                type="number"
                defaultValue={String(plan.entitlements.characterLimit)}
              />
              <Field
                label={messages.billingAdmin.personas}
                name="personaLimit"
                type="number"
                defaultValue={String(plan.entitlements.personaLimit)}
              />
            </div>
            <div className="field-row">
              <Field
                label={messages.billingAdmin.memoryTokens}
                name="memoryTokenBudget"
                type="number"
                defaultValue={String(plan.entitlements.memoryTokenBudget)}
              />
              <Field
                label={messages.billingAdmin.loreTokens}
                name="loreTokenBudget"
                type="number"
                defaultValue={String(plan.entitlements.loreTokenBudget)}
              />
            </div>
            <Field
              label={messages.billingAdmin.advancedDaily}
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
                <input type="checkbox" name="active" defaultChecked={plan.active} />{' '}
                {messages.billingAdmin.active}
              </label>
            </div>
            <button className="compact-primary" type="submit" disabled={savePlan.isPending}>
              {messages.billingAdmin.savePlan}
            </button>
          </form>
        ))}
      </div>
      <h3>{messages.billingAdmin.accessPacks}</h3>
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
          <h4>{pack ? pack.code : messages.billingAdmin.newPack}</h4>
          {!pack ? <Field label={messages.billingAdmin.code} name="code" required /> : null}
          <Field
            label={messages.billingAdmin.name}
            name="displayName"
            defaultValue={pack?.displayName}
            required
          />
          <Field
            label={messages.billingAdmin.descriptionLabel}
            name="description"
            defaultValue={pack?.description}
            required
          />
          <div className="field-row">
            <Field
              label="Stars"
              name="starsAmount"
              type="number"
              defaultValue={String(pack?.starsAmount ?? 1)}
            />
            <Field
              label={messages.billingAdmin.days}
              name="durationDays"
              type="number"
              defaultValue={String(pack?.durationDays ?? 30)}
            />
          </div>
          <Select
            label={messages.billingAdmin.plan}
            name="planCode"
            defaultValue={pack?.planCode ?? 'PLUS'}
            options={(plans.data?.items ?? [])
              .filter((plan) => plan.code !== 'FREE')
              .map((plan) => [plan.code, plan.displayName] as const)}
          />
          <Field
            label={messages.billingAdmin.order}
            name="sortOrder"
            type="number"
            defaultValue={String(pack?.sortOrder ?? index)}
          />
          <label className="terms-check">
            <input type="checkbox" name="active" defaultChecked={pack?.active ?? false} />{' '}
            {messages.billingAdmin.active}
          </label>
          <button className="compact-primary" type="submit" disabled={savePack.isPending}>
            {pack ? messages.billingAdmin.savePack : messages.billingAdmin.createPack}
          </button>
        </form>
      ))}
      <InlineError error={savePlan.error ?? savePack.error} />
    </section>
  );
}

function AiSmokePanel({ notify }: { readonly notify: (message: string | null) => void }) {
  const { messages } = useI18n();
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
        result.run.alreadyAttempted ? messages.aiAdmin.alreadyRun : messages.aiAdmin.completed,
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
          <h2 id="ai-smoke-title">{messages.aiAdmin.title}</h2>
        </div>
      </div>
      <p className="section-description">{messages.aiAdmin.description}</p>
      <p className="section-description">
        {messages.aiAdmin.availableModels}{' '}
        {capabilities && capabilities.availableCandidates.length > 0
          ? capabilities.availableCandidates.join(', ')
          : messages.aiAdmin.capabilityPending}
      </p>
      {!v3ModelAvailable && !result ? (
        <p className="memory-warning" role="status">
          {messages.aiAdmin.unavailable}
        </p>
      ) : null}
      {smoke.isPending ? <p className="section-description">{messages.aiAdmin.checking}</p> : null}
      {!smoke.isPending && !result ? (
        <>
          <p>{messages.aiAdmin.neverRun}</p>
          <label className="ai-smoke-consent">
            <input
              type="checkbox"
              checked={consented}
              disabled={!v3ModelAvailable}
              onChange={(event) => {
                setConsented(event.currentTarget.checked);
              }}
            />
            <span>{messages.aiAdmin.consent}</span>
          </label>
          <button
            type="button"
            disabled={!v3ModelAvailable || !consented || run.isPending}
            onClick={() => {
              run.mutate();
            }}
          >
            {run.isPending ? messages.aiAdmin.running : messages.aiAdmin.run}
          </button>
        </>
      ) : null}
      {result ? (
        <div className="ai-smoke-result" aria-live="polite">
          <strong>{result.state}</strong>
          <span>
            {result.model} · {messages.aiAdmin.tokenUsage(result.inputTokens, result.outputTokens)}
          </span>
          <span>
            {messages.aiAdmin.protocol}: {result.protocolVariant} · HTTP{' '}
            {result.httpStatus ?? messages.aiAdmin.noResponse}
          </span>
          <span>
            Provider: ${(result.providerReportedCostMicros / 1_000_000).toFixed(6)} ·{' '}
            {messages.aiAdmin.reserve}: ${(result.conservativeCostMicros / 1_000_000).toFixed(6)}
          </span>
          {result.output ? <blockquote>{result.output}</blockquote> : null}
          {result.errorCode ? (
            <span>
              {messages.aiAdmin.errorCode}: {result.errorCode}
            </span>
          ) : null}
        </div>
      ) : null}
      {previousRuns.length > 0 ? (
        <details>
          <summary>{messages.aiAdmin.previousRuns}</summary>
          {previousRuns.map((item) => (
            <div className="ai-smoke-result" key={item.runKey}>
              <strong>
                {item.runKey} · {item.state}
              </strong>
              <span>
                {item.errorCode ?? messages.aiAdmin.noError} · HTTP{' '}
                {item.httpStatus ?? messages.aiAdmin.notRecorded} · {item.latencyMs ?? 0}{' '}
                {messages.aiAdmin.milliseconds}
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
  const { messages } = useI18n();
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
      notify(messages.staff.assigned);
    },
  });
  const revoke = useMutation({
    mutationFn: (targetTelegramId: string) =>
      apiRequest(`/api/v1/admin/staff/${encodeURIComponent(targetTelegramId)}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['admin-staff'] });
      notify(messages.staff.revoked);
    },
  });
  return (
    <section className="feature-flags-panel" aria-labelledby="staff-title">
      <div className="section-heading">
        <div>
          <span className="status-pill">OWNER</span>
          <h2 id="staff-title">{messages.staff.title}</h2>
        </div>
      </div>
      <p className="section-description">{messages.staff.description}</p>
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
          <span>{messages.staff.role}</span>
          <select
            value={role}
            onChange={(event) => {
              setRole(event.target.value as 'MODERATOR' | 'SENIOR_MODERATOR');
            }}
          >
            <option value="MODERATOR">{messages.staff.moderator}</option>
            <option value="SENIOR_MODERATOR">{messages.staff.seniorModerator}</option>
          </select>
        </label>
        <button className="compact-primary" type="submit" disabled={assign.isPending}>
          {messages.staff.assign}
        </button>
        <InlineError error={assign.error} />
      </form>
      {staff.isPending ? <EmptyState title={messages.staff.loading} /> : null}
      {staff.isError ? <ErrorState error={staff.error} retry={() => void staff.refetch()} /> : null}
      <div className="list-stack">
        {staff.data?.items.map((member) => (
          <article className="moderation-case-card" key={member.id}>
            <span>
              <strong>{member.displayName}</strong>
              <small>
                {member.telegramId} {member.username ? `@${member.username}` : ''} ·{' '}
                {member.role === 'SENIOR_MODERATOR'
                  ? messages.staff.seniorModeratorLower
                  : messages.staff.moderatorLower}
              </small>
            </span>
            <button
              className="compact-button"
              type="button"
              disabled={revoke.isPending}
              onClick={() => {
                if (window.confirm(messages.staff.revokeConfirmation(member.displayName))) {
                  revoke.mutate(member.telegramId);
                }
              }}
            >
              {messages.staff.revoke}
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
  const { messages } = useI18n();
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
      notify(messages.personas.removed);
    },
  });
  const makeDefault = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/v1/personas/${id}/default`, { method: 'POST' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['personas'] });
      notify(messages.personas.defaultChanged);
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
        eyebrow={messages.personas.eyebrow}
        title={messages.personas.title}
        description={messages.personas.description}
        action={
          <button
            className="compact-primary"
            type="button"
            onClick={() => {
              setEditing('new');
            }}
          >
            {messages.personas.create}
          </button>
        }
      />
      {personas.isError ? (
        <ErrorState error={personas.error} retry={() => void personas.refetch()} />
      ) : null}
      {personas.data?.items.length === 0 ? (
        <EmptyState title={messages.personas.emptyTitle} text={messages.personas.emptyText} />
      ) : null}
      <div className="list-stack">
        {personas.data?.items.map((persona) => (
          <article className="list-card" key={persona.id}>
            <Avatar name={persona.name} fileId={persona.avatarFileId} />
            <div className="list-copy">
              <h2>{persona.name}</h2>
              <p>{persona.shortDescription || messages.personas.noDescription}</p>
              <div className="tag-list">
                <span>
                  {persona.visibility === 'PUBLIC'
                    ? messages.personas.public
                    : messages.personas.private}
                </span>
                {persona.isDefault ? <span>{messages.personas.default}</span> : null}
              </div>
            </div>
            <div className="card-actions">
              <button
                type="button"
                onClick={() => {
                  setEditing(persona);
                }}
              >
                {messages.personas.edit}
              </button>
              {!persona.isDefault ? (
                <button
                  type="button"
                  onClick={() => {
                    makeDefault.mutate(persona.id);
                  }}
                >
                  {messages.personas.makeDefault}
                </button>
              ) : null}
              <button
                className="danger-link"
                type="button"
                onClick={() => {
                  if (window.confirm(messages.personas.removeConfirm(persona.name)))
                    remove.mutate(persona.id);
                }}
              >
                {messages.personas.remove}
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
  const { messages } = useI18n();
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
      notify(existing ? messages.personas.saved : messages.personas.created);
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
      title={existing ? messages.personas.editTitle : messages.personas.newTitle}
      onCancel={onClose}
      onSubmit={submit}
      pending={save.isPending}
      error={save.error}
    >
      <Field
        label={messages.personas.name}
        name="name"
        defaultValue={existing?.name}
        required
        maxLength={80}
      />
      <Field
        label={messages.personas.shortDescription}
        name="shortDescription"
        defaultValue={existing?.shortDescription}
        maxLength={280}
      />
      <TextArea
        label={messages.personas.longDescription}
        name="longDescription"
        defaultValue={existing?.longDescription}
      />
      <TextArea
        label={messages.personas.personality}
        name="personality"
        defaultValue={existing?.personality}
      />
      <TextArea
        label={messages.personas.appearance}
        name="appearance"
        defaultValue={existing?.appearance}
      />
      <TextArea
        label={messages.personas.speakingStyle}
        name="speakingStyle"
        defaultValue={existing?.speakingStyle}
      />
      <TextArea
        label={messages.personas.background}
        name="background"
        defaultValue={existing?.background}
      />
      <Field
        label={messages.personas.pronouns}
        name="pronouns"
        defaultValue={existing?.pronouns}
        maxLength={80}
      />
      <Field
        label={messages.personas.representedAge}
        name="representedAge"
        defaultValue={existing?.representedAge ?? ''}
        maxLength={80}
      />
      <TextArea
        label={messages.personas.customNotes}
        name="customNotes"
        defaultValue={existing?.customNotes}
      />
      <Select
        label={messages.personas.visibility}
        name="visibility"
        defaultValue={existing?.visibility ?? 'PRIVATE'}
        options={[
          ['PRIVATE', messages.personas.onlyMe],
          ['PUBLIC', messages.personas.public],
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
  const { messages } = useI18n();
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
            ? messages.characters.matureReviewPending
            : messages.characters.published
          : messages.characters.done,
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
        eyebrow={messages.characters.eyebrow}
        title={messages.characters.title}
        description={messages.characters.description}
        action={
          <div className="header-actions">
            <button className="secondary compact-button" type="button" onClick={onOpenLorebooks}>
              {messages.characters.lorebooks}
            </button>
            <button
              className="compact-primary"
              type="button"
              onClick={() => {
                setEditing('new');
              }}
            >
              {messages.characters.create}
            </button>
          </div>
        }
      />
      {characters.isError ? (
        <ErrorState error={characters.error} retry={() => void characters.refetch()} />
      ) : null}
      <InlineError error={preview.error} />
      {stats.data ? (
        <section className="creator-stats" aria-label={messages.characters.creatorStats}>
          <span>
            <strong>{stats.data.chatsStarted}</strong> {messages.characters.chatsStarted}
          </span>
          <span>
            <strong>{stats.data.likes}</strong> {messages.characters.likes}
          </span>
          <span>
            <strong>{stats.data.bookmarks}</strong> {messages.characters.bookmarks}
          </span>
          <span>
            <strong>{stats.data.averageRating?.toFixed(1) ?? '—'}</strong>{' '}
            {messages.characters.rating}
          </span>
        </section>
      ) : null}
      {characters.data?.items.length === 0 ? (
        <EmptyState title={messages.characters.emptyTitle} text={messages.characters.emptyText} />
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
                    ? messages.characters.statePublished
                    : character.publishState === 'MODERATION_PENDING'
                      ? messages.characters.statePending
                      : character.publishState === 'HIDDEN' || character.publishState === 'REJECTED'
                        ? messages.characters.stateHidden
                        : messages.characters.stateDraft}
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
                  ? messages.characters.openingPreview
                  : messages.characters.previewChat}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(character);
                }}
              >
                {messages.characters.edit}
              </button>
              {character.publishState === 'PUBLISHED' ||
              character.publishState === 'MODERATION_PENDING' ? (
                <button
                  type="button"
                  onClick={() => {
                    action.mutate({ id: character.id, command: 'unpublish' });
                  }}
                >
                  {character.publishState === 'MODERATION_PENDING'
                    ? messages.characters.cancelReview
                    : messages.characters.unpublish}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    action.mutate({ id: character.id, command: 'publish' });
                  }}
                >
                  {messages.characters.publish}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  action.mutate({ id: character.id, command: 'duplicate' });
                }}
              >
                {messages.characters.duplicate}
              </button>
              <button
                className="danger-link"
                type="button"
                onClick={() => {
                  if (window.confirm(messages.characters.removeConfirm(character.name)))
                    action.mutate({ id: character.id, command: 'delete' });
                }}
              >
                {messages.characters.remove}
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
  const { messages } = useI18n();
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
  const [previewName, setPreviewName] = useState(
    existing?.name ?? messages.characters.characterFallback,
  );
  const [previewGreeting, setPreviewGreeting] = useState(
    existing?.firstMessage ?? messages.characters.greetingFallback,
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
      const normalized = error instanceof Error ? error : new Error(messages.characters.saveFailed);
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
      notify(createdInitially ? messages.characters.created : messages.characters.versionSaved);
      onClose();
    }
  };
  return (
    <Editor
      title={existing ? messages.characters.editorTitle : messages.characters.newTitle}
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
            ? messages.characters.saving
            : saveState === 'SAVED'
              ? messages.characters.saved
              : saveState === 'FAILED'
                ? messages.characters.failed
                : saveState === 'INCOMPLETE'
                  ? messages.characters.incomplete
                  : messages.characters.dirty}
        </span>
      }
    >
      <fieldset className="editor-section">
        <legend>{messages.characters.basics}</legend>
        <Field
          label={messages.characters.name}
          name="name"
          defaultValue={existing?.name}
          required
          maxLength={100}
          onChange={(value) => {
            setPreviewName(value || messages.characters.characterFallback);
          }}
        />
        <Field
          label={messages.characters.tagline}
          name="tagline"
          defaultValue={existing?.tagline}
          required
          maxLength={180}
        />
        <TextArea
          label={messages.characters.descriptionField}
          name="description"
          defaultValue={existing?.description}
          required
          minLength={20}
        />
      </fieldset>
      <fieldset className="editor-section">
        <legend>{messages.characters.personalitySection}</legend>
        <TextArea
          label={messages.characters.personalityField}
          name="personality"
          defaultValue={existing?.personality}
          required
          minLength={20}
        />
        <TextArea
          label={messages.characters.speechStyle}
          name="speechStyle"
          defaultValue={existing?.speechStyle}
        />
      </fieldset>
      <fieldset className="editor-section">
        <legend>{messages.characters.scenarioSection}</legend>
        <TextArea
          label={messages.characters.scenario}
          name="scenario"
          defaultValue={existing?.scenario}
        />
        <TextArea label={messages.characters.goals} name="goals" defaultValue={existing?.goals} />
        <TextArea
          label={messages.characters.behaviourRules}
          name="behaviourRules"
          defaultValue={existing?.behaviourRules}
        />
      </fieldset>
      <fieldset className="editor-section">
        <legend>{messages.characters.firstMessageSection}</legend>
        <TextArea
          label={messages.characters.firstMessage}
          name="firstMessage"
          defaultValue={existing?.firstMessage}
          required
          maxLength={16_000}
          onChange={setPreviewGreeting}
        />
        <TextArea
          label={messages.characters.alternateGreetings}
          name="alternateGreetings"
          defaultValue={existing?.alternateGreetings.join('\n---\n')}
          placeholder={messages.characters.alternateGreetingsHint}
        />
        <section className="template-preview" aria-label={messages.characters.greetingPreview}>
          <span>{messages.characters.greetingPreviewCaption}</span>
          <strong>{previewName}</strong>
          <p>
            {renderTemplate(previewGreeting, {
              char: previewName,
              user: messages.characters.userPersonaFallback,
              persona: messages.characters.userPersonaFallback,
              scenario: '',
              description: '',
              memory: '',
            }).value || messages.characters.emptyGreeting}
          </p>
        </section>
      </fieldset>
      <fieldset className="editor-section">
        <legend>{messages.characters.examples}</legend>
        <p>{messages.characters.templateSafety}</p>
        <TextArea
          label={messages.characters.exampleDialogues}
          name="exampleDialogues"
          defaultValue={existing?.exampleDialogues}
          placeholder={messages.characters.examplePlaceholder}
        />
      </fieldset>
      <fieldset className="editor-section">
        <legend>{messages.characters.instructions}</legend>
        <TextArea
          label={messages.characters.creatorInstructions}
          name="systemInstructions"
          defaultValue={existing?.systemInstructions}
        />
        <TextArea
          label={messages.characters.postHistoryInstructions}
          name="postHistoryInstructions"
          defaultValue={existing?.postHistoryInstructions}
        />
        <TextArea
          label={messages.characters.creatorNotes}
          name="creatorNotes"
          defaultValue={existing?.creatorNotes}
        />
      </fieldset>
      <fieldset className="editor-section">
        <legend>{messages.characters.lore}</legend>
        <p>{messages.characters.loreHint}</p>
      </fieldset>
      <fieldset className="editor-section">
        <legend>{messages.characters.appearanceSection}</legend>
        <TextArea
          label={messages.characters.appearance}
          name="appearance"
          defaultValue={existing?.appearance}
        />
        <TextArea
          label={messages.characters.background}
          name="background"
          defaultValue={existing?.background}
        />
      </fieldset>
      <fieldset className="editor-section">
        <legend>{messages.characters.publication}</legend>
        <Field
          label={messages.characters.tags}
          name="tags"
          defaultValue={existing?.tags.join(', ')}
        />
        <div className="field-row">
          <Select
            label={messages.characters.language}
            name="language"
            defaultValue={existing?.language ?? 'ru'}
            options={[
              ['ru', messages.characters.russian],
              ['en', messages.characters.english],
            ]}
          />
          <Select
            label={messages.characters.contentRating}
            name="contentRating"
            defaultValue={existing?.contentRating ?? 'SAFE'}
            options={[
              ['SAFE', messages.characters.safe],
              ['MATURE', messages.characters.mature],
            ]}
          />
        </div>
        {!autosaveEnabled ? <p className="meta">{messages.characters.manualSaveHint}</p> : null}
      </fieldset>
    </Editor>
  );
}

function SettingsView({
  account,
  notify,
  onLocaleChange,
}: {
  readonly account: MeResponse;
  readonly notify: (message: string | null) => void;
  readonly onLocaleChange: (locale: Locale) => void;
}) {
  const { locale, messages } = useI18n();
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
      onLocaleChange(result.locale);
      notify(getWebMessages(result.locale).settings.saved);
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
      notify(messages.support.created);
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
      notify(messages.dataControls.deletionRequested);
    },
  });
  const cancelDeletion = useMutation({
    mutationFn: () => apiRequest('/api/v1/data-controls/account-deletion', { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['data-controls'] });
      notify(messages.dataControls.deletionCancelled);
    },
  });
  const unblock = useMutation({
    mutationFn: (userId: string) => apiRequest(`/api/v1/blocks/${userId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['blocks'] }),
        client.invalidateQueries({ queryKey: ['discovery'] }),
      ]);
      notify(messages.dataControls.userUnblocked);
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
  if (settings.isPending) return <EmptyState title={messages.settings.loading} />;
  if (settings.isError)
    return <ErrorState error={settings.error} retry={() => void settings.refetch()} />;
  return (
    <div className="view-stack">
      <ViewHeader
        eyebrow={messages.settings.eyebrow}
        title={messages.settings.title}
        description={messages.settings.description}
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
          label={messages.settings.theme}
          name="theme"
          defaultValue={settings.data.theme}
          options={[
            ['dark', messages.settings.dark],
            ['amoled', messages.settings.amoled],
            ['light', messages.settings.light],
          ]}
        />
        <Select
          label={messages.settings.language}
          name="locale"
          defaultValue={settings.data.locale}
          options={[
            ['ru', messages.settings.russian],
            ['en', messages.settings.english],
          ]}
        />
        <Select
          label={messages.settings.generationMode}
          name="generationProfile"
          defaultValue={settings.data.generationProfile}
          options={(
            [
              ['BALANCED', messages.settings.balanced],
              ['CREATIVE', messages.settings.creative],
              ['PREMIUM', messages.settings.premium],
            ] as const
          ).filter(([code]) => account.planEntitlements.modelProfiles.includes(code))}
        />
        <div className="budget-note">
          <strong>{messages.settings.prepaidTitle}</strong>
          <p>{messages.settings.prepaidText}</p>
        </div>
        {save.error ? <InlineError error={save.error} /> : null}
        <button className="primary" type="submit" disabled={save.isPending}>
          {messages.settings.save}
        </button>
      </form>
      <section className="editor-card account-controls" aria-labelledby="support-title">
        <div>
          <p className="eyebrow">{messages.support.eyebrow}</p>
          <h2 id="support-title">{messages.support.title}</h2>
          <p className="meta">{messages.support.privacyNote}</p>
        </div>
        <form
          className="view-stack"
          onSubmit={(event) => {
            event.preventDefault();
            createSupportRequest.mutate();
          }}
        >
          <label className="field">
            <span>{messages.support.category}</span>
            <select
              name="supportCategory"
              value={supportCategory}
              onChange={(event) => {
                setSupportCategory(event.target.value as SupportCategory);
              }}
            >
              <option value="GENERAL">{messages.support.categoryGeneral}</option>
              <option value="TECHNICAL">{messages.support.categoryTechnical}</option>
              <option value="PAYMENT">{messages.support.categoryPayment}</option>
              <option value="SAFETY">{messages.support.categorySafety}</option>
              <option value="DATA">{messages.support.categoryData}</option>
            </select>
          </label>
          <label className="field">
            <span>{messages.support.subject}</span>
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
            <span>{messages.support.message}</span>
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
            {createSupportRequest.isPending ? messages.support.sending : messages.support.send}
          </button>
          {createSupportRequest.error ? <InlineError error={createSupportRequest.error} /> : null}
        </form>
        <div className="list-stack" aria-label={messages.support.myRequests}>
          {supportRequests.data?.items.map((item) => (
            <article className="support-card" key={item.id}>
              <span className="status-pill">{supportStateLabel(item.state, messages)}</span>
              <strong>{item.subject}</strong>
              <p>{item.message}</p>
              {item.resolutionNote ? (
                <p className="meta">{messages.support.response(item.resolutionNote)}</p>
              ) : null}
            </article>
          ))}
        </div>
        {supportRequests.error ? <InlineError error={supportRequests.error} /> : null}
      </section>

      <section className="editor-card account-controls" aria-labelledby="legal-title">
        <div>
          <p className="eyebrow">{messages.legal.eyebrow}</p>
          <h2 id="legal-title">{messages.legal.title}</h2>
        </div>
        <details>
          <summary>{messages.legal.termsTitle}</summary>
          <p>{messages.legal.terms}</p>
        </details>
        <details>
          <summary>{messages.legal.privacyTitle}</summary>
          <p>{messages.legal.privacy}</p>
        </details>
        <p className="meta">{messages.legal.revision}</p>
      </section>
      <section className="editor-card account-controls" aria-labelledby="data-controls-title">
        <div>
          <p className="eyebrow">{messages.dataControls.eyebrow}</p>
          <h2 id="data-controls-title">{messages.dataControls.title}</h2>
          <p className="meta">
            {messages.dataControls.accountSummary(
              account.plan,
              formatCredits(account.creditBalanceMicros, locale),
            )}
          </p>
        </div>
        {dataControls.isPending ? <p className="meta">{messages.dataControls.loading}</p> : null}
        {dataControls.error ? <InlineError error={dataControls.error} /> : null}
        {dataControls.data ? (
          <div className="export-summary">
            <span>
              {messages.dataControls.conversations(dataControls.data.export.counts.conversations)}
            </span>
            <span>
              {messages.dataControls.characters(dataControls.data.export.counts.characters)}
            </span>
            <span>
              {messages.dataControls.lorebooks(dataControls.data.export.counts.lorebooks)}
            </span>
            <span>
              {messages.dataControls.supportRequests(
                dataControls.data.export.counts.supportRequests,
              )}
            </span>
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
            {exportData.isPending
              ? messages.dataControls.preparing
              : messages.dataControls.download}
          </button>
        </div>
        {exportData.error ? <InlineError error={exportData.error} /> : null}
        <p className="meta">{messages.dataControls.exportHint}</p>
      </section>

      <section className="editor-card account-controls" aria-labelledby="blocks-title">
        <div>
          <p className="eyebrow">{messages.dataControls.privacyEyebrow}</p>
          <h2 id="blocks-title">{messages.dataControls.blockedTitle}</h2>
        </div>
        {blocks.isPending ? <p className="meta">{messages.dataControls.blockedLoading}</p> : null}
        {blocks.error ? <InlineError error={blocks.error} /> : null}
        {blocks.data?.items.length === 0 ? (
          <p className="meta">{messages.dataControls.noBlockedUsers}</p>
        ) : null}
        <div className="blocked-list">
          {blocks.data?.items.map((user) => (
            <article key={user.userId}>
              <div>
                <strong>{user.displayName}</strong>
                <small>
                  {user.username ? `@${user.username}` : messages.dataControls.noUsername}
                </small>
              </div>
              <button
                type="button"
                disabled={unblock.isPending}
                onClick={() => {
                  unblock.mutate(user.userId);
                }}
              >
                {messages.dataControls.unblock}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="editor-card deletion-zone" aria-labelledby="deletion-title">
        <div>
          <p className="eyebrow">{messages.dataControls.dangerEyebrow}</p>
          <h2 id="deletion-title">{messages.dataControls.deletionTitle}</h2>
        </div>
        {dataControls.data?.deletion?.state === 'PENDING' ? (
          <>
            <p>
              {messages.dataControls.deletionScheduled(
                new Date(dataControls.data.deletion.executeAfter).toLocaleString(
                  locale === 'ru' ? 'ru-RU' : 'en-US',
                ),
              )}{' '}
              {messages.dataControls.deletionMayCancel}
            </p>
            <button
              className="secondary"
              type="button"
              disabled={cancelDeletion.isPending}
              onClick={() => {
                cancelDeletion.mutate();
              }}
            >
              {messages.dataControls.cancelDeletion}
            </button>
          </>
        ) : (
          <>
            <p>{messages.dataControls.deletionWarning}</p>
            {account.role === 'OWNER' ? (
              <p className="warning-copy">{messages.dataControls.ownerWarning}</p>
            ) : (
              <button
                className="danger-text"
                type="button"
                onClick={() => {
                  setShowDeletionDialog(true);
                }}
              >
                {messages.dataControls.requestDeletion}
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
            <h2 id="confirm-deletion-title">{messages.dataControls.confirmTitle}</h2>
            <p>
              {messages.dataControls.confirmText} {messages.dataControls.confirmationInstruction}{' '}
              <strong>{messages.dataControls.confirmationWord}</strong>.
            </p>
            <label className="field">
              <span>{messages.dataControls.confirmation}</span>
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
                {messages.dataControls.cancel}
              </button>
              <button
                className="danger"
                type="button"
                disabled={
                  deletionConfirmation !== messages.dataControls.confirmationWord ||
                  requestDeletion.isPending
                }
                onClick={() => {
                  requestDeletion.mutate();
                }}
              >
                {messages.dataControls.scheduleDeletion}
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
  const { messages } = useI18n();
  return (
    <div className="error-panel" role="alert">
      <strong>{messages.common.sectionLoadFailed}</strong>
      <p>{localizedErrorMessage(error, messages)}</p>
      <button type="button" onClick={retry}>
        {messages.common.retry}
      </button>
    </div>
  );
}
function InlineError({ error }: { readonly error: Error | null }) {
  const { messages } = useI18n();
  return error ? (
    <p className="error" role="alert">
      {localizedErrorMessage(error, messages)}
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
  const { messages } = useI18n();
  return (
    <div className="view-stack">
      <div className="editor-heading">
        <button type="button" onClick={onCancel}>
          {messages.common.back}
        </button>
        <h1>{title}</h1>
      </div>
      <form className="editor-card" ref={formRef} onInput={onInput} onSubmit={onSubmit}>
        {status}
        {children}
        <InlineError error={error} />
        <div className="editor-actions">
          <button className="secondary" type="button" onClick={onCancel}>
            {messages.common.cancel}
          </button>
          <button className="primary" type="submit" disabled={pending}>
            {pending ? messages.common.saving : messages.common.save}
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
  readonly min?: number;
  readonly max?: number;
  readonly step?: number | string;
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
