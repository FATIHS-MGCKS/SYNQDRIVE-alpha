import type { TireOdometerAnchorStatus } from '@prisma/client';
import type { WheelPos } from '../tire-evidence-provenance';

export type TireWearV3EvidenceLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'UNRATED';

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
  estimatedTreadMm: NumericInterval;
  remainingKm: NumericInterval;
  wearRate: TireWearV3WearRateEstimate;
  evidenceLevel: TireWearV3EvidenceLevel;
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
