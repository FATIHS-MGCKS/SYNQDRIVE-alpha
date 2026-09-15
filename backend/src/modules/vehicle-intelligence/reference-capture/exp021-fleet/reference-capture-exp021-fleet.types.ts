import type { Exp021StudyStatus } from '@prisma/client';

export type Exp021FleetEligibilityReasonCode =
  | 'STUDY_NOT_COLLECTING'
  | 'ENROLLMENT_DISABLED'
  | 'VEHICLE_NOT_FOUND'
  | 'ALLOWED_PLANS_EMPTY'
  | 'TOKEN_UNRESOLVABLE'
  | 'TOKEN_MISMATCH'
  | 'HF_POLICY_BLOCKED'
  | 'ACTIVE_SESSION_CONFLICT'
  | 'TELEMETRY_UNAVAILABLE'
  | 'TELEMETRY_STALE'
  | 'PLAN_UNRESOLVABLE'
  | 'STUDY_EVIDENCE_CLOSED'
  | 'REFERENCE_CAPTURE_DISABLED'
  | 'FLEET_COORDINATOR_DISABLED'
  | 'FLEET_DRY_RUN_REQUIRED'
  | 'STUDY_DRY_RUN_REQUIRED';

export type Exp021FleetTelemetryFreshnessState =
  | 'FRESH'
  | 'STALE'
  | 'UNAVAILABLE'
  | 'NOT_CHECKED';

export type Exp021FleetMinimumMatrixConfig = {
  minValidCompleteRunsPerVehicle: number;
  min9060Runs: number;
  min6090Runs: number;
  minDistinctVehicles: number;
};

export const EXP021_DEFAULT_MINIMUM_MATRIX_CONFIG: Exp021FleetMinimumMatrixConfig = {
  minValidCompleteRunsPerVehicle: 2,
  min9060Runs: 3,
  min6090Runs: 3,
  minDistinctVehicles: 3,
};

export type Exp021FleetStudyConfig = {
  minimumMatrix?: Exp021FleetMinimumMatrixConfig;
};

export type Exp021FleetEligibilityInput = {
  studyStatus: Exp021StudyStatus;
  studyDryRun: boolean;
  enrollmentEnabled: boolean;
  organizationId: string;
  vehicleId: string;
  enrolledTokenId: number;
  resolvedTokenId: number | null;
  allowedPlans: string[];
  hfPolicyAllowed: boolean;
  hfPolicyBlocker?: string;
  activeSessionConflict: boolean;
  activeSessionId?: string;
  telemetryFreshness: Exp021FleetTelemetryFreshnessState;
  referenceCaptureEnabled: boolean;
  fleetCoordinatorEnabled: boolean;
  fleetDryRun: boolean;
};

export type Exp021FleetEligibilityResult = {
  eligible: boolean;
  reasonCodes: Exp021FleetEligibilityReasonCode[];
  organizationId: string;
  vehicleId: string;
  tokenId: number | null;
  proposedPlanId: string | null;
  proposedPhaseOrderMs: number[] | null;
};

export type Exp021FleetDryRunObservation = {
  studyId: string;
  enrollmentId: string;
  organizationId: string;
  vehicleId: string;
  tokenId: number | null;
  eligible: boolean;
  reasonCodes: Exp021FleetEligibilityReasonCode[];
  telemetryFreshness: Exp021FleetTelemetryFreshnessState;
  hfPolicyAllowed: boolean;
  hfPolicyBlocker?: string;
  activeSessionConflict: boolean;
  activeSessionId?: string;
  proposedPlanId: string | null;
  proposedPhaseOrderMs: number[] | null;
  timestamp: string;
  dryRun: true;
};

export type Exp021FleetOrderBalanceSnapshot = {
  globalCounts: Record<string, number>;
  vehicleCounts: Record<string, number>;
};

export type Exp021FleetProposedOrder = {
  planRegistryKey: string;
  planId: string;
  planVersion: string;
  phaseOrderMs: number[];
  phaseOrderKey: string;
  allocatorReason: string;
};
