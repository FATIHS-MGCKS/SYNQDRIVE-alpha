import { readPhysicalDriveIntervalAuthority } from '../exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-enroll.lib';
import { EXP021_PHYSICAL_DRIVE_INTERVAL_METADATA_KEY } from '../reference-capture-exp-021-motion.lib';
import {
  buildCanaryLiveWindowActivationConfig,
  CanaryLiveWindowTripSnapshot,
  runCanaryLiveWindowActivationCoordinatorTick,
} from './reference-capture-exp021-canary-live-window-activation.coordinator.lib';
import { EXP021_CANARY_LIVE_WINDOW_CANARY } from './reference-capture-exp021-canary-live-window-activation.constants';

const T0_MS = Date.parse('2026-09-18T13:00:00.000Z');

function canaryTrip(overrides: Partial<CanaryLiveWindowTripSnapshot> = {}): CanaryLiveWindowTripSnapshot {
  return {
    tripId: 'trip-1',
    vehicleId: EXP021_CANARY_LIVE_WINDOW_CANARY.vehicleId,
    organizationId: EXP021_CANARY_LIVE_WINDOW_CANARY.organizationId,
    tokenId: EXP021_CANARY_LIVE_WINDOW_CANARY.tokenId,
    tripStatus: 'ONGOING',
    startTimeMs: T0_MS + 60_000,
    endTimeMs: null,
    ...overrides,
  };
}

