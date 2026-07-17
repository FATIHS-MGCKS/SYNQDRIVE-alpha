export const CUSTOMER_CANDIDATE_MATCH_REASONS = {
  CUSTOMER_NUMBER_EXACT: 'CUSTOMER_NUMBER_EXACT',
  BOOKING_LINK: 'BOOKING_LINK',
  EMAIL_EXACT: 'EMAIL_EXACT',
  PHONE_EXACT: 'PHONE_EXACT',
  NAME_EXACT: 'NAME_EXACT',
  ADDRESS_MATCH: 'ADDRESS_MATCH',
  DOCUMENT_CONTEXT: 'DOCUMENT_CONTEXT',
  DOCUMENT_REFERENCE: 'DOCUMENT_REFERENCE',
} as const;

export type CustomerCandidateMatchReason =
  (typeof CUSTOMER_CANDIDATE_MATCH_REASONS)[keyof typeof CUSTOMER_CANDIDATE_MATCH_REASONS];

export const CUSTOMER_CANDIDATE_CONFLICT_CODES = {
  DUPLICATE_NAME: 'DUPLICATE_NAME',
  WEAK_NAME_ONLY: 'WEAK_NAME_ONLY',
  MULTIPLE_PLAUSIBLE: 'MULTIPLE_PLAUSIBLE',
} as const;

export type CustomerCandidateConflictCode =
  (typeof CUSTOMER_CANDIDATE_CONFLICT_CODES)[keyof typeof CUSTOMER_CANDIDATE_CONFLICT_CODES];

export interface CustomerCandidateConflict {
  code: CustomerCandidateConflictCode;
  field: string;
  message: string;
  severity: 'BLOCKER' | 'WARNING';
}

export interface CustomerCandidateMatch {
  customerId: string;
  confidence: number;
  matchReasons: CustomerCandidateMatchReason[];
  conflicts: CustomerCandidateConflict[];
  rank: number;
  confirmationRequired: boolean;
  /** Non-PII label for review UI */
  displayLabel: string;
}

/** Pipeline-safe hints without raw PII values */
export interface CustomerResolverHints {
  customerNumberPresent: boolean;
  bookingLinkPresent: boolean;
  namePresent: boolean;
  emailPresent: boolean;
  phonePresent: boolean;
  addressPresent: boolean;
  documentReferencePresent: boolean;
  documentContextCustomerId?: string | null;
  linkedBookingId?: string | null;
}

export interface CustomerCandidateSearchRecord {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  emailNormalized: string | null;
  phoneNormalized: string | null;
  fullNameNormalized: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  taxId: string | null;
  idNumberNormalized: string | null;
}

export interface CustomerCandidatePipelineState {
  evaluatedAt: string;
  hints: CustomerResolverHints;
  candidates: CustomerCandidateMatch[];
  ambiguousNameMatch: boolean;
  autoConfirmEligible: false;
}

export interface CustomerCandidateResolverInput {
  organizationId: string;
  documentType: string;
  extractedData: Record<string, unknown>;
  uploadContextCustomerId?: string | null;
  linkedBookingId?: string | null;
  bookingLinkCustomerId?: string | null;
}

export const CUSTOMER_CANDIDATE_RESOLVER_DOCUMENT_TYPES = [
  'FINE',
  'INVOICE',
  'DAMAGE',
  'ACCIDENT',
  'OTHER',
] as const;

export interface CustomerResolverPrivateHints {
  customerNumber?: string | null;
  customerName?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine?: string | null;
  city?: string | null;
  zip?: string | null;
  documentReference?: string | null;
  documentContextCustomerId?: string | null;
  bookingLinkCustomerId?: string | null;
}
