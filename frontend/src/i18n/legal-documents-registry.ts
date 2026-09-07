import type { SupportedLocale } from './locales';

/** Legal localization is separate from ordinary product UI completeness. */
export type LegalLocalizationStatus =
  | 'legally-reviewed'
  | 'runtime-fallback'
  | 'not-available';

export type LegalDocumentLocalizationEntry = {
  locale: SupportedLocale;
  status: LegalLocalizationStatus;
  /** Dedicated legal dictionary module when legally reviewed. */
  sourceModule: 'legal-documents.en' | 'legal-documents.de' | null;
};

export const LEGAL_DOCUMENT_LOCALIZATION: Record<SupportedLocale, LegalDocumentLocalizationEntry> = {
  en: {
    locale: 'en',
    status: 'legally-reviewed',
    sourceModule: 'legal-documents.en',
  },
  de: {
    locale: 'de',
    status: 'legally-reviewed',
    sourceModule: 'legal-documents.de',
  },
  pl: {
    locale: 'pl',
    status: 'runtime-fallback',
    sourceModule: null,
  },
  fr: {
    locale: 'fr',
    status: 'runtime-fallback',
    sourceModule: null,
  },
  cs: {
    locale: 'cs',
    status: 'runtime-fallback',
    sourceModule: null,
  },
  nl: {
    locale: 'nl',
    status: 'runtime-fallback',
    sourceModule: null,
  },
  es: {
    locale: 'es',
    status: 'runtime-fallback',
    sourceModule: null,
  },
  tr: {
    locale: 'tr',
    status: 'runtime-fallback',
    sourceModule: null,
  },
  it: {
    locale: 'it',
    status: 'runtime-fallback',
    sourceModule: null,
  },
};

export function isLegallyReviewedLegalLocale(locale: SupportedLocale): boolean {
  return LEGAL_DOCUMENT_LOCALIZATION[locale].status === 'legally-reviewed';
}
