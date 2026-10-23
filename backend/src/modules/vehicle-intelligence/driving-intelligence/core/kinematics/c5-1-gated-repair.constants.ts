import type { MotionCoreSpeedQuality, MotionCoreSpeedSample } from './speed-sample.types';

export const MOTION_CORE_SPEED_C5_1_VERSION =
  'MOTION_CORE_SPEED_C5_1_GATED_REPAIR_V1_2_NULL_NEIGHBOR_FAIL_CLOSED';

export const PRIOR_VERSION_V1_1 = 'MOTION_CORE_SPEED_C5_1_GATED_REPAIR_V1_1_SAFETY_HARDENED';

export const HARDENING_TAG = 'C5_1_SAFETY_PATCH_C1_C3';

export const MOTION_CORE_SPEED_C5_1_PRODUCTION_SAFETY_VERSION = 'C5_1_PRODUCTION_INPUT_GUARDS_V1';

export const F2_MAX_NUMERIC_KMH = 250;

export const EVIDENCE = Object.freeze({
  VALID: 'VALID',
  VIOLATION: 'VIOLATION',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
} as const);

export type C5_1EvidenceStatus = (typeof EVIDENCE)[keyof typeof EVIDENCE];

export const FROZEN = Object.freeze({
  aAttrMps2: 6,
  crossTrackMaxM: 6,
  maxSupportHalfS: 4,
  minSupportTotal: 5,
  minSupportPerSide: 2,
  maxNeighborGapS: 3,
  stationaryChordMps: 3,
  headingRejectDegPerS: 25,
  maxWindowLabels: 15,
});

export type C5_1RepairState =
  | 'REPAIR_ACCEPTED'
  | 'REPAIR_REJECTED'
  | 'PASS_THROUGH_OUTSIDE_WINDOW'
  | 'PASS_THROUGH_NO_REPAIR'
  | 'UNCERTAIN';

export type C5_1SafetyProfile = 'frozen_v12' | 'production_guards_v1';

export type C5_1GatedRepairOptions = {
  vehicleClass?: import('./c5-1-plausibility').C5_1VehicleClass;
  legGate?: import('./leg-consistency').MotionCoreLegGateOptions;
  safetyProfile?: C5_1SafetyProfile;
};

export type C5_1GatedRepairSample = MotionCoreSpeedSample & {
  repairState: C5_1RepairState;
  eligibilitySignals?: string[];
  originalC4Quality?: MotionCoreSpeedQuality;
  originalC4Flags?: string[];
  supportLabelsUsed?: string[];
  supportHalfS?: number;
  q?: Record<string, boolean>;
  trace?: Record<string, unknown>;
};

export type C5_1GatedRepairResult = {
  samples: C5_1GatedRepairSample[];
  c4: MotionCoreSpeedSample[];
  meta: Record<string, unknown>;
};
