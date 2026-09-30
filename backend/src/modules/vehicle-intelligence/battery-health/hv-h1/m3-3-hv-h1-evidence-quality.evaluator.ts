import { M3_3_HV_H1_EVIDENCE_QUALITY_V1 } from './m3-3-hv-h1.constants';
import type { M3_3HvH1FreshnessClass, M3_3HvH1QualityClass } from './m3-3-hv-h1-provider-capability-matrix.types';

export const M3_3_HV_H1_VALIDATION_AUTHORITY = [
  'VALID',
  'INVALID',
  'UNKNOWN_NOT_EVALUATED',
] as const;

export type M3_3HvH1ValidationAuthority =
  (typeof M3_3_HV_H1_VALIDATION_AUTHORITY)[number];

export const M3_3_HV_H1_EVIDENCE_QUALITY_REASONS = [
  'SIGNAL_NOT_LISTED',
  'SIGNAL_NULL',
  'SIGNAL_STALE',
  'TIMESTAMP_MISSING',
  'TIMESTAMP_STALE',
  'TIMESTAMP_FUTURE',
  'TIMESTAMP_INVALID',
  'UNIT_NOT_EVALUATED',
  'RANGE_NOT_EVALUATED',
  'METHOD_NOT_SUPPORTED',
  'CONTEXT_ONLY_SIGNAL',
  'PROVIDER_LISTING_UNKNOWN',
  'FAIL_CLOSED_SCIENTIFIC',
] as const;

export type M3_3HvH1EvidenceQualityReasonCode =
  (typeof M3_3_HV_H1_EVIDENCE_QUALITY_REASONS)[number];

export interface M3_3HvH1EvidenceQualityResultV1 {
  contractVersion: typeof M3_3_HV_H1_EVIDENCE_QUALITY_V1;
  signalKey: string;
  providerAvailable: boolean;
  timestampValid: boolean;
  freshnessClass: M3_3HvH1FreshnessClass;
  qualityClass: M3_3HvH1QualityClass;
  unitValidation: M3_3HvH1ValidationAuthority;
  rangeValidation: M3_3HvH1ValidationAuthority;
  sessionBoundaryQuality: 'not_applicable' | 'strong' | 'weak' | 'invalid';
  evidenceSourceStrength: 'provider' | 'derived' | 'fallback' | 'none';
  methodEligible: boolean;
  scientificEligible: boolean;
  reasonCodes: M3_3HvH1EvidenceQualityReasonCode[];
}

export interface EvaluateM3_3HvH1EvidenceQualityInput {
  signalKey: string;
  freshnessClass: M3_3HvH1FreshnessClass;
  qualityClass: M3_3HvH1QualityClass;
  providerListingStatus: 'LISTED' | 'NOT_LISTED' | 'UNKNOWN';
  vehicleDataStatus: string;
  lastProviderValuePresent: boolean;
  lastProviderTimestampPresent: boolean;
  methodEligible: boolean;
  contextOnly?: boolean;
}

const FRESHNESS_SCIENTIFIC_BLOCK = new Set<M3_3HvH1FreshnessClass>([
  'STALE_PROVIDER_TIMESTAMP',
  'FUTURE_PROVIDER_TIMESTAMP',
  'INVALID_PROVIDER_TIMESTAMP',
  'UNKNOWN',
]);

export function evaluateM3_3HvH1EvidenceQualityV1(
  input: EvaluateM3_3HvH1EvidenceQualityInput,
): M3_3HvH1EvidenceQualityResultV1 {
  const reasonCodes: M3_3HvH1EvidenceQualityReasonCode[] = [];

  const providerAvailable =
    input.providerListingStatus === 'LISTED' &&
    input.vehicleDataStatus === 'AVAILABLE_WITH_DATA';

  if (input.providerListingStatus === 'NOT_LISTED') reasonCodes.push('SIGNAL_NOT_LISTED');
  if (input.providerListingStatus === 'UNKNOWN') reasonCodes.push('PROVIDER_LISTING_UNKNOWN');
  if (input.vehicleDataStatus === 'LISTED_NO_VALUE') reasonCodes.push('SIGNAL_NULL');
  if (input.qualityClass === 'CAPABILITY_STALE') reasonCodes.push('SIGNAL_STALE');
  if (!input.lastProviderTimestampPresent) reasonCodes.push('TIMESTAMP_MISSING');
  if (input.freshnessClass === 'FUTURE_PROVIDER_TIMESTAMP') {
    reasonCodes.push('TIMESTAMP_FUTURE');
  }
  if (input.freshnessClass === 'INVALID_PROVIDER_TIMESTAMP') {
    reasonCodes.push('TIMESTAMP_INVALID');
  }
  if (FRESHNESS_SCIENTIFIC_BLOCK.has(input.freshnessClass)) {
    reasonCodes.push('TIMESTAMP_STALE');
  }
  if (input.contextOnly) reasonCodes.push('CONTEXT_ONLY_SIGNAL');
  if (!input.methodEligible) reasonCodes.push('METHOD_NOT_SUPPORTED');

  const unitValidation = 'UNKNOWN_NOT_EVALUATED' as M3_3HvH1ValidationAuthority;
  const rangeValidation = 'UNKNOWN_NOT_EVALUATED' as M3_3HvH1ValidationAuthority;
  reasonCodes.push('UNIT_NOT_EVALUATED', 'RANGE_NOT_EVALUATED');

  const timestampValid =
    input.lastProviderTimestampPresent &&
    input.freshnessClass !== 'FUTURE_PROVIDER_TIMESTAMP' &&
    input.freshnessClass !== 'INVALID_PROVIDER_TIMESTAMP';

  const unitRangeAuthoritySatisfied =
    unitValidation === 'VALID' && rangeValidation === 'VALID';

  let scientificEligible =
    providerAvailable &&
    timestampValid &&
    input.freshnessClass === 'FRESH_PROVIDER_TIMESTAMP' &&
    input.methodEligible &&
    !input.contextOnly &&
    unitRangeAuthoritySatisfied;

  if (!unitRangeAuthoritySatisfied) {
    reasonCodes.push('FAIL_CLOSED_SCIENTIFIC');
  } else if (!scientificEligible) {
    reasonCodes.push('FAIL_CLOSED_SCIENTIFIC');
  }

  return {
    contractVersion: M3_3_HV_H1_EVIDENCE_QUALITY_V1,
    signalKey: input.signalKey,
    providerAvailable,
    timestampValid,
    freshnessClass: input.freshnessClass,
    qualityClass: input.qualityClass,
    unitValidation,
    rangeValidation,
    sessionBoundaryQuality: 'not_applicable',
    evidenceSourceStrength: providerAvailable ? 'provider' : 'none',
    methodEligible: input.methodEligible,
    scientificEligible,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  };
}
