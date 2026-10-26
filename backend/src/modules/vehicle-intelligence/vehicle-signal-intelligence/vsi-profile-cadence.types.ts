import type { VsiSignalConfidenceLevel } from './vsi-profile.types';

export const VSI_SIGNAL_CADENCE_CONTRACT_VERSION = 'vsi-signal-cadence-v2' as const;

export type VsiCadenceRegimeKind =
  | 'POLL_BOUND_ACTIVE'
  | 'PERIODIC_RESTING_HEARTBEAT'
  | 'IRREGULAR'
  | 'INSUFFICIENT_EVIDENCE';

export type VsiCadenceObservedDensityLabel =
  | 'UNKNOWN'
  | 'NOT_APPLICABLE'
  | 'IRREGULAR'
  | 'SUB_ONE_HZ'
  | 'ONE_SECOND_BUCKETS_UNPROVEN';

export type VsiIceRpmApplicability = 'APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';

export type VsiHfCadenceReadStatus =
  | 'SUCCESS'
  | 'UNAVAILABLE'
  | 'QUERY_FAILED'
  | 'EMPTY'
  | 'SKIPPED';

export type VsiCadenceRegimeV2 = {
  kind: VsiCadenceRegimeKind;
  intervalMedianSeconds: number | null;
  intervalP95Seconds: number | null;
  sampleCount: number;
  confidence: VsiSignalConfidenceLevel;
};

export type VsiSignalCadenceIntelligenceV2 = {
  contractVersion: typeof VSI_SIGNAL_CADENCE_CONTRACT_VERSION;
  evidenceConfidence: VsiSignalConfidenceLevel;
  provenance: string[];
  limitations: string[];
  observedSampleCount: number;
  distinctTimestampCount: number;
  intervalMedianSeconds: number | null;
  intervalP95Seconds: number | null;
  maxIntraWindowGapSeconds: number | null;
  activeWindowCoverageRatio: number | null;
  finalizedTripCount: number | null;
  regimes: VsiCadenceRegimeV2[];
  observedDensityLabel: VsiCadenceObservedDensityLabel;
  /** Stable semantic identity for cadence dimension (excludes raw counters). */
  cadenceSemanticFingerprint: string;
};

export type VsiRpmCadenceSamplePoint = {
  recordedAtMs: number;
  value: number;
  tripId?: string;
};

export type VsiRpmCadenceTripWindow = {
  tripId: string;
  startMs: number;
  endMs: number;
};

export type VsiRpmCadenceEvidenceInput = {
  iceRpmApplicability: VsiIceRpmApplicability;
  tripWindows: readonly VsiRpmCadenceTripWindow[];
  points: readonly VsiRpmCadenceSamplePoint[];
  provenance: string[];
  hfReadStatus: VsiHfCadenceReadStatus;
};

export type VsiLvCadenceEvidencePoint = {
  observedAtMs: number;
  providerTimestampMs: number | null;
};

export type VsiLvCadenceEvidenceInput = {
  points: readonly VsiLvCadenceEvidencePoint[];
  provenance: string[];
  linkActivatedAtMs: number;
  linkDeactivatedAtMs: number | null;
};
