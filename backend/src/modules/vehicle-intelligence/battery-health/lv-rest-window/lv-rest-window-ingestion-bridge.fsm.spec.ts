import { TripDetectionState } from '@prisma/client';
import {
  BatteryChemistry,
  BatteryDriveProfile,
  LvRestWindowEventType,
  LvRestWindowState,
} from '../battery-v2-domain';
import { resolveBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import { buildLvRestWindowPolicyContext } from './lv-rest-window.policy';
import { reduceLvRestWindow } from './lv-rest-window.state-machine';
import { LvRestWindowIngestionBridgeService } from './lv-rest-window-ingestion-bridge.service';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2RestShadowEnabled: jest.fn().mockReturnValue(true),
}));

const ORG = 'org-1';
const VEHICLE = 'veh-ice-1';
const TRIP_END = new Date('2026-07-16T10:00:00.000Z');
const SNAPSHOT = new Date('2026-07-16T10:02:00.000Z');

function icePolicy() {
  return buildLvRestWindowPolicyContext(
    resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.LEAD_ACID,
      lvSignalPresent: true,
    }),
  );
}

describe('LvRestWindowIngestionBridgeService FSM integration', () => {
  const prisma: {
    vehicleTripDetectionState: { findUnique: jest.Mock };
    vehicle: { findUnique: jest.Mock };
  } = {
    vehicleTripDetectionState: {
      findUnique: jest.fn(),
    },
    vehicle: {
      findUnique: jest.fn(),
    },
  };

  const sessions: Map<string, any> = new Map();
  const idempotencyIndex = new Map<string, string>();

  const sessionRepo = {
    findOpenLvRestWindow: jest.fn(async (vehicleId: string) => {
      for (const row of sessions.values()) {
        if (
          row.vehicleId === vehicleId &&
          row.type === 'LV_REST_WINDOW' &&
          !['INVALID', 'COMPLETED', 'MISSED'].includes(row.status)
        ) {
          return row;
        }
      }
      return null;
    }),
    createIdempotent: jest.fn(async (input: any) => {
      const key = `${input.vehicleId}|${input.idempotencyKey}`;
      if (idempotencyIndex.has(key)) {
        return sessions.get(idempotencyIndex.get(key)!);
      }
      const row = {
        id: `session-${sessions.size + 1}`,
        metadata: input.metadata,
        status: input.status,
        ...input,
      };
      sessions.set(row.id, row);
      idempotencyIndex.set(key, row.id);
      return row;
    }),
    updateMutable: jest.fn(async ({ sessionId, ...data }: any) => {
      const row = sessions.get(sessionId);
      const updated = { ...row, ...data };
      sessions.set(sessionId, updated);
      return updated;
    }),
  };

  const policyProfiles = {
    resolveForVehicle: jest.fn().mockResolvedValue(
      resolveBatteryPolicy({
        driveProfile: BatteryDriveProfile.ICE,
        chemistry: BatteryChemistry.LEAD_ACID,
        lvSignalPresent: true,
      }),
    ),
  };

  const scheduleResult = {
    idempotencyKey: 'battery-rest:60m:test',
    scheduledFor: new Date('2026-07-16T11:00:00.000Z'),
    scheduled: true,
    bullJobId: 'bull-job-1',
  };

  const restTargetProducer = {
    scheduleRest60m: jest.fn().mockResolvedValue(scheduleResult),
    scheduleRest6h: jest.fn().mockResolvedValue({
      ...scheduleResult,
      idempotencyKey: 'battery-rest:6h:test',
    }),
    getRest60mDelayMs: jest.fn().mockReturnValue(3600000),
    buildScheduledTargetMetadata: jest.fn((result: typeof scheduleResult) => ({
      idempotencyKey: result.idempotencyKey,
      scheduledFor: result.scheduledFor.toISOString(),
      status: 'ENQUEUED',
      bullJobId: result.bullJobId,
    })),
  };

  const fsm = {
    buildSignalFromLatestState: jest.fn(),
    processEvent: jest.fn(),
  };

  let bridge: LvRestWindowIngestionBridgeService;
  let realFsm: any;

  beforeEach(async () => {
    sessions.clear();
    idempotencyIndex.clear();
    jest.clearAllMocks();

    const { LvRestWindowStateMachineService } = await import('./lv-rest-window.service');
    realFsm = new LvRestWindowStateMachineService(
      prisma as any,
      sessionRepo as any,
      policyProfiles as any,
      restTargetProducer as any,
      undefined,
    );

    fsm.buildSignalFromLatestState.mockImplementation(
      (vehicleId: string, overrides: Record<string, unknown> = {}) =>
        realFsm.buildSignalFromLatestState(vehicleId, overrides),
    );
    fsm.processEvent.mockImplementation(
      (organizationId: string, vehicleId: string, event: any) =>
        realFsm.processEvent(organizationId, vehicleId, event),
    );

    prisma.vehicleTripDetectionState.findUnique.mockResolvedValue({
      state: TripDetectionState.RESTING,
      lastActivityAt: TRIP_END,
      activeTripId: null,
    });

    prisma.vehicle.findUnique.mockResolvedValue({
      latestState: {
        speedKmh: 0,
        isIgnitionOn: false,
        engineLoad: 0,
        lvBatteryVoltage: 12.5,
        tractionBatteryIsCharging: false,
        tractionBatteryChargingPowerKw: 0,
        sourceTimestamp: SNAPSHOT,
        providerFetchedAt: SNAPSHOT,
      },
      tripDetectionState: {
        state: TripDetectionState.RESTING,
        activeTripId: null,
        lastActivityAt: TRIP_END,
      },
    });

    bridge = new LvRestWindowIngestionBridgeService(
      prisma as any,
      fsm as any,
      policyProfiles as any,
    );
  });

  it('opens LV_REST_WINDOW session on RESTING observation cycle (A)', async () => {
    await bridge.processObservationCycle(ORG, VEHICLE, {
      providerFetchedAt: SNAPSHOT.toISOString(),
      lvBatteryVoltage: 12.5,
      lvBatteryObservedAt: SNAPSHOT.toISOString(),
      tractionBatteryIsCharging: false,
    });

    expect(sessions.size).toBe(1);
    const session = [...sessions.values()][0];
    expect(session.type).toBe('LV_REST_WINDOW');
    expect(session.idempotencyKey).toBe(`lv-rest:${VEHICLE}:${TRIP_END.getTime()}`);
    expect(session.metadata.lvRestWindowState).toBe(LvRestWindowState.RESTING);
  });

  it('does not create duplicate sessions on repeated identical observation (D)', async () => {
    const ctx = {
      providerFetchedAt: SNAPSHOT.toISOString(),
      lvBatteryVoltage: 12.5,
      lvBatteryObservedAt: SNAPSHOT.toISOString(),
      tractionBatteryIsCharging: false,
    };

    await bridge.processObservationCycle(ORG, VEHICLE, ctx);
    await bridge.processObservationCycle(ORG, VEHICLE, ctx);

    expect(sessions.size).toBe(1);
    expect(sessionRepo.createIdempotent).toHaveBeenCalledTimes(1);
  });

  it('invalidates open window on high voltage (charging context) in later cycle (E/F)', async () => {
    const ctx = {
      providerFetchedAt: SNAPSHOT.toISOString(),
      lvBatteryVoltage: 12.5,
      lvBatteryObservedAt: SNAPSHOT.toISOString(),
      tractionBatteryIsCharging: false,
    };
    await bridge.processObservationCycle(ORG, VEHICLE, ctx);

    const wakeAt = new Date('2026-07-16T10:03:00.000Z');
    prisma.vehicle.findUnique.mockResolvedValue({
      latestState: {
        speedKmh: 0,
        isIgnitionOn: false,
        engineLoad: 0,
        lvBatteryVoltage: 14.1,
        tractionBatteryIsCharging: false,
        tractionBatteryChargingPowerKw: 0,
        sourceTimestamp: wakeAt,
        providerFetchedAt: wakeAt,
      },
      tripDetectionState: {
        state: TripDetectionState.RESTING,
        activeTripId: null,
        lastActivityAt: TRIP_END,
      },
    });

    await bridge.processObservationCycle(ORG, VEHICLE, {
      providerFetchedAt: wakeAt.toISOString(),
      lvBatteryVoltage: 14.1,
      lvBatteryObservedAt: wakeAt.toISOString(),
      tractionBatteryIsCharging: false,
    });

    const session = [...sessions.values()][0];
    expect(session.metadata.lvRestWindowState).toBe(LvRestWindowState.INVALIDATED);
    expect(session.metadata.invalidatedReason).toBe('charging_detected');
  });
});

describe('reduceLvRestWindow duplicate safety (bridge relies on FSM)', () => {
  it('duplicate TRIP_ENDED does not change state', () => {
    const opened = reduceLvRestWindow(
      VEHICLE,
      null,
      {
        type: LvRestWindowEventType.TRIP_ENDED,
        at: TRIP_END,
        signal: {
          observedAt: TRIP_END,
          providerObservedAt: TRIP_END,
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
        },
      },
      icePolicy(),
    );

    const duplicate = reduceLvRestWindow(
      VEHICLE,
      opened.current,
      {
        type: LvRestWindowEventType.TRIP_ENDED,
        at: SNAPSHOT,
        signal: {
          observedAt: SNAPSHOT,
          providerObservedAt: SNAPSHOT,
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
        },
      },
      icePolicy(),
    );

    expect(duplicate.changed).toBe(false);
    expect(duplicate.reason).toBe('duplicate_trip_end_event');
  });
});
