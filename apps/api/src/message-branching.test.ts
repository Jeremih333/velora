import { describe, expect, it } from 'vitest';
import { withVariantInfo } from './conversation-routes';

type Message = Parameters<typeof withVariantInfo>[0][number];

function message(
  id: string,
  role: Message['role'],
  parentMessageId: string | null,
  createdAt: number,
): Message {
  return {
    id,
    conversationId: 'conversation-1',
    role,
    content: id,
    contentFormat: 'MARKDOWN',
    status: 'COMPLETED',
    isGreeting: 0,
    editedByUser: 0,
    origin: 'LEGACY',
    parentMessageId,
    generationGroupId: null,
    model: null,
    provider: null,
    metadataJson: '{}',
    createdAt,
    updatedAt: createdAt,
    editedAt: null,
  };
}

describe('message branching metadata', () => {
  it('groups variants only by the same parent and role while preserving order', () => {
    const root = message('root', 'USER', null, 1);
    const first = message('assistant-a', 'ASSISTANT', root.id, 2);
    const second = message('assistant-b', 'ASSISTANT', root.id, 3);
    const userSibling = message('user-sibling', 'USER', root.id, 4);
    const result = withVariantInfo([root, second], [root, first, second, userSibling]);
    expect(result[0]).toMatchObject({ variantIndex: 0, variantCount: 1, variantIds: ['root'] });
    expect(result[1]).toMatchObject({
      variantIndex: 1,
      variantCount: 2,
      variantIds: ['assistant-a', 'assistant-b'],
    });
  });

  it('does not expose internal system messages as selectable variants', () => {
    const root = message('root', 'USER', null, 1);
    const assistant = message('assistant', 'ASSISTANT', root.id, 2);
    const internal = message('internal', 'INTERNAL', root.id, 3);
    expect(withVariantInfo([assistant], [root, assistant, internal])[0]).toMatchObject({
      variantCount: 1,
      variantIds: ['assistant'],
    });
  });

  it('returns safe empty metadata when stored metadata is malformed', () => {
    const malformed = { ...message('assistant', 'ASSISTANT', 'root', 2), metadataJson: '{' };
    expect(withVariantInfo([malformed], [malformed])[0]?.metadata).toEqual({});
  });

  it('attaches the current user reaction to the exact generated assistant response', () => {
    const assistant = message('assistant', 'ASSISTANT', 'root', 2);
    const reactions = new Map([
      [
        assistant.id,
        {
          generationId: 'generation-1',
          reaction: 'EXCEPTIONAL' as const,
        },
      ],
    ]);

    expect(withVariantInfo([assistant], [assistant], reactions)[0]).toMatchObject({
      id: assistant.id,
      generationId: 'generation-1',
      reaction: 'EXCEPTIONAL',
    });
  });
});
