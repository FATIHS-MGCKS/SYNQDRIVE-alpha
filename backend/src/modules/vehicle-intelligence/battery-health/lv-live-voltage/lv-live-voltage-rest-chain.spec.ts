import {
  BatteryMeasurementQuality,
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
} from '@prisma/client';
import { BatteryRestTargetEvaluationService } from '../lv-rest-window/battery-rest-target-evaluation.service';
import { LvLiveVoltageIngestionService } from './lv-live-voltage-ingestion.service';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const SESSION = 'clsess123456789012345678901';

describe('LIVE_VOLTAGE → REST target evaluation chain', () => {
  const prisma = {
    batteryMeasurement: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    batteryHealthSnapshot: {
      findFirst: jest.fn(),
    },
    vehicle: {
      findUnique: jest.fn(),
    },
    vehicleTrip: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const measurementRepo = {
    createIdempotent: jest.fn(),
    findExisting: jest.fn().mockResolvedValue(null),
  };

  const policyProfiles = {
    resolveForVehicle: jest.fn().mockResolvedValue({
      driveProfile: 'ICE_LEAD_ACID',
      chemistry: 'LEAD_ACID',
      lvAssessmentAllowed: true,
      supportedMeasurementTypes: [
        BatteryMeasurementType.LIVE_VOLTAGE,
        BatteryMeasurementType.REST_60M,
        BatteryMeasurementType.REST_6H,
      ],
      forbiddenMeasurementTypes: [],
      restingBands: { maxRestingV: 13.2 },
      minimumContext: { restRequiresEngineOff: true },
    }),
  };

  const measurements = {
    create: jest.fn(),
  };

  let liveVoltage: LvLiveVoltageIngestionService;
  let restEval: BatteryRestTargetEvaluationService;

  const restWindowStartedAt = new Date('2026-08-26T10:00:00.000Z');
  const lvObservedAt = new Date('2026-08-26T11:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    liveVoltage = new LvLiveVoltageIngestionService(
      prisma as never,
      measurements as never,
    );
    restEval = new BatteryRestTargetEvaluationService(
      prisma as never,
      {
        create: (cmd: unknown) => measurements.create(cmd),
      } as never,
      policyProfiles as never,
    );

    prisma.batteryMeasurement.findFirst.mockResolvedValue(null);
    prisma.batteryHealthSnapshot.findFirst.mockResolvedValue(null);
    prisma.vehicle.findUnique.mockResolvedValue({
      latestState: {
        speedKmh: 0,
        isIgnitionOn: false,
        engineLoad: 0,
        tractionBatteryIsCharging: false,
        tractionBatteryChargingPowerKw: 0,
      },
      tripDetectionState: { activeTripId: null, lastActivityAt: restWindowStartedAt },
    });

    const liveMeasurement = {
      id: 'live-meas-1',
      observedAt: lvObservedAt,
      numericValue: 12.41,
      providerTimestamp: lvObservedAt,
      context: {
        speedKmh: 0,
        ignitionOn: false,
        engineRunning: false,
        hasActiveTrip: false,
        isLvCharging: false,
        isHvCharging: false,
        providerObservationOutcome: 'NEW_OBSERVATION',
      },
      provenance: {},
    };

    measurements.create.mockImplementation(async (cmd: { type: BatteryMeasurementType }) => {
      if (cmd.type === BatteryMeasurementType.LIVE_VOLTAGE) {
        return { id: 'live-meas-1' };
      }
      return { id: 'rest-meas-1' };
    });

    prisma.batteryMeasurement.findMany.mockResolvedValue([
      {
        id: 'live-meas-1',
        observedAt: lvObservedAt,
        numericValue: 12.41,
        providerTimestamp: lvObservedAt,
        context: liveMeasurement.context,
        provenance: {},
      },
    ]);
  });

  it('LIVE_VOLTAGE candidates feed REST_60M evaluation', async () => {
    await liveVoltage.persistFromObservationClassify({
      organizationId: ORG,
      vehicleId: VEH,
      idempotencyKey: 'obs-1',
      snapshotContext: {
        providerFetchedAt: '2026-08-26T11:00:08.000Z',
        lvBatteryVoltage: 12.41,
        lvBatteryObservedAt: lvObservedAt.toISOString(),
      },
    } as never);

    const result = await restEval.evaluateAndPersist({
      organizationId: ORG,
      vehicleId: VEH,
      session: {
        id: SESSION,
        organizationId: ORG,
        vehicleId: VEH,
        type: BatteryMeasurementSessionType.LV_REST_WINDOW,
        status: BatteryMeasurementSessionStatus.ACTIVE,
        startedAt: restWindowStartedAt,
      } as never,
      restTargetType: 'REST_60M',
      now: new Date('2026-08-26T11:00:30.000Z'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sourceObservationId).toBe('live-meas-1');
      expect(result.quality).toBe(BatteryMeasurementQuality.VALID);
    }

    expect(prisma.batteryMeasurement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG,
          vehicleId: VEH,
          type: BatteryMeasurementType.LIVE_VOLTAGE,
        }),
      }),
    );
  });

  it('LIVE_VOLTAGE candidates feed REST_6H evaluation', async () => {
    const rest6hObservedAt = new Date('2026-08-26T16:00:00.000Z');
    const rest6hContext = {
      speedKmh: 0,
      ignitionOn: false,
      engineRunning: false,
      hasActiveTrip: false,
      isLvCharging: false,
      isHvCharging: false,
      providerObservationOutcome: 'NEW_OBSERVATION',
    };

    prisma.vehicle.findUnique.mockResolvedValue({
      latestState: {
        speedKmh: 0,
        isIgnitionOn: false,
        engineLoad: 0,
        tractionBatteryIsCharging: false,
        tractionBatteryChargingPowerKw: 0,
      },
      tripDetectionState: {
        activeTripId: null,
        lastActivityAt: restWindowStartedAt,
      },
    });

    prisma.batteryMeasurement.findMany.mockResolvedValue([
      {
        id: 'live-meas-6h',
        observedAt: rest6hObservedAt,
        numericValue: 12.39,
        providerTimestamp: rest6hObservedAt,
        context: rest6hContext,
        provenance: {},
      },
    ]);

    await liveVoltage.persistFromObservationClassify({
      organizationId: ORG,
      vehicleId: VEH,
      idempotencyKey: 'obs-6h',
      snapshotContext: {
        providerFetchedAt: '2026-08-26T16:00:08.000Z',
        lvBatteryVoltage: 12.39,
        lvBatteryObservedAt: rest6hObservedAt.toISOString(),
      },
    } as never);

    const result = await restEval.evaluateAndPersist({
      organizationId: ORG,
      vehicleId: VEH,
      session: {
        id: SESSION,
        organizationId: ORG,
        vehicleId: VEH,
        type: BatteryMeasurementSessionType.LV_REST_WINDOW,
        status: BatteryMeasurementSessionStatus.ACTIVE,
        startedAt: restWindowStartedAt,
      } as never,
      restTargetType: 'REST_6H',
      now: new Date('2026-08-26T16:00:30.000Z'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sourceObservationId).toBe('live-meas-6h');
      expect(result.quality).toBe(BatteryMeasurementQuality.VALID);
    }

    expect(prisma.batteryMeasurement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG,
          vehicleId: VEH,
          type: BatteryMeasurementType.LIVE_VOLTAGE,
        }),
      }),
    );
  });
});
