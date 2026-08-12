import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, setCsrfToken } from './api';
import { detectWebLocale, I18nProvider, useI18n, type Locale } from './i18n';
import { OfflineBanner, useOnlineStatus } from './online-status';
import { initializeTelegram } from './telegram';
import type { AuthResponse, MeResponse } from './types';

interface HealthResponse {
  readonly status: string;
}

const AuthenticatedApp = lazy(async () => {
  const module = await import('./AuthenticatedApp');
  return { default: module.AuthenticatedApp };
});

type AuthState =
  | { readonly status: 'checking' }
  | { readonly status: 'standalone' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly user: MeResponse };

const csrfStorageKey = 'velora.csrf';

export function App() {
  const [locale, setLocale] = useState<Locale>(detectWebLocale);
  return (
    <I18nProvider locale={locale}>
      <AppContent onLocaleResolved={setLocale} />
    </I18nProvider>
  );
}

function AppContent({ onLocaleResolved }: { readonly onLocaleResolved: (locale: Locale) => void }) {
  const { messages } = useI18n();
  const telegram = useMemo(() => initializeTelegram(), []);
  const online = useOnlineStatus();
  const [authState, setAuthState] = useState<AuthState>({ status: 'checking' });
  const [authAttempt, setAuthAttempt] = useState(0);
  const authenticatedRef = useRef(false);
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiRequest<HealthResponse>('/health'),
    enabled: online,
  });

  useEffect(() => {
    let active = true;
    const authenticate = async () => {
      if (!online) {
        if (active) {
          setAuthState((current) =>
            current.status === 'ready'
              ? current
              : {
                  status: 'error',
                  message: messages.shell.offlineAuth,
                },
          );
        }
        return;
      }
      if (authenticatedRef.current) return;
      if (!telegram?.initData) {
        if (active) setAuthState({ status: 'standalone' });
        return;
      }
      if (active) setAuthState({ status: 'checking' });
      try {
        const storedCsrf = sessionStorage.getItem(csrfStorageKey);
        if (storedCsrf) {
          setCsrfToken(storedCsrf);
          try {
            const user = await apiRequest<MeResponse>('/api/v1/me');
            if (active) {
              authenticatedRef.current = true;
              onLocaleResolved(user.locale);
              setAuthState({ status: 'ready', user });
            }
            return;
          } catch {
            sessionStorage.removeItem(csrfStorageKey);
          }
        }
        const auth = await apiRequest<AuthResponse>('/api/v1/auth/telegram', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ initData: telegram.initData }),
        });
        setCsrfToken(auth.csrfToken);
        sessionStorage.setItem(csrfStorageKey, auth.csrfToken);
        const user = await apiRequest<MeResponse>('/api/v1/me');
        if (active) {
          authenticatedRef.current = true;
          onLocaleResolved(user.locale);
          setAuthState({ status: 'ready', user });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : messages.shell.authFailed;
        if (active) setAuthState({ status: 'error', message });
      }
    };
    void authenticate();
    return () => {
      active = false;
    };
  }, [
    authAttempt,
    messages.shell.authFailed,
    messages.shell.offlineAuth,
    onLocaleResolved,
    online,
    telegram,
  ]);

  if (authState.status === 'ready') {
    return (
      <>
        <OfflineBanner online={online} />
        <Suspense fallback={<AuthenticatedShellFallback />}>
          <AuthenticatedApp initialUser={authState.user} onLocaleChange={onLocaleResolved} />
        </Suspense>
      </>
    );
  }

  return (
    <main className="app-shell landing-shell">
      <OfflineBanner online={online} />
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="#top" aria-label={messages.shell.homeLabel}>
          <span className="brand-mark">V</span>
          <span>
            <strong>Velora</strong>
            <small>stories that remember</small>
          </span>
        </a>
        <span
          className={`service-dot ${health.data?.status === 'ok' ? 'is-ready' : ''}`}
          aria-label={messages.shell.serviceStatus}
        />
      </header>
      <section id="top" className="hero">
        <p className="eyebrow">{messages.shell.eyebrow}</p>
        <h1>{messages.shell.title}</h1>
        <p className="lead">{messages.shell.intro}</p>
        {authState.status === 'checking' ? (
          <button className="primary" type="button" disabled>
            {messages.shell.preparing}
          </button>
        ) : null}
        {authState.status === 'error' ? (
          <>
            <button
              className="primary"
              type="button"
              onClick={() => {
                setAuthAttempt((value) => value + 1);
              }}
            >
              {messages.shell.retry}
            </button>
            <p className="error" role="alert">
              {authState.message}
            </p>
          </>
        ) : null}
        {authState.status === 'standalone' ? (
          <div className="standalone" role="status">
            <span>◈</span>
            <p>{messages.shell.standalone}</p>
          </div>
        ) : null}
      </section>
      <section className="principles" aria-label={messages.shell.capabilities}>
        <article>
          <span>∞</span>
          <h2>{messages.shell.memory}</h2>
          <p>{messages.shell.memoryText}</p>
        </article>
        <article>
          <span>✦</span>
          <h2>{messages.shell.characters}</h2>
          <p>{messages.shell.charactersText}</p>
        </article>
        <article>
          <span>◒</span>
          <h2>{messages.shell.control}</h2>
          <p>{messages.shell.controlText}</p>
        </article>
      </section>
      <aside className="security-note">
        <span>⌁</span>
        <p>{messages.shell.secure}</p>
      </aside>
    </main>
  );
}

function AuthenticatedShellFallback() {
  const { messages } = useI18n();
  return (
    <main className="app-shell product-shell" aria-busy="true">
      <section className="workspace loading-workspace" role="status">
        <span className="loading-orbit" aria-hidden="true" />
        <p>{messages.shell.preparing}</p>
      </section>
    </main>
  );
}
