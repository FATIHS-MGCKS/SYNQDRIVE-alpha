import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import {
  BatteryV2SnapshotObservationProducer,
  buildBatteryObservationSnapshotContext,
} from './battery-v2-snapshot-observation.producer';
import { BatteryV2TripStartProducer } from './battery-v2-trip-start.producer';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { isDeterministicBatteryV2JobId } from './battery-v2-job-queue.util';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const TRIP = 'cltrip123456789012345678901';

function baseBatteryMap() {
  const observedAt = new Date('2026-07-16T12:00:00.000Z');
  const field = (value: number) => ({
    dimoSignalName: 'x',
    value,
    sourceUnit: 'percent' as const,
    targetUnit: 'percent',
    status: 'valid' as const,
    observedAt,
  });
  const boolField = (value: boolean) => ({
    dimoSignalName: 'x',
    value,
    status: 'valid' as const,
    observedAt,
  });
  return {
    collectionLastSeenAt: observedAt,
    lvBatteryVoltage: {
      dimoSignalName: 'lowVoltageBatteryCurrentVoltage',
      value: 12.5,
      sourceUnit: 'V' as const,
      targetUnit: 'V',
      status: 'valid' as const,
      observedAt,
    },
    evSoc: field(72),
    tractionBatteryCurrentEnergyKwh: field(40),
    tractionBatterySohPercent: field(95),
    tractionBatteryPowerKw: field(0),
    tractionBatteryChargingPowerKw: field(0),
    tractionBatteryAddedEnergyKwh: field(0),
    tractionBatteryChargeLimitPercent: field(80),
    tractionBatteryCurrentVoltage: field(400),
    tractionBatteryTemperatureC: field(22),
    tractionBatteryGrossCapacityKwh: field(60),
    tractionBatteryIsCharging: boolField(false),
    tractionBatteryChargingCableConnected: boolField(false),
  };
}

