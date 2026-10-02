import type { RawRefuelCandidate } from '@prisma/client';
import {
  readBaselineRecencyFromEvidenceMeta,
  type RawFuelPrePlateauBaselineRecencyClassification,
} from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';

export function resolveCandidateBaselineRecencyClassification(
  candidate: Pick<RawRefuelCandidate, 'evidenceMeta'>,
): RawFuelPrePlateauBaselineRecencyClassification | null {
  return readBaselineRecencyFromEvidenceMeta(candidate.evidenceMeta);
}

/** Promotion fail-closed unless baseline recency is explicitly proven FRESH. */
export function isBaselineRecencyProvenFreshForPromotion(
  candidate: Pick<RawRefuelCandidate, 'evidenceMeta'>,
): boolean {
  return resolveCandidateBaselineRecencyClassification(candidate) === 'FRESH';
}
