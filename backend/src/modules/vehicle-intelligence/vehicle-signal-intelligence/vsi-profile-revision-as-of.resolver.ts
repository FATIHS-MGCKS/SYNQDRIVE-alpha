import { parseSignalTimestampMs } from './vsi-capability-resolver.freshness';
import type { VsiCapabilityResolverProfileContext } from './vsi-capability-resolver.types';
import { VSI_PROFILE_CONTRACT_VERSION_V1 } from './vsi-profile.types';
import type { VsiProfileRevisionHistoryRowV1 } from './vsi-profile-revision-history.types';

export const VsiProfileRevisionAsOfAuthority = {
  NO_PRIOR_REVISION: 'NO_PRIOR_REVISION',
  PRIOR_REVISION_FOUND: 'PRIOR_REVISION_FOUND',
  VERIFIED_DECISION_TIME_EVIDENCE: 'VERIFIED_DECISION_TIME_EVIDENCE',
  STALE_AT_DECISION: 'STALE_AT_DECISION',
  UNPROVEN_TEMPORAL_AUTHORITY: 'UNPROVEN_TEMPORAL_AUTHORITY',
} as const;

export type VsiProfileRevisionAsOfAuthority =
  (typeof VsiProfileRevisionAsOfAuthority)[keyof typeof VsiProfileRevisionAsOfAuthority];

export type VsiProfileRevisionAsOfSelectionInput = {
  revisions: readonly VsiProfileRevisionHistoryRowV1[];
  decisionAt: Date;
  /** When false, attribution cannot be proven at decision time. */
  historicalLinkAttributionProven: boolean;
};

export type VsiProfileRevisionAsOfSelectionResult = {
  authority: VsiProfileRevisionAsOfAuthority;
  selectedRevision: VsiProfileRevisionHistoryRowV1 | null;
  limitations: string[];
};

function revisionToProfileContext(row: VsiProfileRevisionHistoryRowV1): VsiCapabilityResolverProfileContext {
  const signals = Array.isArray(row.signalsSnapshot) ? row.signalsSnapshot : [];
  return {
    profileContractVersion: row.profileContractVersion,
    profileRevision: row.profileRevision,
    contentFingerprint: row.contentFingerprint,
    profileLimitations: row.profileLimitations,
    signals: signals.map((raw) => {
      const s = raw as {
        canonicalSignalKey?: string;
        declaredSupport?: string;
        empiricalObservation?: string;
        lastSourceTimestamp?: string | null;
        lastValidObservationAt?: string | null;
        freshnessClassification?: string;
        limitations?: string[];
      };
      return {
        canonicalSignalKey: s.canonicalSignalKey ?? 'UNKNOWN',
        declaredSupport: s.declaredSupport ?? 'UNKNOWN',
        empiricalObservation: s.empiricalObservation ?? 'UNKNOWN',
        lastSourceTimestamp: s.lastSourceTimestamp ?? null,
        lastValidObservationAt: s.lastValidObservationAt ?? null,
        freshnessClassification: s.freshnessClassification ?? 'UNKNOWN',
        limitations: Array.isArray(s.limitations) ? s.limitations : [],
      };
    }),
  };
}

/**
 * Read-only as-of selection for immutable revision history (P5-H1 contract).
 * Does not synthesize revisions; does not enable P5B.1 VERIFIED_CORRELATION by itself.
 */
export function selectVsiProfileRevisionAsOf(
  input: VsiProfileRevisionAsOfSelectionInput,
): VsiProfileRevisionAsOfSelectionResult {
  const limitations: string[] = [];
  const decisionMs = input.decisionAt.getTime();
  if (!Number.isFinite(decisionMs)) {
    return {
      authority: VsiProfileRevisionAsOfAuthority.UNPROVEN_TEMPORAL_AUTHORITY,
      selectedRevision: null,
      limitations: ['INVALID_SHADOW_DECISION_TIMESTAMP'],
    };
  }

  if (!input.historicalLinkAttributionProven) {
    return {
      authority: VsiProfileRevisionAsOfAuthority.UNPROVEN_TEMPORAL_AUTHORITY,
      selectedRevision: null,
      limitations: ['HISTORICAL_SOURCE_LINK_ATTRIBUTION_UNPROVEN'],
    };
  }

  const eligible = input.revisions
    .filter((row) => {
      const recordedMs = row.recordedAt.getTime();
      const evaluatedMs = row.evaluatedAt.getTime();
      return (
        Number.isFinite(recordedMs) &&
        Number.isFinite(evaluatedMs) &&
        recordedMs <= decisionMs &&
        evaluatedMs <= decisionMs
      );
    })
    .sort((a, b) => b.profileRevision - a.profileRevision);

  const selected = eligible[0] ?? null;
  if (!selected) {
    return {
      authority: VsiProfileRevisionAsOfAuthority.NO_PRIOR_REVISION,
      selectedRevision: null,
      limitations: ['NO_IMMUTABLE_REVISION_RECORDED_BEFORE_DECISION'],
    };
  }

  const profile = revisionToProfileContext(selected);
  if (profile.profileContractVersion === VSI_PROFILE_CONTRACT_VERSION_V1) {
    limitations.push('LEGACY_PROFILE_V1');
  }

  let futureSignalEvidence = false;
  for (const signal of profile.signals) {
    const ts = parseSignalTimestampMs(signal.lastSourceTimestamp);
    if (ts != null && ts > decisionMs) {
      futureSignalEvidence = true;
      limitations.push(`SIGNAL_EVIDENCE_AFTER_DECISION:${signal.canonicalSignalKey}`);
    }
    const validAt = parseSignalTimestampMs(signal.lastValidObservationAt);
    if (validAt != null && validAt > decisionMs) {
      futureSignalEvidence = true;
      limitations.push(`LAST_VALID_OBSERVATION_AFTER_DECISION:${signal.canonicalSignalKey}`);
    }
  }

  if (futureSignalEvidence) {
    return {
      authority: VsiProfileRevisionAsOfAuthority.STALE_AT_DECISION,
      selectedRevision: selected,
      limitations,
    };
  }

  if (profile.profileContractVersion === VSI_PROFILE_CONTRACT_VERSION_V1) {
    return {
      authority: VsiProfileRevisionAsOfAuthority.PRIOR_REVISION_FOUND,
      selectedRevision: selected,
      limitations,
    };
  }

  return {
    authority: VsiProfileRevisionAsOfAuthority.VERIFIED_DECISION_TIME_EVIDENCE,
    selectedRevision: selected,
    limitations,
  };
}
