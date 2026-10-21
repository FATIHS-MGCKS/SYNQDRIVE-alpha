import type { HvChargingCounterQualityAssessmentV2 } from './hv-charging-counter-evidence.counter-quality.v2';

export const HV_R22_POLICY_DECISION_SCHEMA_V1 = 'hv-r22-policy-decision-v1' as const;

export const HV_R22_POLICY_EVALUATOR_VERSION_V1 = 'hv-r22-policy-evaluator-v1' as const;

export type HvR22PolicyReasonCodeV1 =
  | 'BOUNDARY_UNCERTAIN'
  | 'COUNTER_RELIABILITY_UNPROVEN'
  | 'COUNTER_RESET_DETECTED'
  | 'EVIDENCE_MISSING'
  | 'INSUFFICIENT_SESSION_COVERAGE'
  | 'INVALID_SESSION_BOUNDARIES'
  | 'LONG_GAP_PRESENT'
  | 'NEGATIVE_DELTA_PRESENT'
  | 'NUMERIC_EVIDENCE_INCOMPLETE'
  | 'OVERLAP_NOT_ASSESSED'
  | 'OVERLAP_RISK_PRESENT'
  | 'TEMPORAL_GRID_INCOMPLETE'
  | 'UNRELIABLE_ENERGY_DERIVATION';

export interface HvR22PolicyDecisionV1 {
  schemaVersion: typeof HV_R22_POLICY_DECISION_SCHEMA_V1;
  evaluatorVersion: typeof HV_R22_POLICY_EVALUATOR_VERSION_V1;
  shadowEvidenceAcceptable: boolean;
  energyUseEligible: boolean;
  reasonCodes: HvR22PolicyReasonCodeV1[];
}

export interface EvaluateHvR22PolicyDecisionInputV1 {
  counterQuality: HvChargingCounterQualityAssessmentV2 | null | undefined;
  /** When false, energy eligibility fails closed (PR2 will supply assessment). */
  overlapAssessed: boolean;
  /** Required for energy eligibility when overlapAssessed is true. */
  overlapRiskCleared?: boolean;
  sessionBoundariesValid?: boolean;
}

/** Stable emission order for reason codes (tests + audit). */
export const HV_R22_POLICY_REASON_CODE_ORDER_V1: readonly HvR22PolicyReasonCodeV1[] = [
  'BOUNDARY_UNCERTAIN',
  'COUNTER_RELIABILITY_UNPROVEN',
  'COUNTER_RESET_DETECTED',
  'EVIDENCE_MISSING',
  'INSUFFICIENT_SESSION_COVERAGE',
  'INVALID_SESSION_BOUNDARIES',
  'LONG_GAP_PRESENT',
  'NEGATIVE_DELTA_PRESENT',
  'NUMERIC_EVIDENCE_INCOMPLETE',
  'OVERLAP_NOT_ASSESSED',
  'OVERLAP_RISK_PRESENT',
  'TEMPORAL_GRID_INCOMPLETE',
  'UNRELIABLE_ENERGY_DERIVATION',
];

function sortReasonCodes(codes: HvR22PolicyReasonCodeV1[]): HvR22PolicyReasonCodeV1[] {
  const set = new Set(codes);
  return HV_R22_POLICY_REASON_CODE_ORDER_V1.filter((code) => set.has(code));
}

function hasNegativeCounterStep(quality: HvChargingCounterQualityAssessmentV2): boolean {
  if (quality.monotonicity.negativeDeltas > 0) return true;
  if (quality.monotonicityGapAware.negativeDeltas > 0) return true;
  return quality.boundaryClassifications.includes('IN_SESSION_NEGATIVE_DELTA');
}

function hasResetEvidence(quality: HvChargingCounterQualityAssessmentV2): boolean {
  if (quality.resetCandidates > 0) return true;
  return quality.boundaryClassifications.includes('PRE_SESSION_RESET_CANDIDATE');
}

function hasInsufficientSessionCoverage(quality: HvChargingCounterQualityAssessmentV2): boolean {
  return quality.boundaryClassifications.includes('INSUFFICIENT_COVERAGE');
}

function numericEvidenceComplete(quality: HvChargingCounterQualityAssessmentV2): boolean {
  const row = quality.returnedRowNumericCoverage;
  return (
    row.returnedRowCount >= 2 &&
    row.nullLastCount === 0 &&
    row.numericLastCount === row.returnedRowCount &&
    row.returnedRowNumericCoverageRatio === 1
  );
}