describe('BatteryV2SnapshotObservationProducer', () => {
  const prisma = {
    hvBatteryHealthSnapshot: { findFirst: jest.fn() },
    batteryHealthSnapshot: { findFirst: jest.fn() },
  };
  const queueAdd = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
    prisma.hvBatteryHealthSnapshot.findFirst.mockResolvedValue(null);
    prisma.batteryHealthSnapshot.findFirst.mockResolvedValue(null);
    queueAdd.mockResolvedValue({ id: 'job-1' });
  });

  it('enqueues classify job for first HV observation', async () => {
    const producerSvc = new BatteryV2JobProducerService({
      add: queueAdd,
      getJob: jest.fn().mockResolvedValue(null),
    } as any);
    const producer = new BatteryV2SnapshotObservationProducer(
      prisma as any,
      producerSvc,
    );

    const receivedAt = new Date('2026-07-16T12:00:00.000Z');
    const normalized = {
      lvBatteryVoltage: 12.5,
      evSoc: 72,
      tractionBatteryCurrentEnergyKwh: 40,
      tractionBatterySohPercent: 95,
      tractionBatteryPowerKw: 0,
      tractionBatteryChargingPowerKw: 0,
      tractionBatteryAddedEnergyKwh: 0,
      tractionBatteryChargeLimitPercent: 80,
      tractionBatteryIsCharging: false,
      tractionBatteryChargingCableConnected: false,
      tractionBatteryTemperatureC: 22,
      tractionBatteryGrossCapacityKwh: 60,
      rangeKm: 300,
      odometerKm: 12000,
    };

    const jobId = await producer.classifyAndEnqueue({
      organizationId: ORG,
      vehicleId: VEH,
      receivedAt,
      normalized,
      batteryMap: baseBatteryMap() as any,
      lvBatteryObservedAt: receivedAt,
    });

    expect(jobId).toContain('battery-v2:');
    expect(queueAdd).toHaveBeenCalledTimes(1);
    const [jobType, payload, opts] = queueAdd.mock.calls[0];
    expect(jobType).toBe('BATTERY_OBSERVATION_CLASSIFY');
    expect(payload.organizationId).toBe(ORG);
    expect(payload.snapshotContext?.evSoc).toBe(72);
    expect(isDeterministicBatteryV2JobId(payload.idempotencyKey, opts.jobId)).toBe(true);
  });

  it('does not enqueue duplicate snapshot observation for unchanged poll', async () => {
    const observedAt = new Date('2026-07-16T12:00:00.000Z');
    prisma.hvBatteryHealthSnapshot.findFirst.mockResolvedValue({
      socPercent: 72,
      energyUsedKwh: 40,
      energyObservedAt: observedAt,
      isCharging: false,
      chargingCableConnected: false,
      providerSohPercent: 95,
      recordedAt: observedAt,
      providerReceivedAt: observedAt,
      idempotencyKey: 'existing-key',
    });
    prisma.batteryHealthSnapshot.findFirst.mockResolvedValue({
      recordedAt: observedAt,
      voltageV: 12.5,
    });

    const producerSvc = new BatteryV2JobProducerService({
      add: queueAdd,
      getJob: jest.fn().mockResolvedValue(null),
    } as any);
    const producer = new BatteryV2SnapshotObservationProducer(
      prisma as any,
      producerSvc,
    );

    const normalized = {
      lvBatteryVoltage: 12.5,
      evSoc: 72,
      tractionBatteryCurrentEnergyKwh: 40,
      tractionBatterySohPercent: 95,
      tractionBatteryPowerKw: 0,
      tractionBatteryChargingPowerKw: 0,
      tractionBatteryAddedEnergyKwh: 0,
      tractionBatteryChargeLimitPercent: 80,
      tractionBatteryIsCharging: false,
      tractionBatteryChargingCableConnected: false,
      tractionBatteryTemperatureC: 22,
      tractionBatteryGrossCapacityKwh: 60,
      rangeKm: 300,
      odometerKm: 12000,
    };

    const result = await producer.classifyAndEnqueue({
      organizationId: ORG,
      vehicleId: VEH,
      receivedAt: observedAt,
      normalized,
      batteryMap: baseBatteryMap() as any,
      lvBatteryObservedAt: observedAt,
    });

    expect(result).toBeNull();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('suppresses duplicate enqueue when BullMQ job id already exists', async () => {
    let seenJobId: string | null = null;
    const queue = {
      getJob: jest.fn().mockImplementation(async (jobId: string) => {
        if (jobId === seenJobId) {
          return { getState: async () => 'delayed' };
        }
        seenJobId = jobId;
        return null;
      }),
      add: queueAdd,
    };
    const producerSvc = new BatteryV2JobProducerService(queue as any);
    const producer = new BatteryV2SnapshotObservationProducer(prisma as any, producerSvc);

    const receivedAt = new Date('2026-07-16T12:00:00.000Z');
    const first = await producer.classifyAndEnqueue({
      organizationId: ORG,
      vehicleId: VEH,
      receivedAt,
      normalized: {
        lvBatteryVoltage: 12.5,
        evSoc: 72,
        tractionBatteryCurrentEnergyKwh: 40,
        tractionBatterySohPercent: 95,
        tractionBatteryPowerKw: 0,
        tractionBatteryChargingPowerKw: 0,
        tractionBatteryAddedEnergyKwh: 0,
        tractionBatteryChargeLimitPercent: 80,
        tractionBatteryIsCharging: false,
        tractionBatteryChargingCableConnected: false,
        tractionBatteryTemperatureC: 22,
        tractionBatteryGrossCapacityKwh: 60,
        rangeKm: 300,
        odometerKm: 12000,
      },
      batteryMap: baseBatteryMap() as any,
      lvBatteryObservedAt: receivedAt,
    });

    const second = await producer.classifyAndEnqueue({
      organizationId: ORG,
      vehicleId: VEH,
      receivedAt,
      normalized: {
        lvBatteryVoltage: 12.5,
        evSoc: 72,
        tractionBatteryCurrentEnergyKwh: 40,
        tractionBatterySohPercent: 95,
        tractionBatteryPowerKw: 0,
        tractionBatteryChargingPowerKw: 0,
        tractionBatteryAddedEnergyKwh: 0,
        tractionBatteryChargeLimitPercent: 80,
        tractionBatteryIsCharging: false,
        tractionBatteryChargingCableConnected: false,
        tractionBatteryTemperatureC: 22,
        tractionBatteryGrossCapacityKwh: 60,
        rangeKm: 300,
        odometerKm: 12000,
      },
      batteryMap: baseBatteryMap() as any,
      lvBatteryObservedAt: receivedAt,
    });

    expect(first).toBeTruthy();
    expect(second).toBe(first);
    expect(queueAdd).toHaveBeenCalledTimes(1);
  });

  it('suppresses parallel duplicate enqueue for same idempotency key', async () => {
    let seenJobId: string | null = null;
    const queueAdd = jest.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { id: 'job-parallel' };
    });
    const queue = {
      getJob: jest.fn().mockImplementation(async (jobId: string) => {
        if (jobId === seenJobId) {
          return { getState: async () => 'waiting' };
        }
        seenJobId = jobId;
        return null;
      }),
      add: queueAdd,
    };
    const producerSvc = new BatteryV2JobProducerService(queue as any);
    const producer = new BatteryV2SnapshotObservationProducer(prisma as any, producerSvc);

    const receivedAt = new Date('2026-07-16T12:00:00.000Z');
    const input = {
      organizationId: ORG,
      vehicleId: VEH,
      receivedAt,
      normalized: {
        lvBatteryVoltage: 12.5,
        evSoc: 72,
        tractionBatteryCurrentEnergyKwh: 40,
        tractionBatterySohPercent: 95,
        tractionBatteryPowerKw: 0,
        tractionBatteryChargingPowerKw: 0,
        tractionBatteryAddedEnergyKwh: 0,
        tractionBatteryChargeLimitPercent: 80,
        tractionBatteryIsCharging: false,
        tractionBatteryChargingCableConnected: false,
        tractionBatteryTemperatureC: 22,
        tractionBatteryGrossCapacityKwh: 60,
        rangeKm: 300,
        odometerKm: 12000,
      },
      batteryMap: baseBatteryMap() as any,
      lvBatteryObservedAt: receivedAt,
    };

    const results = await Promise.all([
      producer.classifyAndEnqueue(input),
      producer.classifyAndEnqueue(input),
    ]);

    expect(results[0]).toBeTruthy();
    expect(results[1]).toBe(results[0]);
    expect(queueAdd).toHaveBeenCalledTimes(1);
  });
});

