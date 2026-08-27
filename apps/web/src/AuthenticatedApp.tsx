import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { renderTemplate } from '@velora/prompts';
import { characterGroupSizes, characterLanguages, ru } from '@velora/shared';
import { apiRequest } from './api';
import {
  calculateCharacterPromptMetrics,
  characterPromptValuesFromForm,
} from './character-metrics';
import { allowsCharacterAutosave, pendingAutosaveState } from './character-autosave';
import {
  CharacterImage,
  classifyCharacterImageGeometry,
  type CharacterImageGeometry,
} from './CharacterImage';
import {
  AppShell,
  BottomNavigation,
  Checkbox,
  Dialog,
  EmptyState,
  ErrorState,
  FilterButton,
  FormField,
  GreetingMessage,
  SearchBar,
  SegmentedControl,
  SideDrawer,
  Skeleton,
  Switch,
  Toast,
  TopBar,
  TextAreaField,
} from './CoreComponents';
import { localizedErrorMessage } from './error-localization';
import { parseDiscoveryUrlState, writeDiscoveryUrlState } from './discovery-url-state';
import {
  parseLibraryUrlState,
  writeLibraryUrlState,
  type CharacterKind,
  type CharacterVisibility,
  type LibrarySort,
} from './library-url-state';
import { ImageUploadControl } from './ImageUploadControl';
import { BrandMark } from './BrandMark';
import { getNotificationMessages } from './notification-i18n';
import {
  ActionMenu,
  Dropdown,
  FilterSheet,
  LocaleButton,
  PersonaCard,
  PlanCard,
  PlanCarousel,
  SortDropdown,
  type DiscoveryFilters,
  type DiscoveryGroupSizeOption,
  type DiscoveryLanguageOption,
  type DiscoveryTagOption,
} from './ProductComponents';
import { getWebMessages, useI18n, type Locale, type WebMessages } from './i18n';
import { openTelegramInvoice, type InvoiceStatus } from './telegram';
import { useTelegramBackButton } from './telegram-back-button';
import { VeloraIcon, type VeloraIconName } from './VeloraIcon';
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
  MediaLibraryResponse,
  ModerationCaseDetail,
  ModerationCaseSummary,
  PaymentHistoryItem,
  PaymentInvoice,
  PlanCatalog,
  PlanDefinition,
  Persona,
  PublicFeatureFlags,
  OperationsDashboard,
  NotificationList,
  OwnerPayment,
  OwnerUserGrant,
  RoleplayModelEvalCatalogItem,
  RoleplayModelEvalRun,
  RoleplayModelControls,
  Settings,
  StaffAssignment,
  SupportCategory,
  SupportRequest,
  SupportState,
  UserProfile,
  UserNotification,
} from './types';

const Field = FormField;
const TextArea = TextAreaField;

const ChatsView = lazy(async () => {
  const module = await import('./ChatsView');
  return { default: module.ChatsView };
});

const LorebooksView = lazy(async () => {
  const module = await import('./LorebooksView');
  return { default: module.LorebooksView };
});

const CreateHubView = lazy(async () => {
  const module = await import('./CreateHubView');
  return { default: module.CreateHubView };
});

const ModerationDirectoryView = lazy(async () => {
  const module = await import('./ModerationDirectoryView');
  return { default: module.ModerationDirectoryView };
});

const RoleplayBenchmarkPanel = lazy(async () => {
  const module = await import('./RoleplayBenchmarkPanel');
  return { default: module.RoleplayBenchmarkPanel };
});

const SafeMarkdown = lazy(async () => {
  const module = await import('./SafeMarkdown');
  return { default: module.SafeMarkdown };
});

type Tab =
  | 'discover'
  | 'create'
  | 'chats'
  | 'characters'
  | 'lorebooks'
  | 'personas'
  | 'billing'
  | 'settings'
  | 'profile'
  | 'moderation';

type SettingsSectionId = 'support-title' | 'legal-title' | 'blocks-title';

interface ListResponse<T> {
  readonly items: readonly T[];
}
interface DiscoveryResponse extends ListResponse<DiscoveryCharacter> {
  readonly nextCursor: string | null;
  readonly totalCount: number;
  readonly contentPreferences: {
    readonly safeSearch: boolean;
    readonly matureImageBlur: boolean;
  };
}

type DiscoveryTagResponse = ListResponse<DiscoveryTagOption>;
type DiscoveryLanguageResponse = ListResponse<DiscoveryLanguageOption>;
interface DiscoveryGroupSizeResponse extends ListResponse<DiscoveryGroupSizeOption> {
  readonly enabled: boolean;
}

interface PublicConfigResponse {
  readonly telegramBotUsername: string;
}

export function characterIdFromLaunchSearch(search: string): string | null {
  const parameters = new URLSearchParams(search);
  const directCharacterId = parameters.get('character')?.trim();
  if (directCharacterId) return directCharacterId;
  const startParameter = parameters.get('tgWebAppStartParam')?.trim();
  if (!startParameter?.startsWith('character_')) return null;
  const characterId = startParameter.slice('character_'.length);
  return characterId === '' ? null : characterId;
}

export function telegramCharacterShareUrl(botUsername: string, characterId: string): string {
  const normalizedUsername = botUsername.trim().replace(/^@/u, '');
  return `https://t.me/${normalizedUsername}?startapp=${encodeURIComponent(`character_${characterId}`)}`;
}

