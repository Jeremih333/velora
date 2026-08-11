import { describe, expect, it } from 'vitest';
import { characterInputSchema, characterPatchSchema } from './index';

const validCharacter = {
  name: 'Элиас',
  tagline: 'Хранитель забытого архива',
  description: 'Хранитель, который знает слишком много забытых историй.',
  personality: 'Спокойный, внимательный и немного ироничный собеседник.',
  firstMessage: 'Ты всё-таки нашёл дорогу, {{user}}.',
  language: 'ru',
  contentRating: 'SAFE',
};

describe('character input', () => {
  it('applies private and non-destructive defaults', () => {
    expect(characterInputSchema.parse(validCharacter)).toMatchObject({
      visibility: 'PRIVATE',
      avatarFileId: null,
      tags: [],
      alternateGreetings: [],
      systemInstructions: '',
    });
  });

  it('does not let clients select moderation-only visibility or issue empty edits', () => {
    expect(() =>
      characterInputSchema.parse({ ...validCharacter, visibility: 'MODERATION_HIDDEN' }),
    ).toThrow();
    expect(() => characterPatchSchema.parse({ baseVersion: 1 })).toThrow();
  });
});
