export const BOOKING_CANDIDATE_MATCH_REASONS = {
  BOOKING_REFERENCE_EXACT: 'BOOKING_REFERENCE_EXACT',
  DATE_OVERLAP: 'DATE_OVERLAP',
  DOCUMENT_CONTEXT: 'DOCUMENT_CONTEXT',
  CUSTOMER_NAME: 'CUSTOMER_NAME',
  INVOICE_REFERENCE: 'INVOICE_REFERENCE',
  FINE_REFERENCE: 'FINE_REFERENCE',
  VEHICLE_ANCHOR: 'VEHICLE_ANCHOR',
} as const;

export type BookingCandidateMatchReason =
  (typeof BOOKING_CANDIDATE_MATCH_REASONS)[keyof typeof BOOKING_CANDIDATE_MATCH_REASONS];

export const BOOKING_CANDIDATE_CONFLICT_CODES = {
  OVERLAPPING_BOOKINGS: 'OVERLAPPING_BOOKINGS',
  MISSING_EVENT_TIME: 'MISSING_EVENT_TIME',
  CUSTOMER_ONLY: 'CUSTOMER_ONLY',
} as const;

export type BookingCandidateConflictCode =
  (typeof BOOKING_CANDIDATE_CONFLICT_CODES)[keyof typeof BOOKING_CANDIDATE_CONFLICT_CODES];

export interface BookingCandidateConflict {
  code: BookingCandidateConflictCode;
  field: string;
  message: string;
  severity: 'BLOCKER' | 'WARNING';
}

export interface BookingCandidateMatch {
  bookingId: string;
  confidence: number;
  matchReasons: BookingCandidateMatchReason[];
  conflicts: BookingCandidateConflict[];
  temporalOverlap: boolean;
  rank: number;
  confirmationRequired: boolean;
}

export type BookingEventTimePrecision = 'datetime' | 'date' | 'missing';

export interface BookingResolverHints {
  vehicleId?: string | null;
  eventInstant?: string | null;
  eventTimePrecision: BookingEventTimePrecision;
  bookingReference?: string | null;
  customerName?: string | null;
  invoiceReference?: string | null;
  fineReference?: string | null;
  documentSubtype?: string | null;
  documentContextBookingId?: string | null;
}

export interface BookingCandidateSearchRecord {
  id: string;
  vehicleId: string;
  customerId: string;
  assignedDriverId: string | null;
  startDate: Date;
  endDate: Date;
  status: string;
  customer: {
    firstName: string;
    lastName: string;
    company: string | null;
  };
}

export interface BookingCandidatePipelineState {
  evaluatedAt: string;
  hints: BookingResolverHints;
  candidates: BookingCandidateMatch[];
  ambiguousOverlap: boolean;
  autoConfirmEligible: false;
}

export interface BookingCandidateResolverInput {
  organizationId: string;
  vehicleId: string | null;
  documentType: string;
  extractedData: Record<string, unknown>;
  uploadContextBookingId?: string | null;
  fieldEvidence?: Array<{ key: string; conflict: boolean; candidateValues?: unknown[] }>;
}

export const BOOKING_CANDIDATE_RESOLVER_DOCUMENT_TYPES = [
  'FINE',
  'INVOICE',
  'DAMAGE',
  'ACCIDENT',
] as const;
