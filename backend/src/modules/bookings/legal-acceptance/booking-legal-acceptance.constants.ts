import type {
  BookingLegalAcceptanceLegalBasis,
  BookingLegalAcceptanceType,
} from '@prisma/client';

export const BOOKING_LEGAL_ACCEPTANCE_RETENTION_CLASS = 'LEGAL_ACCEPTANCE' as const;

export const BOOKING_LEGAL_ACCEPTANCE_SOURCE = {
  CHECKOUT_WIZARD: 'checkout_wizard',
  OPERATOR_PORTAL: 'operator_portal',
  HANDOVER_FLOW: 'handover_flow',
  API: 'api',
  CORRECTION: 'correction',
} as const;

export type BookingLegalAcceptanceSource =
  (typeof BOOKING_LEGAL_ACCEPTANCE_SOURCE)[keyof typeof BOOKING_LEGAL_ACCEPTANCE_SOURCE];

export const BOOKING_LEGAL_ACCEPTANCE_ERROR_CODE = {
  NOT_FOUND: 'BOOKING_LEGAL_ACCEPTANCE_NOT_FOUND',
  BOOKING_SCOPE: 'BOOKING_LEGAL_ACCEPTANCE_BOOKING_SCOPE',
  INVALID_REVOCATION: 'BOOKING_LEGAL_ACCEPTANCE_INVALID_REVOCATION',
  IMMUTABLE_VIOLATION: 'BOOKING_LEGAL_ACCEPTANCE_IMMUTABLE_VIOLATION',
  MISSING_DOCUMENT_HASH: 'BOOKING_LEGAL_ACCEPTANCE_MISSING_DOCUMENT_HASH',
  FORBIDDEN_METADATA: 'BOOKING_LEGAL_ACCEPTANCE_FORBIDDEN_METADATA',
} as const;

/** Acceptance types that may be revoked via a REVOCATION event. */
export const REVOCABLE_ACCEPTANCE_TYPES: ReadonlySet<BookingLegalAcceptanceType> = new Set([
  'MARKETING_CONSENT',
  'OTHER_CONSENT',
]);

/** Default legal basis per acceptance type — callers may override with justification. */
export const DEFAULT_LEGAL_BASIS_BY_ACCEPTANCE_TYPE: Readonly<
  Record<BookingLegalAcceptanceType, BookingLegalAcceptanceLegalBasis>
> = {
  TERMS_CONTRACT_ACCEPTANCE: 'CONTRACT',
  PRIVACY_NOTICE_ACKNOWLEDGMENT: 'NOTICE_ACKNOWLEDGMENT',
  MARKETING_CONSENT: 'CONSENT',
  OTHER_CONSENT: 'CONSENT',
  RENTAL_CONTRACT_SIGNATURE: 'CONTRACT',
  HANDOVER_SIGNATURE: 'CONTRACT',
  RETURN_SIGNATURE: 'CONTRACT',
};

export const FORBIDDEN_METADATA_KEYS = [
  'documentContent',
  'pdf',
  'body',
  'html',
  'signatureDataUrl',
  'customerSignatureDataUrl',
  'staffSignatureDataUrl',
  'rawSignature',
] as const;
