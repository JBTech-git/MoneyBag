import { en, type MessageKey } from './messages/en';
import { hi } from './messages/hi';
import { bn } from './messages/bn';
import {
  isLanguage,
  LANG_STORAGE_KEY,
  parseLanguage,
  type Language,
} from './types';

export type { Language, MessageKey };
export {
  isLanguage,
  LANG_STORAGE_KEY,
  LANGUAGE_LABELS,
  LANGUAGES,
  parseLanguage,
} from './types';

const catalogs = { en, hi, bn } as const;

export function localeFor(lang: Language): string {
  if (lang === 'hi') return 'hi-IN';
  if (lang === 'bn') return 'bn-IN';
  return 'en-IN';
}

export function t(
  lang: Language,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const catalog = catalogs[lang] || en;
  let text = catalog[key] ?? en[key] ?? String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export function readStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'en';
  try {
    return parseLanguage(window.localStorage.getItem(LANG_STORAGE_KEY), 'en');
  } catch {
    return 'en';
  }
}

export function writeStoredLanguage(lang: Language) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

export function applyDocumentLanguage(lang: Language) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
}

const SHORT_DAYS: MessageKey[] = [
  'date.sun',
  'date.mon',
  'date.tue',
  'date.wed',
  'date.thu',
  'date.fri',
  'date.sat',
];

const SHORT_MONTHS: MessageKey[] = [
  'date.jan',
  'date.feb',
  'date.mar',
  'date.apr',
  'date.may',
  'date.jun',
  'date.jul',
  'date.aug',
  'date.sep',
  'date.oct',
  'date.nov',
  'date.dec',
];

const FULL_MONTHS: MessageKey[] = [
  'date.january',
  'date.february',
  'date.march',
  'date.april',
  'date.mayFull',
  'date.june',
  'date.july',
  'date.august',
  'date.september',
  'date.october',
  'date.november',
  'date.december',
];

export function shortDayName(lang: Language, dayIndex: number): string {
  return t(lang, SHORT_DAYS[dayIndex] || 'date.sun');
}

export function shortMonthName(lang: Language, monthIndex: number): string {
  return t(lang, SHORT_MONTHS[monthIndex] || 'date.jan');
}

export function fullMonthName(lang: Language, monthIndex: number): string {
  return t(lang, FULL_MONTHS[monthIndex] || 'date.january');
}

export function accountTypeLabel(lang: Language, accountType: string): string {
  const key = `accountType.${accountType}` as MessageKey;
  if (key in en) return t(lang, key);
  return t(lang, 'accountType.cash');
}
