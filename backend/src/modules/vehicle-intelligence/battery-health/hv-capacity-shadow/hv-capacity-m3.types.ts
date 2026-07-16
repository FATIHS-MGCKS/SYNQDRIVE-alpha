import { HvCapacityMethod } from '../battery-v2-domain';

export const HV_M3_CAPACITY_METHOD = HvCapacityMethod.SEGMENT_ADDED_ENERGY_OVER_SOC;

export const HV_M3_MODEL_VERSION = 1;

export const HV_M3_METHOD_ROLE = 'VALIDATION_ONLY' as const;

/** Strong deviation vs M2 session median triggers method conflict (architecture §4.4). */
export const HV_M3_METHOD_CONFLICT_DEVIATION_RATIO = 0.1;

export const HV_M3_MIN_DELTA_SOC_PERCENT = 20;
export const HV_M3_MIN_ADDED_ENERGY_KWH = 0.5;
export const HV_M3_MAX_ADDED_ENERGY_KWH = 50;
export const HV_M3_DEFAULT_CAPACITY_MIN_KWH = 15;
export const HV_M3_DEFAULT_CAPACITY_MAX_KWH = 120;

/** Reject when naive first/last energy delta diverges from segment aggregate. */
export const HV_M3_FIRST_LAST_DIVERGENCE_RATIO = 0.15;

export const HV_M3_GATE_REASONS = {
  SESSION_ONGOING: 'SESSION_ONGOING',
  SESSION_NOT_VALIDATION_ELIGIBLE: 'SESSION_NOT_VALIDATION_ELIGIBLE',
  NON_DIMO_SEGMENT_SOURCE: 'NON_DIMO_SEGMENT_SOURCE',
  WEAK_SESSION_BOUNDARIES: 'WEAK_SESSION_BOUNDARIES',
  INSUFFICIENT_SOC_DELTA: 'INSUFFICIENT_SOC_DELTA',
  MISSING_SEGMENT_AGGREGATE: 'MISSING_SEGMENT_AGGREGATE',
  IMPLAUSIBLE_ADDED_ENERGY: 'IMPLAUSIBLE_ADDED_ENERGY',
  ADDED_ENERGY_RESET: 'ADDED_ENERGY_RESET',
  FIRST_LAST_DIVERGENCE: 'FIRST_LAST_DIVERGENCE',
  OUT_OF_CAPACITY_BAND: 'OUT_OF_CAPACITY_BAND',
  METHOD_CONFLICT_WITH_M2: 'METHOD_CONFLICT_WITH_M2',
} as const;

export type HvM3GateReasonCode =
  (typeof HV_M3_GATE_REASONS)[keyof typeof HV_M3_GATE_REASONS];

export interface HvCapacityM3SessionInput {
  source: string;
  isOngoing: boolean;
  startAt: Date;
  endAt: Date | null;
  startSocPercent: number | null;
  endSocPercent: number | null;
  startEnergyKwh: number | null;
  endEnergyKwh: number | null;
  energyAddedKwh: number | null;
  deltaSocPercent: number | null;
  addedEnergyMinKwh?: number | null;
  addedEnergyMaxKwh?: number | null;
  capacityValidationEligible: boolean;
  qualityStatus?: string | null;
  boundaryStrength?: 'strong' | 'weak' | 'invalid';
}

export interface HvCapacityM3GateEvaluation {
  eligible: boolean;
  reasonCodes: HvM3GateReasonCode[];
}

export interface HvCapacityM3Estimate {
  estimatedCapacityKwh: number;
  segmentAddedEnergyKwh: number;
  deltaSocPercent: number;
  gate: HvCapacityM3GateEvaluation;
  methodConflict: boolean;
  methodConflictDeviationRatio: number | null;
  m2MedianCapacityKwh: number | null;
}

export interface HvCapacityM3ValidationResult {
  sessionId: string;
  method: typeof HV_M3_CAPACITY_METHOD;
  modelVersion: number;
  estimate: HvCapacityM3Estimate | null;
  persisted: boolean;
  skippedReason?: string;
}

export interface HvCapacityM3ObservationMetadata {
  validationOnly: true;
  methodRole: typeof HV_M3_METHOD_ROLE;
  segmentAddedEnergyKwh: number;
  deltaSocPercent: number;
  gateReasonCodes: HvM3GateReasonCode[];
  methodConflict: boolean;
  methodConflictDeviationRatio: number | null;
  m2MedianCapacityKwh: number | null;
  segmentAggregateSource: true;
}

/** Session-level M3 validation outcome stored in `HvChargeSession.metadata`. */
export interface HvCapacityM3SessionValidation {
  method: typeof HV_M3_CAPACITY_METHOD;
  modelVersion: number;
  methodRole: typeof HV_M3_METHOD_ROLE;
  estimatedCapacityKwh: number | null;
  segmentAddedEnergyKwh: number | null;
  deltaSocPercent: number | null;
  gateEligible: boolean;
  gateReasonCodes: HvM3GateReasonCode[];
  methodConflict: boolean;
  methodConflictDeviationRatio: number | null;
  m2MedianCapacityKwh: number | null;
  persisted: boolean;
  validatedAt: string;
}
