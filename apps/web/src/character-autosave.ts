export type CharacterPublishState =
  'DRAFT' | 'MODERATION_PENDING' | 'PUBLISHED' | 'REJECTED' | 'HIDDEN';

export function allowsCharacterAutosave(publishState: CharacterPublishState | null): boolean {
  return publishState === null || publishState === 'DRAFT';
}

export function pendingAutosaveState(valid: boolean): 'DIRTY' | 'INCOMPLETE' {
  return valid ? 'DIRTY' : 'INCOMPLETE';
}
