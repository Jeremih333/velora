// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useTelegramBackButton,
  useTelegramLifecycle,
  useTelegramSafeArea,
  useTelegramTheme,
  useTelegramViewport,
} from './telegram-hooks';
import type { TelegramBackButton, TelegramEventType, TelegramWebApp } from './telegram';

type EventHandler = (event?: unknown) => void;

function telegramFixture() {
  const handlers = new Map<TelegramEventType, Set<EventHandler>>();
  let backHandler: (() => void) | null = null;
  let showCalls = 0;
  let hideCalls = 0;
  const backButton: TelegramBackButton = {
    isVisible: false,
    show: () => {
      showCalls += 1;
      return backButton;
    },
    hide: () => {
      hideCalls += 1;
      return backButton;
    },
    onClick: vi.fn((callback: () => void) => {
      backHandler = callback;
      return backButton;
    }),
    offClick: vi.fn((callback: () => void) => {
      if (backHandler === callback) backHandler = null;
      return backButton;
    }),
  };
  const webApp = {
    initData: 'signed',
    colorScheme: 'dark' as 'light' | 'dark',
    isActive: true,
    viewportHeight: 720,
    viewportStableHeight: 700,
    safeAreaInset: { top: 10, right: 2, bottom: 12, left: 2 },
    contentSafeAreaInset: { top: 44, right: 4, bottom: 24, left: 4 },
    BackButton: backButton,
    ready: vi.fn(),
    expand: vi.fn(),
    setHeaderColor: vi.fn(),
    setBackgroundColor: vi.fn(),
    openInvoice: vi.fn(),
    onEvent: vi.fn((event: TelegramEventType, handler: EventHandler) => {
      const listeners = handlers.get(event) ?? new Set<EventHandler>();
      listeners.add(handler);
      handlers.set(event, listeners);
    }),
    offEvent: vi.fn((event: TelegramEventType, handler: EventHandler) => {
      handlers.get(event)?.delete(handler);
    }),
  } satisfies TelegramWebApp;
  window.Telegram = { WebApp: webApp };
  return {
    webApp,
    backButton,
    getShowCalls: () => showCalls,
    getHideCalls: () => hideCalls,
    pressBack: () => backHandler?.(),
    emit: (event: TelegramEventType, payload?: unknown) => {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
}

function PlatformHarness() {
  const viewport = useTelegramViewport();
  const safeArea = useTelegramSafeArea();
  const theme = useTelegramTheme();
  const active = useTelegramLifecycle();
  return (
    <output data-testid="platform">{JSON.stringify({ viewport, safeArea, theme, active })}</output>
  );
}

function BackHarness({
  active,
  onBack,
}: {
  readonly active: boolean;
  readonly onBack: () => void;
}) {
  const native = useTelegramBackButton(active, onBack);
  return <output>{native ? 'native' : 'fallback'}</output>;
}

afterEach(() => {
  cleanup();
  delete window.Telegram;
  document.documentElement.removeAttribute('data-telegram-theme');
  document.documentElement.removeAttribute('data-telegram-active');
  document.documentElement.removeAttribute('data-telegram-viewport-stable');
  document.documentElement.removeAttribute('data-telegram-keyboard');
  document.documentElement.removeAttribute('style');
});

describe('Telegram platform hooks', () => {
  it('tracks stable viewport, both safe areas, theme and lifecycle events', () => {
    const fixture = telegramFixture();
    render(<PlatformHarness />);

    expect(screen.getByTestId('platform').textContent).toContain('"stableHeight":700');
    expect(document.documentElement.style.getPropertyValue('--velora-content-safe-area-top')).toBe(
      '44px',
    );

    fixture.webApp.viewportHeight = 610;
    fixture.webApp.viewportStableHeight = 608;
    fixture.webApp.colorScheme = 'light';
    fixture.webApp.contentSafeAreaInset = { top: 20, right: 3, bottom: 30, left: 3 };
    act(() => {
      fixture.emit('viewportChanged', { isStateStable: true });
      fixture.emit('contentSafeAreaChanged');
      fixture.emit('themeChanged');
      fixture.emit('deactivated');
    });

    const state = screen.getByTestId('platform').textContent;
    expect(state).toContain('"height":610');
    expect(state).toContain('"stableHeight":608');
    expect(state).toContain('"theme":"light"');
    expect(state).toContain('"active":false');
    expect(document.documentElement.dataset['telegramTheme']).toBe('light');
    expect(document.documentElement.dataset['telegramKeyboard']).toBe('closed');
    expect(
      document.documentElement.style.getPropertyValue('--velora-content-safe-area-bottom'),
    ).toBe('30px');

    fixture.webApp.viewportHeight = 420;
    fixture.webApp.viewportStableHeight = 700;
    act(() => {
      fixture.emit('viewportChanged', { isStateStable: false });
    });
    expect(document.documentElement.dataset['telegramKeyboard']).toBe('open');
    expect(document.documentElement.dataset['telegramViewportStable']).toBe('false');
  });

  it('uses the native back button only while a local back target is active', () => {
    const fixture = telegramFixture();
    const onBack = vi.fn();
    const view = render(<BackHarness active onBack={onBack} />);

    expect(screen.getByText('native')).toBeTruthy();
    expect(fixture.getShowCalls()).toBe(1);
    act(() => {
      fixture.pressBack();
    });
    expect(onBack).toHaveBeenCalledOnce();

    view.rerender(<BackHarness active={false} onBack={onBack} />);
    expect(screen.getByText('fallback')).toBeTruthy();
    expect(fixture.getHideCalls()).toBeGreaterThan(0);
  });
});
