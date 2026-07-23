/**
 * Shared constants + types for the Booking Document Lifecycle.
 *
 * Document types are plain string constants (matching the string status style
 * used elsewhere in the schema) rather than a Prisma enum, so adding a type
 * never requires a DB migration.
 */

export const DOCUMENT_TYPE = {
  BOOKING_INVOICE: 'BOOKING_INVOICE',
  DEPOSIT_RECEIPT: 'DEPOSIT_RECEIPT',
  RENTAL_CONTRACT: 'RENTAL_CONTRACT',
  TERMS_AND_CONDITIONS: 'TERMS_AND_CONDITIONS',
  /** Neutral category for administratively approved consumer-facing legal information. */
  CONSUMER_INFORMATION: 'CONSUMER_INFORMATION',
  /**
   * @deprecated Legacy alias — use CONSUMER_INFORMATION + legalVariant instead.
   * Accepted on API input for backward compatibility only.
   */
  WITHDRAWAL_INFORMATION: 'WITHDRAWAL_INFORMATION',
  PRIVACY_POLICY: 'PRIVACY_POLICY',
  HANDOVER_PICKUP: 'HANDOVER_PICKUP',
  HANDOVER_RETURN: 'HANDOVER_RETURN',
  FINAL_INVOICE: 'FINAL_INVOICE',
} as const;

export type DocumentType = (typeof DOCUMENT_TYPE)[keyof typeof DOCUMENT_TYPE];

/** Types SynqDrive renders itself (vs. uploaded legal documents). */
export const GENERATED_DOCUMENT_TYPES: DocumentType[] = [
  DOCUMENT_TYPE.BOOKING_INVOICE,
  DOCUMENT_TYPE.DEPOSIT_RECEIPT,
  DOCUMENT_TYPE.RENTAL_CONTRACT,
  DOCUMENT_TYPE.HANDOVER_PICKUP,
  DOCUMENT_TYPE.HANDOVER_RETURN,
  DOCUMENT_TYPE.FINAL_INVOICE,
];

/** Types managed (uploaded + versioned) by the rental company in Administration. */
export const LEGAL_DOCUMENT_TYPES: DocumentType[] = [
  DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
  DOCUMENT_TYPE.CONSUMER_INFORMATION,
  DOCUMENT_TYPE.PRIVACY_POLICY,
];

export const DOCUMENT_ORIGIN = {
  GENERATED: 'GENERATED',
  STATIC_LEGAL: 'STATIC_LEGAL',
  UPLOADED_REFERENCE: 'UPLOADED_REFERENCE',
} as const;

export const DOCUMENT_STATUS = {
  DRAFT: 'DRAFT',
  GENERATED: 'GENERATED',
  SENT: 'SENT',
  VOID: 'VOID',
  FAILED: 'FAILED',
} as const;

/** Statuses allowed as outbound-email PDF attachments (GENERATED + re-send of SENT). */
export const EMAIL_SENDABLE_DOCUMENT_STATUSES = new Set<string>([
  DOCUMENT_STATUS.GENERATED,
  DOCUMENT_STATUS.SENT,
]);

export function isEmailSendableDocumentStatus(status: string): boolean {
  return EMAIL_SENDABLE_DOCUMENT_STATUSES.has(status);
}

export const BUNDLE_STATUS = {
  PENDING: 'PENDING',
  PARTIAL: 'PARTIAL',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
} as const;
export type BundleStatus = (typeof BUNDLE_STATUS)[keyof typeof BUNDLE_STATUS];

export const LEGAL_STATUS = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  SUPERSEDED: 'SUPERSEDED',
  REVOKED: 'REVOKED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type LegalStatus = (typeof LEGAL_STATUS)[keyof typeof LEGAL_STATUS];

/** Terminal lifecycle states — no further user-driven transitions. */
export const LEGAL_TERMINAL_STATUSES: ReadonlySet<LegalStatus> = new Set([
  LEGAL_STATUS.ARCHIVED,
]);

/** Per-type document-number prefixes (scoped per organization + year). */
export const DOCUMENT_NUMBER_PREFIX: Record<string, string> = {
  [DOCUMENT_TYPE.BOOKING_INVOICE]: 'RE',
  [DOCUMENT_TYPE.FINAL_INVOICE]: 'SR',
  [DOCUMENT_TYPE.DEPOSIT_RECEIPT]: 'KA',
  [DOCUMENT_TYPE.RENTAL_CONTRACT]: 'MV',
  [DOCUMENT_TYPE.HANDOVER_PICKUP]: 'UP',
  [DOCUMENT_TYPE.HANDOVER_RETURN]: 'RP',
};

import {
  CONSUMER_INFORMATION_VARIANT_TITLE_DE,
  normalizeLegalDocumentType,
  CONSUMER_INFORMATION_VARIANT,
} from './legal-document-type.compat';

/** Human title per document type (German, customer-facing / admin default). */
export const DOCUMENT_TITLE_DE: Record<string, string> = {
  [DOCUMENT_TYPE.BOOKING_INVOICE]: 'Rechnung',
  [DOCUMENT_TYPE.DEPOSIT_RECEIPT]: 'Kautionsbeleg',
  [DOCUMENT_TYPE.RENTAL_CONTRACT]: 'Mietvertrag',
  [DOCUMENT_TYPE.TERMS_AND_CONDITIONS]: 'Allgemeine Geschäftsbedingungen (AGB)',
  [DOCUMENT_TYPE.CONSUMER_INFORMATION]: 'Verbraucherinformation',
  [DOCUMENT_TYPE.WITHDRAWAL_INFORMATION]:
    CONSUMER_INFORMATION_VARIANT_TITLE_DE[CONSUMER_INFORMATION_VARIANT.WITHDRAWAL_RIGHT_NOTICE],
  [DOCUMENT_TYPE.PRIVACY_POLICY]: 'Datenschutzerklärung',
  [DOCUMENT_TYPE.HANDOVER_PICKUP]: 'Übergabeprotokoll (Abholung)',
  [DOCUMENT_TYPE.HANDOVER_RETURN]: 'Übergabeprotokoll (Rückgabe)',
  [DOCUMENT_TYPE.FINAL_INVOICE]: 'Schlussrechnung',
};

export function legalDocumentTitleDe(
  documentType: string,
  legalVariant?: string | null,
): string {
  const canonical = normalizeLegalDocumentType(documentType);
  if (
    canonical === 'CONSUMER_INFORMATION' &&
    legalVariant &&
    legalVariant in CONSUMER_INFORMATION_VARIANT_TITLE_DE
  ) {
    return CONSUMER_INFORMATION_VARIANT_TITLE_DE[
      legalVariant as keyof typeof CONSUMER_INFORMATION_VARIANT_TITLE_DE
    ];
  }
  return DOCUMENT_TITLE_DE[canonical] ?? DOCUMENT_TITLE_DE[documentType] ?? documentType;
}

export function isGeneratedDocumentType(value: string): value is DocumentType {
  return (GENERATED_DOCUMENT_TYPES as string[]).includes(value);
}

export function isLegalDocumentType(value: string): value is DocumentType {
  return (
    value === DOCUMENT_TYPE.TERMS_AND_CONDITIONS ||
    value === DOCUMENT_TYPE.CONSUMER_INFORMATION ||
    value === DOCUMENT_TYPE.PRIVACY_POLICY ||
    value === DOCUMENT_TYPE.WITHDRAWAL_INFORMATION
  );
}
