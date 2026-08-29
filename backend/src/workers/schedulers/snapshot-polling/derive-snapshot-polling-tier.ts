import { TripDetectionState } from '@prisma/client';

import {
  classifyTelemetryFreshness,
  TELEMETRY_FRESH_THRESHOLD_MS,
  TELEMETRY_STANDBY_THRESHOLD_MS,
} from '@modules/vehicles/vehicle-state-interpreter';
import {
  DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG,
  type SnapshotPollingTierConfig,
} from './snapshot-polling-tier.config';
import { SnapshotPollingTier } from './snapshot-polling-tier.types';

/** FSM states treated as active driving — highest polling tier. */
const ACTIVE_DRIVING_FSM_STATES: ReadonlySet<TripDetectionState> = new Set([
  TripDetectionState.ACTIVE_TRIP,
  TripDetectionState.IDLE_WITHIN_TRIP,
  TripDetectionState.POSSIBLE_END,
]);

export interface SnapshotPollingTierInput {
  connectionStatus: string | null;
  tokenId: number | null;
  tripDetectionState: TripDetectionState | null;
  /**
   * Canonical vehicle observation instant — prefer `sourceTimestamp` over
   * `lastSeenAt` (matches connectivity / telemetry-freshness resolver).
   */
  observationAt: Date | null;
  /** Trip FSM last activity — authoritative activity signal when present. */
  lastActivityAt: Date | null;
  speedKmh: number | null;
  isIgnitionOn: boolean | null;
  nowMs: number;
}

export interface SnapshotPollingTierResult {
  tier: SnapshotPollingTier;
  /** Human-readable reason for tier assignment (observability / tests). */
  reason: string;
}

export interface SnapshotPollDueInput {
  effectiveTier: SnapshotPollingTier;
  lastPolledAt: Date | null;
  nowMs: number;
  config: SnapshotPollingTierConfig;
  rawTier: SnapshotPollingTier;
  previousEffectiveTier: SnapshotPollingTier | null;
  tierInput: SnapshotPollingTierInput;
}

function ageMs(at: Date | null, nowMs: number): number | null {
  if (!at) return null;
  const ms = at.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, nowMs - ms);
}

function hasRecentActivity(
  lastActivityAt: Date | null,
  nowMs: number,
): boolean {
  const activityAge = ageMs(lastActivityAt, nowMs);
  return activityAge != null && activityAge < TELEMETRY_FRESH_THRESHOLD_MS;
}

function hasMovementSignals(
  input: SnapshotPollingTierInput,
  config: SnapshotPollingTierConfig,
): boolean {
  const speed = input.speedKmh ?? 0;
  if (speed > config.movementSpeedKmh) return true;
  return input.isIgnitionOn === true;
}

function hasActivityPromotionSignals(
  input: SnapshotPollingTierInput,
  config: SnapshotPollingTierConfig,
): boolean {
  return (
    hasRecentActivity(input.lastActivityAt, input.nowMs) ||
    hasMovementSignals(input, config) ||
    classifyTelemetryFreshness(input.observationAt, input.nowMs) === 'live'
  );
}

export function snapshotPollingIntervalMs(
  tier: SnapshotPollingTier,
  config: SnapshotPollingTierConfig,
): number | null {
  if (
    tier === SnapshotPollingTier.OFFLINE ||
    tier === SnapshotPollingTier.HARD_OFFLINE
  ) {
    return null;
  }
  return config.intervalMsByTier[
    tier as keyof typeof config.intervalMsByTier
  ] ?? null;
}

/**
 * Canonical, deterministic activity-tier derivation for snapshot polling.
 *
 * Reuses authoritative connectivity and telemetry freshness semantics.
 * OFFLINE/HARD_OFFLINE label inputs outside the CONNECTED scheduler cohort;
 * DimoSnapshotScheduler excludes those vehicles before calling this function.
 */
