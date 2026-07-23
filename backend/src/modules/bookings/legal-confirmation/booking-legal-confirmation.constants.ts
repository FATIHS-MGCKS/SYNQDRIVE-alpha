import { DOCUMENT_TYPE } from '@modules/documents/documents.constants';

/** Stable API error codes for server-side legal confirmation enforcement (Prompt 19). */
export const BOOKING_LEGAL_CONFIRMATION_ERROR_CODE = {
  LEGAL_DOCUMENT_MISSING: 'LEGAL_DOCUMENT_MISSING',
  LEGAL_ACCEPTANCE_REQUIRED: 'LEGAL_ACCEPTANCE_REQUIRED',
  LEGAL_DOCUMENT_VERSION_MISMATCH: 'LEGAL_DOCUMENT_VERSION_MISMATCH',
  LEGAL_EVIDENCE_INVALID: 'LEGAL_EVIDENCE_INVALID',
} as const;

export type BookingLegalConfirmationErrorCode =
  (typeof BOOKING_LEGAL_CONFIRMATION_ERROR_CODE)[keyof typeof BOOKING_LEGAL_CONFIRMATION_ERROR_CODE];

/** Mandatory legal document types that must have presentation snapshots at checkout confirm. */
export const MANDATORY_CHECKOUT_LEGAL_DOCUMENT_TYPES = [
  DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
  DOCUMENT_TYPE.CONSUMER_INFORMATION,
  DOCUMENT_TYPE.PRIVACY_POLICY,
] as const;

/** Document types that require an explicit acceptance flag at confirm (not optional consent). */
export const MANDATORY_CHECKOUT_ACCEPTANCE_FLAGS = {
  [DOCUMENT_TYPE.TERMS_AND_CONDITIONS]: 'agbAccepted',
  [DOCUMENT_TYPE.PRIVACY_POLICY]: 'privacyAccepted',
} as const;

/** Acceptance types recorded after successful enforcement. */
export const CHECKOUT_ACCEPTANCE_TYPE_BY_DOCUMENT = {
  [DOCUMENT_TYPE.TERMS_AND_CONDITIONS]: 'TERMS_CONTRACT_ACCEPTANCE',
  [DOCUMENT_TYPE.PRIVACY_POLICY]: 'PRIVACY_NOTICE_ACKNOWLEDGMENT',
} as const;

export const INVALID_SNAPSHOT_INTEGRITY_STATUSES = new Set([
  'CHECKSUM_MISMATCH',
  'MISSING_OBJECT',
]);
