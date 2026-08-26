import { BatteryMeasurementQuality, BatteryMeasurementType } from '@prisma/client';
import { LvLiveVoltageIngestionService } from './lv-live-voltage-ingestion.service';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';

describe('LvLiveVoltageIngestionService', () => {
  const prisma = {
    batteryMeasurement: {
      findFirst: jest.fn(),
    },
    batteryHealthSnapshot: {
      findFirst: jest.fn(),
    },
    vehicle: {
      findUnique: jest.fn(),
    },
  };

  const measurements = {
    create: jest.fn(),
  };

  let service: LvLiveVoltageIngestionService;

  const basePayload = {
    organizationId: ORG,
    vehicleId: VEH,
    idempotencyKey: 'obs-key-1',
    snapshotContext: {
      providerFetchedAt: '2026-08-26T12:00:08.000Z',
      lvBatteryVoltage: 12.45,
      lvBatteryObservedAt: '2026-08-26T12:00:00.000Z',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LvLiveVoltageIngestionService(
      prisma as never,
      measurements as never,
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
      tripDetectionState: { activeTripId: null, lastActivityAt: null },
    });
    measurements.create.mockResolvedValue({ id: 'meas-live-1' });
  });

  it('persists LIVE_VOLTAGE for new provider observation', async () => {
    const result = await service.persistFromObservationClassify(basePayload as never);

    expect(result.persisted).toBe(true);
    expect(result.measurementId).toBe('meas-live-1');
    expect(measurements.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BatteryMeasurementType.LIVE_VOLTAGE,
        quality: BatteryMeasurementQuality.VALID,
        numericValue: 12.45,
        unit: 'V',
        signalName: 'lowVoltageBatteryCurrentVoltage',
      }),
    );
  });

  it('skips duplicate observation (idempotent)', async () => {
    prisma.batteryMeasurement.findFirst.mockResolvedValue({
      observedAt: new Date('2026-08-26T12:00:00.000Z'),
      numericValue: 12.45,
      receivedAt: new Date('2026-08-26T12:00:08.000Z'),
      idempotencyKey: 'existing',
    });

    const result = await service.persistFromObservationClassify(basePayload as never);

    expect(result.persisted).toBe(false);
    expect(result.skippedReason).toBe('DUPLICATE_OBSERVATION');
    expect(measurements.create).not.toHaveBeenCalled();
  });

  it('skips out-of-order older observation', async () => {
    prisma.batteryMeasurement.findFirst.mockResolvedValue({
      observedAt: new Date('2026-08-26T13:00:00.000Z'),
      numericValue: 12.5,
      receivedAt: new Date('2026-08-26T13:00:08.000Z'),
      idempotencyKey: 'existing',
    });

    const result = await service.persistFromObservationClassify(basePayload as never);

    expect(result.persisted).toBe(false);
    expect(result.skippedReason).toBe('OUT_OF_ORDER');
  });

  it('does not fabricate measurement when voltage missing', async () => {
    const result = await service.persistFromObservationClassify({
      ...basePayload,
      snapshotContext: {
        ...basePayload.snapshotContext,
        lvBatteryVoltage: null,
      },
    } as never);

    expect(result.persisted).toBe(false);
    expect(result.skippedReason).toBe('no_plausible_voltage');
  });

  it('rejects implausible voltage', async () => {
    const result = await service.persistFromObservationClassify({
      ...basePayload,
      snapshotContext: {
        ...basePayload.snapshotContext,
        lvBatteryVoltage: 8.5,
      },
    } as never);

    expect(result.persisted).toBe(false);
    expect(measurements.create).not.toHaveBeenCalled();
  });

  it('includes REST evaluation context on persisted measurement', async () => {
    await service.persistFromObservationClassify(basePayload as never);

    expect(measurements.create).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          speedKmh: 0,
          ignitionOn: false,
          hasActiveTrip: false,
          providerObservationOutcome: 'NEW_OBSERVATION',
        }),
      }),
    );
  });
});
