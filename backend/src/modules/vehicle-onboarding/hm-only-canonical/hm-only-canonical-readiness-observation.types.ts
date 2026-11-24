import type { ProductSlug } from '@prisma/client';

export type HmLegacyAdmissionVerdict = 'LEGACY_ADMISSIBLE' | 'LEGACY_BLOCKED';

export type HmCanonicalAdmissionVerdict =
  | 'CANONICAL_ADMISSION_ELIGIBLE'
  | 'CANONICAL_ADMISSION_BLOCKED'
  | 'CANONICAL_IDEMPOTENT_REPLAY'
  | 'CANONICAL_LEGACY_RECONCILIATION_REQUIRED'
  | 'CANONICAL_ADMISSION_NOT_EVALUABLE';

export type HmCanonicalReadinessVerdict =
  | 'CANONICAL_READINESS_PASS'
  | 'CANONICAL_READINESS_BLOCKED'
  | 'CANONICAL_READINESS_NOT_EVALUABLE';

export type HmExpectedBillingClassification =
  | 'BILLABLE_IF_ACTIVATED'
  | 'NON_BILLABLE_IF_ACTIVATED'
  | 'NOT_APPLICABLE_ACTIVATION_BLOCKED'
  | 'NO_NEW_EFFECT_IDEMPOTENT_REPLAY'
  | 'UNKNOWN';

export type HmEvaluationCompleteness = 'COMPLETE' | 'PARTIAL' | 'NOT_EVALUABLE';

export interface HmOnlyReadinessObservationResult {
  legacyAdmission: HmLegacyAdmissionVerdict;
  legacyBlockerReasonCodes: string[];
  canonicalAdmission: HmCanonicalAdmissionVerdict;
  canonicalAdmissionBlockerReasonCodes: string[];
  canonicalReadiness: HmCanonicalReadinessVerdict;
  canonicalBlockerReasonCodes: string[];
  requiredInputFields: string[];
  evidenceAvailability: Record<string, 'PRESENT' | 'MISSING' | 'NOT_APPLICABLE'>;
  expectedBillingClassification: HmExpectedBillingClassification;
  billingPredictionReasonCode: string;
  evaluationCompleteness: HmEvaluationCompleteness;
  powertrainClass: 'ICE' | 'BEV' | 'HV' | 'UNKNOWN';
  providerMirrorFreshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  divergenceLegacyOnly: boolean;
  /** Predictive only — no billing side effects. */
  metadata: {
    /** Tenant-safe org id for logging (authenticated tenant when available). */
    organizationId: string;
    hmVehicleId: string;
    selectedProduct: ProductSlug | null;
    evaluationDurationMs: number;
    tenantScopeMismatch?: boolean;
  };
}