import { useEffect, useState } from 'react';
import { getTelegramWebApp, type TelegramInsets, type TelegramWebApp } from './telegram';

const ZERO_INSETS: TelegramInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export interface TelegramViewportState {
  readonly height: number;
  readonly stableHeight: number;
  readonly stable: boolean;
}

export interface TelegramSafeAreaState {
  readonly device: TelegramInsets;
  readonly content: TelegramInsets;
}

function finitePositive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizedInsets(value: TelegramInsets | undefined): TelegramInsets {
  if (!value) return ZERO_INSETS;
  return {
    top: Math.max(0, value.top),
    right: Math.max(0, value.right),
    bottom: Math.max(0, value.bottom),
    left: Math.max(0, value.left),
  };
}

function browserHeight(): number {
  return finitePositive(window.visualViewport?.height, window.innerHeight);
}

function readViewport(webApp: TelegramWebApp | null, stable: boolean): TelegramViewportState {
  const fallback = browserHeight();
  return {
    height: finitePositive(webApp?.viewportHeight, fallback),
    stableHeight: finitePositive(webApp?.viewportStableHeight, fallback),
    stable,
  };
}

function writeViewportVariables(value: TelegramViewportState): void {
  const root = document.documentElement.style;
  root.setProperty('--velora-viewport-height', `${String(value.height)}px`);
  root.setProperty('--velora-viewport-stable-height', `${String(value.stableHeight)}px`);
  document.documentElement.dataset['telegramViewportStable'] = String(value.stable);
  document.documentElement.dataset['telegramKeyboard'] =
    value.stableHeight - value.height >= 80 ? 'open' : 'closed';
}

function writeInsetVariables(value: TelegramSafeAreaState): void {
  const root = document.documentElement.style;
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    root.setProperty(`--velora-safe-area-${side}`, `${String(value.device[side])}px`);
    root.setProperty(`--velora-content-safe-area-${side}`, `${String(value.content[side])}px`);
  }
}

export function useTelegramViewport(): TelegramViewportState {
  const [value, setValue] = useState<TelegramViewportState>(() =>
    readViewport(getTelegramWebApp(), true),
  );

  useEffect(() => {
    const webApp = getTelegramWebApp();
    const update = (event?: unknown) => {
      const stable =
        typeof event === 'object' && event !== null && 'isStateStable' in event
          ? event.isStateStable === true
          : true;
      const next = readViewport(webApp, stable);
      writeViewportVariables(next);
      setValue(next);
    };
    update();
    webApp?.onEvent?.('viewportChanged', update);
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      webApp?.offEvent?.('viewportChanged', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return value;
}

export function useTelegramSafeArea(): TelegramSafeAreaState {
  const read = (): TelegramSafeAreaState => {
    const webApp = getTelegramWebApp();
    return {
      device: normalizedInsets(webApp?.safeAreaInset),
      content: normalizedInsets(webApp?.contentSafeAreaInset),
    };
  };
  const [value, setValue] = useState<TelegramSafeAreaState>(read);

  useEffect(() => {
    const webApp = getTelegramWebApp();
    const update = () => {
      const next = read();
      writeInsetVariables(next);
      setValue(next);
    };
    update();
    webApp?.onEvent?.('safeAreaChanged', update);
    webApp?.onEvent?.('contentSafeAreaChanged', update);
    return () => {
      webApp?.offEvent?.('safeAreaChanged', update);
      webApp?.offEvent?.('contentSafeAreaChanged', update);
    };
  }, []);

  return value;
}

export function useTelegramBackButton(active: boolean, onBack: () => void): boolean {
  const backButton = getTelegramWebApp()?.BackButton;
  useEffect(() => {
    if (!backButton || !active) {
      backButton?.hide();
      return;
    }
    backButton.onClick(onBack).show();
    return () => {
      backButton.offClick(onBack).hide();
    };
  }, [active, backButton, onBack]);
  return Boolean(backButton && active);
}

export function useTelegramTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => getTelegramWebApp()?.colorScheme ?? 'dark',
  );
  useEffect(() => {
    const webApp = getTelegramWebApp();
    const update = () => {
      const next = webApp?.colorScheme ?? 'dark';
      document.documentElement.dataset['telegramTheme'] = next;
      setTheme(next);
    };
    update();
    webApp?.onEvent?.('themeChanged', update);
    return () => {
      webApp?.offEvent?.('themeChanged', update);
    };
  }, []);
  return theme;
}

export function useTelegramLifecycle(): boolean {
  const [active, setActive] = useState(() => getTelegramWebApp()?.isActive ?? true);
  useEffect(() => {
    const webApp = getTelegramWebApp();
    const activate = () => {
      document.documentElement.dataset['telegramActive'] = 'true';
      setActive(true);
    };
    const deactivate = () => {
      document.documentElement.dataset['telegramActive'] = 'false';
      setActive(false);
    };
    if (webApp?.isActive === false) deactivate();
    else activate();
    webApp?.onEvent?.('activated', activate);
    webApp?.onEvent?.('deactivated', deactivate);
    return () => {
      webApp?.offEvent?.('activated', activate);
      webApp?.offEvent?.('deactivated', deactivate);
    };
  }, []);
  return active;
}
