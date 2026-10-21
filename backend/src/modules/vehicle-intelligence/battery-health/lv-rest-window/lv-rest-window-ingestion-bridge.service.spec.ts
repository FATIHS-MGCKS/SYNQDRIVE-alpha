import { TripDetectionState } from '@prisma/client';
import { LvRestWindowEventType } from '../battery-v2-domain';
import { LvRestWindowIngestionBridgeService } from './lv-rest-window-ingestion-bridge.service';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2RestShadowEnabled: jest.fn(),
}));

const { isBatteryV2RestShadowEnabled } = jest.requireMock(
  '@config/battery-health-v2.config',
) as { isBatteryV2RestShadowEnabled: jest.Mock };

const ORG = 'org-1';
const VEHICLE = 'veh-1';
const TRIP_END = new Date('2026-07-16T10:00:00.000Z');
const OBSERVED = new Date('2026-07-16T10:02:00.000Z');

function baseSignal() {
  return {
    observedAt: OBSERVED,
    providerObservedAt: OBSERVED,
    providerError: false,
    speedKmh: 0,
    ignitionOn: false,
    engineRunning: false,
    hasActiveTrip: false,
    isLvCharging: false,
    isHvCharging: false,
    lvVoltage: 12.5,
    lastActivityAt: TRIP_END,
    tripEndAt: TRIP_END,
    tripId: null,
  };
}

function baseCtx() {
  return {
    providerFetchedAt: OBSERVED.toISOString(),
    lvBatteryVoltage: 12.5,
    lvBatteryObservedAt: OBSERVED.toISOString(),
    tractionBatteryIsCharging: false,
  };
}

