import { Language, LanguageOption } from './types';
import { en } from './en';
import { hi } from './hi';
import { te } from './te';

export const translations: Record<Language, typeof en> = {
  en,
  hi,
  te,
};

export const AVAILABLE_LANGUAGES: LanguageOption[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    shortLabel: 'EN',
  },
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    shortLabel: 'HI',
  },
  {
    code: 'te',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    shortLabel: 'TE',
  },
];

export function translate(
  lang: Language,
  key: keyof typeof en,
  params?: Record<string, string | number>
): string {
  const dictionary = translations[lang] || translations.en;
  let text = dictionary[key] || translations.en[key] || String(key);

  if (params) {
    Object.entries(params).forEach(([paramKey, paramVal]) => {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramVal));
    });
  }

  return text;
}

export * from './types';