function temporalGridComplete(quality: HvChargingCounterQualityAssessmentV2): boolean {
  const temporal = quality.temporalCoverage;
  return (
    quality.temporalCompletenessQuality === 'COMPLETE_MINUTE_GRID' &&
    temporal.expectedMinuteGridSlots > 0 &&
    temporal.missingMinuteGridSlots === 0 &&
    temporal.longestTemporalGapMinutes <= 1 &&
    temporal.missingMinuteGapsBetweenReturnedRows === 0
  );
}

/**
 * Fail-closed policy layer — does not alter hv-r22-counter-quality-v1/v2 fields.
 */
export function evaluateHvR22PolicyDecisionV1(
  input: EvaluateHvR22PolicyDecisionInputV1,
): HvR22PolicyDecisionV1 {
  const reasons: HvR22PolicyReasonCodeV1[] = [];

  if (input.sessionBoundariesValid === false) {
    reasons.push('INVALID_SESSION_BOUNDARIES');
  }

  const quality = input.counterQuality;
  if (!quality) {
    reasons.push('EVIDENCE_MISSING');
    return finalize(reasons);
  }

  if (quality.energyDerivationQuality === 'UNRELIABLE') {
    reasons.push('UNRELIABLE_ENERGY_DERIVATION');
  }

  if (quality.boundaryUncertainty) {
    reasons.push('BOUNDARY_UNCERTAIN');
  }

  if (hasInsufficientSessionCoverage(quality)) {
    reasons.push('INSUFFICIENT_SESSION_COVERAGE');
  }

  if (hasResetEvidence(quality)) {
    reasons.push('COUNTER_RESET_DETECTED');
  }

  if (hasNegativeCounterStep(quality)) {
    reasons.push('NEGATIVE_DELTA_PRESENT');
  }

  if (!numericEvidenceComplete(quality)) {
    reasons.push('NUMERIC_EVIDENCE_INCOMPLETE');
  }

  if (!quality.reliableSessionCounterDelta) {
    reasons.push('COUNTER_RELIABILITY_UNPROVEN');
  }

  if (quality.counterDeltaFirstLastInSessionKwh == null) {
    if (!reasons.includes('COUNTER_RELIABILITY_UNPROVEN')) {
      reasons.push('COUNTER_RELIABILITY_UNPROVEN');
    }
  }

  if (!temporalGridComplete(quality)) {
    reasons.push('TEMPORAL_GRID_INCOMPLETE');
    const temporal = quality.temporalCoverage;
    if (
      temporal.longestTemporalGapMinutes > 1 ||
      temporal.missingMinuteGapsBetweenReturnedRows > 0
    ) {
      reasons.push('LONG_GAP_PRESENT');
    }
  }

  if (!input.overlapAssessed) {
    reasons.push('OVERLAP_NOT_ASSESSED');
  } else if (input.overlapRiskCleared !== true) {
    reasons.push('OVERLAP_RISK_PRESENT');
  }

  return finalize(reasons);
}

function finalize(reasons: HvR22PolicyReasonCodeV1[]): HvR22PolicyDecisionV1 {
  const sorted = sortReasonCodes(reasons);

  const shadowBlockers = new Set<HvR22PolicyReasonCodeV1>([
    'BOUNDARY_UNCERTAIN',
    'COUNTER_RELIABILITY_UNPROVEN',
    'COUNTER_RESET_DETECTED',
    'EVIDENCE_MISSING',
    'INSUFFICIENT_SESSION_COVERAGE',
    'INVALID_SESSION_BOUNDARIES',
    'NEGATIVE_DELTA_PRESENT',
    'NUMERIC_EVIDENCE_INCOMPLETE',
    'UNRELIABLE_ENERGY_DERIVATION',
  ]);

  const shadowEvidenceAcceptable = !sorted.some((code) => shadowBlockers.has(code));

  const energyBlockers = new Set<HvR22PolicyReasonCodeV1>([
    ...shadowBlockers,
    'TEMPORAL_GRID_INCOMPLETE',
    'LONG_GAP_PRESENT',
    'OVERLAP_NOT_ASSESSED',
    'OVERLAP_RISK_PRESENT',
  ]);
  const energyUseEligible = !sorted.some((code) => energyBlockers.has(code));

  return {
    schemaVersion: HV_R22_POLICY_DECISION_SCHEMA_V1,
    evaluatorVersion: HV_R22_POLICY_EVALUATOR_VERSION_V1,
    shadowEvidenceAcceptable,
    energyUseEligible,
    reasonCodes: sorted,
  };
}
