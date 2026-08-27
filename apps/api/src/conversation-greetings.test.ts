import { describe, expect, it } from 'vitest';
import { planGreetingBackfill, renderConversationGreetings } from './conversation-routes';

describe('conversation greeting variants', () => {
  it('renders every stored greeting in stable order without an AI request', () => {
    expect(
      renderConversationGreetings(
        ['Привет, {{user}}.', '*{{char}} ждёт у пристани.*', '{{persona}} входит в сцену.'],
        {
          char: 'Катя',
          user: 'Даня',
          persona: 'Собеседник',
          scenario: 'Совёнок',
          description: 'Помощница вожатой',
        },
      ),
    ).toEqual(['Привет, Даня.', '*Катя ждёт у пристани.*', 'Собеседник входит в сцену.']);
  });

  it('restores the alternates a legacy conversation never stored', () => {
    const planned = planGreetingBackfill(
      ['Первое приветствие.', 'Второе приветствие.', 'Третье приветствие.'],
      [{ content: 'Первое приветствие.', metadataJson: '{"greetingIndex":0}', createdAt: 1_000 }],
    );
    expect(planned).toEqual([
      { index: 1, content: 'Второе приветствие.', createdAt: 1_001 },
      { index: 2, content: 'Третье приветствие.', createdAt: 1_002 },
    ]);
  });

  it('anchors restored alternates around the greeting the chat actually opened on', () => {
    const planned = planGreetingBackfill(
      ['Первое приветствие.', 'Второе приветствие.', 'Третье приветствие.'],
      [{ content: 'Второе приветствие.', metadataJson: '{"greetingIndex":1}', createdAt: 5_000 }],
    );
    expect(planned.map((greeting) => greeting.createdAt)).toEqual([4_999, 5_001]);
    expect(planned.map((greeting) => greeting.index)).toEqual([0, 2]);
  });

  it('falls back to matching on content when the stored index is unusable', () => {
    const planned = planGreetingBackfill(
      ['Первое приветствие.', 'Второе приветствие.'],
      [{ content: 'Второе приветствие.', metadataJson: null, createdAt: 900 }],
    );
    expect(planned).toEqual([{ index: 0, content: 'Первое приветствие.', createdAt: 899 }]);
  });

  it('never duplicates a greeting that is already present or was edited away', () => {
    expect(
      planGreetingBackfill(
        ['Первое приветствие.', 'Второе приветствие.'],
        [
          { content: 'Первое приветствие.', metadataJson: '{"greetingIndex":0}', createdAt: 10 },
          { content: 'Второе приветствие.', metadataJson: '{"greetingIndex":1}', createdAt: 11 },
        ],
      ),
    ).toEqual([]);
    expect(
      planGreetingBackfill(
        ['Единственное приветствие.'],
        [{ content: 'Что-то другое.', metadataJson: null, createdAt: 10 }],
      ),
    ).toEqual([]);
  });

  it('does nothing when the conversation has no greeting to anchor on', () => {
    expect(planGreetingBackfill(['Одно.', 'Два.'], [])).toEqual([]);
  });
});
