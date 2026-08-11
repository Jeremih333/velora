import { useSyncExternalStore } from 'react';

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
  if (online) return null;
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <strong>Нет подключения</strong>
      <span>Введённый текст не будет очищен. Повтори отправку после восстановления сети.</span>
    </div>
  );
}
