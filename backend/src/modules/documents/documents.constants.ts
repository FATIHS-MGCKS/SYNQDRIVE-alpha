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
  DOCUMENT_TYPE.WITHDRAWAL_INFORMATION,
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

/** Generation pipeline status (orthogonal to document lifecycle `status`). */
export const DOCUMENT_GENERATION_STATUS = {
  IDLE: 'IDLE',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const;

export type DocumentGenerationStatus =
  (typeof DOCUMENT_GENERATION_STATUS)[keyof typeof DOCUMENT_GENERATION_STATUS];

/** Who/what initiated PDF generation. */
export const DOCUMENT_GENERATION_TRIGGER_SOURCE = {
  USER: 'USER',
  SYSTEM: 'SYSTEM',
  BUNDLE: 'BUNDLE',
  INVOICE_PANEL: 'INVOICE_PANEL',
  REGENERATE: 'REGENERATE',
} as const;

export type DocumentGenerationTriggerSource =
  (typeof DOCUMENT_GENERATION_TRIGGER_SOURCE)[keyof typeof DOCUMENT_GENERATION_TRIGGER_SOURCE];

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
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;

/** Per-type document-number prefixes (scoped per organization + year). */
export const DOCUMENT_NUMBER_PREFIX: Record<string, string> = {
  [DOCUMENT_TYPE.BOOKING_INVOICE]: 'RE',
  [DOCUMENT_TYPE.FINAL_INVOICE]: 'SR',
  [DOCUMENT_TYPE.DEPOSIT_RECEIPT]: 'KA',
  [DOCUMENT_TYPE.RENTAL_CONTRACT]: 'MV',
  [DOCUMENT_TYPE.HANDOVER_PICKUP]: 'UP',
  [DOCUMENT_TYPE.HANDOVER_RETURN]: 'RP',
};

/** Human title per document type (German, customer-facing). */
export const DOCUMENT_TITLE_DE: Record<string, string> = {
  [DOCUMENT_TYPE.BOOKING_INVOICE]: 'Rechnung',
  [DOCUMENT_TYPE.DEPOSIT_RECEIPT]: 'Kautionsbeleg',
  [DOCUMENT_TYPE.RENTAL_CONTRACT]: 'Mietvertrag',
  [DOCUMENT_TYPE.TERMS_AND_CONDITIONS]: 'Allgemeine Geschäftsbedingungen (AGB)',
  [DOCUMENT_TYPE.WITHDRAWAL_INFORMATION]: 'Widerrufsbelehrung',
  [DOCUMENT_TYPE.PRIVACY_POLICY]: 'Datenschutzerklärung',
  [DOCUMENT_TYPE.HANDOVER_PICKUP]: 'Übergabeprotokoll (Abholung)',
  [DOCUMENT_TYPE.HANDOVER_RETURN]: 'Übergabeprotokoll (Rückgabe)',
  [DOCUMENT_TYPE.FINAL_INVOICE]: 'Schlussrechnung',
};

export function isGeneratedDocumentType(value: string): value is DocumentType {
  return (GENERATED_DOCUMENT_TYPES as string[]).includes(value);
}

export function isLegalDocumentType(value: string): value is DocumentType {
  return (LEGAL_DOCUMENT_TYPES as string[]).includes(value);
}
