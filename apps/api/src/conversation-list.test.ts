import { describe, expect, it } from 'vitest';
import { conversationPersonaName, escapeConversationLike } from './conversation-routes';

describe('conversation list helpers', () => {
  it('escapes every SQLite LIKE metacharacter in user search', () => {
    expect(escapeConversationLike('100%_story\\name')).toBe('100\\%\\_story\\\\name');
  });

  it('reads only a non-empty persona name from a valid immutable snapshot', () => {
    expect(conversationPersonaName('{"name":" Странница ","private":"ignored"}')).toBe('Странница');
    expect(conversationPersonaName('{"name":""}')).toBeNull();
    expect(conversationPersonaName('{broken')).toBeNull();
    expect(conversationPersonaName(null)).toBeNull();
  });
});
