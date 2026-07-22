/**
 * Neutral legal document type definitions for Administration → Rechtliche Dokumente.
 *
 * SynqDrive führt administrativ freigegebene Rechtstextregeln aus, ersetzt jedoch
 * keine juristische Prüfung oder Rechtsberatung.
 */

export const LEGAL_DOCUMENT_ADMIN_DISCLAIMER_DE =
  'SynqDrive führt administrativ freigegebene Rechtstextregeln aus, ersetzt jedoch keine juristische Prüfung oder Rechtsberatung.';

export const LEGAL_DOCUMENT_TYPE = {
  TERMS_AND_CONDITIONS: 'TERMS_AND_CONDITIONS',
  CONSUMER_INFORMATION: 'CONSUMER_INFORMATION',
  /** @deprecated API input alias — maps to CONSUMER_INFORMATION */
  WITHDRAWAL_INFORMATION: 'WITHDRAWAL_INFORMATION',
  PRIVACY_POLICY: 'PRIVACY_POLICY',
} as const;

export const CONSUMER_INFORMATION_VARIANT = {
  WITHDRAWAL_RIGHT_NOTICE: 'WITHDRAWAL_RIGHT_NOTICE',
  NO_WITHDRAWAL_RIGHT_NOTICE: 'NO_WITHDRAWAL_RIGHT_NOTICE',
  OTHER_CONSUMER_INFORMATION: 'OTHER_CONSUMER_INFORMATION',
} as const;

export type ConsumerInformationVariant =
  (typeof CONSUMER_INFORMATION_VARIANT)[keyof typeof CONSUMER_INFORMATION_VARIANT];

export const CONSUMER_INFORMATION_VARIANT_LABELS_DE: Record<ConsumerInformationVariant, string> = {
  WITHDRAWAL_RIGHT_NOTICE: 'Widerrufsbelehrung',
  NO_WITHDRAWAL_RIGHT_NOTICE: 'Information über das Nichtbestehen eines Widerrufsrechts',
  OTHER_CONSUMER_INFORMATION: 'Sonstige Verbraucherinformation',
};

export interface LegalDocumentTypeConfig {
  /** Canonical API documentType for new uploads */
  key: string;
  title: string;
  hint: string;
  /** Required when key is CONSUMER_INFORMATION */
  variants?: { value: ConsumerInformationVariant; label: string }[];
  /** Accepted legacy documentType values from API list responses */
  legacyKeys?: string[];
}

export const LEGAL_DOCUMENT_TYPE_CONFIGS: LegalDocumentTypeConfig[] = [
  {
    key: LEGAL_DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
    title: 'Allgemeine Geschäftsbedingungen (AGB)',
    hint: 'Wird der Buchung beigefügt und im Mietvertrag referenziert.',
  },
  {
    key: LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION,
    title: 'Verbraucherinformation',
    hint: 'Administrativ freigegebene Verbraucherinformation — Variante nach org-interner Auswahl (keine Rechtsberatung durch SynqDrive).',
    variants: Object.entries(CONSUMER_INFORMATION_VARIANT_LABELS_DE).map(([value, label]) => ({
      value: value as ConsumerInformationVariant,
      label,
    })),
    legacyKeys: [LEGAL_DOCUMENT_TYPE.WITHDRAWAL_INFORMATION],
  },
  {
    key: LEGAL_DOCUMENT_TYPE.PRIVACY_POLICY,
    title: 'Datenschutzerklärung',
    hint: 'Wird dem Kunden bei der Buchung zur Verfügung gestellt und kann per E-Mail versendet werden.',
  },
];

/** Resolve list/upload grouping key from API document row. */
export function legalDocumentGroupKey(documentType: string, legacyDocumentType?: string | null): string {
  if (
    documentType === LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION ||
    documentType === LEGAL_DOCUMENT_TYPE.WITHDRAWAL_INFORMATION ||
    legacyDocumentType === LEGAL_DOCUMENT_TYPE.WITHDRAWAL_INFORMATION
  ) {
    return LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION;
  }
  return documentType;
}
