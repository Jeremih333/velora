import { describe, expect, it } from 'vitest';
import { canResolveMatureReview, publishStateAfterCharacterEdit } from './character-safety';

describe('Mature character review policy', () => {
  it('keeps every published or pending Mature edit behind review', () => {
    expect(publishStateAfterCharacterEdit('PUBLISHED', 'MATURE')).toBe('MODERATION_PENDING');
    expect(publishStateAfterCharacterEdit('MODERATION_PENDING', 'MATURE')).toBe(
      'MODERATION_PENDING',
    );
    expect(publishStateAfterCharacterEdit('MODERATION_PENDING', 'SAFE')).toBe('DRAFT');
    expect(publishStateAfterCharacterEdit('PUBLISHED', 'SAFE')).toBe('PUBLISHED');
  });

  it('prevents resolving a review while leaving its publication state orphaned', () => {
    expect(canResolveMatureReview('NO_ACTION')).toBe(true);
    expect(canResolveMatureReview('CONTENT_HIDE')).toBe(true);
    expect(canResolveMatureReview('CONTENT_REMOVE')).toBe(true);
    expect(canResolveMatureReview('ESCALATE')).toBe(true);
    expect(canResolveMatureReview('WARNING')).toBe(false);
    expect(canResolveMatureReview('ACCOUNT_BAN')).toBe(false);
  });
});
