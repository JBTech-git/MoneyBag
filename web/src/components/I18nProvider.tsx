'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  applyDocumentLanguage,
  parseLanguage,
  readStoredLanguage,
  t as translate,
  writeStoredLanguage,
  type Language,
  type MessageKey,
} from '@/lib/i18n';

type I18nContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  language,
  children,
}: {
  language?: string | null;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<Language>(() =>
    language ? parseLanguage(language, 'en') : readStoredLanguage(),
  );

  useEffect(() => {
    if (language == null || language === '') return;
    const next = parseLanguage(language, lang);
    setLangState(next);
    applyDocumentLanguage(next);
    writeStoredLanguage(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    applyDocumentLanguage(lang);
  }, [lang]);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    applyDocumentLanguage(next);
    writeStoredLanguage(next);
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useT must be used within I18nProvider');
  }
  return ctx;
}