export function deriveSnapshotPollingTier(
  input: SnapshotPollingTierInput,
  config: SnapshotPollingTierConfig = DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG,
): SnapshotPollingTierResult {
  if (input.tokenId == null) {
    return {
      tier: SnapshotPollingTier.HARD_OFFLINE,
      reason: 'missing_token',
    };
  }

  if (input.connectionStatus !== 'CONNECTED') {
    return {
      tier: SnapshotPollingTier.OFFLINE,
      reason: `connection_status_${input.connectionStatus ?? 'null'}`,
    };
  }

  const fsm = input.tripDetectionState;
  if (fsm != null && ACTIVE_DRIVING_FSM_STATES.has(fsm)) {
    return {
      tier: SnapshotPollingTier.ACTIVE_DRIVING,
      reason: `fsm_${fsm}`,
    };
  }

  if (hasMovementSignals(input, config)) {
    return {
      tier: SnapshotPollingTier.RECENTLY_ACTIVE,
      reason: 'movement_or_ignition',
    };
  }

  if (hasRecentActivity(input.lastActivityAt, input.nowMs)) {
    return {
      tier: SnapshotPollingTier.RECENTLY_ACTIVE,
      reason: 'recent_fsm_activity',
    };
  }

  const freshness = classifyTelemetryFreshness(input.observationAt, input.nowMs);

  if (freshness === 'live') {
    return {
      tier: SnapshotPollingTier.RECENTLY_ACTIVE,
      reason: 'telemetry_live',
    };
  }

  if (freshness === 'standby') {
    return {
      tier: SnapshotPollingTier.RESTING_STANDBY,
      reason: 'telemetry_standby',
    };
  }

  if (freshness === 'signal_delayed' || freshness === 'offline') {
    return {
      tier: SnapshotPollingTier.LONG_IDLE,
      reason: `telemetry_${freshness}`,
    };
  }

  const observationAge = ageMs(input.observationAt, input.nowMs);
  if (observationAge != null && observationAge < TELEMETRY_STANDBY_THRESHOLD_MS) {
    return {
      tier: SnapshotPollingTier.RESTING_STANDBY,
      reason: 'no_signal_recent_observation',
    };
  }

  return {
    tier: SnapshotPollingTier.LONG_IDLE,
    reason: 'no_signal_long_idle',
  };
}

export interface SnapshotPollingHysteresisInput {
  rawTier: SnapshotPollingTier;
  previousEffectiveTier: SnapshotPollingTier | null;
  lastActiveDrivingAtMs: number | null;
  nowMs: number;
}

/**
 * Apply demotion hysteresis so a single quiet snapshot does not immediately
 * demote an active vehicle from ACTIVE_DRIVING cadence.
 */
export function applySnapshotPollingHysteresis(
  input: SnapshotPollingHysteresisInput,
  config: SnapshotPollingTierConfig,
): SnapshotPollingTier {
  if (input.rawTier === SnapshotPollingTier.ACTIVE_DRIVING) {
    return SnapshotPollingTier.ACTIVE_DRIVING;
  }

  if (
    input.lastActiveDrivingAtMs != null &&
    input.nowMs - input.lastActiveDrivingAtMs < config.activeDrivingDemotionHoldMs
  ) {
    const held = input.previousEffectiveTier ?? SnapshotPollingTier.ACTIVE_DRIVING;
    if (
      held === SnapshotPollingTier.ACTIVE_DRIVING ||
      held === SnapshotPollingTier.RECENTLY_ACTIVE
    ) {
      return SnapshotPollingTier.RECENTLY_ACTIVE;
    }
  }

  return input.rawTier;
}

/**
 * When authoritative activity signals place a vehicle on a faster tier, do not
 * wait out a recent providerFetchedAt timestamp that predates the promotion.
 */
export function requiresImmediateSnapshotPollOnPromotion(
  input: SnapshotPollDueInput,
): boolean {
  const intervalMs = snapshotPollingIntervalMs(input.effectiveTier, input.config);
  if (intervalMs == null || input.lastPolledAt == null) return false;

  const elapsed = input.nowMs - input.lastPolledAt.getTime();
  if (elapsed >= intervalMs) return false;

  if (input.rawTier === SnapshotPollingTier.ACTIVE_DRIVING) {
    const fsm = input.tierInput.tripDetectionState;
    return fsm != null && ACTIVE_DRIVING_FSM_STATES.has(fsm);
  }

  if (input.rawTier === SnapshotPollingTier.RECENTLY_ACTIVE) {
    return hasActivityPromotionSignals(input.tierInput, input.config);
  }

  return false;
}

/**
 * Whether a CONNECTED-cohort vehicle should enqueue a snapshot poll now.
 * OFFLINE/HARD_OFFLINE always return false — those vehicles are excluded
 * upstream by scheduler eligibility.
 */
export function isSnapshotPollDue(input: SnapshotPollDueInput): boolean {
  if (
    input.effectiveTier === SnapshotPollingTier.OFFLINE ||
    input.effectiveTier === SnapshotPollingTier.HARD_OFFLINE
  ) {
    return false;
  }

  const intervalMs = snapshotPollingIntervalMs(input.effectiveTier, input.config);
  if (intervalMs == null) return false;

  if (input.lastPolledAt == null) return true;

  const elapsed = input.nowMs - input.lastPolledAt.getTime();
  if (elapsed >= intervalMs) return true;

  return requiresImmediateSnapshotPollOnPromotion(input);
}
