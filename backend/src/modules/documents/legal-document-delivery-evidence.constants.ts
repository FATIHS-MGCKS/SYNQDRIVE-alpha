/**
 * Controlled vocabulary for legal document delivery evidence (Prompt 18/32).
 *
 * This model records delivery and acknowledgment of legal TEXTS (AGB, consumer
 * information, privacy notices). It is NOT a consent store — marketing, KYC,
 * and data-processing consents live in separate domains.
 */

export const LEGAL_DELIVERY_CHANNEL = {
  /** Shown in booking/checkout portal UI */
  PORTAL: 'PORTAL',
  /** Sent via transactional email */
  EMAIL: 'EMAIL',
  /** Presented in person (handover, counter) */
  IN_PERSON: 'IN_PERSON',
  /** Customer downloaded from authenticated portal */
  DOWNLOAD: 'DOWNLOAD',
  /** Printed copy provided */
  PRINT: 'PRINT',
} as const;

export type LegalDeliveryChannel =
  (typeof LEGAL_DELIVERY_CHANNEL)[keyof typeof LEGAL_DELIVERY_CHANNEL];

export const LEGAL_DELIVERY_STATUS = {
  PENDING: 'PENDING',
  PRESENTED: 'PRESENTED',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  BOUNCED: 'BOUNCED',
  OPENED: 'OPENED',
} as const;

export type LegalDeliveryStatus =
  (typeof LEGAL_DELIVERY_STATUS)[keyof typeof LEGAL_DELIVERY_STATUS];

/** Statuses after which delivery fields are sealed (no further mutation). */
export const LEGAL_DELIVERY_TERMINAL_STATUSES = new Set<LegalDeliveryStatus>([
  LEGAL_DELIVERY_STATUS.DELIVERED,
  LEGAL_DELIVERY_STATUS.FAILED,
  LEGAL_DELIVERY_STATUS.BOUNCED,
]);

/** Legal text acknowledgment methods — receipt/awareness, NOT consent grant. */
export const LEGAL_ACKNOWLEDGMENT_METHOD = {
  /** Explicit UI checkbox confirming receipt of the legal text */
  EXPLICIT_CHECKBOX: 'EXPLICIT_CHECKBOX',
  /** Electronic signature on the legal document */
  ELECTRONIC_SIGNATURE: 'ELECTRONIC_SIGNATURE',
  /** In-person confirmation of receipt */
  IN_PERSON_CONFIRMATION: 'IN_PERSON_CONFIRMATION',
  /** Customer confirmed via email reply/action */
  EMAIL_CONFIRMATION: 'EMAIL_CONFIRMATION',
} as const;

export type LegalAcknowledgmentMethod =
  (typeof LEGAL_ACKNOWLEDGMENT_METHOD)[keyof typeof LEGAL_ACKNOWLEDGMENT_METHOD];

export const LEGAL_DELIVERY_EVIDENCE_ERROR_CODE = {
  NOT_FOUND: 'LEGAL_DELIVERY_EVIDENCE_NOT_FOUND',
  IMMUTABLE: 'LEGAL_DELIVERY_EVIDENCE_IMMUTABLE',
  TENANT_MISMATCH: 'LEGAL_DELIVERY_EVIDENCE_TENANT_MISMATCH',
  DUPLICATE_REQUEST: 'LEGAL_DELIVERY_EVIDENCE_DUPLICATE_REQUEST',
  INVALID_TRANSITION: 'LEGAL_DELIVERY_EVIDENCE_INVALID_TRANSITION',
  MISSING_REQUIRED: 'LEGAL_DELIVERY_EVIDENCE_MISSING_REQUIRED',
} as const;
