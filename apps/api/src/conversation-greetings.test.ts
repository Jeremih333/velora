import { describe, expect, it } from 'vitest';
import { renderConversationGreetings } from './conversation-routes';

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
});
