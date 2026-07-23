import { LEGAL_BOOKING_CHANNEL } from './legal-document-scope.constants';

/** Resolver contract version — bump when selection semantics change. */
export const LEGAL_DOCUMENT_RESOLVER_VERSION = 'legal-document-resolver-v1';

export const LEGAL_DOCUMENT_RESOLVER_ERROR_CODES = {
  MISSING_LANGUAGE: 'LEGAL_DOCUMENT_RESOLVER_MISSING_LANGUAGE',
  UNSUPPORTED_LANGUAGE: 'LEGAL_DOCUMENT_RESOLVER_UNSUPPORTED_LANGUAGE',
  UNSUPPORTED_JURISDICTION: 'LEGAL_DOCUMENT_RESOLVER_UNSUPPORTED_JURISDICTION',
  SCOPE_CONFLICT: 'LEGAL_DOCUMENT_RESOLVER_SCOPE_CONFLICT',
  MISSING_MANDATORY: 'LEGAL_DOCUMENT_RESOLVER_MISSING_MANDATORY',
  BOOKING_NOT_FOUND: 'LEGAL_DOCUMENT_RESOLVER_BOOKING_NOT_FOUND',
} as const;

export type LegalDocumentResolverErrorCode =
  (typeof LEGAL_DOCUMENT_RESOLVER_ERROR_CODES)[keyof typeof LEGAL_DOCUMENT_RESOLVER_ERROR_CODES];

export const LEGAL_DOCUMENT_RESOLVER_SELECTION_REASON = {
  HIGHEST_PRIORITY_MATCH: 'HIGHEST_PRIORITY_MATCH',
  SINGLE_MATCH: 'SINGLE_MATCH',
  ORGANIZATION_WIDE_FALLBACK: 'ORGANIZATION_WIDE_FALLBACK',
} as const;

export const LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE = {
  EXPLICIT: 'EXPLICIT',
  ORGANIZATION_LANGUAGE: 'ORGANIZATION_LANGUAGE',
  CUSTOMER_COUNTRY: 'CUSTOMER_COUNTRY',
  ORGANIZATION_COUNTRY: 'ORGANIZATION_COUNTRY',
  DERIVE_FROM_LANGUAGE: 'DERIVE_FROM_LANGUAGE',
  DEFAULT_BOOKING_CHANNEL: 'DEFAULT_BOOKING_CHANNEL',
  CUSTOMER_TYPE: 'CUSTOMER_TYPE',
  BOOKING_PICKUP_STATION: 'BOOKING_PICKUP_STATION',
  ORGANIZATION_BUSINESS_TYPE: 'ORGANIZATION_BUSINESS_TYPE',
} as const;

/**
 * Configurable fallback policy. SynqDrive never silently defaults to German —
 * language must be explicit or come from organization settings (logged in fallbackDecisions).
 */
export const LEGAL_DOCUMENT_RESOLVER_FALLBACK_POLICY = {
  language: {
    allowOrganizationLanguage: true,
    /** Explicit rejection — no implicit `de`. */
    silentGermanFallback: false,
  },
  jurisdiction: {
    allowCustomerCountry: true,
    allowOrganizationCountry: true,
    allowDeriveFromLanguage: true,
  },
  bookingChannel: {
    defaultWhenMissing: LEGAL_BOOKING_CHANNEL.MANUAL,
  },
} as const;

/** Lifecycle statuses eligible for booking resolution (freigegeben + gültig). */
export const LEGAL_DOCUMENT_RESOLVER_ELIGIBLE_STATUS = 'ACTIVE' as const;

/** Statuses explicitly excluded from resolution with reason codes. */
export const LEGAL_DOCUMENT_RESOLVER_EXCLUDED_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'SUPERSEDED',
  'REVOKED',
  'ARCHIVED',
] as const;
