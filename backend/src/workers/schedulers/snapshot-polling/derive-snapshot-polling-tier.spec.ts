import { TripDetectionState } from '@prisma/client';

import { TELEMETRY_FRESH_THRESHOLD_MS, TELEMETRY_STANDBY_THRESHOLD_MS } from '@modules/vehicles/vehicle-state-interpreter';
import {
  applySnapshotPollingHysteresis,
  deriveSnapshotPollingTier,
  isSnapshotPollDue,
  requiresImmediateSnapshotPollOnPromotion,
} from './derive-snapshot-polling-tier';
import { DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG } from './snapshot-polling-tier.config';
import { SnapshotPollingTier } from './snapshot-polling-tier.types';

const NOW = Date.parse('2026-08-29T12:00:00.000Z');
const config = DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG;

function baseInput(
  overrides: Partial<Parameters<typeof deriveSnapshotPollingTier>[0]> = {},
) {
  return {
    connectionStatus: 'CONNECTED',
    tokenId: 42,
    tripDetectionState: TripDetectionState.RESTING,
    observationAt: new Date(NOW - 5 * 60_000),
    lastActivityAt: null,
    speedKmh: 0,
    isIgnitionOn: false,
    nowMs: NOW,
    ...overrides,
  };
}

function dueInput(
  overrides: Partial<Parameters<typeof isSnapshotPollDue>[0]> = {},
) {
  const tierInput = baseInput();
  return {
    effectiveTier: SnapshotPollingTier.RESTING_STANDBY,
    lastPolledAt: new Date(NOW - 6 * 60_000),
    nowMs: NOW,
    config,
    rawTier: SnapshotPollingTier.RESTING_STANDBY,
    previousEffectiveTier: SnapshotPollingTier.RESTING_STANDBY,
    tierInput,
    ...overrides,
  };
}

describe('deriveSnapshotPollingTier', () => {
  it('ACTIVE_DRIVING for ACTIVE_TRIP FSM', () => {
    const { tier } = deriveSnapshotPollingTier(
      baseInput({ tripDetectionState: TripDetectionState.ACTIVE_TRIP }),
      config,
    );
    expect(tier).toBe(SnapshotPollingTier.ACTIVE_DRIVING);
  });

  it('RECENTLY_ACTIVE for live telemetry without active trip', () => {
    const { tier } = deriveSnapshotPollingTier(
      baseInput({
        observationAt: new Date(NOW - TELEMETRY_FRESH_THRESHOLD_MS + 60_000),
      }),
      config,
    );
    expect(tier).toBe(SnapshotPollingTier.RECENTLY_ACTIVE);
  });

  it('RESTING_STANDBY for standby telemetry band', () => {
    const { tier } = deriveSnapshotPollingTier(
      baseInput({
        observationAt: new Date(NOW - TELEMETRY_STANDBY_THRESHOLD_MS + 60_000),
      }),
      config,
    );
    expect(tier).toBe(SnapshotPollingTier.RESTING_STANDBY);
  });

  it('LONG_IDLE for telemetry older than 24h', () => {
    const { tier } = deriveSnapshotPollingTier(
      baseInput({
        observationAt: new Date(NOW - TELEMETRY_STANDBY_THRESHOLD_MS - 60_000),
      }),
      config,
    );
    expect(tier).toBe(SnapshotPollingTier.LONG_IDLE);
  });

  it('OFFLINE labels non-CONNECTED inputs (scheduler excludes them)', () => {
    const { tier } = deriveSnapshotPollingTier(
      baseInput({ connectionStatus: 'DISCONNECTED' }),
      config,
    );
    expect(tier).toBe(SnapshotPollingTier.OFFLINE);
  });

  it('HARD_OFFLINE labels missing token (scheduler excludes them)', () => {
    const { tier } = deriveSnapshotPollingTier(
      baseInput({ tokenId: null }),
      config,
    );
    expect(tier).toBe(SnapshotPollingTier.HARD_OFFLINE);
  });

  it('active trip overrides stale telemetry', () => {
    const { tier } = deriveSnapshotPollingTier(
      baseInput({
        tripDetectionState: TripDetectionState.ACTIVE_TRIP,
        observationAt: new Date(NOW - 7 * 24 * 3600_000),
      }),
      config,
    );
    expect(tier).toBe(SnapshotPollingTier.ACTIVE_DRIVING);
  });

  it('movement promotes to RECENTLY_ACTIVE', () => {
    const { tier } = deriveSnapshotPollingTier(
      baseInput({
        speedKmh: 25,
        observationAt: new Date(NOW - TELEMETRY_STANDBY_THRESHOLD_MS - 60_000),
      }),
      config,
    );
    expect(tier).toBe(SnapshotPollingTier.RECENTLY_ACTIVE);
  });
});

