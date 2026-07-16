import type {
  BatteryReferenceCapacityType,
  ReferenceCapacityVerificationStatus,
} from '../battery-v2-domain';
import type { HvCrossSessionConfidence, HvCrossSessionGateReasonCode } from './hv-capacity-cross-session.types';

export const HV_SOH_GATE_MODEL_VERSION = 1;

export const HV_SOH_GATE_APPROVED_MODEL_VERSIONS = [HV_SOH_GATE_MODEL_VERSION] as const;

export const HV_SOH_GATE_MATURITY = {
  SHADOW: 'SHADOW',
  PROVISIONAL: 'PROVISIONAL',
} as const;

export type HvSohGateMaturity =
  (typeof HV_SOH_GATE_MATURITY)[keyof typeof HV_SOH_GATE_MATURITY];

export const HV_SOH_GATE_SCORE_SEMANTICS = 'ESTIMATED_SOH_PERCENT_INTERNAL' as const;

export const HV_SOH_GATE_AVAILABILITY = {
  UNAVAILABLE: 'UNAVAILABLE',
  GATED: 'GATED',
  COMPUTED_INTERNAL: 'COMPUTED_INTERNAL',
} as const;

export type HvSohGateAvailability =
  (typeof HV_SOH_GATE_AVAILABILITY)[keyof typeof HV_SOH_GATE_AVAILABILITY];

/** Rolling freshness aligned with cross-session assessment (31 days). */
export const HV_SOH_GATE_FRESHNESS_MS = 31 * 24 * 60 * 60 * 1000;

export const HV_SOH_GATE_MIN_QUALIFIED_SESSIONS = 3;

/** Reject without clamping — degraded packs may reach ~50 %, slight over-reference noise to 105 %. */
export const HV_SOH_GATE_MIN_PLAUSIBLE_PERCENT = 50;
export const HV_SOH_GATE_MAX_PLAUSIBLE_PERCENT = 105;

export const HV_SOH_GATE_GATE_REASONS = {
  NO_REFERENCE_CAPACITY: 'NO_REFERENCE_CAPACITY',
  REFERENCE_NOT_VERIFIED: 'REFERENCE_NOT_VERIFIED',
  INCOMPATIBLE_CAPACITY_TYPE: 'INCOMPATIBLE_CAPACITY_TYPE',
  CAPACITY_ASSESSMENT_NOT_STABLE: 'CAPACITY_ASSESSMENT_NOT_STABLE',
  INSUFFICIENT_SESSIONS: 'INSUFFICIENT_SESSIONS',
  ASSESSMENT_STALE: 'ASSESSMENT_STALE',
  CAPABILITY_CHANGED: 'CAPABILITY_CHANGED',
  METHOD_CONFLICT: 'METHOD_CONFLICT',
  MODEL_VERSION_NOT_APPROVED: 'MODEL_VERSION_NOT_APPROVED',
  OUT_OF_PLAUSIBLE_BAND: 'OUT_OF_PLAUSIBLE_BAND',
  PUBLICATION_DISABLED: 'PUBLICATION_DISABLED',
} as const;

export type HvSohGateReasonCode =
  (typeof HV_SOH_GATE_GATE_REASONS)[keyof typeof HV_SOH_GATE_GATE_REASONS];

export interface HvSohGateCrossSessionInput {
  shadowGatePassed: boolean;
  estimatedUsableCapacityKwh: number | null;
  sessionCount: number;
  computedAt: string;
  gateReasonCodes: HvCrossSessionGateReasonCode[];
  methodAgreement: {
    sessionsWithM3Conflict: number;
  };
  confidence: HvCrossSessionConfidence;
  idempotencyKey: string;
  modelVersion: number;
  capabilityVersion: number | null;
}

export interface HvSohGateReferenceInput {
  id: string;
  capacityKwh: number;
  capacityType: BatteryReferenceCapacityType;
  verificationStatus: ReferenceCapacityVerificationStatus;
}

export interface HvSohGateVehicleContext {
  vehicleId: string;
  modelVersion: number;
  currentCapabilityVersion: number;
  sohPublicationEnabled: boolean;
  now?: Date;
}

export interface HvSohGateAssessmentReason {
  code: HvSohGateReasonCode | 'SOH_GATE_COMPUTED_INTERNAL';
  labelDe: string;
}

export interface HvSohGateAssessment {
  assessmentType: 'HV_SOH_CAPACITY_ESTIMATE';
  scoreSemantics: typeof HV_SOH_GATE_SCORE_SEMANTICS;
  assessmentMode: 'SHADOW';
  modelVersion: number;
  sohAvailability: HvSohGateAvailability;
  estimatedSohPercent: number | null;
  estimatedUsableCapacityKwh: number | null;
  verifiedReferenceCapacityKwh: number | null;
  referenceCapacityId: string | null;
  referenceVerificationStatus: ReferenceCapacityVerificationStatus | null;
  referenceCapacityType: BatteryReferenceCapacityType | null;
  sessionCount: number;
  crossSessionAssessmentIdempotencyKey: string | null;
  capabilityVersion: number | null;
  maturity: HvSohGateMaturity | null;
  confidence: HvCrossSessionConfidence;
  sohGatePassed: boolean;
  gateReasonCodes: HvSohGateReasonCode[];
  reasons: HvSohGateAssessmentReason[];
  publicationEligible: false;
  sohPublicationEnabled: boolean;
  computedAt: string;
  idempotencyKey: string;
  inputSummary: Record<string, unknown>;
}

export interface HvSohGateAssessmentResult {
  assessment: HvSohGateAssessment;
  persisted: boolean;
  assessmentId?: string;
}