describe('BatteryV2TripStartProducer', () => {
  beforeEach(() => {
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
  });

  it('enqueues exactly one delayed start-proxy job per trip id', async () => {
    let seenJobId: string | null = null;
    const queueAdd = jest.fn().mockResolvedValue({ id: 'job-2' });
    const queue = {
      getJob: jest.fn().mockImplementation(async (jobId: string) => {
        if (jobId === seenJobId) {
          return { getState: async () => 'delayed' };
        }
        seenJobId = jobId;
        return null;
      }),
      add: queueAdd,
    };
    const jobProducer = new BatteryV2JobProducerService(queue as any);
    const tripProducer = new BatteryV2TripStartProducer(jobProducer);

    const prev = process.env.BATTERY_V2_START_PROXY_ENABLED;
    const prevCrank = process.env.BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED;
    process.env.BATTERY_V2_START_PROXY_ENABLED = 'true';
    process.env.BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED = 'false';

    const startedAt = new Date('2026-07-16T12:05:00.000Z');
    const first = await tripProducer.enqueueStartProxy({
      organizationId: ORG,
      vehicleId: VEH,
      tripId: TRIP,
      tripStartedAt: startedAt,
    });
    const second = await tripProducer.enqueueStartProxy({
      organizationId: ORG,
      vehicleId: VEH,
      tripId: TRIP,
      tripStartedAt: startedAt,
    });

    const expectedKey = `start-proxy:1.0.0:trip:${TRIP}`;
    expect(first).toBe(`battery-v2:${expectedKey}`);
    expect(second).toBe(first);
    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueAdd.mock.calls[0][2].delay).toBeGreaterThan(0);
    expect(queueAdd.mock.calls[0][1].idempotencyKey).toBe(expectedKey);

    process.env.BATTERY_V2_START_PROXY_ENABLED = prev;
    process.env.BATTERY_V2_LEGACY_CRANK_ASSESSMENT_ENABLED = prevCrank;
  });
});

describe('buildBatteryObservationSnapshotContext', () => {
  it('serializes provider telemetry without PII', () => {
    const receivedAt = new Date('2026-07-16T12:00:00.000Z');
    const ctx = buildBatteryObservationSnapshotContext({
      receivedAt,
      normalized: {
        lvBatteryVoltage: 12.4,
        evSoc: 70,
        tractionBatteryCurrentEnergyKwh: 38,
        tractionBatterySohPercent: 94,
        tractionBatteryPowerKw: 1,
        tractionBatteryChargingPowerKw: 0,
        tractionBatteryAddedEnergyKwh: 0,
        tractionBatteryChargeLimitPercent: 80,
        tractionBatteryIsCharging: false,
        tractionBatteryChargingCableConnected: false,
        tractionBatteryTemperatureC: 21,
        tractionBatteryGrossCapacityKwh: 58,
        rangeKm: 280,
        odometerKm: 1000,
      },
      batteryMap: baseBatteryMap() as any,
      lvBatteryObservedAt: receivedAt,
    });
    expect(ctx.providerFetchedAt).toBe(receivedAt.toISOString());
    expect(ctx.evSoc).toBe(70);
    expect((ctx as any).email).toBeUndefined();
  });
});
