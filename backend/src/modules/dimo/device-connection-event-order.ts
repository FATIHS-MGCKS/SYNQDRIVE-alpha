import type { DeviceConnectionEpisodeResolutionMethod } from '@prisma/client';
import { EpisodeConflictReasonCode } from './device-connection-episode-conflict';

export interface EpisodeTimelineRefs {
  openedAt: Date;
  status: string;
  resolutionEvidenceAt: Date | null;
  resolutionMethod: DeviceConnectionEpisodeResolutionMethod | null;
}

export type UnplugEpisodeDecision =
  | { action: 'open' }
  | { action: 'ignore'; reason: EpisodeConflictReasonCode }
  | { action: 'requires_review'; reasonCodes: EpisodeConflictReasonCode[] };

export type PlugEpisodeDecision =
  | { action: 'resolve' }
  | { action: 'reject'; reason: 'plug_before_unplug' | 'binding_mismatch' | 'no_open_episode' }
  | { action: 'ignore'; reason: EpisodeConflictReasonCode };

export type HistoricalSnapshotDecision =
  | { action: 'apply' }
  | { action: 'reject'; reason: EpisodeConflictReasonCode };

const RECOVERY_METHODS = new Set<DeviceConnectionEpisodeResolutionMethod>([
  'EXPLICIT_PLUG_WEBHOOK',
  'SNAPSHOT_PLUG_SIGNAL',
  'TELEMETRY_RESUMED',
]);

/**
 * Provider-observed time is authoritative for episode ordering.
 * Received/processed timestamps are used for backfill and intake diagnostics only.
 */
export function evaluateLateUnplugAgainstRecovery(input: {
  unplugObservedAt: Date;
  unplugReceivedAt: Date;
  latestClosedEpisode: EpisodeTimelineRefs | null;
  openEpisodeForBinding: EpisodeTimelineRefs | null;
}): UnplugEpisodeDecision {
  if (input.openEpisodeForBinding) {
    return { action: 'open' }; // handled as already_open upstream
  }

  const closed = input.latestClosedEpisode;
  if (!closed?.resolutionEvidenceAt) {
    return { action: 'open' };
  }

  const recoveryAt = closed.resolutionEvidenceAt.getTime();
  const unplugAt = input.unplugObservedAt.getTime();

  if (
    unplugAt <= closed.openedAt.getTime() &&
    input.unplugReceivedAt.getTime() > recoveryAt
  ) {
    return {
      action: 'ignore',
      reason: EpisodeConflictReasonCode.STALE_UNPLUG_AFTER_RECOVERY,
    };
  }

  if (
    closed.resolutionMethod &&
    RECOVERY_METHODS.has(closed.resolutionMethod) &&
    unplugAt < recoveryAt &&
    input.unplugReceivedAt.getTime() > recoveryAt
  ) {
    return {
      action: 'ignore',
      reason: EpisodeConflictReasonCode.STALE_UNPLUG_AFTER_RECOVERY,
    };
  }

  if (
    unplugAt < closed.openedAt.getTime() &&
    input.unplugReceivedAt.getTime() > closed.openedAt.getTime()
  ) {
    return {
      action: 'requires_review',
      reasonCodes: [
        EpisodeConflictReasonCode.OUT_OF_ORDER_WEBHOOK,
        EpisodeConflictReasonCode.STALE_UNPLUG_AFTER_RECOVERY,
      ],
    };
  }

  return { action: 'open' };
}

export function evaluatePlugCloseEligibility(input: {
  openEpisode: EpisodeTimelineRefs | null;
  plugObservedAt: Date;
  plugReceivedAt: Date;
  bindingMatches: boolean;
}): PlugEpisodeDecision {
  if (!input.openEpisode) {
    return { action: 'reject', reason: 'no_open_episode' };
  }

  if (!input.bindingMatches) {
    return { action: 'reject', reason: 'binding_mismatch' };
  }

  if (input.plugObservedAt.getTime() < input.openEpisode.openedAt.getTime()) {
    return { action: 'reject', reason: 'plug_before_unplug' };
  }

  if (input.plugReceivedAt.getTime() < input.openEpisode.openedAt.getTime()) {
    return {
      action: 'ignore',
      reason: EpisodeConflictReasonCode.OUT_OF_ORDER_WEBHOOK,
    };
  }

  return { action: 'resolve' };
}

export function evaluateHistoricalSnapshotBackfill(input: {
  providerObservedAt: Date;
  receivedAt: Date;
  episodeOpenedAt: Date | null;
  maxBackfillLagMs: number;
}): HistoricalSnapshotDecision {
  const lagMs = input.receivedAt.getTime() - input.providerObservedAt.getTime();
  if (lagMs > input.maxBackfillLagMs) {
    return {
      action: 'reject',
      reason: EpisodeConflictReasonCode.HISTORICAL_BACKFILL_SNAPSHOT,
    };
  }

  if (
    input.episodeOpenedAt != null &&
    input.providerObservedAt.getTime() <= input.episodeOpenedAt.getTime()
  ) {
    return {
      action: 'reject',
      reason: EpisodeConflictReasonCode.HISTORICAL_BACKFILL_SNAPSHOT,
    };
  }

  if (
    input.episodeOpenedAt != null &&
    input.receivedAt.getTime() <= input.episodeOpenedAt.getTime()
  ) {
    return {
      action: 'reject',
      reason: EpisodeConflictReasonCode.HISTORICAL_BACKFILL_SNAPSHOT,
    };
  }

  return { action: 'apply' };
}

export function compareProviderObservedAt(a: Date, b: Date): number {
  return a.getTime() - b.getTime();
}
