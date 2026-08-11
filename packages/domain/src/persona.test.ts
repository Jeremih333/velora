import { describe, expect, it } from 'vitest';
import { personaInputSchema, personaPatchSchema } from './index';

describe('persona input', () => {
  it('normalizes a minimal persona and all documented defaults', () => {
    expect(personaInputSchema.parse({ name: ' Лея ' })).toMatchObject({
      name: 'Лея',
      avatarFileId: null,
      visibility: 'PRIVATE',
      personality: '',
      appearance: '',
      speakingStyle: '',
      background: '',
      representedAge: null,
      customNotes: '',
    });
  });

  it('rejects empty patches and invalid media ids', () => {
    expect(() => personaPatchSchema.parse({})).toThrow();
    expect(() => personaPatchSchema.parse({ avatarFileId: 'not-an-id' })).toThrow();
  });
});
