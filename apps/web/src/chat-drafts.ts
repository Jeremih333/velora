const CHAT_DRAFT_PREFIX = 'velora:chat-draft:';
const MAX_CHAT_DRAFT_LENGTH = 8_000;

function storageKey(conversationId: string): string {
  return `${CHAT_DRAFT_PREFIX}${conversationId}`;
}

export function readChatDraft(conversationId: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return (window.localStorage.getItem(storageKey(conversationId)) ?? '').slice(
      0,
      MAX_CHAT_DRAFT_LENGTH,
    );
  } catch {
    return '';
  }
}

export function persistChatDraft(conversationId: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    const bounded = value.slice(0, MAX_CHAT_DRAFT_LENGTH);
    if (bounded) window.localStorage.setItem(storageKey(conversationId), bounded);
    else window.localStorage.removeItem(storageKey(conversationId));
  } catch {
    // Private browsing or a full storage quota must not break the composer.
  }
}
