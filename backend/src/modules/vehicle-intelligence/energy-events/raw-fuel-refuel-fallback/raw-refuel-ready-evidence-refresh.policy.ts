import type { RawRefuelCandidate } from '@prisma/client';
import {
  RFRF_RISE_DETECTION_VERSION,
  RFRF_RISE_DETECTOR_VERSION,
} from '../raw-fuel-rise-detector/raw-fuel-rise-detector.config';
import {
  readBaselineRecencyFromEvidenceMeta,
} from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';
import { RFRF_SIGNAL_TRUST_RESOLVER_VERSION } from './raw-fuel-signal-trust.resolver';
import {
  readReadyEvidenceRefreshFromEvidenceMeta,
  type ReadyEvidenceRefreshMeta,
} from './raw-refuel-ready-evidence-refresh-metadata';

export const RFRF_READY_EVIDENCE_REFRESH_POLICY_VERSION = 'rfrf-ready-evidence-refresh-v1';

export type ReadyCandidateRefreshRequirementStatus =
  | 'REFRESH_REQUIRED'
  | 'REFRESH_CURRENT'
  | 'FAIL_CLOSED';

export interface ReadyCandidateRefreshRequirementEvaluation {
  status: ReadyCandidateRefreshRequirementStatus;
  reason: string;
}

function refreshMetaMatchesCurrentAuthority(meta: ReadyEvidenceRefreshMeta): boolean {
  return (
    meta.refreshPolicyVersion === RFRF_READY_EVIDENCE_REFRESH_POLICY_VERSION &&
    meta.trustResolverVersion === RFRF_SIGNAL_TRUST_RESOLVER_VERSION &&
    meta.detectorVersion === RFRF_RISE_DETECTOR_VERSION &&
    meta.detectionVersion === RFRF_RISE_DETECTION_VERSION &&
    meta.baselineRecencyClassification === 'FRESH' &&
    meta.absoluteDetectionAdmissibility != null &&
    meta.absoluteDetectionAdmissibility !== 'UNKNOWN'
  );
}

/**
 * Determines whether a READY_FOR_PERSIST row must reload historical DIMO evidence
 * under the current detector/trust refresh authorities.
 *
 * UNKNOWN trust alone does not force refresh once metadata is current for
 * {@link RFRF_SIGNAL_TRUST_RESOLVER_VERSION}.
 */
export function evaluateReadyCandidateRefreshRequirement(
  candidate: Pick<RawRefuelCandidate, 'evidenceMeta' | 'detectorVersion' | 'detectionVersion'>,
): ReadyCandidateRefreshRequirementEvaluation {
  const baseline = readBaselineRecencyFromEvidenceMeta(candidate.evidenceMeta);
  if (baseline == null) {
    return { status: 'REFRESH_REQUIRED', reason: 'baseline_recency_missing' };
  }
  if (baseline !== 'FRESH') {
    return { status: 'REFRESH_REQUIRED', reason: 'baseline_recency_not_fresh' };
  }

  const refreshMeta = readReadyEvidenceRefreshFromEvidenceMeta(candidate.evidenceMeta);
  if (!refreshMeta) {
    return { status: 'REFRESH_REQUIRED', reason: 'ready_evidence_refresh_metadata_missing' };
  }

  if (refreshMeta.refreshPolicyVersion !== RFRF_READY_EVIDENCE_REFRESH_POLICY_VERSION) {
    return { status: 'REFRESH_REQUIRED', reason: 'refresh_policy_version_stale' };
  }
  if (refreshMeta.trustResolverVersion !== RFRF_SIGNAL_TRUST_RESOLVER_VERSION) {
    return { status: 'REFRESH_REQUIRED', reason: 'trust_resolver_version_stale' };
  }
  if (
    refreshMeta.detectorVersion !== RFRF_RISE_DETECTOR_VERSION ||
    refreshMeta.detectionVersion !== RFRF_RISE_DETECTION_VERSION
  ) {
    return { status: 'REFRESH_REQUIRED', reason: 'detector_authority_stale' };
  }
  if (
    candidate.detectorVersion !== RFRF_RISE_DETECTOR_VERSION ||
    candidate.detectionVersion !== RFRF_RISE_DETECTION_VERSION
  ) {
    return { status: 'REFRESH_REQUIRED', reason: 'candidate_detector_version_stale' };
  }
  if (
    refreshMeta.absoluteDetectionAdmissibility == null ||
    refreshMeta.absoluteDetectionAdmissibility === 'UNKNOWN'
  ) {
    return { status: 'REFRESH_REQUIRED', reason: 'admissibility_provenance_missing' };
  }
  if (refreshMeta.baselineRecencyClassification !== 'FRESH') {
    return { status: 'REFRESH_REQUIRED', reason: 'stored_refresh_baseline_not_fresh' };
  }

  if (!refreshMetaMatchesCurrentAuthority(refreshMeta)) {
    return { status: 'FAIL_CLOSED', reason: 'refresh_metadata_inconsistent' };
  }

  return { status: 'REFRESH_CURRENT', reason: 'ready_evidence_refresh_current' };
}
