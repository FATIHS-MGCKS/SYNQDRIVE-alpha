import { VSI_PROFILE_CONTRACT_VERSION_V1 } from './vsi-profile.types';
import type { VsiProfileRevisionHistoryRowV1 } from './vsi-profile-revision-history.types';
import { mapVsiProfileRevisionToCapabilityContext } from './vsi-profile-revision-to-capability-context.mapper';
import { isVsiProfileRevisionSignalsSnapshotWellFormed } from './vsi-profile-revision-signals-snapshot';
import {
  assessVsiProfileRevisionSignalTemporalState,
  VsiProfileRevisionSignalTemporalState,
} from './vsi-profile-revision-signal-temporal';
import {
  VsiProfileRevisionAsOfAuthority,
  VsiProfileRevisionAsOfQueryCompleteness,
  type VsiProfileRevisionAsOfQueryEvidenceV1,
} from './vsi-profile-revision-as-of.types';

export type VsiProfileRevisionAsOfSelectionInput = {
  revisions: readonly VsiProfileRevisionHistoryRowV1[];
  decisionAt: Date;
  /** When false, attribution cannot be proven at decision time. */
  historicalLinkAttributionProven: boolean;
  queryEvidence: VsiProfileRevisionAsOfQueryEvidenceV1;
};

export type VsiProfileRevisionAsOfSelectionResult = {
  authority: VsiProfileRevisionAsOfAuthority;
  selectedRevision: VsiProfileRevisionHistoryRowV1 | null;
  limitations: string[];
};

export { isVsiProfileRevisionSignalsSnapshotWellFormed } from './vsi-profile-revision-signals-snapshot';

/**
 * `recorded_at` is the database insert timestamp (`clock_timestamp()` default).
 * It bounds when the row was written, not when the transaction became visible relative to APDS `decisionAt`.
 * `VERIFIED_DECISION_TIME_EVIDENCE` is not emitted without durable commit-visibility proof (none in P5-H1).
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

  if (input.queryEvidence.completeness !== VsiProfileRevisionAsOfQueryCompleteness.COMPLETE) {
    return {
      authority: VsiProfileRevisionAsOfAuthority.UNPROVEN_TEMPORAL_AUTHORITY,
      selectedRevision: null,
      limitations: ['AS_OF_QUERY_INCOMPLETE'],
    };
  }

  const eligibleCount = input.queryEvidence.eligibleRevisionCountExact;
  if (eligibleCount == null) {
    return {
      authority: VsiProfileRevisionAsOfAuthority.UNPROVEN_TEMPORAL_AUTHORITY,
      selectedRevision: null,
      limitations: ['AS_OF_ELIGIBLE_COUNT_UNKNOWN'],
    };
  }

  if (eligibleCount === 0) {
    return {
      authority: VsiProfileRevisionAsOfAuthority.NO_PRIOR_REVISION,
      selectedRevision: null,
      limitations: ['NO_IMMUTABLE_REVISION_RECORDED_BEFORE_DECISION'],
    };
  }

  const selected = input.revisions[0] ?? null;
  if (!selected) {
    return {
      authority: VsiProfileRevisionAsOfAuthority.UNPROVEN_TEMPORAL_AUTHORITY,
      selectedRevision: null,
      limitations: ['AS_OF_BEST_REVISION_NOT_LOADED'],
    };
  }

  if (
    input.queryEvidence.maxEligibleProfileRevision != null &&
    selected.profileRevision !== input.queryEvidence.maxEligibleProfileRevision
  ) {
    return {
      authority: VsiProfileRevisionAsOfAuthority.UNPROVEN_TEMPORAL_AUTHORITY,
      selectedRevision: null,
      limitations: ['AS_OF_BEST_REVISION_MISMATCH'],
    };
  }

  const recordedMs = selected.recordedAt.getTime();
  const evaluatedMs = selected.evaluatedAt.getTime();
  if (!Number.isFinite(recordedMs) || !Number.isFinite(evaluatedMs)) {
    return {
      authority: VsiProfileRevisionAsOfAuthority.UNPROVEN_TEMPORAL_AUTHORITY,
      selectedRevision: selected,
      limitations: ['INVALID_PROFILE_TEMPORAL_AUTHORITY'],
    };
  }

  if (recordedMs > decisionMs || evaluatedMs > decisionMs) {
    return {
      authority: VsiProfileRevisionAsOfAuthority.UNPROVEN_TEMPORAL_AUTHORITY,
      selectedRevision: selected,
      limitations: ['PROFILE_TEMPORAL_FILTER_VIOLATION'],
    };
  }

  if (!isVsiProfileRevisionSignalsSnapshotWellFormed(selected.signalsSnapshot)) {
    return {
      authority: VsiProfileRevisionAsOfAuthority.UNPROVEN_TEMPORAL_AUTHORITY,
      selectedRevision: selected,
      limitations: ['MALFORMED_SIGNALS_SNAPSHOT'],
    };
  }

  const profile = mapVsiProfileRevisionToCapabilityContext(selected);
  if (!profile) {
    return {
      authority: VsiProfileRevisionAsOfAuthority.UNPROVEN_TEMPORAL_AUTHORITY,
      selectedRevision: selected,
      limitations: [...limitations, 'MALFORMED_SIGNALS_SNAPSHOT'],
    };
  }
  if (profile.profileContractVersion === VSI_PROFILE_CONTRACT_VERSION_V1) {
    limitations.push('LEGACY_PROFILE_V1');
  }

  let hasFutureSignal = false;
  let hasMissingProvenance = false;
  for (const signal of profile.signals) {
    const state = assessVsiProfileRevisionSignalTemporalState({
      empiricalObservation: signal.empiricalObservation,
      lastSourceTimestamp: signal.lastSourceTimestamp,
      lastValidObservationAt: signal.lastValidObservationAt,
      decisionAtMs: decisionMs,
    });
    if (state === VsiProfileRevisionSignalTemporalState.FUTURE_SIGNAL_EVIDENCE) {
      hasFutureSignal = true;
      limitations.push(`FUTURE_SIGNAL_EVIDENCE:${signal.canonicalSignalKey}`);
    }
    if (state === VsiProfileRevisionSignalTemporalState.MISSING_TEMPORAL_PROVENANCE) {
      hasMissingProvenance = true;
      limitations.push(`MISSING_TEMPORAL_PROVENANCE:${signal.canonicalSignalKey}`);
    }
    if (state === VsiProfileRevisionSignalTemporalState.VALID_PAST_SIGNAL_EVIDENCE) {
      limitations.push(`VALID_PAST_SIGNAL_EVIDENCE:${signal.canonicalSignalKey}`);
    }
  }

  if (hasFutureSignal) {
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

  if (hasMissingProvenance) {
    return {
      authority: VsiProfileRevisionAsOfAuthority.PRIOR_REVISION_FOUND,
      selectedRevision: selected,
      limitations,
    };
  }

  if (recordedMs >= decisionMs) {
    limitations.push('PERSISTENCE_RECORDED_AT_NOT_STRICTLY_BEFORE_DECISION');
    return {
      authority: VsiProfileRevisionAsOfAuthority.UNPROVEN_TEMPORAL_AUTHORITY,
      selectedRevision: selected,
      limitations,
    };
  }

  limitations.push('PERSISTENCE_RECORDED_AT_UPPER_BOUND_ONLY');
  limitations.push('PERSISTENCE_COMMIT_VISIBILITY_UNPROVEN');
  return {
    authority: VsiProfileRevisionAsOfAuthority.PRIOR_REVISION_FOUND,
    selectedRevision: selected,
    limitations,
  };
}
