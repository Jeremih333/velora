// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { persistChatDraft, readChatDraft } from './chat-drafts';

describe('chat drafts', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('keeps drafts isolated by conversation and removes an empty draft', () => {
    persistChatDraft('conversation-a', 'Продолжим отсюда');
    persistChatDraft('conversation-b', 'Другая история');

    expect(readChatDraft('conversation-a')).toBe('Продолжим отсюда');
    expect(readChatDraft('conversation-b')).toBe('Другая история');

    persistChatDraft('conversation-a', '');
    expect(readChatDraft('conversation-a')).toBe('');
    expect(readChatDraft('conversation-b')).toBe('Другая история');
  });

  it('bounds restored text to the composer limit', () => {
    persistChatDraft('bounded', 'x'.repeat(8_100));
    expect(readChatDraft('bounded')).toHaveLength(8_000);
  });
});
