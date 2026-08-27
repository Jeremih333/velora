import { z } from 'zod';

export const characterLanguageCodes = [
  'ru',
  'en',
  'de',
  'fr',
  'es',
  'hi',
  'pl',
  'zh',
  'pt',
  'it',
  'ko',
  'ar',
  'tr',
  'ja',
  'other',
] as const;

export const characterLanguageSchema = z.enum(characterLanguageCodes);
export type CharacterLanguageCode = z.infer<typeof characterLanguageSchema>;

export interface CharacterLanguageDefinition {
  readonly code: CharacterLanguageCode;
  readonly nativeName: string;
  readonly direction: 'ltr' | 'rtl';
}

export const characterLanguages: readonly CharacterLanguageDefinition[] = [
  { code: 'ru', nativeName: 'Русский', direction: 'ltr' },
  { code: 'en', nativeName: 'English', direction: 'ltr' },
  { code: 'de', nativeName: 'Deutsch', direction: 'ltr' },
  { code: 'fr', nativeName: 'Français', direction: 'ltr' },
  { code: 'es', nativeName: 'Español', direction: 'ltr' },
  { code: 'hi', nativeName: 'हिन्दी', direction: 'ltr' },
  { code: 'pl', nativeName: 'Polski', direction: 'ltr' },
  { code: 'zh', nativeName: '中文', direction: 'ltr' },
  { code: 'pt', nativeName: 'Português', direction: 'ltr' },
  { code: 'it', nativeName: 'Italiano', direction: 'ltr' },
  { code: 'ko', nativeName: '한국어', direction: 'ltr' },
  { code: 'ar', nativeName: 'العربية', direction: 'rtl' },
  { code: 'tr', nativeName: 'Türkçe', direction: 'ltr' },
  { code: 'ja', nativeName: '日本語', direction: 'ltr' },
  { code: 'other', nativeName: 'Другой', direction: 'ltr' },
];

/**
 * `characters.language` is retained only for backwards-compatible reads during the additive
 * language-code migration. New product behavior reads `language_code`.
 */
export function legacyCharacterLanguage(code: CharacterLanguageCode): 'ru' | 'en' {
  return code === 'en' ? 'en' : 'ru';
}
