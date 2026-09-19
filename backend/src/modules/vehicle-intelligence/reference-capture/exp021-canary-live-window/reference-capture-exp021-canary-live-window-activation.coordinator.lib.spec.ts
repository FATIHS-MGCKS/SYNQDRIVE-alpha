import { readPhysicalDriveIntervalAuthority } from '../exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-canary-enroll.lib';
import { EXP021_PHYSICAL_DRIVE_INTERVAL_METADATA_KEY } from '../reference-capture-exp-021-motion.lib';
import {
  buildCanaryLiveWindowActivationConfig,
  CanaryLiveWindowTripSnapshot,
  runCanaryLiveWindowActivationCoordinatorTick,
} from './reference-capture-exp021-canary-live-window-activation.coordinator.lib';
import { EXP021_CANARY_LIVE_WINDOW_CANARY } from './reference-capture-exp021-canary-live-window-activation.constants';
import {
  buildExp021CanaryCohortAuthority,
  EXP021_FIRST_LIVE_FORENSIC_VEHICLE_TRIP_ID,
  EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE,
} from './reference-capture-exp021-canary-live-window-cohort.lib';

const T0_MS = Date.parse('2026-09-18T13:00:00.000Z');

function testCohortConfig() {
  const cohort = buildExp021CanaryCohortAuthority([
    {
      organizationId: EXP021_CANARY_LIVE_WINDOW_CANARY.organizationId,
      vehicleId: EXP021_CANARY_LIVE_WINDOW_CANARY.vehicleId,
      tokenId: EXP021_CANARY_LIVE_WINDOW_CANARY.tokenId,
    },
  ])!;
  return buildCanaryLiveWindowActivationConfig({
    enabled: true,
    activationNotBeforeIso: new Date(T0_MS).toISOString(),
    cohort,
  })!;
}

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
  const config = testCohortConfig();

  it('1 — new ongoing allowed trip arms one session', async () => {
    const arm = jest.fn().mockResolvedValue({ sessionId: 's1', studyRunId: 'r1' });
    const result = await runCanaryLiveWindowActivationCoordinatorTick({
      config,
      ongoingTrips: [canaryTrip()],
      completedTrips: [],
      ledgerByTripId: new Map(),
      activeBlockingSessionByVehicleId: new Map(),
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
      activeBlockingSessionByVehicleId: new Map(),
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
      activeBlockingSessionByVehicleId: new Map(),
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
      activeBlockingSessionByVehicleId: new Map(),
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
      activeBlockingSessionByVehicleId: new Map(),
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
      activeBlockingSessionByVehicleId: new Map([
        [EXP021_CANARY_LIVE_WINDOW_CANARY.vehicleId, 'foreign-session'],
      ]),
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
      buildCanaryLiveWindowActivationConfig({
        enabled: false,
        activationNotBeforeIso: '2026-09-18T13:00:00.000Z',
        cohort: null,
      }),
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
      activeBlockingSessionByVehicleId: new Map(),
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
      activeBlockingSessionByVehicleId: new Map([
        [EXP021_CANARY_LIVE_WINDOW_CANARY.vehicleId, 's1'],
      ]),
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
      activeBlockingSessionByVehicleId: new Map(),
      ports: { armOngoingTrip: jest.fn(), finalizeCompletedTrip: finalize },
    });
    expect(result.finalizedTripIds).toEqual([]);
    expect(result.skippedReasons[0]?.reason).toBe('NO_LEDGER_MISS_NO_BACKFILL');
    expect(finalize).not.toHaveBeenCalled();
  });

  it('multi-vehicle — three cohort trips arm independently', async () => {
    const cohort = buildExp021CanaryCohortAuthority([...EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE])!;
    const multiConfig = buildCanaryLiveWindowActivationConfig({
      enabled: true,
      activationNotBeforeIso: new Date(T0_MS).toISOString(),
      cohort,
    })!;
    const arm = jest
      .fn()
      .mockResolvedValueOnce({ sessionId: 's-mx', studyRunId: 'r-mx' })
      .mockResolvedValueOnce({ sessionId: 's-ms', studyRunId: 'r-ms' })
      .mockResolvedValueOnce({ sessionId: 's-wob', studyRunId: 'r-wob' });
    const trips = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE.map((m, index) =>
      canaryTrip({
        tripId: `trip-${index}`,
        vehicleId: m.vehicleId,
        tokenId: m.tokenId,
        organizationId: m.organizationId,
      }),
    );
    const result = await runCanaryLiveWindowActivationCoordinatorTick({
      config: multiConfig,
      ongoingTrips: trips,
      completedTrips: [],
      ledgerByTripId: new Map(),
      activeBlockingSessionByVehicleId: new Map(),
      ports: { armOngoingTrip: arm, finalizeCompletedTrip: jest.fn() },
    });
    expect(result.armedTripIds).toHaveLength(3);
    expect(arm).toHaveBeenCalledTimes(3);
  });

  it('forensic first live trip is never armed', async () => {
    const arm = jest.fn();
    const result = await runCanaryLiveWindowActivationCoordinatorTick({
      config,
      ongoingTrips: [
        canaryTrip({ tripId: EXP021_FIRST_LIVE_FORENSIC_VEHICLE_TRIP_ID }),
      ],
      completedTrips: [],
      ledgerByTripId: new Map(),
      activeBlockingSessionByVehicleId: new Map(),
      ports: { armOngoingTrip: arm, finalizeCompletedTrip: jest.fn() },
    });
    expect(result.armedTripIds).toEqual([]);
    expect(result.skippedReasons[0]?.reason).toBe('NON_CANARY_TOKEN_OR_VEHICLE');
    expect(arm).not.toHaveBeenCalled();
  });

  it('vehicle A blocking session does not block vehicle B arm', async () => {
    const cohort = buildExp021CanaryCohortAuthority([...EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE])!;
    const multiConfig = buildCanaryLiveWindowActivationConfig({
      enabled: true,
      activationNotBeforeIso: new Date(T0_MS).toISOString(),
      cohort,
    })!;
    const mx = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[0];
    const ms = EXP021_INITIAL_PRODUCTION_COHORT_REFERENCE[1];
    const arm = jest.fn().mockResolvedValue({ sessionId: 's-ms', studyRunId: 'r-ms' });
    const result = await runCanaryLiveWindowActivationCoordinatorTick({
      config: multiConfig,
      ongoingTrips: [
        canaryTrip({
          tripId: 'trip-ms',
          vehicleId: ms.vehicleId,
          tokenId: ms.tokenId,
          organizationId: ms.organizationId,
        }),
      ],
      completedTrips: [],
      ledgerByTripId: new Map(),
      activeBlockingSessionByVehicleId: new Map([[mx.vehicleId, 'blocking-mx-session']]),
      ports: { armOngoingTrip: arm, finalizeCompletedTrip: jest.fn() },
    });
    expect(result.armedTripIds).toEqual(['trip-ms']);
  });
});
