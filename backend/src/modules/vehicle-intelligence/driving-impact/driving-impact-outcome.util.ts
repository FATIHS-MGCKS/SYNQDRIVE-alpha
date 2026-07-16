import { DRIVING_IMPACT_CONFIG as C } from './driving-impact.config';
import type {
  DrivingImpactComputationQuality,
  DrivingImpactOutcome,
  DrivingImpactSkipReason,
  DrivingImpactTripStatus,
} from './driving-impact-outcome.types';
import type { AnalysisStageState } from '../trips/trip-analysis-status';

export interface DrivingImpactQualityInput {
  distanceKm: number;
  citySharePct: number | null;
  highwaySharePct: number | null;
  countryRoadSharePct: number | null;
  brakingEventRowCount: number;
  useTelemetryDrivingEvents: boolean;
}

/** Assess whether a persisted impact row is complete or limited-source partial. */
export function assessDrivingImpactComputationQuality(
  input: DrivingImpactQualityInput,
): DrivingImpactComputationQuality {
  const missingUsageSplit =
    input.citySharePct == null &&
    input.highwaySharePct == null &&
    input.countryRoadSharePct == null;

  const limitedBrakingDetail = input.brakingEventRowCount === 0;

  if (missingUsageSplit || limitedBrakingDetail) {
    return 'PARTIAL';
  }

  return 'COMPLETE';
}

export function mapComputationQualityToTripStatus(
  quality: DrivingImpactComputationQuality,
): Extract<DrivingImpactTripStatus, 'READY' | 'PARTIAL'> {
  return quality === 'COMPLETE' ? 'READY' : 'PARTIAL';
}

export function buildPersistedDrivingImpactOutcome(params: {
  quality: DrivingImpactComputationQuality;
  calculatedAt: Date;
}): DrivingImpactOutcome {
  return {
    drivingImpactStatus: mapComputationQualityToTripStatus(params.quality),
    stageState: 'done',
    modelVersion: C.MODEL_VERSION,
    calculatedAt: params.calculatedAt,
    computationQuality: params.quality,
  };
}

export function buildSkippedDrivingImpactOutcome(
  reason: DrivingImpactSkipReason,
): DrivingImpactOutcome {
  return {
    drivingImpactStatus: 'SKIPPED',
    stageState: 'skipped',
    modelVersion: C.MODEL_VERSION,
    calculatedAt: null,
    skipReason: reason,
  };
}

export function buildFailedDrivingImpactOutcome(error: string): DrivingImpactOutcome {
  return {
    drivingImpactStatus: 'FAILED',
    stageState: 'failed',
    modelVersion: C.MODEL_VERSION,
    calculatedAt: null,
    failureReason: error.slice(0, 500),
  };
}

export function expectedStageStateForTripStatus(
  status: DrivingImpactTripStatus,
): AnalysisStageState | null {
  switch (status) {
    case 'READY':
    case 'PARTIAL':
      return 'done';
    case 'SKIPPED':
      return 'skipped';
    case 'FAILED':
      return 'failed';
    case 'PENDING':
      return 'pending';
    default:
      return null;
  }
}
