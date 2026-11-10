import {
  isSnapshotPollDue,
  type SnapshotPollDueInput,
} from '../../derive-snapshot-polling-tier';
import { DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG } from '../../snapshot-polling-tier.config';
import { SnapshotPollingTier } from '../../snapshot-polling-tier.types';

export const APDS_V3_BASELINE_AUTHORITY = 'VERIFIED_IS_SNAPSHOT_POLL_DUE' as const;

export type OfflineBaselinePollDueInput = {
  decisionAtMs: number;
  lastPhysicalPollMs: number | null;
  effectiveTier: SnapshotPollingTier;
  rawTier?: SnapshotPollingTier;
  previousEffectiveTier?: SnapshotPollingTier | null;
};

/**
 * Pure adapter to production `isSnapshotPollDue` for offline replay parity.
 * Coalescing / queue dedupe are out of scope — documented separately.
 */
export function evaluateVerifiedBaselinePollDue(
  input: OfflineBaselinePollDueInput,
  config = DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG,
): { due: boolean; authority: typeof APDS_V3_BASELINE_AUTHORITY } {
  const pollDueInput: SnapshotPollDueInput = {
    effectiveTier: input.effectiveTier,
    rawTier: input.rawTier ?? input.effectiveTier,
    previousEffectiveTier: input.previousEffectiveTier ?? null,
    lastPolledAt:
      input.lastPhysicalPollMs != null
        ? new Date(input.lastPhysicalPollMs)
        : null,
    nowMs: input.decisionAtMs,
    config,
    tierInput: {
      connectionStatus: 'CONNECTED',
      tokenId: 1,
      tripDetectionState: null,
      observationAt: null,
      lastActivityAt: null,
      speedKmh: null,
      isIgnitionOn: null,
      nowMs: input.decisionAtMs,
    },
  };
  return {
    due: isSnapshotPollDue(pollDueInput),
    authority: APDS_V3_BASELINE_AUTHORITY,
  };
}

export function mapActivityTierLabelToSnapshotTier(label: string): SnapshotPollingTier {
  const normalized = label.trim().toUpperCase();
  if (normalized.includes('ACTIVE_DRIVING')) return SnapshotPollingTier.ACTIVE_DRIVING;
  if (normalized.includes('RECENTLY_ACTIVE')) return SnapshotPollingTier.RECENTLY_ACTIVE;
  if (normalized.includes('LONG_IDLE')) return SnapshotPollingTier.LONG_IDLE;
  if (normalized.includes('OFFLINE')) return SnapshotPollingTier.OFFLINE;
  return SnapshotPollingTier.RESTING_STANDBY;
}
