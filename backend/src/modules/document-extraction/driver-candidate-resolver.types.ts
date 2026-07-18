export const DRIVER_CANDIDATE_MATCH_REASONS = {
  DRIVER_ID_EXACT: 'DRIVER_ID_EXACT',
  LICENSE_EXACT: 'LICENSE_EXACT',
  TRIP_DRIVER_ASSIGNMENT: 'TRIP_DRIVER_ASSIGNMENT',
  BOOKING_PRIMARY_DRIVER: 'BOOKING_PRIMARY_DRIVER',
  BOOKING_ADDITIONAL_DRIVER: 'BOOKING_ADDITIONAL_DRIVER',
  DOCUMENT_CONTEXT: 'DOCUMENT_CONTEXT',
  NAME_EXACT: 'NAME_EXACT',
} as const;

export type DriverCandidateMatchReason =
  (typeof DRIVER_CANDIDATE_MATCH_REASONS)[keyof typeof DRIVER_CANDIDATE_MATCH_REASONS];

export const DRIVER_CANDIDATE_CONFLICT_CODES = {
  AMBIGUOUS_DRIVER_POOL: 'AMBIGUOUS_DRIVER_POOL',
  DUPLICATE_NAME: 'DUPLICATE_NAME',
  WEAK_NAME_ONLY: 'WEAK_NAME_ONLY',
  UNASSIGNED_DRIVER: 'UNASSIGNED_DRIVER',
} as const;

export type DriverCandidateConflictCode =
  (typeof DRIVER_CANDIDATE_CONFLICT_CODES)[keyof typeof DRIVER_CANDIDATE_CONFLICT_CODES];

export interface DriverCandidateConflict {
  code: DriverCandidateConflictCode;
  field: string;
  message: string;
  severity: 'BLOCKER' | 'WARNING';
}

export interface DriverCandidateMatch {
  driverCustomerId: string;
  confidence: number;
  matchReasons: DriverCandidateMatchReason[];
  conflicts: DriverCandidateConflict[];
  rank: number;
  confirmationRequired: boolean;
  /** Non-PII label for review UI */
  displayLabel: string;
  driverRole: 'PRIMARY' | 'ADDITIONAL' | 'UNKNOWN';
}

export interface DriverResolverHints {
  driverNamePresent: boolean;
  licensePresent: boolean;
  driverIdPresent: boolean;
  bookingLinkPresent: boolean;
  tripAssignmentPresent: boolean;
  documentContextDriverId?: string | null;
  linkedBookingId?: string | null;
}

export interface DriverCandidateSearchRecord {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  fullNameNormalized: string | null;
  licenseNumberNormalized: string | null;
}

export interface DriverBookingPoolContext {
  bookingId: string;
  bookingCustomerId: string;
  primaryDriverId: string | null;
  additionalDriverIds: string[];
  allowedDriverIds: string[];
  tripDriverId: string | null;
}

export interface DriverCandidatePipelineState {
  evaluatedAt: string;
  hints: DriverResolverHints;
  candidates: DriverCandidateMatch[];
  ambiguousDriverPool: boolean;
  unassignedDriver: boolean;
  autoConfirmEligible: false;
}

export interface DriverCandidateResolverInput {
  organizationId: string;
  documentType: string;
  extractedData: Record<string, unknown>;
  linkedBookingId?: string | null;
  uploadContextDriverId?: string | null;
  resolvedVehicleId?: string | null;
}

export const DRIVER_CANDIDATE_RESOLVER_DOCUMENT_TYPES = [
  'FINE',
  'ACCIDENT',
  'DAMAGE',
] as const;

export interface DriverResolverPrivateHints {
  driverName?: string | null;
  licenseNumber?: string | null;
  driverId?: string | null;
  documentContextDriverId?: string | null;
}
