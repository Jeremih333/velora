import type { ModerationAction } from '@velora/moderation';

export type CharacterPublishState =
  'DRAFT' | 'MODERATION_PENDING' | 'PUBLISHED' | 'REJECTED' | 'HIDDEN';

export function publishStateAfterCharacterEdit(
  current: CharacterPublishState,
  contentRating: 'SAFE' | 'MATURE',
): CharacterPublishState {
  if (contentRating === 'MATURE' && (current === 'PUBLISHED' || current === 'MODERATION_PENDING')) {
    return 'MODERATION_PENDING';
  }
  return current === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
}

export function canResolveMatureReview(action: ModerationAction): boolean {
  return ['NO_ACTION', 'CONTENT_HIDE', 'CONTENT_REMOVE', 'ESCALATE'].includes(action);
}
