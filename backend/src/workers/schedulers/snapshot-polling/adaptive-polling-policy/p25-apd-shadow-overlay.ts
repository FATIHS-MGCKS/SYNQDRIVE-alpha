import type { P25ApdProfileInvalidationReason } from './p25-apd-profile-invalidation.types';
import type { P25ApdShadowDecision } from './p25-apd-shadow-decision.types';

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
    return {
      ...decision,
      decision: 'FORCED_PROFILE_INVALID',
      reason: 'PROFILE_OBSERVABILITY_GAP',
    };
  }
  return decision;
}
