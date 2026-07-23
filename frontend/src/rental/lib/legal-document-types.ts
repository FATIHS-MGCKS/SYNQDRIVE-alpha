/**
 * Neutral legal document type definitions for Administration → Customer legal texts.
 *
 * UI copy is resolved via i18n keys — see legal-documents-i18n.ts.
 */

import type { TranslationKey } from '../i18n/translations/en';

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

export interface LegalDocumentTypeConfig {
  /** Canonical API documentType for new uploads */
  key: string;
  titleKey: TranslationKey;
  hintKey: TranslationKey;
  /** Required when key is CONSUMER_INFORMATION */
  variants?: { value: ConsumerInformationVariant; labelKey: TranslationKey }[];
  /** Accepted legacy documentType values from API list responses */
  legacyKeys?: string[];
}

export const LEGAL_DOCUMENT_TYPE_CONFIGS: LegalDocumentTypeConfig[] = [
  {
    key: LEGAL_DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
    titleKey: 'legalDocuments.type.TERMS_AND_CONDITIONS.title',
    hintKey: 'legalDocuments.type.TERMS_AND_CONDITIONS.hint',
  },
  {
    key: LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION,
    titleKey: 'legalDocuments.type.CONSUMER_INFORMATION.title',
    hintKey: 'legalDocuments.type.CONSUMER_INFORMATION.hint',
    variants: [
      {
        value: CONSUMER_INFORMATION_VARIANT.WITHDRAWAL_RIGHT_NOTICE,
        labelKey: 'legalDocuments.variant.WITHDRAWAL_RIGHT_NOTICE',
      },
      {
        value: CONSUMER_INFORMATION_VARIANT.NO_WITHDRAWAL_RIGHT_NOTICE,
        labelKey: 'legalDocuments.variant.NO_WITHDRAWAL_RIGHT_NOTICE',
      },
      {
        value: CONSUMER_INFORMATION_VARIANT.OTHER_CONSUMER_INFORMATION,
        labelKey: 'legalDocuments.variant.OTHER_CONSUMER_INFORMATION',
      },
    ],
    legacyKeys: [LEGAL_DOCUMENT_TYPE.WITHDRAWAL_INFORMATION],
  },
  {
    key: LEGAL_DOCUMENT_TYPE.PRIVACY_POLICY,
    titleKey: 'legalDocuments.type.PRIVACY_POLICY.title',
    hintKey: 'legalDocuments.type.PRIVACY_POLICY.hint',
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