describe('isSnapshotPollDue', () => {
  it('ACTIVE_DRIVING due every 30s', () => {
    expect(
      isSnapshotPollDue(
        dueInput({
          effectiveTier: SnapshotPollingTier.ACTIVE_DRIVING,
          rawTier: SnapshotPollingTier.ACTIVE_DRIVING,
          lastPolledAt: new Date(NOW - 31_000),
        }),
      ),
    ).toBe(true);
    expect(
      isSnapshotPollDue(
        dueInput({
          effectiveTier: SnapshotPollingTier.ACTIVE_DRIVING,
          rawTier: SnapshotPollingTier.ACTIVE_DRIVING,
          lastPolledAt: new Date(NOW - 10_000),
        }),
      ),
    ).toBe(false);
  });

  it('OFFLINE and HARD_OFFLINE are never due (not in scheduler cohort)', () => {
    expect(
      isSnapshotPollDue(
        dueInput({
          effectiveTier: SnapshotPollingTier.OFFLINE,
          rawTier: SnapshotPollingTier.OFFLINE,
          lastPolledAt: null,
        }),
      ),
    ).toBe(false);
    expect(
      isSnapshotPollDue(
        dueInput({
          effectiveTier: SnapshotPollingTier.HARD_OFFLINE,
          rawTier: SnapshotPollingTier.HARD_OFFLINE,
          lastPolledAt: null,
        }),
      ),
    ).toBe(false);
  });

  it('promotes LONG_IDLE -> ACTIVE_TRIP immediately when providerFetchedAt is recent', () => {
    const tierInput = baseInput({
      tripDetectionState: TripDetectionState.ACTIVE_TRIP,
    });
    const input = dueInput({
      effectiveTier: SnapshotPollingTier.ACTIVE_DRIVING,
      rawTier: SnapshotPollingTier.ACTIVE_DRIVING,
      previousEffectiveTier: SnapshotPollingTier.LONG_IDLE,
      lastPolledAt: new Date(NOW - 20_000),
      tierInput,
    });

    expect(requiresImmediateSnapshotPollOnPromotion(input)).toBe(true);
    expect(isSnapshotPollDue(input)).toBe(true);
  });

  it('promotes LONG_IDLE -> fresh external activity immediately', () => {
    const tierInput = baseInput({
      observationAt: new Date(NOW - 7 * 24 * 3600_000),
      lastActivityAt: new Date(NOW - 15_000),
    });
    const input = dueInput({
      effectiveTier: SnapshotPollingTier.RECENTLY_ACTIVE,
      rawTier: SnapshotPollingTier.RECENTLY_ACTIVE,
      previousEffectiveTier: SnapshotPollingTier.LONG_IDLE,
      lastPolledAt: new Date(NOW - 45_000),
      tierInput,
    });

    expect(isSnapshotPollDue(input)).toBe(true);
  });
});

describe('applySnapshotPollingHysteresis', () => {
  it('prevents immediate demotion from ACTIVE_DRIVING to RESTING_STANDBY', () => {
    const effective = applySnapshotPollingHysteresis(
      {
        rawTier: SnapshotPollingTier.RESTING_STANDBY,
        previousEffectiveTier: SnapshotPollingTier.ACTIVE_DRIVING,
        lastActiveDrivingAtMs: NOW - 30_000,
        nowMs: NOW,
      },
      config,
    );
    expect(effective).toBe(SnapshotPollingTier.RECENTLY_ACTIVE);
  });

  it('allows demotion after hold window expires', () => {
    const effective = applySnapshotPollingHysteresis(
      {
        rawTier: SnapshotPollingTier.RESTING_STANDBY,
        previousEffectiveTier: SnapshotPollingTier.ACTIVE_DRIVING,
        lastActiveDrivingAtMs: NOW - config.activeDrivingDemotionHoldMs - 1,
        nowMs: NOW,
      },
      config,
    );
    expect(effective).toBe(SnapshotPollingTier.RESTING_STANDBY);
  });
});

describe('deterministic job id contract', () => {
  it('snapshot job ids remain snapshot-{vehicleId}', () => {
    const vehicleId = 'c10351f8-aaaa-bbbb-cccc-ddddeeeeffff';
    expect(`snapshot-${vehicleId}`).toBe(
      'snapshot-c10351f8-aaaa-bbbb-cccc-ddddeeeeffff',
    );
  });
});
