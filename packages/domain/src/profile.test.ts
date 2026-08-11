import { describe, expect, it } from 'vitest';
import { userProfilePatchSchema } from './index';

describe('user profile contract', () => {
  it('accepts a bounded independent product profile', () => {
    expect(
      userProfilePatchSchema.parse({
        displayName: 'Автор историй',
        bio: 'Создаю спокойные приключения.',
        avatarFileId: null,
        visibility: 'PUBLIC',
      }),
    ).toMatchObject({ displayName: 'Автор историй', visibility: 'PUBLIC' });
  });

  it('rejects empty names and undeclared Telegram identity fields', () => {
    expect(() =>
      userProfilePatchSchema.parse({
        displayName: '',
        bio: '',
        avatarFileId: null,
        visibility: 'PUBLIC',
      }),
    ).toThrow();
    expect(() =>
      userProfilePatchSchema.parse({
        displayName: 'Имя',
        bio: '',
        avatarFileId: null,
        visibility: 'PUBLIC',
        telegramUsername: 'leak',
      }),
    ).toThrow();
  });
});
