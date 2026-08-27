import { z } from 'zod';

export { en } from './locales/en';
export { ru } from './locales/ru';
export {
  characterGroupSizeCodes,
  characterGroupSizeSchema,
  characterGroupSizes,
  type CharacterGroupSize,
  type CharacterGroupSizeDefinition,
} from './character-group-sizes';
export {
  characterLanguageCodes,
  characterLanguageSchema,
  characterLanguages,
  legacyCharacterLanguage,
  type CharacterLanguageCode,
  type CharacterLanguageDefinition,
} from './character-languages';

export const uuidSchema = z.uuid();
export const telegramIdSchema = z.string().regex(/^\d{1,20}$/u);
export const localeSchema = z.enum(['ru', 'en']);
export const roleSchema = z.enum([
  'USER',
  'CREATOR',
  'MODERATOR',
  'SENIOR_MODERATOR',
  'ADMIN',
  'OWNER',
]);

export type UserRole = z.infer<typeof roleSchema>;

export class AppError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: readonly unknown[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function createId(): string {
  return crypto.randomUUID();
}

export function nowMs(): number {
  return Date.now();
}

export function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error('Unknown error');
}
