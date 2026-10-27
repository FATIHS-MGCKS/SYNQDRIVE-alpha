import type { TireOdometerAnchorStatus } from '@prisma/client';
import type { WheelPos } from '../tire-evidence-provenance';

export type TireWearV3EvidenceLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'UNRATED';

/** Customer-facing tread depth evidence (never conflated with L-level rate calibration). */
export type TireWearV3TreadEvidenceClass =
  | 'MEASURED'
  | 'CALIBRATED_ESTIMATE'
  | 'BASELINE_ESTIMATE'
  | 'INSUFFICIENT';

export interface TireWearV3DynamicFactorSnapshot {
  factor: number;
  coverage: number;
  sRel: number | null;
  applied: boolean;
  appliedToRateLo: boolean;
}

export type TireWearV3RateSource =
  | 'prior_life_table'
  | 'prior_life_explicit'
  | 'prior_life_widened'
  | 'measurement_fused'
  | 'not_rateable';

export interface NumericInterval {
  lo: number;
  hi: number;
}

export interface TireWearV3WearRateEstimate {
  mmPerKm: NumericInterval;
  mmPer1000km: NumericInterval;
  source: TireWearV3RateSource;
  /** Posterior / observation 1σ when rate was fused; model prior width otherwise. */
  modelUncertaintyMmPerKm: NumericInterval;
  measurementUncertaintyMmPerKm: NumericInterval | null;
  flags: string[];
}

export interface TireWearV3WheelProjection {
  position: WheelPos;
  initialTreadMm: number;
  initialTreadUsedDefaultFallback: boolean;
  replacementThresholdMm: number;
  distanceSinceAnchorKm: number;
  /** Interval projection from anchor + wear rate (internal). */
  estimatedTreadMm: NumericInterval;
  /** Wear since projection anchor (mm), from rate × distance. */
  estimatedWearMm: NumericInterval;
  /** Null when treadEvidenceClass is INSUFFICIENT. */
  displayTreadMm: NumericInterval | null;
  /** Point mm only for MEASURED (fresh) or CALIBRATED_ESTIMATE; never for baseline-only. */
  pointEstimateTreadMm: number | null;
  treadEvidenceClass: TireWearV3TreadEvidenceClass;
  remainingKm: NumericInterval;
  wearRate: TireWearV3WearRateEstimate;
  evidenceLevel: TireWearV3EvidenceLevel;
  dynamicFactor: TireWearV3DynamicFactorSnapshot;
  flags: string[];
}

export interface TireWearV3PriorSetupResult {
  tireSetupId: string;
  vehicleId: string;
  organizationId: string | null;
  modelVersion: string;
  modelConfigHash: string;
  inputFingerprint: string;
  computedAt: string;
  odometerAnchorKm: number | null;
  odometerAnchorStatus: TireOdometerAnchorStatus | null;
  currentOdometerKm: number | null;
  ledgerDistanceKm: number;
  ledgerRowCount: number;
  dynamicBeta: number;
  ds4SeverityCoverage: number;
  ds4SeveritySRel: number | null;
  rated: boolean;
  wheels: TireWearV3WheelProjection[];
  setupFlags: string[];
}

export interface TireWearV3MeasurementPoint {
  measuredAt: Date;
  odometerKm: number | null;
  treadMm: number;
  source: string;
  isCalibrationPoint: boolean;
}
