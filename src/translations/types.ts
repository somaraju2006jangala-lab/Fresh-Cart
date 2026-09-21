export type Language = 'en' | 'hi' | 'te';

export interface LanguageOption {
  code: Language;
  name: string;
  nativeName: string;
  shortLabel: string;
}

export type TranslationKey = string;
