import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { en, type TranslationKey } from './translations/en';
import { de } from './translations/de';
import { fr } from './translations/fr';
import { nl } from './translations/nl';
import { es } from './translations/es';
import { it } from './translations/it';
import { pl } from './translations/pl';
import { cs } from './translations/cs';

export type Locale = 'en' | 'de' | 'fr' | 'nl' | 'es' | 'it' | 'pl' | 'cs';

const translations: Record<Locale, Record<string, string>> = { en, de, fr, nl, es, it, pl, cs };

const LOCALE_STORAGE_KEY = 'synqdrive.locale';

function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && value in translations);
}

function readInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';

  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // ignore storage failures
  }

  const browserLocale = navigator.language?.toLowerCase() ?? '';
  if (browserLocale.startsWith('de')) return 'de';

  return 'en';
}

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const defaultT = (key: TranslationKey, vars?: Record<string, string | number>): string => {
  let text = translations.en[key] ?? key;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v));
    });
  }
  return text;
};

const defaultValue: LanguageContextValue = {
  locale: 'en',
  setLocale: () => {},
  t: defaultT,
};

const LanguageContext = createContext<LanguageContextValue>(defaultValue);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // ignore storage failures
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      let text = translations[locale]?.[key] ?? translations.en[key] ?? key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          text = text.replace(`{${k}}`, String(v));
        });
      }
      return text;
    },
    [locale],
  );

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
