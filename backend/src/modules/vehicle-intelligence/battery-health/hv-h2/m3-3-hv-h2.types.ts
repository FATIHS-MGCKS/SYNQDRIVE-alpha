import { BatteryMeasurementScope } from '../battery-v2-domain';
import type { HvCapacityMethod } from '../hv-method-profile/hv-method-profile.types';
import {
  M3_3_HV_H2_LONGITUDINAL_INPUT_CANDIDATE_V1,
  M3_3_HV_H2_LONGITUDINAL_INPUT_REPORT_V1,
} from './m3-3-hv-h2.constants';

export const M3_3_HV_H2_VALUE_SEMANTICS = [
  'ESTIMATED_USABLE_CAPACITY_KWH',
  'PROVIDER_SOH_PERCENT',
] as const;

export type M3_3HvH2ValueSemantic = (typeof M3_3_HV_H2_VALUE_SEMANTICS)[number];

export const M3_3_HV_H2_METHOD_ROLES = [
  'METHOD_SHADOW_EVIDENCE',
  'VALIDATION_ONLY',
  'PROVIDER_EVIDENCE',
] as const;

export type M3_3HvH2MethodRole = (typeof M3_3_HV_H2_METHOD_ROLES)[number];

export const M3_3_HV_H2_ELIGIBILITY_REASONS = {
  SOURCE_ROW_INVALID: 'SOURCE_ROW_INVALID',
  SOURCE_SCOPE_MISMATCH: 'SOURCE_SCOPE_MISMATCH',
  SESSION_MISSING: 'SESSION_MISSING',
  SESSION_SCOPE_MISMATCH: 'SESSION_SCOPE_MISMATCH',
  SESSION_ONGOING: 'SESSION_ONGOING',
  SESSION_NOT_QUALIFIED: 'SESSION_NOT_QUALIFIED',
  CAPACITY_VALIDATION_NOT_ELIGIBLE: 'CAPACITY_VALIDATION_NOT_ELIGIBLE',
  M2_OUTLIER: 'M2_OUTLIER',
  M2_GATE_BLOCKED: 'M2_GATE_BLOCKED',
  M3_GATE_BLOCKED: 'M3_GATE_BLOCKED',
  M3_METHOD_CONFLICT: 'M3_METHOD_CONFLICT',
  OBSERVATION_TIMESTAMP_INVALID: 'OBSERVATION_TIMESTAMP_INVALID',
  OBSERVATION_TIMESTAMP_MISSING: 'OBSERVATION_TIMESTAMP_MISSING',
  FUTURE_OBSERVATION_TIMESTAMP: 'FUTURE_OBSERVATION_TIMESTAMP',
  PROVIDER_PROVENANCE_MISSING: 'PROVIDER_PROVENANCE_MISSING',
  PROVIDER_SOH_RANGE_INVALID: 'PROVIDER_SOH_RANGE_INVALID',
  INTERVENTION_BOUNDARY_INTERSECTION: 'INTERVENTION_BOUNDARY_INTERSECTION',
  METHOD_UNSUPPORTED: 'METHOD_UNSUPPORTED',
  MODEL_VERSION_UNSUPPORTED: 'MODEL_VERSION_UNSUPPORTED',
  VALUE_MISSING: 'VALUE_MISSING',
  VALUE_NON_FINITE: 'VALUE_NON_FINITE',
} as const;

export type M3_3HvH2EligibilityReasonCode =
  (typeof M3_3_HV_H2_ELIGIBILITY_REASONS)[keyof typeof M3_3_HV_H2_ELIGIBILITY_REASONS];

export type M3_3HvH2Eligibility = 'eligible' | 'ineligible';

export interface M3_3HvH2LongitudinalInputCandidateV1 {
  contractVersion: typeof M3_3_HV_H2_LONGITUDINAL_INPUT_CANDIDATE_V1;
  organizationId: string;
  vehicleId: string;
  batteryScope: typeof BatteryMeasurementScope.HV;
  candidateFingerprint: string;
  sourceEntityType: string;
  sourceEntityId: string;
  method: HvCapacityMethod;
  methodRole: M3_3HvH2MethodRole;
  valueSemantic: M3_3HvH2ValueSemantic;
  numericValue: number | null;
  unit: string;
  observedAt: string;
  receivedAt: string | null;
  persistedAt?: string | null;
  sessionId: string | null;
  provider: string | null;
  quality: string;
  freshness: string;
  evidenceStrength: string;
  modelVersion: number | null;
  sourceProvenance: string;
  eligibility: M3_3HvH2Eligibility;
  reasonCodes: M3_3HvH2EligibilityReasonCode[];
  lifecycleSegmentId: string;
  replacementBoundaryBeforeAt: string | null;
  replacementBoundaryAfterAt: string | null;
  maturity: 'LONGITUDINAL_INPUT_CANDIDATE';
  healthConclusion: null;
  observationValidity: 'VALID' | 'INVALID';
  currentDecisionFreshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  referenceCapacityKwh?: number | null;
  referenceCapacityId?: string | null;
  deltaSocPercent?: number | null;
  deltaEnergyKwh?: number | null;
}

export interface M3_3HvH2LifecycleSegmentV1 {
  lifecycleSegmentId: string;
  segmentIndex: number;
  replacementBoundaryEffectiveAt: string | null;
}

export interface M3_3HvH2ValidationAnchorV1 {
  groundTruthEventId: string;
  organizationId: string;
  vehicleId: string;
  batteryScope: typeof BatteryMeasurementScope.HV;
  groundTruthType: string;
  effectiveAt: string;
  createdAt: string;
  sourceProvenance: string;
  verificationStatus: string;
  maturity: 'CONFIRMED_GROUND_TRUTH_FACT';
}

export interface M3_3HvH2DerivedContextV1 {
  kind: string;
  provenance: string;
  sessionIds: string[];
}

export interface M3_3HvH2LongitudinalInputReportSummaryV1 {
  candidateCount: number;
  eligibleCandidateCount: number;
  ineligibleCandidateCount: number;
  m2Count: number;
  m3Count: number;
  providerSohCount: number;
  lifecycleSegmentCount: number;
  replacementBoundaryCount: number;
  m2LongitudinalReady: boolean;
  m3ValidationSeriesReady: boolean;
  providerSohLongitudinalReady: boolean;
  multiPointSeriesPresent: boolean;
}

export interface M3_3HvH2LongitudinalInputReportV1 {
  contractVersion: typeof M3_3_HV_H2_LONGITUDINAL_INPUT_REPORT_V1;
  organizationId: string;
  vehicleId: string;
  batteryScope: typeof BatteryMeasurementScope.HV;
  evaluationAt: string;
  temporalSemantics: string;
  truncated: boolean;
  lifecycleSegments: M3_3HvH2LifecycleSegmentV1[];
  candidates: M3_3HvH2LongitudinalInputCandidateV1[];
  validationAnchors: M3_3HvH2ValidationAnchorV1[];
  derivedContext: M3_3HvH2DerivedContextV1[];
  summary: M3_3HvH2LongitudinalInputReportSummaryV1;
  methodIdentityRequired: true;
  crossMethodPoolingDefault: false;
  healthConclusion: null;
  customerPublicationEligible: false;
  dbReadOnlyTransactionEnforced: true;
}
