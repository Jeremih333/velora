import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, setCsrfToken } from './api';
import { AuthenticatedApp } from './AuthenticatedApp';
import { ru } from './i18n';
import { OfflineBanner, useOnlineStatus } from './online-status';
import { initializeTelegram } from './telegram';
import type { AuthResponse, MeResponse } from './types';

interface HealthResponse {
  readonly status: string;
}

type AuthState =
  | { readonly status: 'checking' }
  | { readonly status: 'standalone' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly user: MeResponse };

const csrfStorageKey = 'velora.csrf';

export function App() {
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
                  message:
                    'Нет подключения к сети. Вход продолжится автоматически после восстановления.',
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
          setAuthState({ status: 'ready', user });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Не удалось подтвердить вход.';
        if (active) setAuthState({ status: 'error', message });
      }
    };
    void authenticate();
    return () => {
      active = false;
    };
  }, [authAttempt, online, telegram]);

  if (authState.status === 'ready') {
    return (
      <>
        <OfflineBanner online={online} />
        <AuthenticatedApp initialUser={authState.user} />
      </>
    );
  }

  return (
    <main className="app-shell landing-shell">
      <OfflineBanner online={online} />
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Velora — на главную">
          <span className="brand-mark">V</span>
          <span>
            <strong>Velora</strong>
            <small>stories that remember</small>
          </span>
        </a>
        <span
          className={`service-dot ${health.data?.status === 'ok' ? 'is-ready' : ''}`}
          aria-label="Состояние сервиса"
        />
      </header>
      <section id="top" className="hero">
        <p className="eyebrow">{ru.eyebrow}</p>
        <h1>{ru.title}</h1>
        <p className="lead">{ru.intro}</p>
        {authState.status === 'checking' ? (
          <button className="primary" type="button" disabled>
            {ru.preparing}
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
              {ru.retry}
            </button>
            <p className="error" role="alert">
              {authState.message}
            </p>
          </>
        ) : null}
        {authState.status === 'standalone' ? (
          <div className="standalone" role="status">
            <span>◈</span>
            <p>{ru.standalone}</p>
          </div>
        ) : null}
      </section>
      <section className="principles" aria-label="Возможности Velora">
        <article>
          <span>∞</span>
          <h2>{ru.memory}</h2>
          <p>{ru.memoryText}</p>
        </article>
        <article>
          <span>✦</span>
          <h2>{ru.characters}</h2>
          <p>{ru.charactersText}</p>
        </article>
        <article>
          <span>◒</span>
          <h2>{ru.control}</h2>
          <p>{ru.controlText}</p>
        </article>
      </section>
      <aside className="security-note">
        <span>⌁</span>
        <p>{ru.secure}</p>
      </aside>
    </main>
  );
}