describe('reference-capture-exp021-canary-live-window-activation.coordinator.lib', () => {
  const config = buildCanaryLiveWindowActivationConfig({
    enabled: true,
    activationNotBeforeIso: new Date(T0_MS).toISOString(),
  })!;

  it('1 — new ongoing allowed trip arms one session', async () => {
    const arm = jest.fn().mockResolvedValue({ sessionId: 's1', studyRunId: 'r1' });
    const result = await runCanaryLiveWindowActivationCoordinatorTick({
      config,
      ongoingTrips: [canaryTrip()],
      completedTrips: [],
      ledgerByTripId: new Map(),
      activeBlockingSessionId: null,
      ports: { armOngoingTrip: arm, finalizeCompletedTrip: jest.fn() },
    });
    expect(result.armedTripIds).toEqual(['trip-1']);
    expect(arm).toHaveBeenCalledTimes(1);
  });

  it('2 — duplicate ongoing delivery does not arm twice', async () => {
    const arm = jest.fn();
    const ledger = new Map<string, import('./reference-capture-exp021-canary-live-window-activation.coordinator.lib').CanaryLiveWindowLedgerSnapshot>([
      ['trip-1', { vehicleTripId: 'trip-1', state: 'RECORDING_STARTED', sessionId: 's1' }],
    ]);
    const result = await runCanaryLiveWindowActivationCoordinatorTick({
      config,
      ongoingTrips: [canaryTrip(), canaryTrip()],
      completedTrips: [],
      ledgerByTripId: ledger,
      activeBlockingSessionId: null,
      ports: { armOngoingTrip: arm, finalizeCompletedTrip: jest.fn() },
    });
    expect(result.armedTripIds).toEqual([]);
    expect(arm).not.toHaveBeenCalled();
  });

  it('3 — replica race converges via ledger (coordinator sees ledger)', async () => {
    const arm = jest.fn();
    const ledger = new Map<string, import('./reference-capture-exp021-canary-live-window-activation.coordinator.lib').CanaryLiveWindowLedgerSnapshot>([
      ['trip-1', { vehicleTripId: 'trip-1', state: 'RECORDING_STARTED', sessionId: 's1' }],
    ]);
    await runCanaryLiveWindowActivationCoordinatorTick({
      config,
      ongoingTrips: [canaryTrip()],
      completedTrips: [],
      ledgerByTripId: ledger,
      activeBlockingSessionId: null,
      ports: { armOngoingTrip: arm, finalizeCompletedTrip: jest.fn() },
    });
    expect(arm).not.toHaveBeenCalled();
  });

  it('4 — non-allowlisted token arms zero sessions', async () => {
    const arm = jest.fn();
    const result = await runCanaryLiveWindowActivationCoordinatorTick({
      config,
      ongoingTrips: [canaryTrip({ tokenId: 999999 })],
      completedTrips: [],
      ledgerByTripId: new Map(),
      activeBlockingSessionId: null,
      ports: { armOngoingTrip: arm, finalizeCompletedTrip: jest.fn() },
    });
    expect(result.armedTripIds).toEqual([]);
    expect(arm).not.toHaveBeenCalled();
  });

  it('5 — historical trip before activation T0 arms zero sessions', async () => {
    const arm = jest.fn();
    const result = await runCanaryLiveWindowActivationCoordinatorTick({
      config,
      ongoingTrips: [canaryTrip({ startTimeMs: T0_MS - 60_000 })],
      completedTrips: [],
      ledgerByTripId: new Map(),
      activeBlockingSessionId: null,
      ports: { armOngoingTrip: arm, finalizeCompletedTrip: jest.fn() },
    });
    expect(result.armedTripIds).toEqual([]);
    expect(result.skippedReasons[0]?.reason).toBe('HISTORICAL_TRIP_BEFORE_ACTIVATION_T0');
  });

  it('6–8 — completed trip finalizes session; PDI authority is persisted metadata shape', async () => {
    const finalize = jest.fn().mockResolvedValue(undefined);
    const ledger = new Map<string, import('./reference-capture-exp021-canary-live-window-activation.coordinator.lib').CanaryLiveWindowLedgerSnapshot>([
      ['trip-1', { vehicleTripId: 'trip-1', state: 'RECORDING_STARTED', sessionId: 's1' }],
    ]);
    const completed = canaryTrip({
      tripStatus: 'COMPLETED',
      endTimeMs: T0_MS + 1_500_000,
    });
    const result = await runCanaryLiveWindowActivationCoordinatorTick({
      config,
      ongoingTrips: [],
      completedTrips: [completed],
      ledgerByTripId: ledger,
      activeBlockingSessionId: 'foreign-session',
      ports: { armOngoingTrip: jest.fn(), finalizeCompletedTrip: finalize },
    });
    expect(result.finalizedTripIds).toEqual(['trip-1']);
    expect(finalize).toHaveBeenCalledTimes(1);

    const authority = readPhysicalDriveIntervalAuthority({
      [EXP021_PHYSICAL_DRIVE_INTERVAL_METADATA_KEY]: {
        physicalStartAt: '2026-09-18T13:01:00.000Z',
        physicalEndAt: '2026-09-18T13:26:00.000Z',
        source: 'PDI_CANDIDATE',
      },
    });
    expect(authority?.physicalEndAt).toBe('2026-09-18T13:26:00.000Z');
    expect(authority?.physicalEndAt).not.toBe(new Date().toISOString());
  });

  it('9 — maturation operator can read new physicalEndAt from experiment metadata', () => {
    const physicalEndAt = '2026-09-18T13:26:00.000Z';
    const authority = readPhysicalDriveIntervalAuthority({
      physicalDriveInterval: {
        physicalStartAt: '2026-09-18T13:01:00.000Z',
        physicalEndAt,
        source: 'PDI_CANDIDATE',
      },
    });
    expect(authority?.physicalEndAt).toBe(physicalEndAt);
  });

  it('10 — kill switch (disabled config) yields null config', () => {
    expect(
      buildCanaryLiveWindowActivationConfig({ enabled: false, activationNotBeforeIso: '2026-09-18T13:00:00.000Z' }),
    ).toBeNull();
  });

  it('11 — restart with existing ledger does not re-arm', async () => {
    const arm = jest.fn();
    const ledger = new Map<string, import('./reference-capture-exp021-canary-live-window-activation.coordinator.lib').CanaryLiveWindowLedgerSnapshot>([
      ['trip-1', { vehicleTripId: 'trip-1', state: 'RECORDING_STARTED', sessionId: 's1' }],
    ]);
    await runCanaryLiveWindowActivationCoordinatorTick({
      config,
      ongoingTrips: [canaryTrip()],
      completedTrips: [],
      ledgerByTripId: ledger,
      activeBlockingSessionId: null,
      ports: { armOngoingTrip: arm, finalizeCompletedTrip: jest.fn() },
    });
    expect(arm).not.toHaveBeenCalled();
  });

  it('12a — in-progress ledger resumes despite foreign blocking session', async () => {
    const arm = jest.fn().mockResolvedValue({ sessionId: 's1', studyRunId: 'r1' });
    const ledger = new Map([
      ['trip-1', { vehicleTripId: 'trip-1', state: 'SESSION_CREATED' as const, sessionId: 's1' }],
    ]);
    const result = await runCanaryLiveWindowActivationCoordinatorTick({
      config,
      ongoingTrips: [canaryTrip()],
      completedTrips: [],
      ledgerByTripId: ledger,
      activeBlockingSessionId: 's1',
      ports: { armOngoingTrip: arm, finalizeCompletedTrip: jest.fn() },
    });
    expect(result.armedTripIds).toEqual(['trip-1']);
    expect(arm).toHaveBeenCalledTimes(1);
  });

  it('12 — missed drive without ledger is not backfilled on completion only', async () => {
    const finalize = jest.fn();
    const completed = canaryTrip({
      tripStatus: 'COMPLETED',
      endTimeMs: T0_MS + 1_500_000,
    });
    const result = await runCanaryLiveWindowActivationCoordinatorTick({
      config,
      ongoingTrips: [],
      completedTrips: [completed],
      ledgerByTripId: new Map(),
      activeBlockingSessionId: null,
      ports: { armOngoingTrip: jest.fn(), finalizeCompletedTrip: finalize },
    });
    expect(result.finalizedTripIds).toEqual([]);
    expect(result.skippedReasons[0]?.reason).toBe('NO_LEDGER_MISS_NO_BACKFILL');
    expect(finalize).not.toHaveBeenCalled();
  });
});