describe('LvRestWindowIngestionBridgeService', () => {
  const prisma = {
    vehicleTripDetectionState: {
      findUnique: jest.fn(),
    },
    vehicleTrip: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const fsm = {
    buildSignalFromLatestState: jest.fn(),
    processEvent: jest.fn(),
  };
  const sessionArming = {
    ensureLvRestWindowForFinalizedTrip: jest.fn(),
  };
  const policyProfiles = {
    resolveForVehicle: jest.fn().mockResolvedValue({
      lvAssessmentAllowed: true,
      supportedMeasurementTypes: ['REST_60M', 'REST_6H'],
      minimumContext: { restRequiresEngineOff: true },
      restingBands: { maxRestingV: 13.2 },
    }),
  };

  let bridge: LvRestWindowIngestionBridgeService;

  beforeEach(() => {
    jest.clearAllMocks();
    isBatteryV2RestShadowEnabled.mockReturnValue(true);
    fsm.buildSignalFromLatestState.mockResolvedValue(baseSignal());
    fsm.processEvent.mockResolvedValue({ changed: true });
    prisma.vehicleTripDetectionState.findUnique.mockResolvedValue({
      state: TripDetectionState.RESTING,
      lastActivityAt: TRIP_END,
      activeTripId: null,
    });
    // No canonical finalized trip for the anchor by default → legacy
    // direct TRIP_ENDED emission path (anchor without trip linkage).
    prisma.vehicleTrip.findMany.mockResolvedValue([]);
    sessionArming.ensureLvRestWindowForFinalizedTrip.mockResolvedValue({
      outcome: 'opened',
      reason: 'opened_candidate',
    });
    bridge = new LvRestWindowIngestionBridgeService(
      prisma as any,
      fsm as any,
      policyProfiles as any,
      sessionArming as any,
    );
  });

  it('does not invoke FSM when rest shadow flag is disabled (J)', async () => {
    isBatteryV2RestShadowEnabled.mockReturnValue(false);

    await bridge.processObservationCycle(ORG, VEHICLE, baseCtx());

    expect(fsm.buildSignalFromLatestState).not.toHaveBeenCalled();
    expect(fsm.processEvent).not.toHaveBeenCalled();
  });

  it('derives internal TRIP_ENDED from RESTING det state and opens window (A)', async () => {
    await bridge.processObservationCycle(ORG, VEHICLE, baseCtx());

    const tripEndedCall = fsm.processEvent.mock.calls.find(
      ([, , event]) => event.type === LvRestWindowEventType.TRIP_ENDED,
    );
    expect(tripEndedCall).toBeDefined();
    expect(tripEndedCall![2].signal.lastActivityAt).toEqual(TRIP_END);
    expect(tripEndedCall![2].signal.tripEndAt).toEqual(TRIP_END);
    expect(tripEndedCall![2].signal.hasActiveTrip).toBe(false);
  });

  it('processes TRIP_ENDED before REST_SNAPSHOT in the same cycle (B)', async () => {
    await bridge.processObservationCycle(ORG, VEHICLE, baseCtx());

    const eventTypes = fsm.processEvent.mock.calls.map(([, , event]) => event.type);
    const tripEndedIdx = eventTypes.indexOf(LvRestWindowEventType.TRIP_ENDED);
    const snapshotIdx = eventTypes.indexOf(LvRestWindowEventType.REST_SNAPSHOT);
    expect(tripEndedIdx).toBeGreaterThanOrEqual(0);
    expect(snapshotIdx).toBeGreaterThan(tripEndedIdx);
  });

  it('skips TRIP_ENDED when det state is not RESTING (C)', async () => {
    prisma.vehicleTripDetectionState.findUnique.mockResolvedValue({
      state: TripDetectionState.ACTIVE_TRIP,
      lastActivityAt: TRIP_END,
      activeTripId: 'trip-1',
    });
    fsm.buildSignalFromLatestState.mockResolvedValue({
      ...baseSignal(),
      hasActiveTrip: true,
    });

    await bridge.processObservationCycle(ORG, VEHICLE, baseCtx());

    const tripEndedCall = fsm.processEvent.mock.calls.find(
      ([, , event]) => event.type === LvRestWindowEventType.TRIP_ENDED,
    );
    expect(tripEndedCall).toBeUndefined();
    expect(
      fsm.processEvent.mock.calls.some(
        ([, , event]) => event.type === LvRestWindowEventType.NEW_TRIP_STARTED,
      ),
    ).toBe(true);
  });

  it('does not emit REST_SNAPSHOT without plausible LV voltage (C)', async () => {
    await bridge.processObservationCycle(ORG, VEHICLE, {
      ...baseCtx(),
      lvBatteryVoltage: null,
    });

    expect(
      fsm.processEvent.mock.calls.some(
        ([, , event]) => event.type === LvRestWindowEventType.REST_SNAPSHOT,
      ),
    ).toBe(false);
  });

  it('repeated observation cycles call TRIP_ENDED with same anchor (D)', async () => {
    await bridge.processObservationCycle(ORG, VEHICLE, baseCtx());
    await bridge.processObservationCycle(ORG, VEHICLE, baseCtx());

    const tripEndedCalls = fsm.processEvent.mock.calls.filter(
      ([, , event]) => event.type === LvRestWindowEventType.TRIP_ENDED,
    );
    expect(tripEndedCalls).toHaveLength(2);
    expect(tripEndedCalls[0][2].signal.lastActivityAt).toEqual(TRIP_END);
    expect(tripEndedCalls[1][2].signal.lastActivityAt).toEqual(TRIP_END);
  });

  it('emits WAKE_DETECTED when wake voltage present (E)', async () => {
    fsm.buildSignalFromLatestState.mockResolvedValue({
      ...baseSignal(),
      lvVoltage: 14.1,
    });

    await bridge.processObservationCycle(ORG, VEHICLE, {
      ...baseCtx(),
      lvBatteryVoltage: 14.1,
    });

    expect(
      fsm.processEvent.mock.calls.some(
        ([, , event]) => event.type === LvRestWindowEventType.WAKE_DETECTED,
      ),
    ).toBe(true);
  });

  it('emits CHARGING_DETECTED when charging context present (F)', async () => {
    fsm.buildSignalFromLatestState.mockResolvedValue({
      ...baseSignal(),
      isHvCharging: true,
    });

    await bridge.processObservationCycle(ORG, VEHICLE, {
      ...baseCtx(),
      tractionBatteryIsCharging: true,
    });

    expect(
      fsm.processEvent.mock.calls.some(
        ([, , event]) => event.type === LvRestWindowEventType.CHARGING_DETECTED,
      ),
    ).toBe(true);
  });

  it('emits NEW_TRIP_STARTED when active trip is present (G)', async () => {
    fsm.buildSignalFromLatestState.mockResolvedValue({
      ...baseSignal(),
      hasActiveTrip: true,
    });
    prisma.vehicleTripDetectionState.findUnique.mockResolvedValue({
      state: TripDetectionState.ACTIVE_TRIP,
      lastActivityAt: TRIP_END,
      activeTripId: 'trip-1',
    });

    await bridge.processObservationCycle(ORG, VEHICLE, baseCtx());

    expect(
      fsm.processEvent.mock.calls.some(
        ([, , event]) => event.type === LvRestWindowEventType.NEW_TRIP_STARTED,
      ),
    ).toBe(true);
  });

  it('converges on canonical session arming when a finalized trip matches the anchor', async () => {
    prisma.vehicleTrip.findMany.mockResolvedValue([{ id: 'trip-fin-1', endTime: TRIP_END }]);

    await bridge.processObservationCycle(ORG, VEHICLE, baseCtx());

    expect(sessionArming.ensureLvRestWindowForFinalizedTrip).toHaveBeenCalledWith({
      organizationId: ORG,
      vehicleId: VEHICLE,
      tripId: 'trip-fin-1',
    });
    // No parallel direct TRIP_ENDED emission when the canonical opener runs.
    expect(
      fsm.processEvent.mock.calls.some(
        ([, , event]) => event.type === LvRestWindowEventType.TRIP_ENDED,
      ),
    ).toBe(false);
  });

  it('binds the closest completed trip when multiple trips fall inside ±120s (Phase 4)', async () => {
    const anchor = TRIP_END;
    const closerTripId = 'trip-closer';
    const fartherTripId = 'trip-farther';
    prisma.vehicleTrip = {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([
        {
          id: fartherTripId,
          endTime: new Date(anchor.getTime() + 90_000),
        },
        {
          id: closerTripId,
          endTime: new Date(anchor.getTime() + 5_000),
        },
      ]),
    };
    bridge = new LvRestWindowIngestionBridgeService(
      prisma as any,
      fsm as any,
      policyProfiles as any,
      sessionArming as any,
    );

    await bridge.processObservationCycle(ORG, VEHICLE, baseCtx());

    expect(sessionArming.ensureLvRestWindowForFinalizedTrip).toHaveBeenCalledWith(
      expect.objectContaining({ tripId: closerTripId }),
    );
  });

  it('reads trip detection state only (H)', async () => {
    await bridge.processObservationCycle(ORG, VEHICLE, baseCtx());

    expect(prisma.vehicleTripDetectionState.findUnique).toHaveBeenCalledWith({
      where: { vehicleId: VEHICLE },
      select: { state: true, lastActivityAt: true, activeTripId: true },
    });
    const detStateModel = prisma.vehicleTripDetectionState as Record<string, unknown>;
    expect(detStateModel.update).toBeUndefined();
    expect(detStateModel.upsert).toBeUndefined();
  });
});
