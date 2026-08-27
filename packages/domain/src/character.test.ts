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
      avatarFocalX: 50,
      avatarFocalY: 50,
      personalityVisible: false,
      tags: [],
      alternateGreetings: [],
      systemInstructions: '',
    });
  });

  it('keeps personality private by default and accepts an explicit public setting', () => {
    expect(characterInputSchema.parse(validCharacter).personalityVisible).toBe(false);
    expect(
      characterInputSchema.parse({ ...validCharacter, personalityVisible: true })
        .personalityVisible,
    ).toBe(true);
    expect(characterPatchSchema.parse({ baseVersion: 1, personalityVisible: true })).toMatchObject({
      personalityVisible: true,
    });
  });

  it('accepts bounded focal points and rejects crop coordinates outside the image', () => {
    expect(
      characterInputSchema.parse({ ...validCharacter, avatarFocalX: 12.5, avatarFocalY: 87 }),
    ).toMatchObject({ avatarFocalX: 12.5, avatarFocalY: 87 });
    expect(() => characterInputSchema.parse({ ...validCharacter, avatarFocalX: -1 })).toThrow();
    expect(() => characterPatchSchema.parse({ baseVersion: 1, avatarFocalY: 101 })).toThrow();
  });

  it('does not let clients select moderation-only visibility or issue empty edits', () => {
    expect(() =>
      characterInputSchema.parse({ ...validCharacter, visibility: 'MODERATION_HIDDEN' }),
    ).toThrow();
    expect(() => characterPatchSchema.parse({ baseVersion: 1 })).toThrow();
  });
});