export function telegramAvatarBotGroupUrl(botUsername: string): string {
  const normalizedUsername = botUsername.trim().replace(/^@/u, '');
  return `https://t.me/${normalizedUsername}?startgroup=velora`;
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
  const notificationMessages = getNotificationMessages(locale);
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>('discover');
  const [notice, setNotice] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState(initialUser.id);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [createExpanded, setCreateExpanded] = useState(false);
  const [libraryExpanded, setLibraryExpanded] = useState(true);
  const [characterCreateRequest, setCharacterCreateRequest] = useState(0);
  const [lorebookCreateRequest, setLorebookCreateRequest] = useState(0);
  const [createInitialEditor, setCreateInitialEditor] = useState<'GROUP' | null>(null);
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [profileUserId, tab]);
  useTelegramBackButton(drawerOpen, closeDrawer);
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => apiRequest<MeResponse>('/api/v1/me'),
    initialData: initialUser,
  });
  const appSettings = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiRequest<Settings>('/api/v1/settings'),
  });
  useEffect(() => {
    if (appSettings.data) document.documentElement.dataset['theme'] = appSettings.data.theme;
  }, [appSettings.data]);
  const changeLocale = useMutation({
    mutationFn: (nextLocale: Locale) =>
      apiRequest<Settings>('/api/v1/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: nextLocale }),
      }),
    onSuccess: (settings) => {
      client.setQueryData<MeResponse>(['me'], (current) =>
        current ? { ...current, locale: settings.locale } : current,
      );
      onLocaleChange(settings.locale);
      setNotice(getWebMessages(settings.locale).settings.saved);
    },
    onError: (error: Error) => {
      setNotice(localizedErrorMessage(error, messages));
    },
  });
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiRequest<NotificationList>('/api/v1/notifications?limit=20'),
    refetchInterval: 60_000,
  });
  const markNotificationRead = useMutation({
    mutationFn: (notificationId: string) =>
      apiRequest<{ readonly id: string; readonly read: true }>(
        `/api/v1/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: 'POST' },
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAllNotificationsRead = useMutation({
    mutationFn: () =>
      apiRequest<{ readonly updated: number }>('/api/v1/notifications/read-all', {
        method: 'POST',
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      setNotice(null);
    }, 4_000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [notice]);

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
    <AppShell>
      <TopBar>
        <button
          className="shell-icon-button menu-trigger"
          type="button"
          aria-label={messages.navigation.openMenu}
          aria-expanded={drawerOpen}
          onClick={() => {
            setDrawerOpen(true);
          }}
        >
          <VeloraIcon name="menu" />
        </button>
        <button
          className="brand brand-button"
          type="button"
          aria-label={messages.navigation.profile}
          onClick={() => {
            setProfileUserId(me.data.id);
            setTab('profile');
          }}
        >
          <BrandMark />
          <span>
            <strong>VeloraAI</strong>
            <small>{me.data.displayName}</small>
          </span>
        </button>
        <div className="header-actions">
          <button
            className="shell-icon-button notification-trigger"
            type="button"
            aria-label={notificationMessages.open}
            aria-haspopup="dialog"
            aria-expanded={notificationsOpen}
            onClick={() => {
              setNotificationsOpen(true);
            }}
          >
            <VeloraIcon name="bell" />
            {(notifications.data?.unreadCount ?? 0) > 0 ? (
              <span className="notification-badge" aria-hidden="true">
                {Math.min(notifications.data?.unreadCount ?? 0, 99)}
              </span>
            ) : null}
          </button>
          <LocaleButton
            locale={locale}
            pending={changeLocale.isPending}
            label={messages.navigation.switchLanguage}
            onChange={(nextLocale) => {
              changeLocale.mutate(nextLocale);
            }}
          />
          <button
            className="balance-pill"
            type="button"
            aria-label={messages.navigation.plans}
            onClick={() => {
              setTab('billing');
            }}
          >
            <strong>{me.data.planDisplayName}</strong>
          </button>
          {['MODERATOR', 'SENIOR_MODERATOR', 'ADMIN', 'OWNER'].includes(me.data.role) ? (
            <button
              className="compact-button lore-symbol"
              type="button"
              aria-label={messages.navigation.moderation}
              onClick={() => {
                setTab('moderation');
              }}
            >
              <VeloraIcon name="shield" size={18} />
            </button>
          ) : null}
        </div>
      </TopBar>

      {notice ? <Toast>{notice}</Toast> : null}
      {notificationsOpen ? (
        <NotificationCenter
          data={notifications.data}
          pending={notifications.isPending}
          error={notifications.error}
          onClose={() => {
            setNotificationsOpen(false);
          }}
          onMarkAll={() => {
            markAllNotificationsRead.mutate();
          }}
          onOpen={(notificationId, actionTab) => {
            markNotificationRead.mutate(notificationId);
            setNotificationsOpen(false);
            if (actionTab) setTab(actionTab);
          }}
        />
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
            onManagePersonas={() => {
              setTab('personas');
            }}
          />
        ) : null}
        {tab === 'create' ? (
          <Suspense fallback={<WorkspaceFallback label={messages.navigation.create} />}>
            <CreateHubView
              key={`create-${createInitialEditor ?? 'MENU'}`}
              initialEditor={createInitialEditor}
              onCreatePersona={() => {
                setTab('personas');
              }}
              onCreateCharacter={() => {
                setCharacterCreateRequest((current) => current + 1);
                setTab('characters');
              }}
              onCreateLorebook={() => {
                setLorebookCreateRequest((current) => current + 1);
                setTab('lorebooks');
              }}
              onStarted={(id) => {
                setConversationId(id);
                setTab('chats');
              }}
            />
          </Suspense>
        ) : null}
        {tab === 'chats' ? (
          <Suspense fallback={<WorkspaceFallback label={messages.navigation.chats} />}>
            <ChatsView
              initialConversationId={conversationId}
              allowedModelProfiles={me.data.planEntitlements.modelProfiles}
              onConversationOpened={setConversationId}
              onDiscover={() => {
                setConversationId(null);
                setTab('discover');
              }}
              telegramBackBlocked={drawerOpen}
            />
          </Suspense>
        ) : null}
        {tab === 'characters' ? (
          <CharactersView
            account={me.data}
            key={`characters-${String(characterCreateRequest)}`}
            createRequest={characterCreateRequest}
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
          <Suspense fallback={<WorkspaceFallback label={messages.lorebooks.title} />}>
            <LorebooksView
              key={`lorebooks-${String(lorebookCreateRequest)}`}
              createRequest={lorebookCreateRequest}
              onBack={() => {
                setTab('characters');
              }}
            />
          </Suspense>
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
            account={me.data}
            notify={setNotice}
            onNavigate={(nextTab) => {
              setTab(nextTab);
            }}
            onBack={() => {
              setTab('discover');
            }}
            onOpenCharacter={(characterId) => {
              const location = new URL(window.location.href);
              location.searchParams.set('character', characterId);
              window.history.replaceState(
                window.history.state,
                '',
                `${location.pathname}${location.search}${location.hash}`,
              );
              setTab('discover');
            }}
          />
        ) : null}
        {tab === 'moderation' ? <ModerationView notify={setNotice} role={me.data.role} /> : null}
      </section>
      {drawerOpen ? (
        <AppDrawer
          activeTab={tab}
          createExpanded={createExpanded}
          libraryExpanded={libraryExpanded}
          onCreateExpanded={setCreateExpanded}
          onLibraryExpanded={setLibraryExpanded}
          onClose={closeDrawer}
          onNavigate={(nextTab) => {
            if (nextTab === 'profile') setProfileUserId(me.data.id);
            setTab(nextTab);
            setDrawerOpen(false);
          }}
          onNavigateSettingsSection={(sectionId) => {
            setTab('settings');
            setDrawerOpen(false);
            window.requestAnimationFrame(() => {
              document.getElementById(sectionId)?.scrollIntoView({ block: 'start' });
            });
          }}
          onCreateCharacter={() => {
            setCharacterCreateRequest((current) => current + 1);
            setTab('characters');
            setDrawerOpen(false);
          }}
          onCreatePersona={() => {
            setTab('personas');
            setDrawerOpen(false);
          }}
          onCreateGroup={() => {
            setCreateInitialEditor('GROUP');
            setTab('create');
            setDrawerOpen(false);
          }}
          onCreateLorebook={() => {
            setLorebookCreateRequest((current) => current + 1);
            setTab('lorebooks');
            setDrawerOpen(false);
          }}
        />
      ) : null}
      <BottomNavigation label={messages.navigation.main}>
        <NavButton
          active={tab === 'discover'}
          label={messages.navigation.home}
          icon="discover"
          onClick={() => {
            setTab('discover');
          }}
        />
        <NavButton
          active={tab === 'characters' || tab === 'lorebooks'}
          label={messages.navigation.characters}
          icon="sparkle"
          onClick={() => {
            setTab('characters');
          }}
        />
        <NavButton
          active={tab === 'create'}
          label={messages.navigation.create}
          icon="create"
          ariaLabel={messages.navigation.openCreateMenu}
          onClick={() => {
            setCreateInitialEditor(null);
            setTab('create');
          }}
        />
        <NavButton
          active={tab === 'chats'}
          label={messages.navigation.chats}
          icon="list"
          onClick={() => {
            setTab('chats');
          }}
        />
        <NavButton
          active={tab === 'profile' || tab === 'settings' || tab === 'personas'}
          label={messages.navigation.you}
          icon="persona"
          onClick={() => {
            setProfileUserId(me.data.id);
            setTab('profile');
          }}
        />
      </BottomNavigation>
    </AppShell>
  );
}

function WorkspaceFallback({ label }: { readonly label: string }) {
  return <Skeleton label={label} />;
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
      apiRequest<DiscoveryResponse>('/api/v1/discovery?sort=newest&limit=3&rating=SAFE'),
    enabled: step === 3,
  });
  const complete = useMutation({
    mutationFn: async (characterId: string | null) => {
      const onboarding = await apiRequest<{ readonly personaId: string | null }>(
        '/api/v1/onboarding/complete',
        {
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
        },
      );
      if (!characterId) return null;
      const conversation = await apiRequest<{ readonly id: string }>('/api/v1/conversations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          characterId,
          personaId: onboarding.personaId,
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
        <BrandMark />
        <span>
          <strong>VeloraAI</strong>
          <small>{messages.onboarding.step(step + 1)}</small>
        </span>
      </header>
      <div
        className="onboarding-progress"
        role="progressbar"
        aria-label={messages.onboarding.stepLabel(step + 1)}
        aria-valuemin={1}
        aria-valuemax={4}
        aria-valuenow={step + 1}
      >
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
                <Avatar
                  name={character.name}
                  fileId={character.avatarFileId}
                  focalX={character.avatarFocalX}
                  focalY={character.avatarFocalY}
                />
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

function planBenefits(plan: PlanDefinition, messages: WebMessages): readonly string[] {
  const entitlements = plan.entitlements;
  return [
    messages.billing.characterBenefit(entitlements.characterLimit),
    messages.billing.personaBenefit(entitlements.personaLimit),
    messages.billing.memoryBenefit(entitlements.memoryTokenBudget),
    messages.billing.operationsBenefit(entitlements.advancedOperationsDaily),
    messages.billing.modelsBenefit(entitlements.modelProfiles.join(', ')),
  ];
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
  const [selectedAccessDuration, setSelectedAccessDuration] = useState(30);
  const catalog = useQuery({
    queryKey: ['billing', 'packs'],
    queryFn: () => apiRequest<BillingCatalog>('/api/v1/billing/packs'),
  });
  const accessCatalog = useQuery({
    queryKey: ['billing', 'access-packs'],
    queryFn: () => apiRequest<AccessPackCatalog>('/api/v1/billing/access-packs'),
  });
  const plans = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => apiRequest<PlanCatalog>('/api/v1/billing/plans'),
  });
  const history = useQuery({
    queryKey: ['billing', 'payments'],
    queryFn: () =>
      apiRequest<{ readonly items: readonly PaymentHistoryItem[] }>('/api/v1/billing/payments'),
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
  if (catalog.isPending) return <Skeleton label={messages.billing.loading} />;
  if (catalog.isError)
    return <ErrorState error={catalog.error} retry={() => void catalog.refetch()} />;
  const accessDurations = Array.from(
    new Set(accessCatalog.data?.items.map((pack) => pack.durationDays) ?? []),
  ).sort((left, right) => left - right);
  const activeAccessDuration = accessDurations.includes(selectedAccessDuration)
    ? selectedAccessDuration
    : accessDurations[0];
  const visiblePlans = (plans.data?.items ?? [])
    .filter(
      (plan) =>
        plan.code === 'FREE' ||
        accessCatalog.data?.items.some(
          (pack) => pack.planCode === plan.code && pack.durationDays === activeAccessDuration,
        ),
    )
    .sort((left, right) => left.rank - right.rank);
  const premiumRank = Math.max(0, ...visiblePlans.map((plan) => plan.rank));
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
      {plans.isError ? <InlineError error={plans.error} /> : null}
      {accessCatalog.data?.items.length && visiblePlans.length ? (
        <section className="view-stack plan-catalog" aria-labelledby="access-packs-title">
          <div className="plan-catalog-heading">
            <div>
              <span className="section-kicker">{messages.billing.planKicker}</span>
              <h2 id="access-packs-title">{messages.billing.accessPacks}</h2>
              <p>{messages.billing.planComparison}</p>
            </div>
            {accessDurations.length > 1 ? (
              <div
                className="period-selector"
                role="radiogroup"
                aria-label={messages.billing.periodLabel}
              >
                {accessDurations.map((duration) => (
                  <button
                    className={duration === activeAccessDuration ? 'is-active' : undefined}
                    type="button"
                    role="radio"
                    aria-checked={duration === activeAccessDuration}
                    key={duration}
                    onClick={() => {
                      setSelectedAccessDuration(duration);
                    }}
                  >
                    {messages.billing.periodDays(duration)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <PlanCarousel
            label={messages.billing.planCarouselLabel}
            previousLabel={locale === 'ru' ? 'Предыдущий тариф' : 'Previous plan'}
            nextLabel={locale === 'ru' ? 'Следующий тариф' : 'Next plan'}
          >
            {visiblePlans.map((plan) => {
              const pack = accessCatalog.data.items.find(
                (candidate) =>
                  candidate.planCode === plan.code &&
                  candidate.durationDays === activeAccessDuration,
              );
              const isFree = plan.code === 'FREE';
              const isCurrent = account.plan === plan.code;
              const description = pack?.description ?? messages.billing.freeDescription;
              return (
                <PlanCard
                  key={`${plan.code}-${String(activeAccessDuration ?? 0)}`}
                  stars={pack?.starsAmount ?? null}
                  title={plan.displayName}
                  description={description}
                  detail={
                    isFree
                      ? messages.billing.noExpiry
                      : messages.billing.periodDays(pack?.durationDays ?? 0)
                  }
                  benefits={planBenefits(plan, messages)}
                  badge={isCurrent ? messages.billing.currentBadge : undefined}
                  priceLabel={
                    isFree
                      ? messages.billing.freePrice
                      : messages.billing.starsPrice(pack?.starsAmount ?? 0)
                  }
                  current={isCurrent}
                  premium={!isFree && plan.rank === premiumRank}
                  actionLabel={isFree ? messages.billing.included : messages.billing.buyOnce}
                  disabled={
                    !catalog.data.paymentsEnabled || !termsAccepted || accessInvoice.isPending
                  }
                  onPurchase={
                    pack
                      ? () => {
                          accessInvoice.mutate(pack.code);
                        }
                      : undefined
                  }
                />
              );
            })}
          </PlanCarousel>
        </section>
      ) : null}
      {!catalog.data.paymentsEnabled ? (
        <section className="billing-disabled" role="status">
          <strong>{messages.billing.disabledTitle}</strong>
          <p>{messages.billing.disabledText}</p>
        </section>
      ) : null}
      <InlineError error={accessInvoice.error} />
      <section className="billing-faq" aria-labelledby="billing-faq-title">
        <span className="section-kicker">FAQ</span>
        <h2 id="billing-faq-title">{messages.billing.faqTitle}</h2>
        {[
          [messages.billing.faqNoRenewQuestion, messages.billing.faqNoRenewAnswer],
          [messages.billing.faqExpiryQuestion, messages.billing.faqExpiryAnswer],
          [messages.billing.faqStackQuestion, messages.billing.faqStackAnswer],
          [messages.billing.faqRefundQuestion, messages.billing.faqRefundAnswer],
        ].map(([question, answer]) => (
          <details key={question}>
            <summary>
              <span>{question}</span>
              <VeloraIcon name="chevronDown" />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>
      <section className="payment-history">
        <h2>{messages.billing.history}</h2>
        {history.isPending ? <p>{messages.billing.historyLoading}</p> : null}
        {history.isError ? <InlineError error={history.error} /> : null}
        {history.data?.items.length === 0 ? <p>{messages.billing.noOperations}</p> : null}
        {history.data?.items.map((item) => (
          <div className="payment-row" key={item.id}>
            <span>
              <strong>
                <VeloraIcon name="star" size={16} /> {item.amount}
              </strong>
              <small>{formatPaymentState(item.state, messages)}</small>
              {item.validUntil ? (
                <small>
                  {messages.billing.accessUntil(
                    new Date(item.validUntil).toLocaleDateString(locale),
                  )}
                </small>
              ) : null}
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
    PENDING: messages.billing.statePending,
    PAID: messages.billing.statePaid,
    GRANTED: messages.billing.stateGranted,
    FAILED: messages.billing.stateFailed,
    CANCELLED: messages.billing.stateCancelled,
    EXPIRED: messages.billing.stateExpired,
    REFUNDED: messages.billing.stateRefunded,
  };
  return labels[state] ?? state;
}

function NavButton({
  active,
  label,
  icon,
  ariaLabel,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly icon: VeloraIconName;
  readonly ariaLabel?: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      className={active ? 'nav-item is-active' : 'nav-item'}
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <VeloraIcon name={icon} />
      <small>{label}</small>
    </button>
  );
}

function NotificationCenter({
  data,
  pending,
  error,
  onClose,
  onMarkAll,
  onOpen,
}: {
  readonly data: NotificationList | undefined;
  readonly pending: boolean;
  readonly error: Error | null;
  readonly onClose: () => void;
  readonly onMarkAll: () => void;
  readonly onOpen: (notificationId: string, actionTab: UserNotification['actionTab']) => void;
}) {
  const { locale } = useI18n();
  const messages = getNotificationMessages(locale);
  return (
    <Dialog
      backdropClassName="notification-backdrop"
      className="notification-center"
      labelledBy="notification-center-title"
      onClose={onClose}
    >
      <header className="notification-center-header">
        <div>
          <h2 id="notification-center-title">{messages.title}</h2>
          <p>{messages.unread(data?.unreadCount ?? 0)}</p>
        </div>
        <button
          className="shell-icon-button"
          type="button"
          aria-label={messages.close}
          onClick={onClose}
        >
          <VeloraIcon name="close" />
        </button>
      </header>
      {(data?.unreadCount ?? 0) > 0 ? (
        <button className="notification-mark-all" type="button" onClick={onMarkAll}>
          <VeloraIcon name="check" size={18} />
          {messages.markAll}
        </button>
      ) : null}
      {pending ? <Skeleton label={messages.title} /> : null}
      {error ? <InlineError error={error} /> : null}
      {!pending && !error && (data?.items.length ?? 0) === 0 ? (
        <p className="notification-empty">{messages.empty}</p>
      ) : null}
      <div className="notification-list" role="list">
        {data?.items.map((notification) => (
          <button
            className={
              notification.readAt === null ? 'notification-item is-unread' : 'notification-item'
            }
            type="button"
            role="listitem"
            key={notification.id}
            onClick={() => {
              onOpen(notification.id, notification.actionTab);
            }}
          >
            <span className="notification-item-copy">
              <strong>{notification.title}</strong>
              <span>{notification.body}</span>
            </span>
            <time dateTime={new Date(notification.createdAt).toISOString()}>
              {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                notification.createdAt,
              )}
            </time>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

export function AppDrawer({
  activeTab,
  createExpanded,
  libraryExpanded,
  onCreateExpanded,
  onLibraryExpanded,
  onClose,
  onNavigate,
  onCreateCharacter,
  onCreatePersona,
  onCreateGroup,
  onCreateLorebook,
  onNavigateSettingsSection,
}: {
  readonly activeTab: Tab;
  readonly createExpanded: boolean;
  readonly libraryExpanded: boolean;
  readonly onCreateExpanded: (expanded: boolean) => void;
  readonly onLibraryExpanded: (expanded: boolean) => void;
  readonly onClose: () => void;
  readonly onNavigate: (tab: Tab) => void;
  readonly onCreateCharacter: () => void;
  readonly onCreatePersona: () => void;
  readonly onCreateGroup: () => void;
  readonly onCreateLorebook: () => void;
  readonly onNavigateSettingsSection: (sectionId: SettingsSectionId) => void;
}) {
  const { messages } = useI18n();
  const logout = useMutation({
    mutationFn: () => apiRequest<undefined>('/api/v1/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      window.location.reload();
    },
  });
  const item = (tab: Tab, icon: VeloraIconName, label: string) => (
    <button
      className={activeTab === tab ? 'drawer-link is-active' : 'drawer-link'}
      type="button"
      onClick={() => {
        onNavigate(tab);
      }}
    >
      <VeloraIcon name={icon} />
      {label}
    </button>
  );
  const settingsSectionItem = (
    sectionId: SettingsSectionId,
    icon: VeloraIconName,
    label: string,
  ) => (
    <button
      className={activeTab === 'settings' ? 'drawer-link is-active' : 'drawer-link'}
      type="button"
      onClick={() => {
        onNavigateSettingsSection(sectionId);
      }}
    >
      <VeloraIcon name={icon} />
      {label}
    </button>
  );
  return (
    <SideDrawer label={messages.navigation.menu} onClose={onClose}>
      <header className="drawer-brand">
        <BrandMark />
        <div>
          <strong>VeloraAI</strong>
          <small>{messages.navigation.storyStudio}</small>
        </div>
        <button type="button" aria-label={messages.navigation.closeMenu} onClick={onClose}>
          <VeloraIcon name="close" />
        </button>
      </header>
      <nav className="drawer-navigation" aria-label={messages.navigation.menu}>
        {item('discover', 'discover', messages.navigation.home)}
        {item('chats', 'list', messages.navigation.chats)}
        {item('personas', 'persona', messages.navigation.personas)}
        <button
          className="drawer-link drawer-accordion"
          type="button"
          aria-expanded={createExpanded}
          onClick={() => {
            onCreateExpanded(!createExpanded);
          }}
        >
          <VeloraIcon name="create" />
          {messages.navigation.create}
          <VeloraIcon name={createExpanded ? 'chevronUp' : 'chevronDown'} />
        </button>
        {createExpanded ? (
          <div className="drawer-submenu">
            <button type="button" onClick={onCreateCharacter}>
              {messages.navigation.createCharacter}
            </button>
            <button type="button" onClick={onCreatePersona}>
              {messages.navigation.createPersona}
            </button>
            <button type="button" onClick={onCreateGroup}>
              {messages.navigation.createGroup}
            </button>
            <button type="button" onClick={onCreateLorebook}>
              {messages.navigation.createLorebook}
            </button>
          </div>
        ) : null}
        <button
          className="drawer-link drawer-accordion"
          type="button"
          aria-expanded={libraryExpanded}
          onClick={() => {
            onLibraryExpanded(!libraryExpanded);
          }}
        >
          <VeloraIcon name="library" />
          {messages.navigation.myLibrary}
          <VeloraIcon name={libraryExpanded ? 'chevronUp' : 'chevronDown'} />
        </button>
        {libraryExpanded ? (
          <div className="drawer-submenu">
            <button
              type="button"
              onClick={() => {
                onNavigate('characters');
              }}
            >
              {messages.navigation.characters}
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('personas');
              }}
            >
              {messages.navigation.myLibrary}: {messages.navigation.personas}
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('lorebooks');
              }}
            >
              Lorebooks
            </button>
          </div>
        ) : null}
        {item('billing', 'billing', messages.navigation.plans)}
        {item('settings', 'settings', messages.navigation.settings)}
        {settingsSectionItem('blocks-title', 'ban', messages.dataControls.blockedTitle)}
        {settingsSectionItem('support-title', 'info', messages.support.title)}
        {settingsSectionItem('legal-title', 'shield', messages.legal.title)}
        {item('profile', 'persona', messages.navigation.profile)}
      </nav>
      <footer className="drawer-footer">
        <button
          className="drawer-logout"
          type="button"
          disabled={logout.isPending}
          onClick={() => {
            logout.mutate();
          }}
        >
          <VeloraIcon name="logout" />
          {logout.isPending ? messages.navigation.loggingOut : messages.navigation.logout}
        </button>
        {logout.error ? <InlineError error={logout.error} /> : null}
        <small>VeloraAI · 0.1.0</small>
      </footer>
    </SideDrawer>
  );
}

function DiscoveryView({
  currentUserId,
  onStarted,
  onOpenCreator,
  onManagePersonas,
}: {
  readonly currentUserId: string;
  readonly onStarted: (id: string) => void;
  readonly onOpenCreator: (userId: string) => void;
  readonly onManagePersonas: () => void;
}) {
  const { messages } = useI18n();
  const client = useQueryClient();
  const [initialUrlState] = useState(() =>
    parseDiscoveryUrlState(typeof window === 'undefined' ? '' : window.location.search),
  );
  const [query, setQuery] = useState(initialUrlState.query);
  const [submittedQuery, setSubmittedQuery] = useState(initialUrlState.query);
  const [sort, setSort] = useState<'newest' | 'oldest'>(initialUrlState.sort);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sharedCharacterId, setSharedCharacterId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : characterIdFromLaunchSearch(window.location.search),
  );
  const [draftFilters, setDraftFilters] = useState<DiscoveryFilters>(initialUrlState.filters);
  const [appliedFilters, setAppliedFilters] = useState<DiscoveryFilters>(initialUrlState.filters);
  const [personaRequest, setPersonaRequest] = useState<{
    readonly character: DiscoveryCharacter;
    readonly greetingIndex: number;
  } | null>(null);
  const [personaSearch, setPersonaSearch] = useState('');
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [rememberPersona, setRememberPersona] = useState(false);
  const activeFilterCount =
    appliedFilters.languages.length +
    appliedFilters.groupSizes.length +
    Number(appliedFilters.rating !== 'ALL') +
    appliedFilters.includeTags.length +
    appliedFilters.excludeTags.length;
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSubmittedQuery(query.trim());
    }, 350);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [query]);
  useEffect(() => {
    const search = writeDiscoveryUrlState(window.location.search, {
      query: submittedQuery,
      sort,
      filters: appliedFilters,
    });
    const nextUrl = `${window.location.pathname}${search}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [appliedFilters, sort, submittedQuery]);
  useEffect(() => {
    const restoreFromHistory = () => {
      const restored = parseDiscoveryUrlState(window.location.search);
      setQuery(restored.query);
      setSubmittedQuery(restored.query);
      setSort(restored.sort);
      setDraftFilters(restored.filters);
      setAppliedFilters(restored.filters);
    };
    window.addEventListener('popstate', restoreFromHistory);
    return () => {
      window.removeEventListener('popstate', restoreFromHistory);
    };
  }, []);
  const discovery = useInfiniteQuery({
    queryKey: ['discovery', submittedQuery, appliedFilters, sort],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const parameters = new URLSearchParams({ q: submittedQuery, limit: '20', sort });
      if (appliedFilters.languages.length > 0) {
        parameters.set('languages', appliedFilters.languages.join(','));
      }
      if (appliedFilters.groupSizes.length > 0) {
        parameters.set('groupSizes', appliedFilters.groupSizes.join(','));
      }
      if (appliedFilters.rating !== 'ALL') {
        parameters.set('rating', appliedFilters.rating);
      }
      if (appliedFilters.includeTags.length > 0) {
        parameters.set('includeTags', appliedFilters.includeTags.join(','));
      }
      if (appliedFilters.excludeTags.length > 0) {
        parameters.set('excludeTags', appliedFilters.excludeTags.join(','));
      }
      if (pageParam) {
        parameters.set('cursor', pageParam);
      }
      return apiRequest<DiscoveryResponse>(`/api/v1/discovery?${parameters.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const discoveryTags = useQuery({
    queryKey: [
      'discovery-tags',
      draftFilters.languages,
      draftFilters.groupSizes,
      draftFilters.rating,
    ],
    queryFn: () => {
      const parameters = new URLSearchParams({ limit: '200' });
      if (draftFilters.languages.length > 0) {
        parameters.set('languages', draftFilters.languages.join(','));
      }
      if (draftFilters.rating !== 'ALL') parameters.set('rating', draftFilters.rating);
      if (draftFilters.groupSizes.length > 0) {
        parameters.set('groupSizes', draftFilters.groupSizes.join(','));
      }
      return apiRequest<DiscoveryTagResponse>(
        `/api/v1/discovery/tags/catalog?${parameters.toString()}`,
      );
    },
    enabled: filtersOpen,
  });
  const discoveryLanguages = useQuery({
    queryKey: [
      'discovery-languages',
      draftFilters.rating,
      draftFilters.includeTags,
      draftFilters.excludeTags,
      draftFilters.groupSizes,
    ],
    queryFn: () => {
      const parameters = new URLSearchParams();
      if (draftFilters.rating !== 'ALL') parameters.set('rating', draftFilters.rating);
      if (draftFilters.includeTags.length > 0) {
        parameters.set('includeTags', draftFilters.includeTags.join(','));
      }
      if (draftFilters.excludeTags.length > 0) {
        parameters.set('excludeTags', draftFilters.excludeTags.join(','));
      }
      if (draftFilters.groupSizes.length > 0) {
        parameters.set('groupSizes', draftFilters.groupSizes.join(','));
      }
      return apiRequest<DiscoveryLanguageResponse>(
        `/api/v1/discovery/languages/catalog?${parameters.toString()}`,
      );
    },
    enabled: filtersOpen,
  });
  const catalogueItems = discovery.data?.pages.flatMap((page) => page.items) ?? [];
  const sharedCharacter = useQuery({
    queryKey: ['discovery', 'character', sharedCharacterId],
    queryFn: () =>
      apiRequest<DiscoveryCharacter>(
        `/api/v1/discovery/${encodeURIComponent(sharedCharacterId ?? '')}`,
      ),
    enabled: sharedCharacterId !== null,
  });
  const discoveryItems = sharedCharacter.data
    ? [
        sharedCharacter.data,
        ...catalogueItems.filter((character) => character.id !== sharedCharacter.data.id),
      ]
    : catalogueItems;
  const contentPreferences = discovery.data?.pages[0]?.contentPreferences;
  const publicConfig = useQuery({
    queryKey: ['public-config'],
    queryFn: () => apiRequest<PublicConfigResponse>('/api/v1/config'),
  });
  const featureFlags = useQuery({
    queryKey: ['feature-flags'],
    queryFn: () => apiRequest<PublicFeatureFlags>('/api/v1/feature-flags'),
  });
  const discoveryGroupSizes = useQuery({
    queryKey: [
      'discovery-group-sizes',
      draftFilters.languages,
      draftFilters.rating,
      draftFilters.includeTags,
      draftFilters.excludeTags,
    ],
    queryFn: () => {
      const parameters = new URLSearchParams();
      if (draftFilters.languages.length > 0) {
        parameters.set('languages', draftFilters.languages.join(','));
      }
      if (draftFilters.rating !== 'ALL') parameters.set('rating', draftFilters.rating);
      if (draftFilters.includeTags.length > 0) {
        parameters.set('includeTags', draftFilters.includeTags.join(','));
      }
      if (draftFilters.excludeTags.length > 0) {
        parameters.set('excludeTags', draftFilters.excludeTags.join(','));
      }
      return apiRequest<DiscoveryGroupSizeResponse>(
        `/api/v1/discovery/group-sizes/catalog?${parameters.toString()}`,
      );
    },
    enabled: filtersOpen && (featureFlags.data?.flags.groups ?? false),
  });
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiRequest<Settings>('/api/v1/settings'),
  });
  const personas = useQuery({
    queryKey: ['personas'],
    queryFn: () => apiRequest<ListResponse<Persona>>('/api/v1/personas'),
  });
  const startConversation = useMutation({
    mutationFn: async ({
      characterId,
      greetingIndex,
      personaId,
      remember,
    }: {
      readonly characterId: string;
      readonly greetingIndex: number;
      readonly personaId: string | null;
      readonly remember: boolean;
    }) => {
      if (remember && personaId) {
        if (settings.data?.defaultPersonaId !== personaId) {
          await apiRequest(`/api/v1/personas/${personaId}/default`, { method: 'POST' });
        }
        await apiRequest<Settings>('/api/v1/settings', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            preferences: {
              ...(settings.data?.preferences ?? {}),
              autoUseDefaultPersona: true,
            },
          }),
        });
      }
      return apiRequest<{ readonly id: string }>('/api/v1/conversations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          characterId,
          personaId,
          greetingIndex,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
    },
    onSuccess: async (conversation) => {
      setPersonaRequest(null);
      setPersonaSearch('');
      setRememberPersona(false);
      // The character page is a full screen, so it has to step aside once the
      // chat it describes is open; otherwise it sits over the app on return.
      setSharedCharacterId(null);
      const location = new URL(window.location.href);
      if (location.searchParams.has('character')) {
        location.searchParams.delete('character');
        window.history.replaceState(
          window.history.state,
          '',
          `${location.pathname}${location.search}${location.hash}`,
        );
      }
      await Promise.all([
        client.invalidateQueries({ queryKey: ['settings'] }),
        client.invalidateQueries({ queryKey: ['personas'] }),
        client.invalidateQueries({ queryKey: ['conversations'] }),
      ]);
      onStarted(conversation.id);
    },
  });
  const requestStart = (character: DiscoveryCharacter, greetingIndex: number) => {
    const automaticPersona = resolveAutomaticPersona(settings.data, personas.data?.items ?? []);
    if (automaticPersona) {
      startConversation.mutate({
        characterId: character.id,
        greetingIndex,
        personaId: automaticPersona.id,
        remember: false,
      });
      return;
    }
    const defaultPersona = (personas.data?.items ?? []).find(
      (persona) => persona.id === settings.data?.defaultPersonaId,
    );
    setSelectedPersonaId(defaultPersona?.id ?? personas.data?.items[0]?.id ?? null);
    setPersonaSearch('');
    setRememberPersona(false);
    setPersonaRequest({ character, greetingIndex });
  };
  useEffect(() => {
    if (!personaRequest) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !startConversation.isPending) setPersonaRequest(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [personaRequest, startConversation.isPending]);
  const resetDiscovery = () => {
    const emptyFilters: DiscoveryFilters = {
      languages: [],
      groupSizes: [],
      rating: 'ALL',
      includeTags: [],
      excludeTags: [],
    };
    setQuery('');
    setSubmittedQuery('');
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
  };
  return (
    <div className="view-stack discovery-view">
      <ViewHeader
        eyebrow={messages.discovery.eyebrow}
        title={messages.discovery.title}
        description={messages.discovery.description}
      />
      <SearchBar
        value={query}
        label={messages.discovery.searchLabel}
        placeholder={messages.discovery.searchPlaceholder}
        submitLabel={messages.discovery.search}
        onChange={setQuery}
        onSubmit={() => {
          setSubmittedQuery(query.trim());
        }}
      />
      <div className="discovery-toolbar">
        <span className="result-count">
          {messages.discovery.resultCount(discovery.data?.pages[0]?.totalCount ?? 0)}
        </span>
        <SortDropdown
          value={sort}
          onChange={setSort}
          options={[
            { value: 'newest', label: messages.discovery.newest },
            { value: 'oldest', label: messages.discovery.oldest },
          ]}
          label={messages.discovery.sortLabel}
        />
        <FilterButton
          label={messages.discovery.filters(activeFilterCount)}
          active={activeFilterCount > 0}
          expanded={filtersOpen}
          onClick={() => {
            setDraftFilters(appliedFilters);
            setFiltersOpen(true);
          }}
        />
      </div>
      {filtersOpen ? (
        <FilterSheet
          title={messages.discovery.filterTitle}
          filters={draftFilters}
          tagOptions={discoveryTags.data?.items ?? []}
          tagOptionsLoading={discoveryTags.isPending}
          languageOptions={discoveryLanguages.data?.items ?? []}
          languageOptionsLoading={discoveryLanguages.isPending}
          groupSizeOptions={discoveryGroupSizes.data?.items ?? []}
          groupSizeOptionsLoading={discoveryGroupSizes.isPending}
          showGroupSizes={featureFlags.data?.flags.groups ?? false}
          labels={{
            language: messages.discovery.languageFilter,
            languagePlaceholder: messages.discovery.languagePlaceholder,
            languageResults: messages.discovery.languageResults,
            languageSelection: messages.discovery.languageSelection,
            selectLanguage: messages.discovery.selectLanguage,
            loadingLanguages: messages.discovery.loadingLanguages,
            noLanguages: messages.discovery.noLanguages,
            groupSize: messages.discovery.groupSizeFilter,
            groupSizeSelection: messages.discovery.groupSizeSelection,
            groupSizeLabels: messages.discovery.groupSizeLabels,
            selectGroupSize: messages.discovery.selectGroupSize,
            loadingGroupSizes: messages.discovery.loadingGroupSizes,
            noGroupSizes: messages.discovery.noGroupSizes,
            tagsFacet: messages.discovery.tagsFacet,
            languagesFacet: messages.discovery.languagesFacet,
            rating: messages.discovery.ratingFilter,
            allRatings: messages.discovery.allRatings,
            safe: messages.discovery.safeOnly,
            mature: messages.discovery.matureOnly,
            tags: messages.discovery.tagsFilter,
            tagsPlaceholder: messages.discovery.tagsPlaceholder,
            tagResults: messages.discovery.tagResults,
            tagSelection: messages.discovery.tagSelection,
            includeTag: messages.discovery.includeTag,
            excludeTag: messages.discovery.excludeTag,
            includedTag: messages.discovery.includedTag,
            excludedTag: messages.discovery.excludedTag,
            loadingTags: messages.discovery.loadingTags,
            noTags: messages.discovery.noTags,
            apply: messages.discovery.applyFilters,
            reset: messages.discovery.resetFilters,
            close: messages.discovery.closeFilters,
          }}
          onChange={setDraftFilters}
          onApply={() => {
            setAppliedFilters(draftFilters);
            setFiltersOpen(false);
          }}
          onReset={() => {
            resetDiscovery();
          }}
          onClose={() => {
            setFiltersOpen(false);
          }}
        />
      ) : null}
      {discovery.isPending ? <Skeleton label={messages.discovery.loading} rows={6} /> : null}
      {discovery.isError ? (
        <ErrorState error={discovery.error} retry={() => void discovery.refetch()} />
      ) : null}
      {discoveryItems.length === 0 && !discovery.isPending ? (
        <EmptyState
          title={messages.discovery.emptyTitle}
          text={messages.discovery.emptyText}
          action={
            <button className="secondary compact-button" type="button" onClick={resetDiscovery}>
              {messages.discovery.resetFilters}
            </button>
          }
        />
      ) : null}
      <div className="card-grid">
        {discoveryItems.map((character) => (
          <CharacterCard
            key={character.id}
            character={character}
            currentUserId={currentUserId}
            onRequestStart={requestStart}
            onOpenCreator={onOpenCreator}
            startPending={startConversation.isPending}
            publicReviews={featureFlags.data?.flags.public_reviews ?? false}
            initiallyExpanded={sharedCharacterId === character.id}
            shareUrl={
              publicConfig.data?.telegramBotUsername
                ? telegramCharacterShareUrl(publicConfig.data.telegramBotUsername, character.id)
                : (() => {
                    const location = new URL(window.location.href);
                    location.searchParams.set('character', character.id);
                    return location.href;
                  })()
            }
            onExpansionChange={(nextExpanded) => {
              const location = new URL(window.location.href);
              if (nextExpanded) {
                location.searchParams.set('character', character.id);
                setSharedCharacterId(character.id);
              } else {
                if (location.searchParams.get('character') === character.id) {
                  location.searchParams.delete('character');
                }
                setSharedCharacterId(null);
              }
              window.history.replaceState(
                window.history.state,
                '',
                `${location.pathname}${location.search}${location.hash}`,
              );
            }}
            blurMatureImages={
              character.contentRating === 'MATURE' && (contentPreferences?.matureImageBlur ?? true)
            }
          />
        ))}
      </div>
      {discovery.hasNextPage ? (
        <button
          className="secondary discovery-load-more"
          type="button"
          disabled={discovery.isFetchingNextPage}
          onClick={() => {
            void discovery.fetchNextPage();
          }}
        >
          {discovery.isFetchingNextPage
            ? messages.discovery.loadingMore
            : messages.discovery.loadMore}
        </button>
      ) : null}
      {personaRequest ? (
        <PersonaSelector
          character={personaRequest.character}
          personas={personas.data?.items ?? []}
          defaultPersonaId={settings.data?.defaultPersonaId ?? null}
          selectedPersonaId={selectedPersonaId}
          query={personaSearch}
          remember={rememberPersona}
          loading={settings.isPending || personas.isPending}
          pending={startConversation.isPending}
          error={settings.error ?? personas.error ?? startConversation.error}
          onQueryChange={setPersonaSearch}
          onSelect={setSelectedPersonaId}
          onRememberChange={setRememberPersona}
          onClose={() => {
            if (!startConversation.isPending) setPersonaRequest(null);
          }}
          onManage={() => {
            setPersonaRequest(null);
            onManagePersonas();
          }}
          onConfirm={() => {
            startConversation.mutate({
              characterId: personaRequest.character.id,
              greetingIndex: personaRequest.greetingIndex,
              personaId: selectedPersonaId,
              remember: rememberPersona,
            });
          }}
        />
      ) : null}
    </div>
  );
}

export function resolveAutomaticPersona(
  settings: Settings | undefined,
  personas: readonly Persona[],
): Persona | null {
  if (settings?.preferences['autoUseDefaultPersona'] !== true || !settings.defaultPersonaId)
    return null;
  return personas.find((persona) => persona.id === settings.defaultPersonaId) ?? null;
}

export function PersonaSelector({
  character,
  personas,
  defaultPersonaId,
  selectedPersonaId,
  query,
  remember,
  loading,
  pending,
  error,
  onQueryChange,
  onSelect,
  onRememberChange,
  onClose,
  onManage,
  onConfirm,
}: {
  readonly character: DiscoveryCharacter;
  readonly personas: readonly Persona[];
  readonly defaultPersonaId: string | null;
  readonly selectedPersonaId: string | null;
  readonly query: string;
  readonly remember: boolean;
  readonly loading: boolean;
  readonly pending: boolean;
  readonly error: Error | null;
  readonly onQueryChange: (value: string) => void;
  readonly onSelect: (id: string | null) => void;
  readonly onRememberChange: (value: boolean) => void;
  readonly onClose: () => void;
  readonly onManage: () => void;
  readonly onConfirm: () => void;
}) {
  const { messages } = useI18n();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredPersonas = personas.filter((persona) =>
    `${persona.name} ${persona.shortDescription}`.toLocaleLowerCase().includes(normalizedQuery),
  );
  const selectedPersona = personas.find((persona) => persona.id === selectedPersonaId) ?? null;
  return (
    <Dialog
      backdropClassName="account-dialog-backdrop persona-chooser-backdrop"
      className="account-dialog persona-chooser"
      labelledBy="persona-chooser-title"
      onClose={onClose}
    >
      <header className="persona-chooser-header">
        <div>
          <p className="eyebrow">{messages.discovery.personaChooserEyebrow}</p>
          <h2 id="persona-chooser-title">
            {messages.discovery.personaChooserTitle(character.name)}
          </h2>
        </div>
        <button
          className="persona-chooser-close"
          type="button"
          aria-label={messages.discovery.closePersonaChooser}
          disabled={pending}
          onClick={onClose}
        >
          <VeloraIcon name="close" />
        </button>
      </header>
      <label className="persona-search">
        <span className="sr-only">{messages.discovery.personaSearchLabel}</span>
        <input
          autoFocus
          type="search"
          value={query}
          placeholder={messages.discovery.personaSearchPlaceholder}
          onChange={(event) => {
            onQueryChange(event.currentTarget.value);
          }}
        />
      </label>
      <div className="persona-pair" aria-label={messages.discovery.personaPairPreview}>
        <Avatar
          name={selectedPersona?.name ?? messages.discovery.noPersona}
          fileId={selectedPersona?.avatarFileId ?? null}
        />
        <span aria-hidden="true">↔</span>
        <Avatar
          name={character.name}
          fileId={character.avatarFileId}
          focalX={character.avatarFocalX}
          focalY={character.avatarFocalY}
        />
      </div>
      {loading ? <p className="meta">{messages.discovery.personaChooserLoading}</p> : null}
      {!loading ? (
        <div
          className="persona-choice-list"
          role="radiogroup"
          aria-label={messages.discovery.personaChoiceLabel}
        >
          <label
            className={selectedPersonaId === null ? 'persona-choice is-selected' : 'persona-choice'}
          >
            <input
              type="radio"
              name="persona-choice"
              checked={selectedPersonaId === null}
              onChange={() => {
                onSelect(null);
                onRememberChange(false);
              }}
            />
            <Avatar name={messages.discovery.noPersona} fileId={null} />
            <span>
              <strong>{messages.discovery.noPersona}</strong>
              <small>{messages.discovery.noPersonaText}</small>
            </span>
          </label>
          {filteredPersonas.map((persona) => (
            <label
              className={
                persona.id === selectedPersonaId ? 'persona-choice is-selected' : 'persona-choice'
              }
              key={persona.id}
            >
              <input
                type="radio"
                name="persona-choice"
                checked={persona.id === selectedPersonaId}
                onChange={() => {
                  onSelect(persona.id);
                }}
              />
              <Avatar name={persona.name} fileId={persona.avatarFileId} />
              <span>
                <strong>
                  {persona.name}
                  {persona.id === defaultPersonaId ? (
                    <em>{messages.discovery.defaultPersona}</em>
                  ) : null}
                </strong>
                <small>{persona.shortDescription || messages.personas.noDescription}</small>
              </span>
            </label>
          ))}
          {filteredPersonas.length === 0 && normalizedQuery ? (
            <p className="meta">{messages.discovery.noPersonasFound}</p>
          ) : null}
        </div>
      ) : null}
      <label className="persona-remember">
        <input
          type="checkbox"
          checked={remember}
          disabled={selectedPersonaId === null || pending}
          onChange={(event) => {
            onRememberChange(event.currentTarget.checked);
          }}
        />
        <span>{messages.discovery.rememberPersona}</span>
      </label>
      <InlineError error={error} />
      <button
        className="compact-primary persona-confirm"
        type="button"
        disabled={loading || pending}
        onClick={onConfirm}
      >
        {pending
          ? messages.discovery.opening
          : messages.discovery.startWithCharacter(character.name)}
      </button>
      <button
        className="text-button persona-manage"
        type="button"
        disabled={pending}
        onClick={onManage}
      >
        {messages.discovery.managePersonas}
      </button>
    </Dialog>
  );
}

export const PersonaChooser = PersonaSelector;

export function CharacterHero({
  name,
  fileId,
  focalX,
  focalY,
  language,
  contentRating,
  blurMatureImages,
}: {
  readonly name: string;
  readonly fileId: string | null;
  readonly focalX: number;
  readonly focalY: number;
  readonly language: string;
  readonly contentRating: DiscoveryCharacter['contentRating'];
  readonly blurMatureImages: boolean;
}) {
  const [geometry, setGeometry] = useState<CharacterImageGeometry | null>(null);
  return (
    <div
      className={storyCoverClassName(contentRating, blurMatureImages)}
      data-image-geometry={geometry ?? undefined}
    >
      <CharacterImage
        fileId={fileId}
        alt={name}
        focalX={focalX}
        focalY={focalY}
        fallback={<span className="story-cover-fallback">{name.slice(0, 1).toUpperCase()}</span>}
        onGeometry={setGeometry}
        previewable
      />
      <b>{language.toUpperCase()}</b>
    </div>
  );
}

export function TagChip({ children }: { readonly children: React.ReactNode }) {
  return <span>{children}</span>;
}

function StaffBadge({ role }: { readonly role: string }) {
  if (role === 'OWNER') {
    return (
      <span className="staff-badge is-owner" aria-hidden="true" title="Владелец">
        <VeloraIcon name="check" size={14} strokeWidth={3} />
      </span>
    );
  }
  if (!['MODERATOR', 'SENIOR_MODERATOR', 'ADMIN'].includes(role)) return null;
  return (
    <span className="staff-badge is-moderator" aria-hidden="true" title="Модератор">
      <VeloraIcon name="check" size={14} strokeWidth={3} />
    </span>
  );
}

export function CharacterCard({
  character,
  currentUserId,
  onRequestStart,
  onOpenCreator,
  startPending,
  publicReviews,
  blurMatureImages,
  initiallyExpanded = false,
  shareUrl,
  onExpansionChange,
}: {
  readonly character: DiscoveryCharacter;
  readonly currentUserId: string;
  readonly onRequestStart: (character: DiscoveryCharacter, greetingIndex: number) => void;
  readonly onOpenCreator: (userId: string) => void;
  readonly startPending: boolean;
  readonly publicReviews: boolean;
  readonly blurMatureImages: boolean;
  readonly initiallyExpanded?: boolean | undefined;
  readonly shareUrl?: string | undefined;
  readonly onExpansionChange?: ((expanded: boolean) => void) | undefined;
}) {
  const { locale, messages } = useI18n();
  const client = useQueryClient();
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(initiallyExpanded);
  const expanded = onExpansionChange ? initiallyExpanded : uncontrolledExpanded;
  const [shareFeedback, setShareFeedback] = useState<{
    readonly kind: 'success' | 'error';
    readonly text: string;
  } | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [greetingExpanded, setGreetingExpanded] = useState(false);
  const [optimisticInteraction, setOptimisticInteraction] = useState<{
    readonly liked: boolean;
    readonly bookmarked: boolean;
    readonly likeCount: number;
    readonly bookmarkCount: number;
  } | null>(null);
  const visibleInteraction = optimisticInteraction ?? character;
  const selectedGreeting =
    greetingIndex === 0
      ? character.firstMessage
      : (character.alternateGreetings[greetingIndex - 1] ?? character.firstMessage);
  const greetingContentId = `character-greeting-${character.id}`;
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
    onMutate: ({ kind, enabled }) => {
      const previous = {
        liked: visibleInteraction.liked,
        bookmarked: visibleInteraction.bookmarked,
        likeCount: visibleInteraction.likeCount,
        bookmarkCount: visibleInteraction.bookmarkCount,
      };
      setOptimisticInteraction({
        ...previous,
        ...(kind === 'like'
          ? {
              liked: enabled,
              likeCount: Math.max(0, previous.likeCount + (enabled ? 1 : -1)),
            }
          : {
              bookmarked: enabled,
              bookmarkCount: Math.max(0, previous.bookmarkCount + (enabled ? 1 : -1)),
            }),
      });
      return previous;
    },
    onError: (_error, _variables, previous) => {
      if (previous) setOptimisticInteraction(previous);
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['discovery'] }),
        client.invalidateQueries({ queryKey: ['creator-stats'] }),
      ]);
      setOptimisticInteraction(null);
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
  const collapse = () => {
    if (onExpansionChange) onExpansionChange(false);
    else setUncontrolledExpanded(false);
  };
  const card = (
    <article
      className={expanded ? 'story-card is-expanded' : 'story-card is-startable'}
      onClick={(event) => {
        // On its own page the whole surface is readable content, so tapping it
        // must not silently start a chat the way a catalogue tile does.
        if (expanded) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('.story-cover, button, a, input, select, textarea, [role="button"]')) {
          return;
        }
        onRequestStart(character, greetingIndex);
      }}
    >
      <CharacterHero
        name={character.name}
        fileId={character.avatarFileId}
        focalX={character.avatarFocalX}
        focalY={character.avatarFocalY}
        language={character.language}
        contentRating={character.contentRating}
        blurMatureImages={blurMatureImages}
      />
      {!expanded ? (
        <button
          className={
            visibleInteraction.liked ? 'story-like-toggle is-selected' : 'story-like-toggle'
          }
          type="button"
          aria-label={visibleInteraction.liked ? messages.discovery.liked : messages.discovery.like}
          aria-pressed={visibleInteraction.liked}
          disabled={interaction.isPending}
          onClick={() => {
            interaction.mutate({ kind: 'like', enabled: !visibleInteraction.liked });
          }}
        >
          <VeloraIcon name="heart" size={18} />
        </button>
      ) : null}
      <div className="story-body">
        <button
          className="creator-link"
          type="button"
          onClick={() => {
            onOpenCreator(character.creatorId);
          }}
        >
          <span>{messages.discovery.byCreator(character.creatorName)}</span>
          <StaffBadge role={character.creatorRole} />
        </button>
        <div className="story-title-row">
          <h2>{character.name}</h2>
          {!expanded ? (
            <ActionMenu
              label={messages.characters.ownerActions(character.name)}
              items={[
                {
                  label: visibleInteraction.bookmarked
                    ? messages.discovery.saved
                    : messages.discovery.bookmark,
                  disabled: interaction.isPending,
                  onSelect: () => {
                    interaction.mutate({
                      kind: 'bookmark',
                      enabled: !visibleInteraction.bookmarked,
                    });
                  },
                },
              ]}
            />
          ) : null}
        </div>
        <p className="tagline">{character.tagline}</p>
        <button
          className="compact-primary story-start"
          type="button"
          disabled={startPending}
          onClick={() => {
            onRequestStart(character, greetingIndex);
          }}
        >
          {startPending ? messages.discovery.opening : messages.discovery.startStory}
        </button>
        {expanded && character.avatarBotUsername ? (
          <a
            className="secondary compact-button character-avatar-bot-link"
            href={telegramAvatarBotGroupUrl(character.avatarBotUsername)}
            target="_blank"
            rel="noreferrer"
          >
            <VeloraIcon name="create" size={18} />
            {locale === 'ru' ? 'Добавить персонажа в чат' : 'Add character to a chat'}
          </a>
        ) : null}
        {expanded ? (
          <div className="character-metrics" aria-label={messages.discovery.metrics}>
            <span>
              <VeloraIcon name="heart" size={16} /> {visibleInteraction.likeCount}
            </span>
            <span>
              <VeloraIcon name="bookmark" size={16} /> {visibleInteraction.bookmarkCount}
            </span>
            {publicReviews ? (
              <span>
                <VeloraIcon name="star" size={16} /> {character.averageRating?.toFixed(1) ?? '0'} ·{' '}
                {character.reviewCount}
              </span>
            ) : null}
          </div>
        ) : null}
        {expanded ? (
          <div className="description character-markdown-description">
            <Suspense
              fallback={
                <span className="meta" role="status">
                  {messages.discovery.renderingGreeting}
                </span>
              }
            >
              <SafeMarkdown content={character.description} />
            </Suspense>
          </div>
        ) : null}
        {expanded && character.personality ? (
          <section className="character-public-personality">
            <h3>{messages.characters.personalitySection}</h3>
            <SafeMarkdown content={character.personality} />
          </section>
        ) : null}
        {expanded && character.alternateGreetings.length > 0 ? (
          <label className="field greeting-picker">
            <span>{messages.discovery.greeting}</span>
            <select
              aria-label={messages.discovery.greeting}
              value={greetingIndex}
              onChange={(event) => {
                setGreetingIndex(Number(event.currentTarget.value));
                setGreetingExpanded(false);
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
        {expanded ? (
          <GreetingMessage labelledBy={`${greetingContentId}-title`}>
            <h3 id={`${greetingContentId}-title`}>{messages.discovery.greetingBlockTitle}</h3>
            <div
              id={greetingContentId}
              className={greetingExpanded ? 'greeting-copy' : 'greeting-copy is-collapsed'}
            >
              <Suspense
                fallback={
                  <span className="meta" role="status">
                    {messages.discovery.renderingGreeting}
                  </span>
                }
              >
                <SafeMarkdown content={selectedGreeting} />
              </Suspense>
            </div>
            <button
              className="greeting-toggle"
              type="button"
              aria-expanded={greetingExpanded}
              aria-controls={greetingContentId}
              onClick={() => {
                setGreetingExpanded((value) => !value);
              }}
            >
              {greetingExpanded
                ? messages.discovery.collapseGreeting
                : messages.discovery.expandGreeting}
            </button>
          </GreetingMessage>
        ) : null}
        <div className="tag-list">
          {character.tags.map((tag) => (
            <TagChip key={tag}>{tag}</TagChip>
          ))}
        </div>
        {expanded ? (
          <div className="character-interactions character-interactions-after-details">
            <button
              className={visibleInteraction.liked ? 'is-selected' : ''}
              type="button"
              aria-pressed={visibleInteraction.liked}
              disabled={interaction.isPending}
              onClick={() => {
                interaction.mutate({ kind: 'like', enabled: !visibleInteraction.liked });
              }}
            >
              <VeloraIcon name="heart" size={18} />
              {visibleInteraction.liked ? messages.discovery.liked : messages.discovery.like}
            </button>
            <button
              className={visibleInteraction.bookmarked ? 'is-selected' : ''}
              type="button"
              aria-pressed={visibleInteraction.bookmarked}
              disabled={interaction.isPending}
              onClick={() => {
                interaction.mutate({ kind: 'bookmark', enabled: !visibleInteraction.bookmarked });
              }}
            >
              <VeloraIcon name="bookmark" size={18} />
              {visibleInteraction.bookmarked
                ? messages.discovery.saved
                : messages.discovery.bookmark}
            </button>
            <button
              type="button"
              onClick={() => {
                const fallbackUrl = new URL(window.location.href);
                fallbackUrl.searchParams.set('character', character.id);
                const url = shareUrl ?? fallbackUrl.href;
                setShareFeedback(null);
                void (async () => {
                  try {
                    const nativeShare: unknown = Reflect.get(navigator, 'share');
                    if (typeof nativeShare === 'function') {
                      const invokeShare = nativeShare as (data: ShareData) => Promise<void>;
                      await invokeShare.call(navigator, {
                        title: character.name,
                        text: character.tagline || character.description,
                        url,
                      });
                    } else {
                      const clipboard: unknown = Reflect.get(navigator, 'clipboard');
                      const writeText: unknown =
                        typeof clipboard === 'object' && clipboard !== null
                          ? Reflect.get(clipboard, 'writeText')
                          : null;
                      if (typeof writeText !== 'function') throw new Error('SHARE_UNAVAILABLE');
                      const copyText = writeText as (value: string) => Promise<void>;
                      await copyText.call(clipboard, url);
                    }
                    setShareFeedback({ kind: 'success', text: messages.discovery.shareDone });
                  } catch {
                    setShareFeedback({ kind: 'error', text: messages.discovery.shareFailed });
                  }
                })();
              }}
            >
              <VeloraIcon name="share" size={18} />
              {messages.discovery.share}
            </button>
          </div>
        ) : null}
        {shareFeedback ? (
          <span
            className={shareFeedback.kind === 'success' ? 'success share-feedback' : 'error'}
            role={shareFeedback.kind === 'success' ? 'status' : 'alert'}
          >
            {shareFeedback.text}
          </span>
        ) : null}
        {interaction.error ? <InlineError error={interaction.error} /> : null}
        <button
          className="text-button"
          type="button"
          onClick={() => {
            const nextExpanded = !expanded;
            if (onExpansionChange) onExpansionChange(nextExpanded);
            else setUncontrolledExpanded(nextExpanded);
          }}
        >
          {expanded ? messages.discovery.collapse : messages.discovery.details}
        </button>
        {expanded && publicReviews ? (
          <button
            className="text-button report-link"
            type="button"
            disabled={review.isPending || removeReview.isPending}
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
                <span className="review-rating" aria-label={String(item.rating)}>
                  <VeloraIcon name="star" size={16} /> {item.rating}/5
                </span>
                {item.reviewText ? <p>{item.reviewText}</p> : null}
              </article>
            ))}
            {reviews.data?.items.length === 0 ? (
              <p className="meta">{messages.discovery.noReviews}</p>
            ) : null}
          </section>
        ) : null}
      </div>
    </article>
  );
  if (!expanded) return card;
  return (
    <CharacterPageShell title={character.name} onBack={collapse}>
      {card}
    </CharacterPageShell>
  );
}

/**
 * Shows a character on a page of its own instead of unfolding inside the
 * catalogue. Expanding in place pushed every other card down and left no
 * obvious way back, so the details now open as a screen with a back control:
 * Telegram's own arrow when the client draws one, and an in-app arrow when it
 * does not, which is the same rule the chat header follows.
 */
function CharacterPageShell({
  title,
  onBack,
  children,
}: {
  readonly title: string;
  readonly onBack: () => void;
  readonly children: ReactNode;
}) {
  const { messages } = useI18n();
  const nativeBackVisible = useTelegramBackButton(true, onBack);
  return (
    <Dialog
      backdropClassName="character-page-backdrop"
      className="character-page"
      label={title}
      onClose={onBack}
    >
      <>
        <header className="character-page-header">
          {nativeBackVisible ? null : (
            <button type="button" aria-label={messages.discovery.backToCatalogue} onClick={onBack}>
              <VeloraIcon name="arrowLeft" />
            </button>
          )}
          <strong>{title}</strong>
        </header>
        <div className="character-page-scroll">{children}</div>
      </>
    </Dialog>
  );
}

export function storyCoverClassName(
  contentRating: DiscoveryCharacter['contentRating'],
  blurMatureImages: boolean,
): string {
  return contentRating === 'MATURE' && blurMatureImages
    ? 'story-cover is-mature-blurred'
    : 'story-cover';
}

function ProfileView({
  userId,
  currentUserId,
  account,
  notify,
  onNavigate,
  onBack,
  onOpenCharacter,
}: {
  readonly userId: string;
  readonly currentUserId: string;
  readonly account: MeResponse;
  readonly notify: (message: string | null) => void;
  readonly onNavigate: (tab: 'billing' | 'settings') => void;
  readonly onBack: () => void;
  readonly onOpenCharacter: (characterId: string) => void;
}) {
  const { messages } = useI18n();
  const client = useQueryClient();
  const isOwn = userId === currentUserId;
  const [editing, setEditing] = useState(false);
  const [profileAvatarId, setProfileAvatarId] = useState('');
  const [reporting, setReporting] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [characterQuery, setCharacterQuery] = useState('');
  const [characterRating, setCharacterRating] = useState<'ALL' | 'SAFE' | 'MATURE'>('ALL');
  const [characterSort, setCharacterSort] = useState<'newest' | 'oldest'>('newest');
  const profile = useQuery({
    queryKey: ['profile', userId],
    queryFn: () =>
      apiRequest<UserProfile>(isOwn ? '/api/v1/profiles/me' : `/api/v1/profiles/${userId}`),
  });
  const media = useQuery({
    queryKey: ['media'],
    queryFn: () => apiRequest<MediaLibraryResponse>('/api/v1/media'),
    enabled: isOwn && editing,
  });
  const blocks = useQuery({
    queryKey: ['blocks'],
    queryFn: () => apiRequest<ListResponse<BlockedUser>>('/api/v1/blocks'),
    enabled: isOwn,
  });
  const logout = useMutation({
    mutationFn: () => apiRequest<undefined>('/api/v1/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      window.location.reload();
    },
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
        <FormField
          label={messages.profile.displayName}
          name="displayName"
          defaultValue={profile.data.displayName}
          required
          maxLength={80}
        />
        <TextAreaField
          label={messages.profile.bio}
          name="bio"
          defaultValue={profile.data.bio}
          maxLength={1000}
        />
        <label className="field">
          <span>{messages.profile.avatarLibrary}</span>
          <select
            name="avatarFileId"
            value={profileAvatarId}
            onChange={(event) => {
              setProfileAvatarId(event.currentTarget.value);
            }}
          >
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
        <ImageUploadControl
          capabilities={media.data?.capabilities}
          aspectRatio={1}
          onUploaded={(uploaded) => {
            setProfileAvatarId(uploaded.id);
          }}
        />
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
  const normalizedCharacterQuery = characterQuery.trim().toLocaleLowerCase();
  const visibleCharacters = [...profile.data.characters]
    .filter(
      (character) =>
        (characterRating === 'ALL' || character.contentRating === characterRating) &&
        (normalizedCharacterQuery === '' ||
          `${character.name} ${character.tagline}`
            .toLocaleLowerCase()
            .includes(normalizedCharacterQuery)),
    )
    .sort((left, right) =>
      characterSort === 'newest'
        ? right.updatedAt - left.updatedAt
        : left.updatedAt - right.updatedAt,
    );
  return (
    <div className="view-stack">
      {!isOwn ? (
        <button className="text-button profile-back" type="button" onClick={onBack}>
          {messages.profile.backToCatalog}
        </button>
      ) : null}
      <article className={`editor-card public-profile${isOwn ? ' is-own' : ''}`}>
        <div className="profile-identity">
          <Avatar name={profile.data.displayName} fileId={profile.data.avatarFileId} />
          <div>
            <p className="eyebrow">
              {profile.data.isOwn ? messages.profile.ownEyebrow : messages.profile.authorEyebrow}
            </p>
            <h1 className="profile-name-with-badge">
              <span>{profile.data.displayName}</span>
              <StaffBadge role={profile.data.role} />
            </h1>
            <p className="profile-handle">
              @{profile.data.username ?? profile.data.userId.slice(0, 8)}
            </p>
            <span className="status-pill">
              {profile.data.visibility === 'PUBLIC'
                ? messages.profile.public
                : messages.profile.private}
            </span>
          </div>
        </div>
        {profile.data.isOwn ? (
          <section className="profile-account-hub" aria-label={messages.profile.accountHub}>
            <div className="profile-plan-summary">
              <span className="status-pill">{account.planDisplayName}</span>
              <small>{messages.profile.planStatus(account.planDisplayName)}</small>
            </div>
            <nav className="profile-account-links" aria-label={messages.profile.accountActions}>
              <button
                type="button"
                onClick={() => {
                  setProfileAvatarId(profile.data.avatarFileId ?? '');
                  setEditing(true);
                }}
              >
                <VeloraIcon name="edit" />
                <strong>{messages.profile.edit}</strong>
                <VeloraIcon name="chevronRight" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigate('settings');
                }}
              >
                <VeloraIcon name="ban" />
                <strong>{messages.profile.blockedUsers(blocks.data?.items.length ?? 0)}</strong>
                <VeloraIcon name="chevronRight" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigate('billing');
                }}
              >
                <VeloraIcon name="billing" />
                <strong>{messages.profile.managePlan}</strong>
                <VeloraIcon name="chevronRight" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigate('settings');
                }}
              >
                <VeloraIcon name="settings" />
                <strong>{messages.profile.preferences}</strong>
                <VeloraIcon name="chevronRight" />
              </button>
              <button
                type="button"
                disabled={logout.isPending}
                onClick={() => {
                  logout.mutate();
                }}
              >
                <VeloraIcon name="logout" />
                <strong>
                  {logout.isPending ? messages.navigation.loggingOut : messages.profile.logout}
                </strong>
                <VeloraIcon name="chevronRight" />
              </button>
              <button
                className="is-danger"
                type="button"
                onClick={() => {
                  onNavigate('settings');
                }}
              >
                <VeloraIcon name="delete" />
                <strong>{messages.profile.deleteAccount}</strong>
                <VeloraIcon name="chevronRight" />
              </button>
            </nav>
            {logout.error ? <InlineError error={logout.error} /> : null}
          </section>
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
        <div className="profile-character-controls">
          <label className="profile-character-search">
            <span className="sr-only">{messages.profile.searchCharacters}</span>
            <input
              type="search"
              value={characterQuery}
              placeholder={messages.profile.searchCharactersPlaceholder}
              onChange={(event) => {
                setCharacterQuery(event.currentTarget.value);
              }}
            />
          </label>
          <label className="profile-character-filter">
            <span>{messages.profile.characterFilter}</span>
            <select
              value={characterRating}
              onChange={(event) => {
                setCharacterRating(event.currentTarget.value as 'ALL' | 'SAFE' | 'MATURE');
              }}
            >
              <option value="ALL">{messages.profile.allRatings}</option>
              <option value="SAFE">Safe</option>
              <option value="MATURE">Mature</option>
            </select>
          </label>
          <SortDropdown
            value={characterSort}
            onChange={setCharacterSort}
            options={[
              { value: 'newest', label: messages.profile.newestCharacters },
              { value: 'oldest', label: messages.profile.oldestCharacters },
            ]}
            label={messages.profile.characterSort}
          />
          <span className="result-count" role="status">
            {messages.profile.characterResults(visibleCharacters.length)}
          </span>
        </div>
        {profile.data.characters.length === 0 ? (
          <p className="meta">{messages.profile.noPublicCharacters}</p>
        ) : null}
        {profile.data.characters.length > 0 && visibleCharacters.length === 0 ? (
          <p className="meta">{messages.profile.noCharacterResults}</p>
        ) : null}
        <div className="profile-character-grid">
          {visibleCharacters.map((character) => (
            <button
              className="profile-character"
              type="button"
              key={character.id}
              aria-label={messages.profile.openCharacter(character.name)}
              onClick={() => {
                onOpenCharacter(character.id);
              }}
            >
              <Avatar
                name={character.name}
                fileId={character.avatarFileId}
                focalX={character.avatarFocalX}
                focalY={character.avatarFocalY}
              />
              <div>
                <strong>{character.name}</strong>
                <small>{character.tagline}</small>
              </div>
              <span className="status-pill">{character.contentRating}</span>
            </button>
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
  const [section, setSection] = useState<
    'queue' | 'users' | 'characters' | 'operations' | 'support'
  >('queue');
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
  const isAvatarReview = detail.data?.reportId === null && detail.data.targetType === 'AVATAR';
  const isSystemReview = isMatureReview || isAvatarReview;
  const avatarEvidenceId =
    detail.data?.targetType === 'AVATAR' && typeof detail.data.evidence?.['id'] === 'string'
      ? detail.data.evidence['id']
      : null;
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
  if (section === 'users' || section === 'characters') {
    return (
      <Suspense fallback={<Skeleton label={messages.moderation.loadingQueue} />}>
        <ModerationDirectoryView
          mode={section}
          onBack={() => {
            setSection('queue');
          }}
          notify={notify}
        />
      </Suspense>
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
                  {isMatureReview
                    ? messages.moderation.matureReviewTitle
                    : isAvatarReview
                      ? messages.moderation.avatarReviewTitle
                      : detail.data.targetType}
                </h2>
              </div>
              <strong>{messages.moderation.priority(detail.data.priority)}</strong>
            </div>
            <div className="evidence-panel">
              <strong>{messages.moderation.evidence}</strong>
              {avatarEvidenceId ? (
                <img
                  className="moderation-media-preview"
                  src={`/api/v1/media/${avatarEvidenceId}/content`}
                  alt={messages.moderation.avatarEvidenceAlt}
                  loading="lazy"
                  decoding="async"
                />
              ) : null}
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
                      : isAvatarReview
                        ? messages.moderation.approveAvatar
                        : messages.moderation.noViolation}
                  </option>
                  {!isSystemReview ? (
                    <option value="WARNING">{messages.moderation.warning}</option>
                  ) : null}
                  <option value="CONTENT_HIDE">{messages.moderation.hideContent}</option>
                  <option value="CONTENT_REMOVE">{messages.moderation.removeContent}</option>
                  {!isSystemReview ? (
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
            <button
              className="compact-button"
              type="button"
              onClick={() => {
                setSection('users');
              }}
            >
              {messages.operations.users}
            </button>
            <button
              className="compact-button"
              type="button"
              onClick={() => {
                setSection('characters');
              }}
            >
              {messages.navigation.characters}
            </button>
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
                moderationCase.reportId === null &&
                  ['CHARACTER', 'AVATAR'].includes(moderationCase.targetType)
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

interface ModerationDirectoryUser {
  readonly id: string;
  readonly telegramId: string;
  readonly username: string | null;
  readonly displayName: string;
  readonly role: string;
  readonly moderationState: string;
}

interface ModerationDirectoryCharacter {
  readonly id: string;
  readonly name: string;
  readonly publishState: string;
  readonly visibility: string;
  readonly ownerName: string;
}

// Kept temporarily to preserve the stable moderation card markup while the directory is lazy-loaded.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyModerationDirectoryView({
  mode,
  onBack,
  notify,
}: {
  readonly mode: 'users' | 'characters';
  readonly onBack: () => void;
  readonly notify: (message: string | null) => void;
}) {
  const { messages } = useI18n();
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const endpoint = `/api/v1/admin/moderation/${mode}?q=${encodeURIComponent(query)}`;
  const directory = useQuery<ListResponse<ModerationDirectoryUser | ModerationDirectoryCharacter>>({
    queryKey: ['moderation-directory', mode, query],
    queryFn: () =>
      apiRequest<ListResponse<ModerationDirectoryUser | ModerationDirectoryCharacter>>(endpoint),
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
      <ViewHeader
        eyebrow={messages.moderation.eyebrow}
        title={mode === 'users' ? messages.operations.users : messages.navigation.characters}
        description={messages.operations.users}
        action={
          <button className="compact-button" type="button" onClick={onBack}>
            {messages.moderation.backToQueue}
          </button>
        }
      />
      <label className="search-bar">
        <span className="sr-only">{messages.operations.users}</span>
        <input
          type="search"
          value={query}
          placeholder={messages.operations.users}
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
          ? (directory.data?.items as readonly ModerationDirectoryUser[] | undefined)?.map(
              (user) => (
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
              ),
            )
          : (directory.data?.items as readonly ModerationDirectoryCharacter[] | undefined)?.map(
              (character) => (
                <article className="moderation-directory-card" key={character.id}>
                  <div>
                    <strong>{character.name}</strong>
                    <small>
                      {character.ownerName} · {character.id}
                    </small>
                  </div>
                  <span className="status-pill">{character.publishState}</span>
                </article>
              ),
            )}
      </div>
      <InlineError error={changeUserState.error} />
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
  const { locale, messages } = useI18n();
  const aiCopy = ownerAiUsageCopy(locale);
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
      {role === 'OWNER' && dashboard.data?.ownerAiUsage ? (
        <section className="ai-usage-panel" aria-labelledby="owner-ai-usage-title">
          <div className="section-heading">
            <div>
              <h2 id="owner-ai-usage-title">{aiCopy.title}</h2>
              <p>{aiCopy.description}</p>
            </div>
          </div>
          <div className="ai-usage-grid">
            <AiUsageCard
              label={aiCopy.daily}
              usage={dashboard.data.ownerAiUsage.daily}
              copy={aiCopy}
            />
            <AiUsageCard
              label={aiCopy.weekly}
              usage={dashboard.data.ownerAiUsage.weekly}
              copy={aiCopy}
            />
            <AiUsageCard
              label={aiCopy.lifetime}
              usage={dashboard.data.ownerAiUsage.lifetime}
              copy={aiCopy}
            />
          </div>
          <p className="ai-budget-summary">
            {aiCopy.budgetRemaining(
              formatCredits(
                dashboard.data.ownerAiUsage.configuredBudgetMicros.remainingLifetime,
                locale,
              ),
              formatCredits(dashboard.data.ownerAiUsage.configuredBudgetMicros.lifetime, locale),
            )}
          </p>
          <h3>{aiCopy.perModel}</h3>
          {dashboard.data.ownerAiUsage.perModelWeekly.length === 0 ? (
            <p>{aiCopy.noModels}</p>
          ) : (
            <div className="ai-model-usage-list">
              {dashboard.data.ownerAiUsage.perModelWeekly.map((usage) => (
                <AiUsageCard key={usage.model} label={usage.model} usage={usage} copy={aiCopy} />
              ))}
            </div>
          )}
          <p className="capacity-no-upgrade">{aiCopy.capsUnavailable}</p>
        </section>
      ) : null}
      {role === 'OWNER' ? <StaffManagement notify={notify} /> : null}
      {role === 'OWNER' ? <RoleplayModelControlPanel notify={notify} /> : null}
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

function RoleplayModelControlPanel({
  notify,
}: {
  readonly notify: (message: string | null) => void;
}) {
  const client = useQueryClient();
  const models = useQuery({
    queryKey: ['admin-roleplay-models'],
    queryFn: () => apiRequest<RoleplayModelControls>('/api/v1/admin/operations/models'),
  });
  const save = useMutation({
    mutationFn: (input: {
      readonly modelProfileId: string;
      readonly body: Readonly<Record<string, unknown>>;
    }) =>
      apiRequest(`/api/v1/admin/operations/models/${input.modelProfileId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input.body),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-roleplay-models'] }),
        client.invalidateQueries({ queryKey: ['roleplay-model-catalog'] }),
      ]);
      notify('Настройки модели применены без нового развёртывания.');
    },
  });
  return (
    <section
      className="feature-flags-panel model-control-panel"
      aria-labelledby="model-control-title"
    >
      <div className="section-heading">
        <div>
          <span className="status-pill">OWNER · MODELS</span>
          <h2 id="model-control-title">Управление ролевыми моделями</h2>
        </div>
      </div>
      <p className="section-description">
        Название, описание, доступность, тариф, модель по умолчанию и безопасная цепочка fallback
        применяются сразу. Provider ID, цены и окна контекста остаются защищены сервером.
      </p>
      {models.isPending ? <p className="section-description">Загружаем модели…</p> : null}
      <div className="model-control-list">
        {models.data?.items.map((model) => (
          <form
            className="model-control-card"
            key={`${model.modelProfileId}-${String(model.updatedAt)}`}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              save.mutate({
                modelProfileId: model.modelProfileId,
                body: {
                  displayName: getFormString(data, 'displayName'),
                  descriptionRu: getFormString(data, 'descriptionRu'),
                  tier: getFormString(data, 'tier'),
                  enabled: data.get('enabled') === 'on',
                  isDefault: data.get('isDefault') === 'on',
                  fallbackIds: models.data.items
                    .filter(
                      (candidate) => data.get(`fallback:${candidate.modelProfileId}`) === 'on',
                    )
                    .map((candidate) => candidate.modelProfileId),
                },
              });
            }}
          >
            <div className="model-control-heading">
              <strong>{model.modelProfileId}</strong>
              <span className={`status-pill ${model.enabled ? 'status-success' : 'status-error'}`}>
                {model.enabled ? 'включена' : 'отключена'}
              </span>
            </div>
            <label>
              <span>Название</span>
              <input name="displayName" defaultValue={model.displayName} maxLength={80} required />
            </label>
            <label>
              <span>Описание для пользователей</span>
              <textarea
                name="descriptionRu"
                defaultValue={model.descriptionRu}
                maxLength={1000}
                required
              />
            </label>
            <label>
              <span>Тариф</span>
              <select name="tier" defaultValue={model.tier}>
                <option value="free">Free</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
              </select>
            </label>
            <div className="model-control-switches">
              <Switch name="enabled" label="Включена" defaultChecked={model.enabled} />
              <label>
                <input
                  name="isDefault"
                  type="checkbox"
                  defaultChecked={models.data.defaultModelProfileId === model.modelProfileId}
                />{' '}
                По умолчанию
              </label>
            </div>
            <fieldset>
              <legend>Fallback (не более двух, без циклов)</legend>
              {models.data.items
                .filter((candidate) => candidate.modelProfileId !== model.modelProfileId)
                .map((candidate) => (
                  <label key={candidate.modelProfileId}>
                    <input
                      name={`fallback:${candidate.modelProfileId}`}
                      type="checkbox"
                      defaultChecked={model.fallbackIds.includes(candidate.modelProfileId)}
                      disabled={!candidate.enabled}
                    />{' '}
                    {candidate.displayName}
                  </label>
                ))}
            </fieldset>
            <div className="model-health-grid" aria-label="Метрики модели за 24 часа">
              <span>
                <strong>{model.health.requestCount}</strong> запросов
              </span>
              <span>
                <strong>{formatPercent(model.health.successRatePercent)}</strong> успех
              </span>
              <span>
                <strong>{formatPercent(model.health.failureRatePercent)}</strong> ошибки
              </span>
              <span>
                <strong>{formatLatency(model.health.averageLatencyMs)}</strong> latency
              </span>
              <span>
                <strong>{formatLatency(model.health.averageTtftMs)}</strong> TTFT
              </span>
            </div>
            {model.health.recentErrors.length > 0 ? (
              <details>
                <summary>Последние ошибки</summary>
                {model.health.recentErrors.map((error, index) => (
                  <p className="section-description" key={`${error.errorCode}-${String(index)}`}>
                    {error.errorCode}
                  </p>
                ))}
              </details>
            ) : null}
            <button className="compact-primary" type="submit" disabled={save.isPending}>
              Сохранить модель
            </button>
          </form>
        ))}
      </div>
      <InlineError error={models.error ?? save.error} />
    </section>
  );
}

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

