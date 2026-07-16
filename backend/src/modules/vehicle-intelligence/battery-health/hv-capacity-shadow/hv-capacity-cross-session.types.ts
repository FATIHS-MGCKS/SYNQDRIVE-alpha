import type { HvCapacityMethod } from '../battery-v2-domain';
import type { HvCapacityM3SessionValidation } from './hv-capacity-m3.types';
import type { HvCapacitySessionSummary } from './hv-capacity-session-summary.types';

export const HV_CROSS_SESSION_ASSESSMENT_MODEL_VERSION = 1;

export const HV_CROSS_SESSION_MATURITY_SHADOW = 'SHADOW' as const;

export const HV_CROSS_SESSION_SCORE_SEMANTICS =
  'ESTIMATED_USABLE_CAPACITY_NOT_SOH' as const;

export const HV_CROSS_SESSION_MIN_QUALIFIED_SESSIONS = 3;

/** One session must not contribute more than this share of total observations. */
export const HV_CROSS_SESSION_MAX_DOMINANT_SESSION_OBSERVATION_RATIO = 0.5;

/** Max coefficient of variation across session medians (Tesla audit ~0.2 % intra-session). */
export const HV_CROSS_SESSION_MAX_SESSION_MEDIAN_CV = 0.03;

/** Max intra-session CV allowed for any included session. */
export const HV_CROSS_SESSION_MAX_INTRA_SESSION_CV = 0.02;

/** Rolling freshness window aligned with HV recharge reconcile (31 days). */
export const HV_CROSS_SESSION_FRESHNESS_MS = 31 * 24 * 60 * 60 * 1000;

/** Any session with M3 method conflict fails the cross-session gate. */
export const HV_CROSS_SESSION_MAX_M3_CONFLICT_SESSIONS = 0;

export const HV_CROSS_SESSION_CONFIDENCE = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INSUFFICIENT: 'INSUFFICIENT',
} as const;

export type HvCrossSessionConfidence =
  (typeof HV_CROSS_SESSION_CONFIDENCE)[keyof typeof HV_CROSS_SESSION_CONFIDENCE];

export const HV_CROSS_SESSION_GATE_REASONS = {
  INSUFFICIENT_QUALIFIED_SESSIONS: 'INSUFFICIENT_QUALIFIED_SESSIONS',
  DOMINANT_SESSION: 'DOMINANT_SESSION',
  CROSS_SESSION_SPREAD_HIGH: 'CROSS_SESSION_SPREAD_HIGH',
  INTRA_SESSION_INSTABILITY: 'INTRA_SESSION_INSTABILITY',
  M3_METHOD_CONFLICT: 'M3_METHOD_CONFLICT',
  STALE_SESSIONS: 'STALE_SESSIONS',
  MODEL_VERSION_MISMATCH: 'MODEL_VERSION_MISMATCH',
  INCOMPATIBLE_REFERENCE_CAPACITY: 'INCOMPATIBLE_REFERENCE_CAPACITY',
  INSUFFICIENT_FRESH_SESSIONS: 'INSUFFICIENT_FRESH_SESSIONS',
} as const;

export type HvCrossSessionGateReasonCode =
  (typeof HV_CROSS_SESSION_GATE_REASONS)[keyof typeof HV_CROSS_SESSION_GATE_REASONS];

export interface HvCrossSessionInputSession {
  sessionId: string;
  sessionEndAt: Date;
  summary: HvCapacitySessionSummary;
  m3Validation?: HvCapacityM3SessionValidation | null;
}

export interface HvCrossSessionVehicleContext {
  vehicleId: string;
  referenceCapacityKwh: number | null;
  referenceCapacityId: string | null;
  modelVersion: number;
  now?: Date;
}

export interface HvCrossSessionSpreadStats {
  sessionMedianKwh: number | null;
  madKwh: number | null;
  robustSpreadKwh: number | null;
  coefficientOfVariation: number | null;
  minSessionMedianKwh: number | null;
  maxSessionMedianKwh: number | null;
}

export interface HvCrossSessionMethodAgreement {
  sessionsWithM3Validation: number;
  sessionsWithoutM3Conflict: number;
  sessionsWithM3Conflict: number;
  agreementRatio: number | null;
}

export interface HvCrossSessionAssessmentReason {
  code: HvCrossSessionGateReasonCode | 'SHADOW_ASSESSMENT_COMPUTED';
  labelDe: string;
}

export interface HvCrossSessionAssessment {
  assessmentType: 'HV_CAPACITY_SHADOW';
  scoreSemantics: typeof HV_CROSS_SESSION_SCORE_SEMANTICS;
  assessmentMode: 'SHADOW';
  method: HvCapacityMethod;
  modelVersion: number;
  estimatedUsableCapacityKwh: number | null;
  sessionCount: number;
  observationCount: number;
  crossSessionMedianKwh: number | null;
  spread: HvCrossSessionSpreadStats;
  methodAgreement: HvCrossSessionMethodAgreement;
  confidence: HvCrossSessionConfidence;
  maturity: typeof HV_CROSS_SESSION_MATURITY_SHADOW;
  shadowGatePassed: boolean;
  gateReasonCodes: HvCrossSessionGateReasonCode[];
  reasons: HvCrossSessionAssessmentReason[];
  publicationEligible: false;
  sohEligible: false;
  sessionIds: string[];
  referenceCapacityKwh: number | null;
  referenceCapacityId: string | null;
  computedAt: string;
  idempotencyKey: string;
  inputSummary: Record<string, unknown>;
}

export interface HvCrossSessionAssessmentResult {
  assessment: HvCrossSessionAssessment;
  persisted: boolean;
  assessmentId?: string;
}
