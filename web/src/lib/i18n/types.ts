export type Language = 'en' | 'hi' | 'bn';

export const LANGUAGES: Language[] = ['en', 'hi', 'bn'];

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  hi: 'हिंदी',
  bn: 'বাংলা',
};

export const LANG_STORAGE_KEY = 'moneybag_lang';

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'hi' || value === 'bn';
}

export function parseLanguage(value: unknown, fallback: Language = 'en'): Language {
  return isLanguage(value) ? value : fallback;
}
