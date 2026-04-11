'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import en from './translations/en.json';
import ar from './translations/ar.json';

export type Lang = 'en' | 'ar';

const translations: Record<Lang, Record<string, string>> = { en, ar };

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
  dir: 'ltr' | 'rtl';
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

const STORAGE_KEY = 'ninja-lang';

export function LanguageProvider({ children, storageKey }: { children: ReactNode; storageKey?: string }) {
  const key = storageKey || STORAGE_KEY;

  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(key) as Lang) || 'en';
    }
    return 'en';
  });

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, newLang);
      // Also update legacy keys for backward compatibility
      localStorage.setItem('kiosk-lang', newLang);
      localStorage.setItem('app-lang', newLang);
    }
  }, [key]);

  // Set dir and lang on <html> element
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('lang', lang);
    html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  }, [lang]);

  // Migrate from legacy storage keys
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(key);
      if (!stored) {
        const legacy = localStorage.getItem('kiosk-lang') || localStorage.getItem('app-lang');
        if (legacy === 'ar' || legacy === 'en') {
          setLang(legacy);
        }
      }
    }
  }, [key, setLang]);

  const t = useCallback((translationKey: string): string => {
    return translations[lang]?.[translationKey] || translations['en']?.[translationKey] || translationKey;
  }, [lang]);

  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const isRTL = lang === 'ar';

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, dir, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
}

// Standalone t function for use outside of React components (backward compatibility)
export function tStandalone(lang: Lang, key: string): string {
  return translations[lang]?.[key] || translations['en']?.[key] || key;
}
