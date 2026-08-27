import { describe, expect, it } from 'vitest';
import {
  loreAttachmentSchema,
  lorebookImportSchema,
  lorebookInputSchema,
  lorebookTransferSchema,
  loreEntryInputSchema,
} from './index';

describe('lorebook contracts', () => {
  it('applies safe private and deterministic entry defaults', () => {
    expect(lorebookInputSchema.parse({ name: 'Архив' }).visibility).toBe('PRIVATE');
    expect(
      loreEntryInputSchema.parse({ title: 'Хранитель', content: 'Описание мира', keys: ['архив'] }),
    ).toMatchObject({
      enabled: true,
      scanDepth: 20,
      tokenBudget: 400,
      secondaryKeys: [],
    });
    expect(loreAttachmentSchema.parse({})).toEqual({ enabled: true });
  });

  it('accepts an app cover UUID but never exports internal media identifiers', () => {
    const coverMediaFileId = '11111111-1111-4111-8111-111111111111';
    expect(lorebookInputSchema.parse({ name: 'Archive', coverMediaFileId })).toMatchObject({
      coverMediaFileId,
    });
    const transfer = lorebookTransferSchema.parse({
      format: 'velora-lorebook',
      version: 1,
      book: { name: 'Archive', coverMediaFileId },
      entries: [],
    });
    expect('coverMediaFileId' in transfer.book).toBe(false);
  });

  it('rejects empty keys and unsafe budgets', () => {
    expect(() => loreEntryInputSchema.parse({ title: 'X', content: 'Y', keys: [] })).toThrow();
    expect(() =>
      loreEntryInputSchema.parse({ title: 'X', content: 'Y', keys: ['x'], tokenBudget: 9_000 }),
    ).toThrow();
  });

  it('accepts only the versioned bounded Velora transfer format', () => {
    const transfer = lorebookTransferSchema.parse({
      format: 'velora-lorebook',
      version: 1,
      book: { name: 'Переносимая книга', visibility: 'PUBLIC' },
      entries: [{ title: 'Башня', content: 'Стоит на севере', keys: ['башня'] }],
    });
    expect(transfer.entries[0]?.scanDepth).toBe(20);
    expect(() => lorebookTransferSchema.parse({ ...transfer, version: 2 })).toThrow();
    expect(() => lorebookImportSchema.parse({ idempotencyKey: 'x', transfer })).toThrow();
    expect(() =>
      lorebookTransferSchema.parse({ ...transfer, entries: Array(101).fill(transfer.entries[0]) }),
    ).toThrow();
  });
});
