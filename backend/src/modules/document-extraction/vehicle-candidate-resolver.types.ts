export const VEHICLE_CANDIDATE_MATCH_REASONS = {
  VIN_EXACT: 'VIN_EXACT',
  LICENSE_PLATE_EXACT: 'LICENSE_PLATE_EXACT',
  LICENSE_PLATE_FUZZY: 'LICENSE_PLATE_FUZZY',
  MAKE_MODEL: 'MAKE_MODEL',
  FLEET_NUMBER: 'FLEET_NUMBER',
  DOCUMENT_CONTEXT: 'DOCUMENT_CONTEXT',
  BOOKING_REFERENCE: 'BOOKING_REFERENCE',
} as const;

export type VehicleCandidateMatchReason =
  (typeof VEHICLE_CANDIDATE_MATCH_REASONS)[keyof typeof VEHICLE_CANDIDATE_MATCH_REASONS];

export const VEHICLE_CANDIDATE_CONFLICT_CODES = {
  VIN_PLATE_MISMATCH: 'VIN_PLATE_MISMATCH',
  SIGNAL_CONFLICT: 'SIGNAL_CONFLICT',
  OCR_UNCERTAINTY: 'OCR_UNCERTAINTY',
} as const;

export type VehicleCandidateConflictCode =
  (typeof VEHICLE_CANDIDATE_CONFLICT_CODES)[keyof typeof VEHICLE_CANDIDATE_CONFLICT_CODES];

export interface VehicleCandidateConflict {
  code: VehicleCandidateConflictCode;
  field: string;
  message: string;
  severity: 'BLOCKER' | 'WARNING';
}

export interface VehicleCandidateMatch {
  vehicleId: string;
  confidence: number;
  matchReasons: VehicleCandidateMatchReason[];
  conflicts: VehicleCandidateConflict[];
  rank: number;
  confirmationRequired: boolean;
}

export interface VehicleResolverHints {
  licensePlate?: string | null;
  vin?: string | null;
  make?: string | null;
  model?: string | null;
  fleetNumber?: string | null;
  bookingReference?: string | null;
  documentContextVehicleId?: string | null;
  ocrUncertaintyFields?: string[];
}

export interface VehicleCandidateSearchRecord {
  id: string;
  licensePlate: string | null;
  vin: string;
  make: string;
  model: string;
  vehicleName: string | null;
}

export interface VehicleCandidatePipelineState {
  evaluatedAt: string;
  hints: VehicleResolverHints;
  candidates: VehicleCandidateMatch[];
  blockerPresent: boolean;
  autoConfirmEligible: false;
}

export interface VehicleCandidateResolverInput {
  organizationId: string;
  extractedData: Record<string, unknown>;
  uploadContextVehicleId?: string | null;
  uploadContextBookingId?: string | null;
  bookingVehicleId?: string | null;
  fieldEvidence?: Array<{ key: string; conflict: boolean; candidateValues?: unknown[] }>;
  assignedVehicleId?: string | null;
}
