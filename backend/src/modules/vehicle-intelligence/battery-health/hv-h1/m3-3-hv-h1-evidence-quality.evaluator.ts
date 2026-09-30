import { M3_3_HV_H1_EVIDENCE_QUALITY_V1 } from './m3-3-hv-h1.constants';
import type { M3_3HvH1FreshnessClass, M3_3HvH1QualityClass } from './m3-3-hv-h1-provider-capability-matrix.types';

export const M3_3_HV_H1_EVIDENCE_QUALITY_REASONS = [
  'SIGNAL_NOT_LISTED',
  'SIGNAL_NULL',
  'SIGNAL_STALE',
  'TIMESTAMP_MISSING',
  'TIMESTAMP_STALE',
  'UNIT_INVALID',
  'RANGE_INVALID',
  'SESSION_BOUNDARY_WEAK',
  'SESSION_ONGOING',
  'METHOD_NOT_SUPPORTED',
  'PROVIDER_GAP',
  'CONTEXT_ONLY_SIGNAL',
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
  unitValid: boolean;
  rangeValid: boolean;
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
  providerListed: boolean;
  lastProviderValuePresent: boolean;
  lastProviderTimestampPresent: boolean;
  methodEligible: boolean;
  contextOnly?: boolean;
}

export function evaluateM3_3HvH1EvidenceQualityV1(
  input: EvaluateM3_3HvH1EvidenceQualityInput,
): M3_3HvH1EvidenceQualityResultV1 {
  const reasonCodes: M3_3HvH1EvidenceQualityReasonCode[] = [];

  const providerAvailable =
    input.providerListed &&
    (input.lastProviderValuePresent || input.qualityClass === 'CAPABILITY_LISTED_NO_VALUE');

  if (!input.providerListed) reasonCodes.push('SIGNAL_NOT_LISTED');
  if (input.qualityClass === 'CAPABILITY_LISTED_NO_VALUE') reasonCodes.push('SIGNAL_NULL');
  if (input.qualityClass === 'CAPABILITY_STALE') reasonCodes.push('SIGNAL_STALE');
  if (!input.lastProviderTimestampPresent) reasonCodes.push('TIMESTAMP_MISSING');
  if (
    input.freshnessClass === 'STALE_PROVIDER_TIMESTAMP' ||
    input.freshnessClass === 'UNKNOWN'
  ) {
    reasonCodes.push('TIMESTAMP_STALE');
  }
  if (input.contextOnly) reasonCodes.push('CONTEXT_ONLY_SIGNAL');
  if (!input.methodEligible) reasonCodes.push('METHOD_NOT_SUPPORTED');

  const timestampValid = input.lastProviderTimestampPresent;
  const unitValid = true;
  const rangeValid = input.lastProviderValuePresent || input.qualityClass === 'CAPABILITY_LISTED_NO_VALUE';

  let scientificEligible =
    providerAvailable &&
    timestampValid &&
    input.freshnessClass === 'FRESH_PROVIDER_TIMESTAMP' &&
    input.methodEligible &&
    !input.contextOnly;

  if (!scientificEligible) {
    reasonCodes.push('FAIL_CLOSED_SCIENTIFIC');
  }

  return {
    contractVersion: M3_3_HV_H1_EVIDENCE_QUALITY_V1,
    signalKey: input.signalKey,
    providerAvailable,
    timestampValid,
    freshnessClass: input.freshnessClass,
    qualityClass: input.qualityClass,
    unitValid,
    rangeValid,
    sessionBoundaryQuality: 'not_applicable',
    evidenceSourceStrength: providerAvailable ? 'provider' : 'none',
    methodEligible: input.methodEligible,
    scientificEligible,
    reasonCodes: [...new Set(reasonCodes)],
  };
}
