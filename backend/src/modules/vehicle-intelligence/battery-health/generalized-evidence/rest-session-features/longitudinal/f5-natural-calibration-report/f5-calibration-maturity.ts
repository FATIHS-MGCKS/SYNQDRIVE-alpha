import type { F5MaturityStateV1, F5CalBlockV1 } from './f5-natural-calibration-report.types';

export type F5MaturityAggregateInput = {
  primaryRevisionCount: number;
  primaryUniqueVehicles: number;
  primaryUniqueOrgs: number;
  maxRevisionsPerVehicle: number;
  eligibleObservationCount: number;
  assessmentGradeObservationCount: number;
  chargeClassKnownPercent: number | null;
  temperatureCoveragePercent: number | null;
  maxRestAgeNullShare: number;
  repeatabilityPairCount: number;
};

function cal(
  calId: string,
  maturity: F5MaturityStateV1,
  primaryLimitation: string,
): F5CalBlockV1 {
  return {
    calId,
    maturity,
    primaryLimitation,
    canAdvanceToF6Now: false,
  };
}

/** Deterministic F5.0-aligned maturity rules — descriptive only, no numeric thresholds adopted. */
export function computeF5CalibrationMaturityBlocks(
  input: F5MaturityAggregateInput,
): Record<string, F5CalBlockV1> {
  const empty = input.primaryRevisionCount === 0;
  const distVisible = !empty && input.assessmentGradeObservationCount > 0;
  const repeatVisible =
    input.maxRevisionsPerVehicle >= 3 && input.repeatabilityPairCount >= 2;

  return {
    'CAL-M3.3E-001': cal(
      'CAL-M3.3E-001',
      empty ? 'COLLECTING' : distVisible ? 'DISTRIBUTION_VISIBLE' : 'COLLECTING',
      empty ? 'No cohort-C revisions' : 'Fleet still tiny',
    ),
    'CAL-M3.3E-002': cal(
      'CAL-M3.3E-002',
      empty ? 'COLLECTING' : distVisible ? 'DISTRIBUTION_VISIBLE' : 'COLLECTING',
      'Short sustained window vs long profile spans',
    ),
    'CAL-M3.3E-003': cal(
      'CAL-M3.3E-003',
      input.primaryRevisionCount >= 3 ? 'DISTRIBUTION_VISIBLE' : 'COLLECTING',
      'Needs longer natural windows for concentration stability',
    ),
    'CAL-M3.3E-004': cal(
      'CAL-M3.3E-004',
      empty ? 'COLLECTING' : distVisible ? 'DISTRIBUTION_VISIBLE' : 'COLLECTING',
      `maxActualRestAgeMs null share ~${(input.maxRestAgeNullShare * 100).toFixed(0)}%`,
    ),
    'CAL-M3.3E-005': cal(
      'CAL-M3.3E-005',
      'COLLECTING',
      'Rest-timing scalars sparse; firstRestPointAgeMs not on E1 feature scalars',
    ),
    'CAL-M3.3E-006': cal(
      'CAL-M3.3E-006',
      repeatVisible ? 'REPEATABILITY_VISIBLE' : 'COLLECTING',
      repeatVisible
        ? 'Limited repeat pairs emerging'
        : 'Insufficient same-condition repeat pairs',
    ),
    'CAL-M3.3E-007': cal(
      'CAL-M3.3E-007',
      'COLLECTING',
      'Step-change validation requires NAT-M3.3F-009 (M3.3G owner)',
    ),
    'CAL-M3.3E-008': cal(
      'CAL-M3.3E-008',
      repeatVisible ? 'DISTRIBUTION_VISIBLE' : 'COLLECTING',
      'UNSET profile — residual/MAD descriptors need richer repeats',
    ),
    'CAL-M3.3E-009': cal(
      'CAL-M3.3E-009',
      empty
        ? 'COLLECTING'
        : input.temperatureCoveragePercent !== null
          ? 'DISTRIBUTION_VISIBLE'
          : 'COLLECTING',
      'Trip-exterior temperature context only',
    ),
    'CAL-M3.3E-010': cal(
      'CAL-M3.3E-010',
      empty ? 'COLLECTING' : 'DISTRIBUTION_VISIBLE',
      input.chargeClassKnownPercent === 0 || input.chargeClassKnownPercent === null
        ? 'chargeOpportunityClass=UNKNOWN dominates'
        : 'Partial class coverage',
    ),
    'CAL-M3.3E-011': cal(
      'CAL-M3.3E-011',
      empty ? 'COLLECTING' : distVisible ? 'DISTRIBUTION_VISIBLE' : 'COLLECTING',
      'Session minima not calibratable yet',
    ),
  };
}

export function computeF5NaturalEvidenceMaturity(input: F5MaturityAggregateInput): {
  'NAT-M3.3F-001': { status: F5MaturityStateV1 };
  'NAT-M3.3F-002': { status: F5MaturityStateV1 };
  'NAT-M3.3F-003': { status: F5MaturityStateV1 };
} {
  const hasFleet = input.primaryRevisionCount > 0 && input.eligibleObservationCount > 0;
  const repeatVisible =
    input.maxRevisionsPerVehicle >= 3 && input.repeatabilityPairCount >= 2;
  return {
    'NAT-M3.3F-001': {
      status: hasFleet ? 'DISTRIBUTION_VISIBLE' : 'COLLECTING',
    },
    'NAT-M3.3F-002': {
      status: hasFleet ? 'DISTRIBUTION_VISIBLE' : 'COLLECTING',
    },
    'NAT-M3.3F-003': {
      status: repeatVisible ? 'REPEATABILITY_VISIBLE' : 'COLLECTING',
    },
  };
}
