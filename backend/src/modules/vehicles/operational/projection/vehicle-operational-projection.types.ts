/**
 * P0.2 — Canonical Vehicle Operational Projection contract.
 *
 * Authoritative operator-facing interpretation across business workflow,
 * connectivity (P0.1), health evaluability, and attention — without
 * collapsing domains or re-deriving connectivity evidence.
 *
 * No user-facing labels or i18n strings in this module.
 */
import type {
  AttentionState,
  ConnectivityReasonCode,
  ConnectivityRecommendedAction,
  VehicleConnectivityRuntimeState,
} from '../../connectivity/domain/connectivity-domain.types';
import type {
  HealthState,
  RentalHealthAvailabilityState,
} from '../../../rental-health/rental-health.types';

/** Persisted workflow / desk availability (`Vehicle.status` family). */
export const BusinessOperationalState = {
  AVAILABLE: 'AVAILABLE',
  RENTED: 'RENTED',
  RESERVED: 'RESERVED',
  IN_SERVICE: 'IN_SERVICE',
  OUT_OF_SERVICE: 'OUT_OF_SERVICE',
  UNKNOWN: 'UNKNOWN',
} as const;
export type BusinessOperationalState =
  (typeof BusinessOperationalState)[keyof typeof BusinessOperationalState];

/**
 * Operator-facing operational availability — distinct from stored business status.
 * Answers: "Can an operator treat this vehicle as operationally ready right now?"
 */
export const OperationalAvailabilityState = {
  /** No authoritative block and no connectivity verification gap. */
  AVAILABLE: 'AVAILABLE',
  /** Connectivity or evidence uncertainty — manual verification, not a hard block. */
  NEEDS_VERIFICATION: 'NEEDS_VERIFICATION',
  /** Authoritative business, safety, or confirmed operational block. */
  UNAVAILABLE: 'UNAVAILABLE',
  /** Insufficient cross-domain evidence to classify. */
  UNKNOWN: 'UNKNOWN',
} as const;
export type OperationalAvailabilityState =
  (typeof OperationalAvailabilityState)[keyof typeof OperationalAvailabilityState];

/**
 * Whether health assessment can be presented confidently — orthogonal to
 * {@link HealthEvidenceSnapshot.conditionState} severity.
 */
export const HealthEvaluabilityState = {
  EVALUABLE: 'EVALUABLE',
  PARTIALLY_EVALUABLE: 'PARTIALLY_EVALUABLE',
  NOT_EVALUABLE: 'NOT_EVALUABLE',
  UNKNOWN: 'UNKNOWN',
} as const;
export type HealthEvaluabilityState =
  (typeof HealthEvaluabilityState)[keyof typeof HealthEvaluabilityState];

/** Canonical operator attention — aligns with connectivity {@link AttentionState}. */
export type OperatorAttentionLevel = AttentionState;

/**
 * Projection-owned reason codes — additive only.
 * Connectivity-owned codes (e.g. DEVICE_CHECK_REQUIRED) are preserved verbatim.
 */
export const OperationalProjectionReasonCode = {
  BUSINESS_WORKFLOW_BLOCKED: 'BUSINESS_WORKFLOW_BLOCKED',
  HEALTH_RENTAL_BLOCKED: 'HEALTH_RENTAL_BLOCKED',
  HEALTH_EVIDENCE_STALE: 'HEALTH_EVIDENCE_STALE',
  HEALTH_EVIDENCE_UNAVAILABLE: 'HEALTH_EVIDENCE_UNAVAILABLE',
  CONNECTIVITY_CONFIRMED_INTERRUPTION: 'CONNECTIVITY_CONFIRMED_INTERRUPTION',
  CONNECTIVITY_VERIFICATION_REQUIRED: 'CONNECTIVITY_VERIFICATION_REQUIRED',
  INSUFFICIENT_CROSS_DOMAIN_EVIDENCE: 'INSUFFICIENT_CROSS_DOMAIN_EVIDENCE',
} as const;
export type OperationalProjectionReasonCode =
  (typeof OperationalProjectionReasonCode)[keyof typeof OperationalProjectionReasonCode];

export type OperationalReasonCode =
  | ConnectivityReasonCode
  | OperationalProjectionReasonCode;

/**
 * Minimal health-domain input for evaluability — does not re-run health modules.
 *
 * Maps from Rental Health V1 `VehicleHealth`:
 * - `conditionState` ← `overall_state` (severity / condition — not evaluability)
 * - `pipelineAvailability` ← `availability` (pipeline coverage)
 * - `generatedAt` ← `generated_at` (last successful health evaluation)
 * - `anyModuleDataStale` ← any module `data_stale === true`
 * - `telemetryDependentModulesEvaluated` ← caller indicates battery/tires/DTC/etc. were in scope
 */
export interface HealthEvidenceSnapshot {
  conditionState: HealthState;
  pipelineAvailability: RentalHealthAvailabilityState;
  rentalBlocked: boolean | null;
  generatedAt: string | null;
  anyModuleDataStale: boolean;
  /**
   * When true, offline telemetry may conservatively downgrade evaluability
   * because evaluated modules depend on live provider signals.
   */
  telemetryDependentModulesEvaluated?: boolean;
}

/** @deprecated Use {@link HealthEvidenceSnapshot} — retained for in-module migration. */
export type HealthConditionSnapshot = HealthEvidenceSnapshot;

export interface VehicleOperationalEvidence {
  generatedAt: string;
  latestTelemetryAt: string | null;
  latestConnectivityEvidenceAt: string | null;
  healthEvidenceAt: string | null;
  episodeEvidenceReliable: boolean | null;
}

export interface VehicleOperationalOperatorSummary {
  state: OperationalAvailabilityState;
  reasonCodes: OperationalReasonCode[];
  primaryReason: OperationalReasonCode | null;
  recommendedAction: ConnectivityRecommendedAction;
}

/**
 * Canonical P0.2 projection — current operational truth only.
 * Historical device-connection events belong to history endpoints.
 */
export interface VehicleOperationalProjection {
  vehicleId: string;
  organizationId: string;
  generatedAt: string;
  projectionVersion: number;

  businessState: BusinessOperationalState;

  /** Full P0.1 runtime — consumed, never re-derived inside P0.2. */
  connectivity: VehicleConnectivityRuntimeState;

  operationalAvailability: OperationalAvailabilityState;
  healthEvaluability: HealthEvaluabilityState;
  attention: OperatorAttentionLevel;

  operatorSummary: VehicleOperationalOperatorSummary;
  evidence: VehicleOperationalEvidence;
}

export const VEHICLE_OPERATIONAL_PROJECTION_VERSION = 1;
