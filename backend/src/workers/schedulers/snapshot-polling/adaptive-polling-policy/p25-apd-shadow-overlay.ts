import type { P25ApdProfileInvalidationReason } from './p25-apd-profile-invalidation.types';
import type { P25ApdShadowDecision } from './p25-apd-shadow-decision.types';

export function mapProfileInvalidationToShadowOverlay(
  invalidationReason: P25ApdProfileInvalidationReason,
): Pick<P25ApdShadowDecision, 'decision' | 'reason'> {
  switch (invalidationReason) {
    case 'TRIP_ACTIVE':
      return { decision: 'FORCED_TRIP_SAFETY', reason: 'TRIP_ACTIVE' };
    case 'INSUFFICIENT_RECENT_EVIDENCE':
      return {
        decision: 'FORCED_INSUFFICIENT_PROFILE',
        reason: 'PROFILE_INSUFFICIENT_EVIDENCE',
      };
    case 'PROVIDER_OBSERVABILITY_GAP':
      return { decision: 'FORCED_PROFILE_INVALID', reason: 'PROFILE_OBSERVABILITY_GAP' };
    case 'EARLY_SOURCE_ADVANCE':
    case 'LATE_SOURCE_ADVANCE':
    case 'PHASE_DRIFT':
    case 'CAPABILITY_CHANGE':
    case 'ACTIVITY':
      return { decision: 'FORCED_PROFILE_INVALID', reason: 'PROFILE_OBSERVABILITY_GAP' };
    default:
      return { decision: 'FORCED_PROFILE_INVALID', reason: 'PROFILE_OBSERVABILITY_GAP' };
  }
}

/** Shadow-only conservative overlays (do not change frozen replay core). */
export function applyP25ApdShadowSafetyOverlay(
  decision: P25ApdShadowDecision,
  overlay: {
    r9WakeKnown: boolean;
    profileInvalidated: boolean;
    invalidationReason: P25ApdProfileInvalidationReason | null;
    providerGapOpen: boolean;
    sourceTimestampMissing: boolean;
    reconnectPending: boolean;
    tripAuthorityDisagreement?: boolean;
  },
): P25ApdShadowDecision {
  if (overlay.r9WakeKnown) {
    return {
      ...decision,
      decision: 'IMMEDIATE_SNAPSHOT_REQUIRED',
      reason: 'R9_PROVIDER_WAKE',
    };
  }
  if (overlay.sourceTimestampMissing) {
    return {
      ...decision,
      decision: 'FORCED_SOURCE_TIMESTAMP_MISSING',
      reason: 'MISSING_LV_SOURCE_TIMESTAMP',
    };
  }
  if (overlay.providerGapOpen) {
    return {
      ...decision,
      decision: 'FORCED_PROVIDER_GAP',
      reason: 'PROFILE_OBSERVABILITY_GAP',
    };
  }
  if (overlay.reconnectPending) {
    return {
      ...decision,
      decision: 'FORCED_RECONNECT',
      reason: 'PROFILE_OBSERVABILITY_GAP',
    };
  }
  if (overlay.profileInvalidated && overlay.invalidationReason) {
    const mapped = mapProfileInvalidationToShadowOverlay(overlay.invalidationReason);
    return { ...decision, ...mapped };
  }
  if (
    overlay.tripAuthorityDisagreement &&
    decision.decision === 'WOULD_SKIP'
  ) {
    return {
      ...decision,
      decision: 'FORCED_TRIP_SAFETY',
      reason: 'TRIP_AUTHORITY_DISAGREEMENT',
    };
  }
  return decision;
}
