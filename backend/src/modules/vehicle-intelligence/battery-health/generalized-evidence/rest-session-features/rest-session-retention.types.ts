import {
  BatteryGeneralizedEvidenceClass,
  BatteryShutdownStateAlignmentClass,
} from '@prisma/client';

/**
 * M3.3C pure retention policy — temporal authority contract (C1 / C1.1).
 *
 * `actualRestAgeMs` on anchor and ladder inputs mirrors canonical
 * `BatteryGeneralizedEvidenceObservation.actualRestAgeMs`. That persisted value
 * is authoritative only because the M3.3A/B rest-session path derives it via
 * `computeActualRestAgeMs()` (provider-qualified LV field time). This policy
 * does not recalculate age, use ingestion wall clock, or use provider-gap duration.
 */
export type RestSessionRetentionAnchorInput = {
  restSessionId: string;
  evidenceClass: BatteryGeneralizedEvidenceClass;
  /** Must be exactly 0 for ENGINE_OFF anchor acceptance (provider-qualified shutdown). */
  actualRestAgeMs: number | null;
  voltageV: number | null;
};

export type RestSessionRetentionCandidateInput = {
  observationId: string;
  restSessionId: string;
  evidenceClass: BatteryGeneralizedEvidenceClass;
  stateAlignmentClass: BatteryShutdownStateAlignmentClass;
  /**
   * Canonical rest age from GE observation (see module comment above).
   * Must be > 0 for ladder eligibility.
   */
  actualRestAgeMs: number | null;
  voltageV: number | null;
  providerObservationAt: Date | null;
  nominalRestIntervalIndex: number | null;
};

export type RestSessionRetentionEligiblePoint = {
  observationId: string;
  actualRestAgeMs: number;
  voltageMv: number;
  providerObservationAtMs: number | null;
  nominalRestIntervalIndex: number | null;
  evidenceClass: BatteryGeneralizedEvidenceClass;
};

export type RestSessionRetentionFeatures = {
  shutdownToFirstRestDeltaMv: number | null;
  robustRestSlopeMvPerHour: number | null;
  minimumRestVoltageMv: number | null;
  maximumRestVoltageMv: number | null;
  medianRestVoltageMv: number | null;
  restVoltageVarianceMv2: number | null;
  numberOfValidRestPoints: number;
  maxActualRestAgeMs: number | null;
  maxInterObservationGapMs: number | null;
  observationSpanMs: number | null;
  missingRungCount: number | null;
  pairwiseRestDeltas: Record<string, number> | null;
};
