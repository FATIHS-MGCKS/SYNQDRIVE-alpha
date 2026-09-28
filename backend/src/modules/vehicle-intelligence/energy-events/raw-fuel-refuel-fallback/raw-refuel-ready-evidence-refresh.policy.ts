import type { RawRefuelCandidate } from '@prisma/client';
import {
  RFRF_RISE_DETECTION_VERSION,
  RFRF_RISE_DETECTOR_VERSION,
} from '../raw-fuel-rise-detector/raw-fuel-rise-detector.config';
import { readBaselineRecencyFromEvidenceMeta } from '../raw-fuel-rise-detector/raw-fuel-pre-plateau-baseline-recency.policy';
import { RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION } from './raw-fuel-hybrid-absolute-signal-trust.authority';
import {
  inspectHybridAbsoluteSignalTrustEvidence,
  isHybridAbsoluteSignalTrustEvidenceComplete,
} from './raw-fuel-hybrid-trust-evidence-metadata';
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

function hybridTrustProvenanceIsCurrent(
  evidenceMeta: RawRefuelCandidate['evidenceMeta'],
  refreshMeta: ReadyEvidenceRefreshMeta,
): { ok: true } | { ok: false; status: ReadyCandidateRefreshRequirementStatus; reason: string } {
  if (refreshMeta.trustResolverVersion !== RFRF_SIGNAL_TRUST_RESOLVER_VERSION) {
    return { ok: false, status: 'REFRESH_REQUIRED', reason: 'trust_resolver_version_stale' };
  }

  if (
    refreshMeta.hybridTrustAuthorityVersion == null ||
    refreshMeta.hybridTrustAuthorityVersion.length === 0
  ) {
    return { ok: false, status: 'REFRESH_REQUIRED', reason: 'hybrid_trust_authority_missing' };
  }
  if (refreshMeta.hybridTrustAuthorityVersion !== RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION) {
    return { ok: false, status: 'REFRESH_REQUIRED', reason: 'hybrid_trust_authority_stale' };
  }

  if (!refreshMeta.hybridTrustReasonCode || refreshMeta.hybridTrustReasonCode.length === 0) {
    return { ok: false, status: 'REFRESH_REQUIRED', reason: 'hybrid_trust_reason_missing' };
  }

  const inspected = inspectHybridAbsoluteSignalTrustEvidence(evidenceMeta);
  if (inspected.kind === 'missing') {
    return { ok: false, status: 'REFRESH_REQUIRED', reason: 'hybrid_trust_provenance_missing' };
  }
  if (inspected.kind === 'malformed') {
    return { ok: false, status: 'FAIL_CLOSED', reason: 'hybrid_trust_provenance_malformed' };
  }

  const hybrid = inspected.value;

  if (
    !isHybridAbsoluteSignalTrustEvidenceComplete(
      hybrid,
      RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION,
    )
  ) {
    return { ok: false, status: 'FAIL_CLOSED', reason: 'hybrid_trust_provenance_malformed' };
  }

  if (hybrid.authorityVersion !== RFRF_HYBRID_ABSOLUTE_SIGNAL_TRUST_AUTHORITY_VERSION) {
    return { ok: false, status: 'REFRESH_REQUIRED', reason: 'hybrid_trust_authority_stale' };
  }

  if (refreshMeta.hybridTrustReasonCode !== hybrid.reasonCode) {
    return { ok: false, status: 'REFRESH_REQUIRED', reason: 'hybrid_trust_reason_stale' };
  }

  if (hybrid.baselineRecencyClassification !== refreshMeta.baselineRecencyClassification) {
    return { ok: false, status: 'FAIL_CLOSED', reason: 'hybrid_refresh_baseline_inconsistent' };
  }

  if (hybrid.absoluteDetectionAdmissibility !== refreshMeta.absoluteDetectionAdmissibility) {
    return {
      ok: false,
      status: 'FAIL_CLOSED',
      reason: 'hybrid_refresh_admissibility_inconsistent',
    };
  }

  return { ok: true };
}

/**
 * Determines whether a READY_FOR_PERSIST row must reload historical DIMO evidence
 * under the current detector/trust refresh authorities.
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

  const hybridCheck = hybridTrustProvenanceIsCurrent(candidate.evidenceMeta, refreshMeta);
  if (!hybridCheck.ok) {
    return { status: hybridCheck.status, reason: hybridCheck.reason };
  }

  if (!refreshMetaMatchesCurrentAuthority(refreshMeta)) {
    return { status: 'FAIL_CLOSED', reason: 'refresh_metadata_inconsistent' };
  }

  return { status: 'REFRESH_CURRENT', reason: 'ready_evidence_refresh_current' };
}
