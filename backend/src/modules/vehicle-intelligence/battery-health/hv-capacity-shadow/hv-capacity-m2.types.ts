import { HvCapacityMethod } from '../battery-v2-domain';
import type { HvCapacitySessionSummary } from './hv-capacity-session-summary.types';

export const HV_M2_CAPACITY_METHOD = HvCapacityMethod.CURRENT_ENERGY_OVER_SOC;

/** M2 shadow model version — bump when gate/formula semantics change. */
export const HV_M2_MODEL_VERSION = 1;

export const HV_M2_SOC_PREFERRED_MIN = 10;
export const HV_M2_SOC_PREFERRED_MAX = 90;

/** Max allowed skew between SOC and current-energy provider observation timestamps. */
export const HV_M2_MAX_TIMESTAMP_DELTA_MS = 60_000;

export const HV_M2_MIN_SOC_PERCENT = 0;
export const HV_M2_MIN_ENERGY_KWH = 0.05;
export const HV_M2_MAX_ENERGY_KWH = 130;
export const HV_M2_MAX_SOC_PERCENT = 100;

/** Default usable-capacity band when no vehicle reference is configured. */
export const HV_M2_DEFAULT_CAPACITY_MIN_KWH = 15;
export const HV_M2_DEFAULT_CAPACITY_MAX_KWH = 120;

/** ± tolerance around verified reference capacity for plausibility gate. */
export const HV_M2_REFERENCE_BAND_TOLERANCE = 0.4;

/** Mark pointwise estimate as outlier when deviating more than this from session median. */
export const HV_M2_OUTLIER_DEVIATION_RATIO = 0.15;

export const HV_M2_PROVIDER_SOURCE = 'dimo_hv_snapshot';

export const HV_M2_GATE_REASONS = {
  SOC_NOT_POSITIVE: 'SOC_NOT_POSITIVE',
  MISSING_ENERGY: 'MISSING_ENERGY',
  TIMESTAMP_SKEW: 'TIMESTAMP_SKEW',
  DUPLICATE_TIMESTAMP: 'DUPLICATE_TIMESTAMP',
  STALE_REPETITION: 'STALE_REPETITION',
  NOT_NEW_OBSERVATION: 'NOT_NEW_OBSERVATION',
  IMPLAUSIBLE_UNIT: 'IMPLAUSIBLE_UNIT',
  OUT_OF_CAPACITY_BAND: 'OUT_OF_CAPACITY_BAND',
  SESSION_NOT_ELIGIBLE: 'SESSION_NOT_ELIGIBLE',
  OUTLIER: 'OUTLIER',
} as const;

export type HvM2GateReasonCode =
  (typeof HV_M2_GATE_REASONS)[keyof typeof HV_M2_GATE_REASONS];

export interface HvCapacityM2Sample {
  observedAt: Date;
  socPercent: number;
  currentEnergyKwh: number;
  socObservedAt: Date;
  energyObservedAt: Date;
  receivedAt: Date | null;
}

export interface HvCapacityM2CapacityBand {
  minKwh: number;
  maxKwh: number;
  referenceCapacityKwh: number | null;
}

export interface HvCapacityM2GateEvaluation {
  eligible: boolean;
  reasonCodes: HvM2GateReasonCode[];
  timestampDeltaMs: number;
  preferredSocBand: boolean;
}

export interface HvCapacityM2PointEstimate {
  valueKwh: number;
  sample: HvCapacityM2Sample;
  gate: HvCapacityM2GateEvaluation;
  outlier: boolean;
}

import type { HvCapacityM3ValidationResult } from './hv-capacity-m3.types';

export interface HvCapacityM2SessionResult {
  sessionId: string;
  method: typeof HV_M2_CAPACITY_METHOD;
  modelVersion: number;
  estimates: HvCapacityM2PointEstimate[];
  sessionMedianKwh: number | null;
  persistedCount: number;
  skippedCount: number;
  summary: HvCapacitySessionSummary | null;
  m3Validation?: HvCapacityM3ValidationResult | null;
}

export interface HvCapacityObservationMetadata {
  shadowMode: true;
  socPercent: number;
  currentEnergyKwh: number;
  timestampDeltaMs: number;
  preferredSocBand: boolean;
  outlier: boolean;
  gateReasonCodes: HvM2GateReasonCode[];
  sessionMedianKwh?: number | null;
}
