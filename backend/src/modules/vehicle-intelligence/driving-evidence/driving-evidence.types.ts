import type {
  DrivingAnalysisDimension,
  DrivingEvidenceSourceType,
  DrivingEvidenceStrength,
} from '@prisma/client';

/** Stable contract version — bump when field semantics or validation rules change. */
export const DRIVING_EVIDENCE_CONTRACT_VERSION = 'driving-evidence-v1';

/** Max serialized JSON bytes for bounded `contextJson` (no full provider payloads). */
export const DRIVING_EVIDENCE_MAX_CONTEXT_BYTES = 4096;

export const DRIVING_EVIDENCE_SOURCE_TYPES: readonly DrivingEvidenceSourceType[] = [
  'MEASURED_SIGNAL',
  'PROVIDER_CLASSIFIED_EVENT',
  'RECONSTRUCTED_EVENT',
  'ESTIMATED_PROXY',
  'CONTEXT_SIGNAL',
  'MANUAL_VERIFIED',
  'WORKSHOP_VERIFIED',
] as const;

/** Canonical pointer to an existing source row — never a payload mirror. */
export type DrivingEvidenceSourceEntity = {
  table: string;
  id: string;
  kind?: string | null;
};

/** Bounded operational context — labels, counters, short codes only. */
export type DrivingEvidenceContext = Record<string, string | number | boolean | null>;

export type CreateDrivingEvidenceInput = {
  organizationId: string;
  vehicleId: string;
  tripId?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
  dimension?: DrivingAnalysisDimension | null;
  analysisRunId?: string | null;
  sourceType: DrivingEvidenceSourceType;
  strength: DrivingEvidenceStrength;
  observedAt: Date;
  providerSource: string;
  capabilityVersion: string;
  modelVersion: string;
  coverage?: number | null;
  effectiveCadenceMs?: number | null;
  p95CadenceMs?: number | null;
  confidence?: number | null;
  sourceEntity: DrivingEvidenceSourceEntity;
  context?: DrivingEvidenceContext | null;
  idempotencyKey: string;
};

export type DrivingEvidenceValidationIssue = {
  code:
    | 'ESTIMATED_MARKED_AS_MEASURED'
    | 'PROVIDER_CLASSIFICATION_HIDDEN'
    | 'INVALID_SOURCE_ENTITY'
    | 'FORBIDDEN_PAYLOAD_FIELD'
    | 'CONTEXT_TOO_LARGE'
    | 'INVALID_CONFIDENCE'
    | 'MISSING_IDEMPOTENCY_KEY';
  message: string;
};

export type DrivingEvidenceValidationResult =
  | { ok: true; misuseCaseEligible: boolean }
  | { ok: false; issues: DrivingEvidenceValidationIssue[] };

export type NormalizedDrivingEvidenceCreate = CreateDrivingEvidenceInput & {
  misuseCaseEligible: boolean;
  contractVersion: string;
};