function formatLatency(value: number | null): string {
  return value === null ? '—' : `${String(value)} мс`;
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
  const ownerPayments = useQuery({
    queryKey: ['admin-billing-payments'],
    queryFn: () => apiRequest<ListResponse<OwnerPayment>>('/api/v1/admin/billing/payments'),
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
  const refundPayment = useMutation({
    mutationFn: (input: { readonly paymentId: string; readonly reason: string }) =>
      apiRequest(`/api/v1/admin/billing/payments/${encodeURIComponent(input.paymentId)}/refund`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: input.reason, idempotencyKey: crypto.randomUUID() }),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-billing-payments'] }),
        client.invalidateQueries({ queryKey: ['billing-payments'] }),
        client.invalidateQueries({ queryKey: ['me'] }),
      ]);
      notify(messages.billingAdmin.refundCompleted);
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
      <section className="editor-card" aria-labelledby="owner-payments-title">
        <h3 id="owner-payments-title">{messages.billingAdmin.recentPayments}</h3>
        <p className="section-description">{messages.billingAdmin.refundDescription}</p>
        {ownerPayments.isPending ? <p>{messages.billingAdmin.loading}</p> : null}
        {ownerPayments.data?.items.length === 0 ? <p>{messages.billingAdmin.noPayments}</p> : null}
        <div className="list-stack">
          {ownerPayments.data?.items.map((payment) => (
            <article className="moderation-card" key={payment.id}>
              <strong>{payment.target.displayName}</strong>
              <span>
                {payment.starsAmount} XTR · {payment.state}
              </span>
              <small>
                {payment.target.id} · Telegram {payment.target.telegramId}
              </small>
              {payment.refund ? (
                <span>
                  {messages.billingAdmin.refundState}: {payment.refund.state}
                </span>
              ) : null}
              {payment.state === 'ENTITLEMENT_GRANTED' && !payment.refund ? (
                <button
                  className="compact-button danger"
                  type="button"
                  disabled={refundPayment.isPending}
                  onClick={() => {
                    const reason = window.prompt(messages.billingAdmin.refundReasonPrompt);
                    if (
                      reason?.trim() &&
                      window.confirm(messages.billingAdmin.refundConfirmation)
                    ) {
                      refundPayment.mutate({ paymentId: payment.id, reason: reason.trim() });
                    }
                  }}
                >
                  {messages.billingAdmin.refund}
                </button>
              ) : null}
            </article>
          ))}
        </div>
        <InlineError error={ownerPayments.error ?? refundPayment.error} />
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
      <RoleplayModelEvalPanel capabilities={capabilities} notify={notify} />
    </section>
  );
}

