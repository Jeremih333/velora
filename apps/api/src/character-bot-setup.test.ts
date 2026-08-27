import { describe, expect, it } from 'vitest';
import {
  configurePendingCharacterBot,
  deriveWebhookSecret,
  looksLikeTelegramBotToken,
} from './character-bot-setup';

describe('character bot setup security', () => {
  it('accepts only Telegram-shaped bot tokens', () => {
    const shapedFixture = ['123456789', 'abcdefghijklmnopqrstuvwxyz_ABCD123456'].join(':');
    expect(looksLikeTelegramBotToken(shapedFixture)).toBe(true);
    expect(looksLikeTelegramBotToken('not-a-token')).toBe(false);
    expect(looksLikeTelegramBotToken('123456:token with spaces')).toBe(false);
  });

  it('derives stable bot-specific webhook secrets without exposing the key', async () => {
    const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
    const first = await deriveWebhookSecret(key, 'bot-one');
    expect(first).toBe(await deriveWebhookSecret(key, 'bot-one'));
    expect(first).not.toBe(await deriveWebhookSecret(key, 'bot-two'));
    expect(first).not.toContain(key);
  });

  it('reads the character name from the active version schema', async () => {
    let preparedSql = '';
    const statement = {
      bind: () => statement,
      first: () => Promise.resolve(null),
    };
    const database = {
      prepare: (sql: string) => {
        preparedSql = sql;
        return statement;
      },
    } as unknown as D1Database;
    const result = await configurePendingCharacterBot({
      database,
      ownerId: 'owner',
      token: 'unused',
      encryptionKey: 'unused',
      mainBotToken: 'unused',
      mainBotUsername: 'main_bot',
      publicAppUrl: 'https://example.com',
    });
    expect(result).toBeNull();
    expect(preparedSql).toContain('v.name AS characterName');
    expect(preparedSql).toContain('JOIN character_versions v ON v.id = c.active_version_id');
    expect(preparedSql).not.toContain('c.name AS characterName');
  });
});
