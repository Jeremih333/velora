interface TelegramWebApp {
  readonly initData: string;
  readonly colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  openInvoice(url: string, callback?: (status: InvoiceStatus) => void): void;
}

export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending';

declare global {
  interface Window {
    Telegram?: { readonly WebApp: TelegramWebApp };
  }
}

export function initializeTelegram(): TelegramWebApp | null {
  const webApp = window.Telegram?.WebApp ?? null;
  if (webApp) {
    webApp.ready();
    webApp.expand();
  }
  return webApp;
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
