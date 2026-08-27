import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getTelegramWebApp } from './telegram';

/**
 * Telegram exposes a single back button for the whole Mini App, so every screen
 * that wants one is really writing to the same global control. The last writer
 * used to win: closing the side drawer ran its hide() after the chat had asked
 * for the button again, which left the chat with no native arrow and no in-app
 * arrow either, because the chat had been told the native one was showing.
 *
 * These consumers form a stack instead. Only the topmost one owns the button,
 * and removing a consumer hands it back to the screen underneath. Visibility is
 * read from the client's own isVisible flag rather than assumed, so a client
 * that ignores show() reports false and the caller keeps its in-app arrow.
 */
interface BackButtonConsumer {
  readonly onBack: () => void;
}

const backButtonConsumers: BackButtonConsumer[] = [];
const backButtonListeners = new Set<() => void>();
let backButtonHandler: (() => void) | null = null;
let backButtonVisible = false;

function syncBackButton(): void {
  const backButton = getTelegramWebApp()?.BackButton;
  const owner = backButtonConsumers.at(-1) ?? null;
  if (backButton && backButtonHandler) {
    backButton.offClick(backButtonHandler);
    backButtonHandler = null;
  }
  if (!backButton || !owner) {
    backButton?.hide();
    backButtonVisible = false;
  } else {
    backButtonHandler = owner.onBack;
    backButton.onClick(backButtonHandler).show();
    backButtonVisible = backButton.isVisible;
  }
  for (const listener of backButtonListeners) listener();
}

function subscribeBackButton(listener: () => void): () => void {
  backButtonListeners.add(listener);
  return () => {
    backButtonListeners.delete(listener);
  };
}

function readBackButtonVisible(): boolean {
  return backButtonVisible;
}

export function useTelegramBackButton(active: boolean, onBack: () => void): boolean {
  const visible = useSyncExternalStore(subscribeBackButton, readBackButtonVisible, () => false);
  // A back handler exists to read whatever state the screen is in right now, so
  // its identity changes on almost every render. Registering it through a ref
  // keeps that from re-entering the consumer stack each time, which would make
  // ownership churn and force callers into brittle dependency lists.
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  }, [onBack]);
  useEffect(() => {
    if (!active) return;
    const consumer: BackButtonConsumer = {
      onBack: () => {
        latest.current();
      },
    };
    backButtonConsumers.push(consumer);
    syncBackButton();
    return () => {
      const index = backButtonConsumers.lastIndexOf(consumer);
      if (index >= 0) backButtonConsumers.splice(index, 1);
      syncBackButton();
    };
  }, [active]);
  return active && visible;
}
