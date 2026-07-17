import type { HvMethodProfile } from '../hv-method-profile/hv-method-profile.types';
import type { HvCapacitySessionSummary } from './hv-capacity-session-summary.types';
import type { HvCapacityM3SessionValidation } from './hv-capacity-m3.types';
import type { HvSohGateReasonCode } from './hv-soh-gate.types';

export const HV_CAPACITY_SHADOW_EVALUATION_DISCLAIMER =
  'Interne technische Shadow-Auswertung — keine Kundenpublication, keine Readiness-Wirkung, kein kanonischer SOH-Wert.' as const;

export interface HvCapacityShadowEvaluationFreshness {
  generatedAt: string;
  crossSessionComputedAt: string | null;
  sohGateComputedAt: string | null;
  crossSessionFresh: boolean | null;
  sohGateFresh: boolean | null;
  freshnessWindowMs: number;
}

export interface HvCapacityShadowEvaluationModelVersions {
  m2SessionSummary: number;
  m3Validation: number;
  crossSessionAssessment: number;
  sohGate: number;
}

export interface HvCapacityShadowEvaluationReferenceCapacity {
  id: string;
  capacityKwh: number;
  capacityType: string;
  source: string;
  verificationStatus: string;
  verifiedAt: string | null;
  isActive: boolean;
}

export interface HvCapacityShadowEvaluationM2Observation {
  id: string;
  observedAt: string;
  estimatedCapacityKwh: number | null;
  quality: string;
  modelVersion: number;
  socPercent: number | null;
  preferredSocBand: boolean | null;
  outlier: boolean | null;
}

export interface HvCapacityShadowEvaluationSession {
  sessionId: string;
  source: string;
  startAt: string;
  endAt: string | null;
  isOngoing: boolean;
  qualityStatus: string | null;
  qualityReasonCodes: string[];
  capacityShadowEligible: boolean;
  capacityValidationEligible: boolean;
  deltaSocPercent: number | null;
  energyAddedKwh: number | null;
  sessionMedianKwh: number | null;
  m2Summary: HvCapacitySessionSummary | null;
  m3Validation: HvCapacityM3SessionValidation | null;
  m2Observations: HvCapacityShadowEvaluationM2Observation[];
}

export interface HvCapacityShadowEvaluationCrossSession {
  assessmentId: string | null;
  computedAt: string | null;
  estimatedUsableCapacityKwh: number | null;
  sessionCount: number;
  observationCount: number;
  confidence: string | null;
  maturity: string | null;
  shadowGatePassed: boolean;
  gateReasonCodes: string[];
  spread: Record<string, unknown> | null;
  methodAgreement: Record<string, unknown> | null;
  capabilityVersion: number | null;
  modelVersion: number | null;
}

export interface HvCapacityShadowEvaluationSohGate {
  assessmentId: string | null;
  computedAt: string | null;
  sohAvailability: string | null;
  estimatedSohPercent: number | null;
  estimatedUsableCapacityKwh: number | null;
  verifiedReferenceCapacityKwh: number | null;
  maturity: string | null;
  confidence: string | null;
  sohGatePassed: boolean;
  gateReasonCodes: HvSohGateReasonCode[];
  sohPublicationEnabled: boolean;
  modelVersion: number | null;
}

export interface HvCapacityShadowPublicationBlocker {
  code: string;
  labelDe: string;
  source: 'CROSS_SESSION' | 'SOH_GATE' | 'POLICY' | 'FLAG';
}

export interface HvCapacityShadowEvaluationDto {
  organizationId: string;
  vehicleId: string;
  disclaimer: typeof HV_CAPACITY_SHADOW_EVALUATION_DISCLAIMER;
  capabilityProfile: HvMethodProfile;
  modelVersions: HvCapacityShadowEvaluationModelVersions;
  freshness: HvCapacityShadowEvaluationFreshness;
  referenceCapacity: HvCapacityShadowEvaluationReferenceCapacity | null;
  rechargeSessions: HvCapacityShadowEvaluationSession[];
  crossSessionAssessment: HvCapacityShadowEvaluationCrossSession | null;
  sohGate: HvCapacityShadowEvaluationSohGate | null;
  publicationBlockers: HvCapacityShadowPublicationBlocker[];
  publicationEligible: false;
  readinessEffect: false;
}