function RoleplayModelEvalPanel({
  capabilities,
  notify,
}: {
  readonly capabilities: BotHubModelCapabilities | null;
  readonly notify: (message: string | null) => void;
}) {
  const { messages } = useI18n();
  const client = useQueryClient();
  const [pendingModelId, setPendingModelId] = useState<string | null>(null);
  interface EvalState {
    readonly models: readonly RoleplayModelEvalCatalogItem[];
    readonly items: readonly RoleplayModelEvalRun[];
  }
  const evals = useQuery({
    queryKey: ['admin-model-evals'],
    queryFn: () => apiRequest<EvalState>('/api/v1/admin/operations/model-evals'),
  });
  const run = useMutation({
    mutationFn: (modelProfileId: string) =>
      apiRequest<{ readonly run: RoleplayModelEvalRun }>('/api/v1/admin/operations/model-evals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          modelProfileId,
          confirmation: 'ПОТРАТИТЬ 1 ЗАПРОС НА ПРОВЕРКУ МОДЕЛИ',
        }),
      }),
    onSuccess: async (result) => {
      setPendingModelId(null);
      notify(
        result.run.alreadyAttempted
          ? messages.aiAdmin.evalAlreadyRun
          : messages.aiAdmin.evalCompleted,
      );
      await client.invalidateQueries({ queryKey: ['admin-model-evals'] });
      await client.invalidateQueries({ queryKey: ['admin-ai-smoke'] });
    },
  });
  const runsByProfile = new Map(
    (evals.data?.items ?? []).map((item) => [item.modelProfileId, item] as const),
  );
  return (
    <section className="model-eval-panel" aria-labelledby="model-eval-title">
      <div>
        <h3 id="model-eval-title">{messages.aiAdmin.evalTitle}</h3>
        <p className="section-description">{messages.aiAdmin.evalDescription}</p>
      </div>
      {evals.isPending ? <p className="section-description">{messages.aiAdmin.checking}</p> : null}
      <div className="model-eval-list">
        {evals.data?.models.map((model) => {
          const result = runsByProfile.get(model.modelProfileId);
          const available =
            capabilities?.availableCandidates.includes(model.providerModelId) ?? false;
          return (
            <article className="model-eval-card" key={model.modelProfileId}>
              <div className="model-eval-heading">
                <span>
                  <strong>{model.displayName}</strong>
                  <small>{model.providerModelId}</small>
                </span>
                <span className={`status-pill model-tier-${model.tier}`}>{model.tier}</span>
              </div>
              <span className={`status-pill ${available ? 'status-success' : 'status-error'}`}>
                {available ? messages.aiAdmin.evalAvailable : messages.aiAdmin.evalUnavailable}
              </span>
              {result ? (
                <div className="model-eval-result">
                  <strong>{result.state}</strong>
                  <span>
                    {messages.aiAdmin.tokenUsage(result.inputTokens, result.outputTokens)} ·{' '}
                    {result.latencyMs ?? 0} {messages.aiAdmin.milliseconds}
                  </span>
                  {result.errorCode ? <span className="error">{result.errorCode}</span> : null}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!available || run.isPending}
                  onClick={() => {
                    setPendingModelId(model.modelProfileId);
                  }}
                >
                  {messages.aiAdmin.evalRun}
                </button>
              )}
            </article>
          );
        })}
      </div>
      {pendingModelId ? (
        <Dialog
          backdropClassName="account-dialog-backdrop"
          className="account-dialog"
          labelledBy="model-eval-confirm-title"
          onClose={() => {
            setPendingModelId(null);
          }}
        >
          <h3 id="model-eval-confirm-title">{messages.aiAdmin.evalConfirmTitle}</h3>
          <p>{messages.aiAdmin.evalConsent}</p>
          <div className="dialog-actions">
            <button
              type="button"
              onClick={() => {
                setPendingModelId(null);
              }}
            >
              {messages.common.cancel}
            </button>
            <button
              type="button"
              className="compact-primary"
              disabled={run.isPending}
              onClick={() => {
                run.mutate(pendingModelId);
              }}
            >
              {run.isPending ? messages.aiAdmin.running : messages.aiAdmin.evalConfirm}
            </button>
          </div>
        </Dialog>
      ) : null}
      <InlineError error={evals.error ?? run.error} />
      <Suspense fallback={<p className="section-description">{messages.aiAdmin.checking}</p>}>
        <RoleplayBenchmarkPanel
          models={evals.data?.models ?? []}
          capabilities={capabilities}
          notify={notify}
        />
      </Suspense>
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

