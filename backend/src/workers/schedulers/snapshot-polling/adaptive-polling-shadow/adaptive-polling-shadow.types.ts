import type { SnapshotPollingTier } from '../snapshot-polling-tier.types';
import type { TripDetectionState } from '@prisma/client';

export interface AdaptivePollingShadowPrePollContext {
  organizationId: string;
  vehicleId: string;
  decisionAtMs: number;
  origin: string;
  reconciliation: boolean;
  effectiveTier: SnapshotPollingTier;
  tripDetectionState: TripDetectionState | null;
  lastProviderFetchedAtMs: number | null;
  lastTrustworthyLvSourceMs: number | null;
  lvProviderTimestampsMs: number[];
  providerGapOpen: boolean;
  connectivityState: string | null;
  r9WakeKnown: boolean;
  wakeCorrelationId: string | null;
  deviceReconnectRecent: boolean;
  providerReconnectRecent: boolean;
}

export interface AdaptivePollingShadowPrePollResult {
  opportunityId: string;
}

/** Authoritative scientific baseline poll start (DimoSnapshotProcessor). */
export interface AdaptivePollingShadowActualPollStartContext {
  organizationId: string;
  vehicleId: string;
  pollStartedAtMs: number;
  origin: string;
  tripDetectionState: TripDetectionState | null;
  lastProviderFetchedAtMs: number | null;
  providerGapOpen: boolean;
  connectivityState: string | null;
  r9WakeKnown: boolean;
  wakeCorrelationId: string | null;
  deviceReconnectRecent: boolean;
  providerReconnectRecent: boolean;
}

export interface AdaptivePollingShadowPostPollContext {
  organizationId: string;
  vehicleId: string;
  opportunityId: string;
  realPollId: string;
  pollStartedAtMs: number;
  pollCompletedAtMs: number;
  /** Simulated policy LV visibility (historical visibility / bootstrap admission only). */
  realPollVisibleLvSourceAtMs: number | null;
  previousLvSourceMs: number | null;
  /**
   * Strict LIVE_VOLTAGE provider source timestamp (`resolveStrictLvBatteryProviderSourceAt` only).
   * Never `collectionLastSeenAt` or DB read-at-poll-completion.
   */
  baselineLvProviderSourceMs: number | null;
  previousTopLevelSourceMs: number | null;
  /** Provider `sourceTimestamp` from the applied snapshot (not providerFetchedAt). */
  newTopLevelSourceMs: number | null;
  providerFetchedAtMs: number | null;
}
