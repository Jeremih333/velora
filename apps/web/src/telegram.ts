export interface TelegramInsets {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export interface TelegramBackButton {
  readonly isVisible: boolean;
  show(): TelegramBackButton;
  hide(): TelegramBackButton;
  onClick(callback: () => void): TelegramBackButton;
  offClick(callback: () => void): TelegramBackButton;
}

export type TelegramEventType =
  | 'activated'
  | 'deactivated'
  | 'themeChanged'
  | 'viewportChanged'
  | 'safeAreaChanged'
  | 'contentSafeAreaChanged';

export interface TelegramWebApp {
  readonly initData: string;
  readonly colorScheme: 'light' | 'dark';
  readonly isActive?: boolean;
  readonly viewportHeight?: number;
  readonly viewportStableHeight?: number;
  readonly safeAreaInset?: TelegramInsets;
  readonly contentSafeAreaInset?: TelegramInsets;
  readonly BackButton?: TelegramBackButton;
  ready(): void;
  expand(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  openInvoice(url: string, callback?: (status: InvoiceStatus) => void): void;
  onEvent?(eventType: TelegramEventType, handler: (event?: unknown) => void): void;
  offEvent?(eventType: TelegramEventType, handler: (event?: unknown) => void): void;
}

export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending';

declare global {
  interface Window {
    Telegram?: { readonly WebApp: TelegramWebApp };
  }
}

export function initializeTelegram(): TelegramWebApp | null {
  const webApp = getTelegramWebApp();
  if (webApp) {
    webApp.ready();
    webApp.expand();
  }
  return webApp;
}

export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function openTelegramInvoice(
  url: string,
  callback: (status: InvoiceStatus) => void,
): boolean {
  const webApp = window.Telegram?.WebApp;
  if (!webApp?.openInvoice) return false;
  webApp.openInvoice(url, callback);
  return true;
}
