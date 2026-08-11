import { describe, expect, it } from 'vitest';
import { allowsCharacterAutosave, pendingAutosaveState } from './character-autosave';

describe('character draft autosave policy', () => {
  it('autosaves a new or existing draft', () => {
    expect(allowsCharacterAutosave(null)).toBe(true);
    expect(allowsCharacterAutosave('DRAFT')).toBe(true);
  });

  it.each(['MODERATION_PENDING', 'PUBLISHED', 'REJECTED', 'HIDDEN'] as const)(
    'does not autosave %s characters',
    (state) => {
      expect(allowsCharacterAutosave(state)).toBe(false);
    },
  );

  it('distinguishes a valid pending save from an incomplete form', () => {
    expect(pendingAutosaveState(true)).toBe('DIRTY');
    expect(pendingAutosaveState(false)).toBe('INCOMPLETE');
  });
});
