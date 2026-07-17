import type { HvCapacityMethod } from '../battery-v2-domain';
import { HV_M2_CAPACITY_METHOD } from './hv-capacity-m2.types';

/** Versioned session-level shadow gate contract — bump when gate semantics change. */
export const HV_M2_SESSION_SUMMARY_GATE_VERSION = 1;

export const HV_M2_SESSION_SUMMARY_MODEL_VERSION = 1;

export const HV_M2_SESSION_SUMMARY_STATUSES = {
  STABLE_SHADOW: 'STABLE_SHADOW',
  UNSTABLE_SHADOW: 'UNSTABLE_SHADOW',
  INSUFFICIENT: 'INSUFFICIENT',
  DISQUALIFIED: 'DISQUALIFIED',
} as const;

export type HvCapacitySessionSummaryStatus =
  (typeof HV_M2_SESSION_SUMMARY_STATUSES)[keyof typeof HV_M2_SESSION_SUMMARY_STATUSES];

export const HV_M2_SESSION_SUMMARY_GATE_REASONS = {
  SESSION_ONGOING: 'SESSION_ONGOING',
  SESSION_NOT_QUALIFIED: 'SESSION_NOT_QUALIFIED',
  INSUFFICIENT_VALID_SAMPLES: 'INSUFFICIENT_VALID_SAMPLES',
  INSUFFICIENT_SOC_SPAN: 'INSUFFICIENT_SOC_SPAN',
  INSUFFICIENT_PREFERRED_SOC_SAMPLES: 'INSUFFICIENT_PREFERRED_SOC_SAMPLES',
  CV_ABOVE_SHADOW_LIMIT: 'CV_ABOVE_SHADOW_LIMIT',
  DOMINANT_DUPLICATE_TIMESTAMPS: 'DOMINANT_DUPLICATE_TIMESTAMPS',
  EXCESSIVE_PROVIDER_GAPS: 'EXCESSIVE_PROVIDER_GAPS',
  NO_VALID_SAMPLES: 'NO_VALID_SAMPLES',
} as const;

export type HvM2SessionSummaryGateReasonCode =
  (typeof HV_M2_SESSION_SUMMARY_GATE_REASONS)[keyof typeof HV_M2_SESSION_SUMMARY_GATE_REASONS];

/** Shadow CV limit — Tesla audit stable sessions < 1 %. */
export const HV_M2_SESSION_SUMMARY_MAX_CV = 0.02;

export const HV_M2_SESSION_SUMMARY_MIN_VALID_SAMPLES = 5;
export const HV_M2_SESSION_SUMMARY_MIN_PREFERRED_SOC_SAMPLES = 3;
export const HV_M2_SESSION_SUMMARY_MIN_SOC_SPAN_PERCENT = 5;

/** Provider gap threshold — 2× typical HV poll cadence. */
export const HV_M2_SESSION_SUMMARY_PROVIDER_GAP_MS = 90_000;

export const HV_M2_SESSION_SUMMARY_MAX_DOMINANT_DUPLICATE_RATIO = 0.3;

export const HV_M2_SESSION_SUMMARY_MAX_PROVIDER_GAPS = 3;

export interface HvCapacitySessionSummaryInputObservation {
  observedAt: Date;
  estimatedCapacityKwh: number;
  socPercent: number;
  preferredSocBand: boolean;
  outlier: boolean;
  quality: string;
}

export interface HvCapacitySessionSummaryStats {
  validSampleCount: number;
  totalSampleCount: number;
  outlierCount: number;
  medianCapacityKwh: number | null;
  p10CapacityKwh: number | null;
  p90CapacityKwh: number | null;
  madKwh: number | null;
  robustSpreadKwh: number | null;
  coefficientOfVariation: number | null;
  minSocPercent: number | null;
  maxSocPercent: number | null;
  preferredBandSampleCount: number;
  socSpanPercent: number | null;
  temporalCoverageRatio: number | null;
  temporalSpanMs: number | null;
  providerGapCount: number;
  maxProviderGapMs: number | null;
  dominantDuplicateRatio: number | null;
}

export interface HvCapacitySessionSummary {
  method: HvCapacityMethod;
  gateVersion: number;
  modelVersion: number;
  computedAt: string;
  status: HvCapacitySessionSummaryStatus;
  shadowGatePassed: boolean;
  gateReasonCodes: HvM2SessionSummaryGateReasonCode[];
  stats: HvCapacitySessionSummaryStats;
}

export interface HvCapacitySessionSummaryContext {
  sessionStartAt: Date;
  sessionEndAt: Date | null;
  isOngoing: boolean;
  capacityShadowEligible: boolean;
  qualityStatus: string | null;
}

export interface AggregateHvCapacitySessionSummaryInput {
  method: HvCapacityMethod;
  observations: HvCapacitySessionSummaryInputObservation[];
  session: HvCapacitySessionSummaryContext;
  gateVersion?: number;
  modelVersion?: number;
  computedAt?: Date;
}
