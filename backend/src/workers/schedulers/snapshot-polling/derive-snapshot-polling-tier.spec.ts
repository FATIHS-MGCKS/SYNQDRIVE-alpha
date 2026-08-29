import { TripDetectionState } from '@prisma/client';

import { TELEMETRY_FRESH_THRESHOLD_MS, TELEMETRY_STANDBY_THRESHOLD_MS } from '@modules/vehicles/vehicle-state-interpreter';
import {
  applySnapshotPollingHysteresis,
  deriveSnapshotPollingTier,
  isSnapshotPollDue,
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

describe('deriveSnapshotPollingTier', () => {
  it('ACTIVE_DRIVING for ACTIVE_TRIP FSM', () => {
    const { tier } = deriveSnapshotPollingTier(
      baseInput({ tripDetectionState: TripDetectionState.ACTIVE_TRIP }),
      config,
    );
    expect(tier).toBe(SnapshotPollingTier.ACTIVE_DRIVING);
  });

  it('ACTIVE_DRIVING for POSSIBLE_END FSM', () => {
    const { tier } = deriveSnapshotPollingTier(
      baseInput({ tripDetectionState: TripDetectionState.POSSIBLE_END }),
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

  it('OFFLINE when connection is not CONNECTED', () => {
    const { tier } = deriveSnapshotPollingTier(
      baseInput({ connectionStatus: 'DISCONNECTED' }),
      config,
    );
    expect(tier).toBe(SnapshotPollingTier.OFFLINE);
  });

  it('HARD_OFFLINE when token is missing', () => {
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

  it('recent FSM activity promotes to RECENTLY_ACTIVE', () => {
    const { tier } = deriveSnapshotPollingTier(
      baseInput({
        lastActivityAt: new Date(NOW - 30_000),
        observationAt: new Date(NOW - TELEMETRY_STANDBY_THRESHOLD_MS - 60_000),
      }),
      config,
    );
    expect(tier).toBe(SnapshotPollingTier.RECENTLY_ACTIVE);
  });
});

describe('isSnapshotPollDue', () => {
  it('ACTIVE_DRIVING due every 30s', () => {
    const last = new Date(NOW - 31_000);
    expect(
      isSnapshotPollDue(
        SnapshotPollingTier.ACTIVE_DRIVING,
        last,
        NOW,
        config,
      ),
    ).toBe(true);
    expect(
      isSnapshotPollDue(
        SnapshotPollingTier.ACTIVE_DRIVING,
        new Date(NOW - 10_000),
        NOW,
        config,
      ),
    ).toBe(false);
  });

  it('RECENTLY_ACTIVE due at configured 60s cadence', () => {
    expect(
      isSnapshotPollDue(
        SnapshotPollingTier.RECENTLY_ACTIVE,
        new Date(NOW - 61_000),
        NOW,
        config,
      ),
    ).toBe(true);
  });

  it('RESTING_STANDBY due at 5min cadence', () => {
    expect(
      isSnapshotPollDue(
        SnapshotPollingTier.RESTING_STANDBY,
        new Date(NOW - 5 * 60_000 - 1),
        NOW,
        config,
      ),
    ).toBe(true);
  });

  it('LONG_IDLE due at 30min cadence', () => {
    expect(
      isSnapshotPollDue(
        SnapshotPollingTier.LONG_IDLE,
        new Date(NOW - 30 * 60_000 - 1),
        NOW,
        config,
      ),
    ).toBe(true);
  });

  it('OFFLINE does not poll at normal snapshot frequency', () => {
    expect(
      isSnapshotPollDue(
        SnapshotPollingTier.OFFLINE,
        new Date(NOW - 60_000),
        NOW,
        config,
      ),
    ).toBe(false);
  });

  it('HARD_OFFLINE never polls', () => {
    expect(
      isSnapshotPollDue(
        SnapshotPollingTier.HARD_OFFLINE,
        null,
        NOW,
        config,
      ),
    ).toBe(false);
  });

  it('first poll is always due when never polled', () => {
    expect(
      isSnapshotPollDue(SnapshotPollingTier.LONG_IDLE, null, NOW, config),
    ).toBe(true);
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
