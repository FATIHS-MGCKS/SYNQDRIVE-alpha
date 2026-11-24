import type { ProductSlug } from '@prisma/client';

export type HmLegacyAdmissionVerdict = 'LEGACY_ADMISSIBLE' | 'LEGACY_BLOCKED';

export type HmCanonicalReadinessVerdict =
  | 'CANONICAL_READINESS_PASS'
  | 'CANONICAL_READINESS_BLOCKED'
  | 'CANONICAL_READINESS_NOT_EVALUABLE';

export type HmExpectedBillingClassification = 'BILLABLE_IF_ACTIVATED' | 'NON_BILLABLE_IF_ACTIVATED' | 'UNKNOWN';

export type HmEvaluationCompleteness = 'COMPLETE' | 'PARTIAL' | 'NOT_EVALUABLE';

export interface HmOnlyReadinessObservationResult {
  legacyAdmission: HmLegacyAdmissionVerdict;
  legacyBlockerReasonCodes: string[];
  canonicalReadiness: HmCanonicalReadinessVerdict;
  canonicalBlockerReasonCodes: string[];
  requiredInputFields: string[];
  evidenceAvailability: Record<string, 'PRESENT' | 'MISSING' | 'NOT_APPLICABLE'>;
  expectedBillingClassification: HmExpectedBillingClassification;
  evaluationCompleteness: HmEvaluationCompleteness;
  powertrainClass: 'ICE' | 'BEV' | 'HV' | 'UNKNOWN';
  providerMirrorFreshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  divergenceLegacyOnly: boolean;
  /** Predictive only — no billing side effects. */
  metadata: {
    organizationId: string;
    hmVehicleId: string;
    selectedProduct: ProductSlug | null;
    evaluationDurationMs: number;
  };
}