function ownerAiUsageCopy(locale: Locale) {
  return locale === 'ru'
    ? {
        title: 'Расходы AI владельца',
        description: 'Агрегаты BotHub без текстов диалогов и ID.',
        daily: 'За 24 часа',
        weekly: 'За 7 дней',
        lifetime: 'За всё время',
        requests: (count: number) => `Запросов: ${String(count)}`,
        tokens: (input: number, output: number) =>
          `${String(input)} вход / ${String(output)} выход`,
        cost: (value: string) => `Расход: $${value}`,
        budgetRemaining: (remaining: string, limit: string) =>
          `Остаток лимита: $${remaining} из $${limit}`,
        perModel: 'За 7 дней по моделям',
        noModels: 'За 7 дней запросов не было.',
        capsUnavailable: 'Точный CAPS доступен только в кабинете BotHub.',
      }
    : {
        title: 'Owner AI usage',
        description: 'BotHub totals without chat text or user IDs.',
        daily: '24 hours',
        weekly: '7 days',
        lifetime: 'Lifetime',
        requests: (count: number) => `Requests: ${String(count)}`,
        tokens: (input: number, output: number) => `${String(input)} in / ${String(output)} out`,
        cost: (value: string) => `Spend: $${value}`,
        budgetRemaining: (remaining: string, limit: string) =>
          `Budget left: $${remaining} of $${limit}`,
        perModel: '7 days by model',
        noModels: 'No requests in 7 days.',
        capsUnavailable: 'Exact CAPS are available only in BotHub.',
      };
}

