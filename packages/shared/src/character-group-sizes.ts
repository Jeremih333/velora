import { z } from 'zod';

export const characterGroupSizeCodes = ['single', 'small', 'medium', 'large'] as const;

export const characterGroupSizeSchema = z.enum(characterGroupSizeCodes);
export type CharacterGroupSize = z.infer<typeof characterGroupSizeSchema>;

export interface CharacterGroupSizeDefinition {
  readonly code: CharacterGroupSize;
  readonly minimumParticipants: number;
  readonly maximumParticipants: number | null;
}

export const characterGroupSizes: readonly CharacterGroupSizeDefinition[] = [
  { code: 'single', minimumParticipants: 1, maximumParticipants: 1 },
  { code: 'small', minimumParticipants: 2, maximumParticipants: 4 },
  { code: 'medium', minimumParticipants: 5, maximumParticipants: 7 },
  { code: 'large', minimumParticipants: 8, maximumParticipants: null },
];
