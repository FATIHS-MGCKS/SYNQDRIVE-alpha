import type { EvidenceClassification, RoadHypothesisLabel } from './contracts';

/** Internal baseline matcher uses CONFIRMED; public contract uses ASSOCIATED. */
export type InternalMatchOutcome = 'CONFIRMED' | 'AMBIGUOUS' | 'UNKNOWN';

export function toPublicHypothesis(outcome: InternalMatchOutcome): RoadHypothesisLabel {
  if (outcome === 'CONFIRMED') return 'ASSOCIATED';
  return outcome;
}

export function evidenceClassForHypothesis(
  label: RoadHypothesisLabel,
  hasGps: boolean,
): EvidenceClassification {
  if (!hasGps) return 'UNPROVEN';
  if (label === 'UNKNOWN') return 'UNPROVEN';
  return 'INFERRED';
}
