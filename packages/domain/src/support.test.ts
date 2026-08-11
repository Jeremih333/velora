import { describe, expect, it } from 'vitest';
import { supportRequestInputSchema, supportRequestUpdateSchema } from './index';

describe('support request contracts', () => {
  it('accepts a bounded private support request', () => {
    expect(
      supportRequestInputSchema.parse({
        category: 'TECHNICAL',
        subject: 'Не открывается диалог',
        message: 'После запуска диалога появляется код ошибки и пустой экран.',
      }),
    ).toMatchObject({ category: 'TECHNICAL' });
  });

  it('rejects short messages and unknown fields', () => {
    expect(() =>
      supportRequestInputSchema.parse({
        category: 'GENERAL',
        subject: 'Вопрос',
        message: 'Коротко',
      }),
    ).toThrow();
    expect(() =>
      supportRequestUpdateSchema.parse({ state: 'OPEN', resolutionNote: '', message: 'leak' }),
    ).toThrow();
  });
});
