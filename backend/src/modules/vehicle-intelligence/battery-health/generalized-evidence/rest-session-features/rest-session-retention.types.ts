import {
  BatteryGeneralizedEvidenceClass,
  BatteryShutdownStateAlignmentClass,
} from '@prisma/client';

export type RestSessionRetentionAnchorInput = {
  restSessionId: string;
  evidenceClass: BatteryGeneralizedEvidenceClass;
  actualRestAgeMs: number | null;
  voltageV: number | null;
};

export type RestSessionRetentionCandidateInput = {
  observationId: string;
  restSessionId: string;
  evidenceClass: BatteryGeneralizedEvidenceClass;
  stateAlignmentClass: BatteryShutdownStateAlignmentClass;
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