function AiUsageCard({
  label,
  usage,
  copy,
}: {
  readonly label: string;
  readonly usage: NonNullable<OperationsDashboard['ownerAiUsage']>['daily'];
  readonly copy: ReturnType<typeof ownerAiUsageCopy>;
}) {
  const { locale } = useI18n();
  return (
    <article className="ai-usage-card">
      <strong>{label}</strong>
      <span>{copy.requests(usage.requests)}</span>
      <span>{copy.tokens(usage.inputTokens, usage.outputTokens)}</span>
      <span>{copy.cost(formatCredits(usage.costMicros, locale))}</span>
    </article>
  );
}

function PersonasView({ notify }: { readonly notify: (message: string | null) => void }) {
  const { messages } = useI18n();
  const client = useQueryClient();
  const [query, setQuery] = useState('');
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
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visiblePersonas = (personas.data?.items ?? []).filter((persona) =>
    `${persona.name} ${persona.shortDescription} ${persona.longDescription}`
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );
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
            className="compact-primary persona-create-button"
            type="button"
            aria-label={messages.personas.create}
            onClick={() => {
              setEditing('new');
            }}
          >
            <VeloraIcon name="create" />
          </button>
        }
      />
      <label className="search-bar persona-library-search">
        <span className="sr-only">{messages.personas.searchLabel}</span>
        <input
          type="search"
          value={query}
          placeholder={messages.personas.searchPlaceholder}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
        />
      </label>
      <p className="result-count" role="status">
        {messages.personas.resultCount(visiblePersonas.length)}
      </p>
      {personas.isError ? (
        <ErrorState error={personas.error} retry={() => void personas.refetch()} />
      ) : null}
      {personas.isPending ? <Skeleton label={messages.personas.loading} /> : null}
      {personas.data?.items.length === 0 ? (
        <EmptyState
          title={messages.personas.emptyTitle}
          text={messages.personas.emptyText}
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
      ) : null}
      {personas.data && personas.data.items.length > 0 && visiblePersonas.length === 0 ? (
        <EmptyState
          title={messages.personas.noMatchesTitle}
          text={messages.personas.noMatchesText}
          action={
            <button
              className="secondary compact-button"
              type="button"
              onClick={() => {
                setQuery('');
              }}
            >
              {messages.personas.clearSearch}
            </button>
          }
        />
      ) : null}
      <div className="list-stack persona-library-list">
        {visiblePersonas.map((persona) => (
          <PersonaCard
            key={persona.id}
            avatar={<Avatar name={persona.name} fileId={persona.avatarFileId} />}
            name={persona.name}
            description={persona.shortDescription || messages.personas.noDescription}
            actionsLabel={messages.characters.ownerActions(persona.name)}
            badges={[
              persona.visibility === 'PUBLIC'
                ? messages.personas.public
                : messages.personas.private,
              ...(persona.isDefault ? [messages.personas.default] : []),
            ]}
            editLabel={messages.personas.edit}
            defaultLabel={messages.personas.makeDefault}
            removeLabel={messages.personas.remove}
            isDefault={persona.isDefault}
            onEdit={() => {
              setEditing(persona);
            }}
            onMakeDefault={() => {
              makeDefault.mutate(persona.id);
            }}
            onRemove={() => {
              if (window.confirm(messages.personas.removeConfirm(persona.name)))
                remove.mutate(persona.id);
            }}
          />
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
  useLayoutEffect(() => {
    const previousScrollY = window.scrollY;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    return () => {
      window.scrollTo({ top: previousScrollY, left: 0, behavior: 'instant' });
    };
  }, []);
  const existing = persona === 'new' ? null : persona;
  const [previewAvatarId, setPreviewAvatarId] = useState(existing?.avatarFileId ?? '');
  const media = useQuery({
    queryKey: ['media'],
    queryFn: () => apiRequest<MediaLibraryResponse>('/api/v1/media'),
  });
  const save = useMutation({
    mutationFn: async ({
      body,
      makeDefault,
    }: {
      readonly body: Record<string, unknown>;
      readonly makeDefault: boolean;
    }) => {
      const saved = await apiRequest<Persona>(
        existing ? `/api/v1/personas/${existing.id}` : '/api/v1/personas',
        {
          method: existing ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (makeDefault && !saved.isDefault) {
        await apiRequest(`/api/v1/personas/${saved.id}/default`, { method: 'POST' });
      }
      return saved;
    },
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
      body: {
        name: getFormString(data, 'name'),
        avatarFileId: getFormString(data, 'avatarFileId') || null,
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
      },
      makeDefault: data.get('makeDefault') === 'on',
    });
  };
  return (
    <Editor
      className="persona-editor-view"
      title={existing ? messages.personas.editTitle : messages.personas.newTitle}
      onCancel={onClose}
      onSubmit={submit}
      pending={save.isPending}
      error={save.error}
    >
      <div className="persona-editor-avatar">
        <Avatar
          name={existing?.name ?? messages.personas.personaFallback}
          fileId={previewAvatarId || null}
        />
        <div className="persona-avatar-copy">
          <strong>{messages.personas.avatar}</strong>
          <p className="meta">{messages.personas.avatarHint}</p>
        </div>
        <input type="hidden" name="avatarFileId" value={previewAvatarId} />
      </div>
      <ImageUploadControl
        capabilities={media.data?.capabilities}
        aspectRatio={1}
        onUploaded={(uploaded) => {
          setPreviewAvatarId(uploaded.id);
        }}
      />
      {media.error ? <InlineError error={media.error} /> : null}
      <Field
        label={messages.personas.name}
        name="name"
        defaultValue={existing?.name}
        required
        maxLength={80}
        metrics
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
        maxLength={12_000}
        metrics
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
      <label className="check-row persona-default-toggle">
        <input
          type="checkbox"
          name="makeDefault"
          defaultChecked={existing?.isDefault ?? false}
          disabled={existing?.isDefault ?? false}
        />
        <span>{messages.personas.makeDefaultInEditor}</span>
      </label>
    </Editor>
  );
}

export function CreatorCharacterCard({ children }: { readonly children: React.ReactNode }) {
  return <article className="list-card creator-character-card">{children}</article>;
}

function characterVisibilityLabel(
  visibility: Character['visibility'],
  messages: WebMessages,
): string {
  if (visibility === 'PUBLIC') return messages.characters.publicVisibility;
  if (visibility === 'UNLISTED') return messages.characters.unlistedVisibility;
  return messages.characters.privateVisibility;
}

function CharactersView({
  account,
  createRequest,
  notify,
  onStarted,
  onOpenLorebooks,
}: {
  readonly account: MeResponse;
  readonly createRequest: number;
  readonly notify: (message: string | null) => void;
  readonly onStarted: (id: string) => void;
  readonly onOpenLorebooks: () => void;
}) {
  const { messages } = useI18n();
  const client = useQueryClient();
  const [initialUrlState] = useState(() =>
    parseLibraryUrlState(typeof window === 'undefined' ? '' : window.location.search),
  );
  const [query, setQuery] = useState(initialUrlState.query);
  const [sort, setSort] = useState<LibrarySort>(initialUrlState.sort);
  const [visibility, setVisibility] = useState<CharacterVisibility>(initialUrlState.visibility);
  const [kind, setKind] = useState<CharacterKind>(initialUrlState.kind);
  useEffect(() => {
    const search = writeLibraryUrlState(window.location.search, { query, sort, visibility, kind });
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${search}${window.location.hash}`,
    );
  }, [kind, query, sort, visibility]);
  const characters = useQuery({
    queryKey: ['characters', query, sort, visibility, kind],
    queryFn: () => {
      const parameters = new URLSearchParams({ q: query, sort, visibility, kind });
      return apiRequest<ListResponse<Character>>(`/api/v1/characters?${parameters.toString()}`);
    },
  });
  const stats = useQuery({
    queryKey: ['creator-stats'],
    queryFn: () => apiRequest<CreatorStats>('/api/v1/discovery/creator-stats/me'),
  });
  const [editing, setEditing] = useState<Character | 'new' | null>(
    createRequest > 0 ? 'new' : null,
  );
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
        account={account}
        character={editing}
        onClose={() => {
          setEditing(null);
        }}
        notify={notify}
      />
    );
  return (
    <div className="view-stack library-view characters-library">
      <ViewHeader
        eyebrow={messages.characters.eyebrow}
        title={messages.characters.title}
        description={messages.characters.description}
        action={
          <div className="header-actions">
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
      <nav className="library-tabs" aria-label={messages.navigation.myLibrary}>
        <button type="button" className="is-active" aria-current="page">
          {messages.navigation.characters}
        </button>
        <button type="button" onClick={onOpenLorebooks}>
          {messages.characters.lorebooks}
        </button>
      </nav>
      <div className="library-controls">
        <label className="library-search">
          <VeloraIcon name="search" />
          <input
            value={query}
            aria-label={messages.characters.searchLabel}
            placeholder={messages.characters.searchPlaceholder}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
            }}
          />
        </label>
        <label className="compact-filter library-visibility">
          <span>{messages.characters.visibilityFilter}</span>
          <select
            value={visibility}
            onChange={(event) => {
              setVisibility(event.currentTarget.value as typeof visibility);
            }}
          >
            <option value="ALL">{messages.characters.allVisibility}</option>
            <option value="PUBLIC">{messages.characters.publicVisibility}</option>
            <option value="UNLISTED">{messages.characters.unlistedVisibility}</option>
            <option value="PRIVATE">{messages.characters.privateVisibility}</option>
          </select>
        </label>
        <label className="compact-filter library-kind">
          <span>{messages.discovery.groupSizeFilter}</span>
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.currentTarget.value as CharacterKind);
            }}
          >
            <option value="ALL">{messages.characters.allVisibility}</option>
            {characterGroupSizes.map(({ code }) => (
              <option value={code} key={code}>
                {messages.discovery.groupSizeLabels[code]}
              </option>
            ))}
          </select>
        </label>
        <SortDropdown
          value={sort}
          onChange={setSort}
          options={[
            { value: 'newest', label: messages.characters.newest },
            { value: 'oldest', label: messages.characters.oldest },
          ]}
          label={messages.characters.sortLabel}
        />
      </div>
      {characters.isError ? (
        <ErrorState error={characters.error} retry={() => void characters.refetch()} />
      ) : null}
      {characters.isPending ? <Skeleton label={messages.characters.loading} /> : null}
      <InlineError error={preview.error} />
      {characters.data?.items.length === 0 ? (
        <EmptyState
          title={messages.characters.emptyTitle}
          text={messages.characters.emptyText}
          action={
            <button
              className="compact-primary"
              type="button"
              onClick={() => {
                setEditing('new');
              }}
            >
              {messages.characters.create}
            </button>
          }
        />
      ) : null}
      <div className="list-stack">
        {characters.data?.items.map((character) => (
          <CreatorCharacterCard key={character.id}>
            <div className="creator-character-cover">
              <Avatar
                name={character.name}
                fileId={character.avatarFileId}
                focalX={character.avatarFocalX}
                focalY={character.avatarFocalY}
              />
              <ActionMenu
                label={messages.characters.ownerActions(character.name)}
                items={[
                  {
                    label: messages.characters.edit,
                    onSelect: () => {
                      setEditing(character);
                    },
                  },
                  {
                    label:
                      character.publishState === 'PUBLISHED' ||
                      character.publishState === 'MODERATION_PENDING'
                        ? character.publishState === 'MODERATION_PENDING'
                          ? messages.characters.cancelReview
                          : messages.characters.unpublish
                        : messages.characters.publish,
                    onSelect: () => {
                      action.mutate({
                        id: character.id,
                        command:
                          character.publishState === 'PUBLISHED' ||
                          character.publishState === 'MODERATION_PENDING'
                            ? 'unpublish'
                            : 'publish',
                      });
                    },
                  },
                  {
                    label: messages.characters.duplicate,
                    onSelect: () => {
                      action.mutate({ id: character.id, command: 'duplicate' });
                    },
                  },
                  {
                    label: messages.characters.remove,
                    danger: true,
                    onSelect: () => {
                      if (window.confirm(messages.characters.removeConfirm(character.name)))
                        action.mutate({ id: character.id, command: 'delete' });
                    },
                  },
                ]}
              />
            </div>
            <div className="list-copy">
              <p className="library-owner">
                {account.username ? `@${account.username}` : account.displayName}
              </p>
              <h2>{character.name}</h2>
              <p>{character.tagline}</p>
              <div className="tag-list">
                <TagChip>v{character.version}</TagChip>
                <TagChip>{characterVisibilityLabel(character.visibility, messages)}</TagChip>
                <TagChip>
                  {character.publishState === 'PUBLISHED'
                    ? messages.characters.statePublished
                    : character.publishState === 'MODERATION_PENDING'
                      ? messages.characters.statePending
                      : character.publishState === 'HIDDEN' || character.publishState === 'REJECTED'
                        ? messages.characters.stateHidden
                        : messages.characters.stateDraft}
                </TagChip>
                {character.tags.slice(0, 2).map((tag) => (
                  <TagChip key={tag}>{tag}</TagChip>
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
            </div>
          </CreatorCharacterCard>
        ))}
      </div>
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
    </div>
  );
}

function CharacterEditor({
  account,
  character,
  onClose,
  notify,
}: {
  readonly account: MeResponse;
  readonly character: Character | 'new';
  readonly onClose: () => void;
  readonly notify: (message: string | null) => void;
}) {
  const { locale, messages } = useI18n();
  const assistCopy =
    locale === 'ru'
      ? {
          title: 'AI-помощник',
          description: 'AI предложит черновик. Поле изменится только после подтверждения.',
          generate: 'Предложить',
          suggestion: 'Черновик AI',
          applied: 'Текст применён. Проверь его перед сохранением.',
        }
      : {
          title: 'AI assistant',
          description: 'AI suggests a draft. The field changes only after confirmation.',
          generate: 'Suggest',
          suggestion: 'AI draft',
          applied: 'Text applied. Review it before saving.',
        };
  const client = useQueryClient();
  const existing = character === 'new' ? null : character;
  const currentCharacter = useRef<Character | null>(existing);
  const formRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const revisionRef = useRef(0);
  const dirtyRef = useRef(existing === null);
  const [saveState, setSaveState] = useState<
    'INCOMPLETE' | 'DIRTY' | 'SAVING' | 'SAVED' | 'VALIDATING' | 'SUBMITTING' | 'SUCCESS' | 'FAILED'
  >(existing ? 'SAVED' : 'INCOMPLETE');
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [previewName, setPreviewName] = useState(
    existing?.name ?? messages.characters.characterFallback,
  );
  const [previewGreeting, setPreviewGreeting] = useState(
    existing?.firstMessage ?? messages.characters.greetingFallback,
  );
  const [previewAvatarId, setPreviewAvatarId] = useState(existing?.avatarFileId ?? '');
  const [avatarFocalX, setAvatarFocalX] = useState(existing?.avatarFocalX ?? 50);
  const [avatarFocalY, setAvatarFocalY] = useState(existing?.avatarFocalY ?? 50);
  const [assistTarget, setAssistTarget] = useState<CharacterAssistTarget>('firstMessage');
  const [assistSuggestion, setAssistSuggestion] = useState<string | null>(null);
  const [promptMetrics, setPromptMetrics] = useState(() =>
    calculateCharacterPromptMetrics(existing ?? {}),
  );
  const media = useQuery({
    queryKey: ['media'],
    queryFn: () => apiRequest<MediaLibraryResponse>('/api/v1/media'),
  });
  const createAvatarBot = useMutation({
    mutationFn: (characterId: string) =>
      apiRequest<{ readonly instruction: string }>(
        `/api/v1/characters/${characterId}/avatar-bot/setup`,
        { method: 'POST' },
      ),
    onSuccess: (result) => {
      notify(result.instruction);
    },
  });
  const characterAssist = useMutation({
    mutationFn: () => {
      const form = formRef.current;
      if (!form) throw new Error(assistCopy.description);
      const data = new FormData(form);
      const context = [
        getFormString(data, 'tagline'),
        getFormString(data, 'description'),
        getFormString(data, 'personality'),
        getFormString(data, 'scenario'),
        getFormString(data, 'speechStyle'),
      ]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 6_000);
      return apiRequest<{ readonly target: CharacterAssistTarget; readonly suggestion: string }>(
        '/api/v1/characters/assist',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            target: assistTarget,
            name: getFormString(data, 'name') || messages.characters.characterFallback,
            currentText: getFormString(data, assistTarget),
            context,
            language: locale,
          }),
        },
      );
    },
    onSuccess: (result) => {
      setAssistSuggestion(result.suggestion);
    },
  });
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
      avatarFileId: getFormString(data, 'avatarFileId') || null,
      avatarFocalX: Number(getFormString(data, 'avatarFocalX')),
      avatarFocalY: Number(getFormString(data, 'avatarFocalY')),
      tagline: getFormString(data, 'tagline'),
      description: getFormString(data, 'description'),
      personality: getFormString(data, 'personality'),
      personalityVisible: data.has('personalityVisible'),
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
      groupSize: getFormString(data, 'groupSize'),
      visibility: getFormString(data, 'visibility'),
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
          body: JSON.stringify(current ? { ...body, baseVersion: current.version } : body),
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
    if (formRef.current) {
      setPromptMetrics(
        calculateCharacterPromptMetrics(characterPromptValuesFromForm(formRef.current)),
      );
    }
    setSaveState(pendingAutosaveState(formRef.current?.checkValidity() ?? false));
    if (!autosaveEnabled) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void runAutosave();
    }, 900);
  }

  const submit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const action = (event.nativeEvent.submitter as HTMLButtonElement | null)?.value ?? 'draft';
    const publishing = action === 'publish';
    setSaveError(null);
    if (publishing) {
      setSaveState('VALIDATING');
      if (!policyAccepted) {
        setSaveState('INCOMPLETE');
        setSaveError(new Error(messages.onboarding.policyText));
        return;
      }
      const visibility = getFormString(new FormData(form), 'visibility');
      if (visibility !== 'PUBLIC' && visibility !== 'UNLISTED') {
        setSaveState('INCOMPLETE');
        setSaveError(new Error(messages.characters.visibilityHint));
        return;
      }
    }
    const createdInitially = currentCharacter.current === null;
    if (await persistForm(true)) {
      if (publishing) {
        const saved = currentCharacter.current;
        if (!saved) return;
        setSaveState('SUBMITTING');
        try {
          const visibility = getFormString(new FormData(form), 'visibility') as
            'PUBLIC' | 'UNLISTED';
          await apiRequest(`/api/v1/characters/${saved.id}/publish`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ visibility }),
          });
          setSaveState('SUCCESS');
          await client.invalidateQueries({ queryKey: ['characters'] });
          notify(messages.characters.published);
          onClose();
        } catch (error) {
          setSaveState('FAILED');
          setSaveError(error instanceof Error ? error : new Error(messages.characters.saveFailed));
        }
        return;
      }
      setSaveState('SUCCESS');
      notify(createdInitially ? messages.characters.created : messages.characters.versionSaved);
      onClose();
    }
  };
  return (
    <Editor
      className="character-editor-view"
      title={existing ? messages.characters.editorTitle : messages.characters.newTitle}
      onCancel={onClose}
      onSubmit={(event) => {
        void submit(event);
      }}
      pending={saveState === 'SAVING'}
      error={saveError}
      formRef={formRef}
      onInput={scheduleAutosave}
      hideDefaultActions
      status={
        <span className={`save-status is-${saveState.toLowerCase()}`} role="status">
          {saveState === 'SAVING'
            ? messages.characters.saving
            : saveState === 'SAVED'
              ? messages.characters.saved
              : saveState === 'VALIDATING' || saveState === 'SUBMITTING'
                ? messages.common.saving
                : saveState === 'SUCCESS'
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
        <input type="hidden" name="avatarFileId" value={previewAvatarId} />
        <div className="character-avatar-editor" aria-label={messages.characters.avatar}>
          <Avatar name={previewName} fileId={previewAvatarId || null} />
          <div>
            <strong>{messages.characters.avatar}</strong>
            <p className="meta">{messages.characters.avatarHint}</p>
          </div>
        </div>
        <ImageUploadControl
          capabilities={media.data?.capabilities}
          onUploaded={(uploaded) => {
            setPreviewAvatarId(uploaded.id);
            setAvatarFocalX(50);
            setAvatarFocalY(50);
            scheduleAutosave();
          }}
        />
        {previewAvatarId ? (
          <CharacterCropControl
            name={previewName}
            media={media.data?.items.find((item) => item.id === previewAvatarId) ?? null}
            focalX={avatarFocalX}
            focalY={avatarFocalY}
            onFocalXChange={setAvatarFocalX}
            onFocalYChange={setAvatarFocalY}
          />
        ) : null}
        {media.error ? <InlineError error={media.error} /> : null}
        <Field
          label={messages.characters.name}
          name="name"
          defaultValue={existing?.name}
          required
          maxLength={100}
          metrics
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
          metrics
        />
        <TextArea
          label={messages.characters.descriptionField}
          name="description"
          defaultValue={existing?.description}
          required
          minLength={20}
          maxLength={24_000}
          metrics
        />
      </fieldset>
      <fieldset className="editor-section character-ai-assist">
        <legend>{assistCopy.title}</legend>
        <p>{assistCopy.description}</p>
        <Select
          label={assistCopy.title}
          name="assistTarget"
          defaultValue="firstMessage"
          value={assistTarget}
          onChange={(value) => {
            setAssistTarget(value as CharacterAssistTarget);
            setAssistSuggestion(null);
            characterAssist.reset();
          }}
          options={[
            ['tagline', messages.characters.tagline],
            ['description', messages.characters.descriptionField],
            ['personality', messages.characters.personalityField],
            ['firstMessage', messages.characters.firstMessage],
          ]}
        />
        <button
          className="secondary character-assist-generate"
          type="button"
          disabled={characterAssist.isPending}
          onClick={() => {
            setAssistSuggestion(null);
            characterAssist.mutate();
          }}
        >
          <VeloraIcon name="sparkle" size={18} />
          {characterAssist.isPending ? messages.common.saving : assistCopy.generate}
        </button>
        {assistSuggestion ? (
          <section className="character-assist-result" aria-live="polite">
            <strong>{assistCopy.suggestion}</strong>
            <p>{assistSuggestion}</p>
            <div>
              <button
                className="primary"
                type="button"
                onClick={() => {
                  const form = formRef.current;
                  if (!form || !applyCharacterAssistValue(form, assistTarget, assistSuggestion)) {
                    return;
                  }
                  setAssistSuggestion(null);
                  notify(assistCopy.applied);
                }}
              >
                {messages.common.save}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setAssistSuggestion(null);
                }}
              >
                {messages.common.cancel}
              </button>
            </div>
          </section>
        ) : null}
        <InlineError error={characterAssist.error} />
      </fieldset>
      <fieldset className="editor-section">
        <legend>{messages.characters.personalitySection}</legend>
        <TextArea
          label={messages.characters.personalityField}
          name="personality"
          defaultValue={existing?.personality}
          required
          minLength={20}
          maxLength={24_000}
          metrics
        />
        <Switch
          name="personalityVisible"
          label={`${messages.characters.personalitySection} · ${messages.characters.publicVisibility}`}
          defaultChecked={existing?.personalityVisible ?? false}
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
          metrics
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
          <Suspense fallback={<span className="meta">{messages.characters.emptyGreeting}</span>}>
            <SafeMarkdown
              content={
                renderTemplate(previewGreeting, {
                  char: previewName,
                  user: messages.characters.userPersonaFallback,
                  persona: messages.characters.userPersonaFallback,
                  scenario: '',
                  description: '',
                  memory: '',
                }).value || messages.characters.emptyGreeting
              }
            />
          </Suspense>
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
          maxLength={819}
          metrics
        />
        <SegmentedControl
          label={messages.characters.visibility}
          name="visibility"
          defaultValue={existing?.visibility ?? 'PRIVATE'}
          options={[
            { value: 'PUBLIC', label: messages.characters.publicVisibility },
            { value: 'PRIVATE', label: messages.characters.privateVisibility },
            { value: 'UNLISTED', label: messages.characters.unlistedVisibility },
          ]}
          description={messages.characters.visibilityHint}
        />
        <div className="field-row">
          <Select
            label={messages.characters.language}
            name="language"
            defaultValue={existing?.language ?? 'ru'}
            options={characterLanguages.map(
              (language) => [language.code, language.nativeName] as const,
            )}
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
          <Select
            label={messages.discovery.groupSizeFilter}
            name="groupSize"
            defaultValue={existing?.groupSize ?? 'single'}
            options={characterGroupSizes.map(
              ({ code }) => [code, messages.discovery.groupSizeLabels[code]] as const,
            )}
          />
        </div>
        {!autosaveEnabled ? <p className="meta">{messages.characters.manualSaveHint}</p> : null}
        <section
          className={`prompt-budget${promptMetrics.withinBudget ? '' : ' is-over'}`}
          aria-label={messages.characters.promptBudgetLabel}
        >
          <div>
            <strong>
              {messages.characters.promptBudget(promptMetrics.tokens, promptMetrics.budget)}
            </strong>
            <span>{messages.characters.promptCharacters(promptMetrics.characters)}</span>
          </div>
          <progress
            value={Math.min(promptMetrics.tokens, promptMetrics.budget)}
            max={promptMetrics.budget}
          />
          <p>
            {promptMetrics.withinBudget
              ? messages.characters.promptBudgetHint
              : messages.characters.promptBudgetExceeded}
          </p>
        </section>
        <label className="policy-acknowledgement">
          <input
            type="checkbox"
            checked={policyAccepted}
            onChange={(event) => {
              setPolicyAccepted(event.currentTarget.checked);
              if (
                event.currentTarget.checked &&
                saveError?.message === messages.onboarding.policyText
              ) {
                setSaveError(null);
              }
            }}
          />
          <span>
            <strong>{messages.onboarding.policyTitle}</strong>
            <small>{messages.onboarding.policyText}</small>
          </span>
        </label>
      </fieldset>
      {existing ? (
        <fieldset className="editor-section character-avatar-bot-section">
          <legend>{messages.characters.avatarBotTitle}</legend>
          <p>{messages.characters.avatarBotDescription}</p>
          <button
            className="secondary"
            type="button"
            disabled={account.plan !== 'PRO' || createAvatarBot.isPending}
            onClick={() => {
              createAvatarBot.mutate(existing.id);
            }}
          >
            {account.plan === 'PRO'
              ? messages.characters.avatarBotCreate
              : messages.characters.avatarBotProRequired}
          </button>
          <InlineError error={createAvatarBot.error} />
        </fieldset>
      ) : null}
      <div className="character-editor-submit-actions">
        <button
          className="secondary"
          type="submit"
          name="characterAction"
          value="draft"
          disabled={saveState === 'SAVING' || saveState === 'SUBMITTING'}
        >
          {messages.common.save} {messages.characters.stateDraft.toLocaleLowerCase()}
        </button>
        <button
          className="primary"
          type="submit"
          name="characterAction"
          value="publish"
          disabled={saveState === 'SAVING' || saveState === 'SUBMITTING'}
        >
          {messages.characters.publish}
        </button>
        <button className="secondary character-editor-cancel" type="button" onClick={onClose}>
          {messages.common.cancel}
        </button>
      </div>
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
            nsfwVisible: data.get('nsfwVisible') === 'on',
            safeSearch: data.get('safeSearch') === 'on',
            matureImageBlur: data.get('matureImageBlur') === 'on',
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
        <fieldset className="settings-safety-group">
          <legend>{messages.settings.contentSafety}</legend>
          <Checkbox
            name="nsfwVisible"
            label={messages.settings.matureContent}
            description={messages.settings.matureContentText}
            defaultChecked={settings.data.nsfwVisible}
            disabled={!account.ageGateAccepted}
          />
          <Checkbox
            name="safeSearch"
            label={messages.settings.safeSearch}
            description={messages.settings.safeSearchText}
            defaultChecked={settings.data.safeSearch}
          />
          <Checkbox
            name="matureImageBlur"
            label={messages.settings.matureImageBlur}
            description={messages.settings.matureImageBlurText}
            defaultChecked={settings.data.matureImageBlur}
          />
          {!account.ageGateAccepted ? (
            <p className="meta">{messages.settings.ageGateRequired}</p>
          ) : null}
        </fieldset>
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
        <div className="list-stack" role="list" aria-label={messages.support.myRequests}>
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
          <p className="meta">{messages.billing.currentPlan(account.planDisplayName)}</p>
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
        <Dialog
          backdropClassName="account-dialog-backdrop"
          className="account-dialog"
          labelledBy="confirm-deletion-title"
          role="alertdialog"
          onClose={() => {
            setShowDeletionDialog(false);
            setDeletionConfirmation('');
          }}
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
        </Dialog>
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

function CharacterCropControl({
  name,
  media,
  focalX,
  focalY,
  onFocalXChange,
  onFocalYChange,
}: {
  readonly name: string;
  readonly media: MediaFile | null;
  readonly focalX: number;
  readonly focalY: number;
  readonly onFocalXChange: (value: number) => void;
  readonly onFocalYChange: (value: number) => void;
}) {
  const { messages } = useI18n();
  const [loadedGeometry, setLoadedGeometry] = useState<CharacterImageGeometry | null>(null);
  const storedGeometry =
    media?.width && media.height
      ? classifyCharacterImageGeometry(media.width, media.height)
      : 'invalid';
  const geometry = loadedGeometry ?? storedGeometry;
  const unusual = geometry === 'extreme-landscape' || geometry === 'extreme-portrait';

  return (
    <fieldset className="character-crop-control">
      <legend>{messages.characters.cropTitle}</legend>
      <div className="character-crop-preview" data-image-geometry={geometry}>
        <CharacterImage
          fileId={media?.id ?? null}
          alt={messages.characters.cropPreviewAlt(name)}
          focalX={focalX}
          focalY={focalY}
          fallback={<span>{name.slice(0, 1).toUpperCase()}</span>}
          onGeometry={setLoadedGeometry}
        />
      </div>
      <p className="meta">
        {media?.width && media.height
          ? messages.characters.imageDimensions(media.width, media.height)
          : messages.characters.imageDimensionsPending}
      </p>
      {unusual ? <p className="crop-warning">{messages.characters.unusualAspectRatio}</p> : null}
      <label className="crop-range">
        <span>
          {messages.characters.cropHorizontal}: <output>{Math.round(focalX)}%</output>
        </span>
        <input
          type="range"
          name="avatarFocalX"
          min="0"
          max="100"
          step="1"
          value={focalX}
          onChange={(event) => {
            onFocalXChange(Number(event.currentTarget.value));
          }}
        />
      </label>
      <label className="crop-range">
        <span>
          {messages.characters.cropVertical}: <output>{Math.round(focalY)}%</output>
        </span>
        <input
          type="range"
          name="avatarFocalY"
          min="0"
          max="100"
          step="1"
          value={focalY}
          onChange={(event) => {
            onFocalYChange(Number(event.currentTarget.value));
          }}
        />
      </label>
      <p className="meta">{messages.characters.cropHint}</p>
    </fieldset>
  );
}

function Avatar({
  name,
  fileId,
  focalX = 50,
  focalY = 50,
}: {
  readonly name: string;
  readonly fileId: string | null;
  readonly focalX?: number;
  readonly focalY?: number;
}) {
  return (
    <div className="avatar">
      <CharacterImage
        fileId={fileId}
        alt={name}
        focalX={focalX}
        focalY={focalY}
        fallback={name.slice(0, 1).toUpperCase()}
        previewable
      />
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
  className,
  title,
  onCancel,
  onSubmit,
  pending,
  error,
  formRef,
  onInput,
  status,
  hideDefaultActions = false,
  children,
}: {
  readonly className?: string;
  readonly title: string;
  readonly onCancel: () => void;
  readonly onSubmit: (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => void;
  readonly pending: boolean;
  readonly error: Error | null;
  readonly formRef?: React.RefObject<HTMLFormElement | null>;
  readonly onInput?: () => void;
  readonly status?: React.ReactNode;
  readonly hideDefaultActions?: boolean;
  readonly children: React.ReactNode;
}) {
  const { messages } = useI18n();
  return (
    <div className={`view-stack${className ? ` ${className}` : ''}`}>
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
        {!hideDefaultActions ? (
          <div className="editor-actions">
            <button className="secondary" type="button" onClick={onCancel}>
              {messages.common.cancel}
            </button>
            <button className="primary" type="submit" disabled={pending}>
              {pending ? messages.common.saving : messages.common.save}
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
function Select({
  label,
  name,
  defaultValue,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly name: string;
  readonly defaultValue: string;
  readonly value?: string;
  readonly options: readonly (readonly [string, string])[];
  readonly onChange?: (value: string) => void;
}) {
  return (
    <Dropdown
      label={label}
      name={name}
      defaultValue={defaultValue}
      options={options}
      {...(value === undefined ? {} : { value })}
      {...(onChange === undefined ? {} : { onChange })}
    />
  );
}

type CharacterAssistTarget = 'tagline' | 'description' | 'personality' | 'firstMessage';

export function applyCharacterAssistValue(
  form: HTMLFormElement,
  target: CharacterAssistTarget,
  suggestion: string,
): boolean {
  const control = form.elements.namedItem(target);
  if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement))
    return false;
  const prototype =
    control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (!descriptor?.set) return false;
  descriptor.set.call(control, suggestion);
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.focus({ preventScroll: true });
  return true;
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
