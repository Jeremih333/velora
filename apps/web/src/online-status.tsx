import { useSyncExternalStore } from 'react';
import { useI18n } from './i18n';

function subscribe(listener: () => void): () => void {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}

export function OfflineBanner({ online }: { readonly online: boolean }) {
  const { messages } = useI18n();
  if (online) return null;
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <strong>{messages.shell.offlineTitle}</strong>
      <span>{messages.shell.offlineText}</span>
    </div>
  );
}
