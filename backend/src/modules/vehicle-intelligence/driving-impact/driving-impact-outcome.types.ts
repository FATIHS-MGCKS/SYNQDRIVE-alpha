import type { AnalysisStageState } from '../trips/trip-analysis-status';

/** Trip-level driving impact readiness (VehicleTrip.drivingImpactStatus). */
export type DrivingImpactTripStatus = 'PENDING' | 'READY' | 'PARTIAL' | 'SKIPPED' | 'FAILED';

/** Computation quality persisted with the impact row. */
export type DrivingImpactComputationQuality = 'COMPLETE' | 'PARTIAL';

export type DrivingImpactSkipReason =
  | 'trip_not_found'
  | 'distance_too_short'
  | 'capability_gap';

export interface DrivingImpactOutcome {
  drivingImpactStatus: DrivingImpactTripStatus;
  stageState: AnalysisStageState;
  modelVersion: string;
  calculatedAt: Date | null;
  computationQuality?: DrivingImpactComputationQuality;
  skipReason?: DrivingImpactSkipReason;
  failureReason?: string;
}

export type DrivingImpactComputeResult =
  | {
      kind: 'persisted';
      quality: DrivingImpactComputationQuality;
      modelVersion: string;
      calculatedAt: Date;
    }
  | {
      kind: 'skipped';
      reason: DrivingImpactSkipReason;
      modelVersion: string;
    }
  | {
      kind: 'failed';
      error: string;
      modelVersion: string;
    };

export function isDrivingImpactPersisted(
  result: DrivingImpactComputeResult,
): result is Extract<DrivingImpactComputeResult, { kind: 'persisted' }> {
  return result.kind === 'persisted';
}
