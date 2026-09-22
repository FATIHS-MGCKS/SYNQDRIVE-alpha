import {
  BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV,
  BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV,
} from '@config/battery-health-v2.config';
import { BatteryProviderLastStoredLiveVoltageResolver } from '../battery-provider-last-stored-live-voltage.resolver';
import { createBatteryV2JobProducer } from './battery-v2-job-producer.test-util';
import { BatteryV2SnapshotObservationProducer } from './battery-v2-snapshot-observation.producer';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { restoreProcessEnv } from '../testing/battery-v2-process-env.test-util';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';

function baseBatteryMap(lvObservedAt: Date) {
  const field = (value: number) => ({
    dimoSignalName: 'x',
    value,
    sourceUnit: 'percent' as const,
    targetUnit: 'percent',
    status: 'valid' as const,
    observedAt: lvObservedAt,
  });
  return {
    collectionLastSeenAt: lvObservedAt,
    lvBatteryVoltage: {
      dimoSignalName: 'lowVoltageBatteryCurrentVoltage',
      value: 14.126,
      sourceUnit: 'V' as const,
      targetUnit: 'V',
      status: 'valid' as const,
      observedAt: lvObservedAt,
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
    tractionBatteryIsCharging: {
      dimoSignalName: 'x',
      value: false,
      status: 'valid' as const,
      observedAt: lvObservedAt,
    },
    tractionBatteryChargingCableConnected: {
      dimoSignalName: 'x',
      value: false,
      status: 'valid' as const,
      observedAt: lvObservedAt,
    },
  };
}

function normalizedLv(voltage = 14.126) {
  return {
    lvBatteryVoltage: voltage,
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
}

function mockDeadLetters() {
  return { isDeadLetter: jest.fn().mockResolvedValue(false) };
}

function buildProducer(prisma: object, extras?: { gap?: { handleSuccessfulPollWithoutPersist: jest.Mock } }) {
  const queueAdd = jest.fn().mockResolvedValue({ id: 'job-1' });
  const producerSvc = createBatteryV2JobProducer(
    {
      add: queueAdd,
      getJob: jest.fn().mockResolvedValue(null),
    } as never,
    mockDeadLetters() as never,
  );
  const lastStored = new BatteryProviderLastStoredLiveVoltageResolver(prisma as never);
  const producer = new BatteryV2SnapshotObservationProducer(
    prisma as never,
    producerSvc,
    lastStored,
    undefined,
    extras?.gap as never,
  );
  return { producer, queueAdd, producerSvc };
}

function mockHvDuplicate(
  prisma: {
    hvBatteryHealthSnapshot: { findFirst: jest.Mock };
  },
  observedAt: Date,
) {
  prisma.hvBatteryHealthSnapshot.findFirst.mockResolvedValue({
    socPercent: 72,
    energyUsedKwh: 40,
    energyObservedAt: observedAt,
    isCharging: false,
    chargingCableConnected: false,
    providerSohPercent: 95,
    recordedAt: observedAt,
    providerReceivedAt: observedAt,
    idempotencyKey: 'hv-existing',
  });
}

describe('BatteryV2SnapshotObservationProducer — canonical LIVE_VOLTAGE lastStored (B1.2Y3C.1)', () => {
  const T1 = new Date('2026-09-21T18:47:56.000Z');
  const T1_RECEIVED = new Date('2026-09-21T18:47:58.000Z');
  const originalGap = process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV];
  const originalGen = process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV];

  const prismaFixture = {
    hvBatteryHealthSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
    batteryMeasurement: { findFirst: jest.fn() },
    batteryHealthSnapshot: { findFirst: jest.fn() },
  };
  const prisma = prismaFixture;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
    prisma.hvBatteryHealthSnapshot.findFirst.mockResolvedValue(null);
    prisma.batteryHealthSnapshot.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    restoreProcessEnv(BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV, originalGap);
    restoreProcessEnv(BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV, originalGen);
  });

  it('TEST_PRODUCER_STALE_REPLAY_REACHABLE: STALE_REPLAY when poll repeats frozen provider ts beyond threshold', async () => {
    mockHvDuplicate(prismaFixture, T1);
    prisma.batteryMeasurement.findFirst.mockResolvedValue({
      observedAt: T1,
      numericValue: 14.126,
      receivedAt: T1_RECEIVED,
      idempotencyKey: 'canonical-key',
    });

    const receivedAt = new Date(T1.getTime() + 6 * 60_000);
    const { producer } = buildProducer(prisma);

    const result = await producer.classify({
      organizationId: ORG,
      vehicleId: VEH,
      receivedAt,
      normalized: normalizedLv(),
      batteryMap: baseBatteryMap(T1) as never,
      lvBatteryObservedAt: T1,
    });

    expect(result.lvDecision?.outcome).toBe('STALE_REPLAY');
    expect(result.lvDecision?.shouldPersist).toBe(false);
    expect(result.shouldEnqueue).toBe(false);
    expect(prisma.batteryMeasurement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          vehicleId: VEH,
          type: 'LIVE_VOLTAGE',
        },
      }),
    );
    expect(prisma.batteryHealthSnapshot.findFirst).not.toHaveBeenCalled();
  });

  it('TEST_PRODUCER_DUPLICATE_BEFORE_THRESHOLD: DUPLICATE before stale threshold', async () => {
    mockHvDuplicate(prismaFixture, T1);
    const pollReceived = new Date(T1_RECEIVED.getTime() + 60_000);
    prisma.batteryMeasurement.findFirst.mockResolvedValue({
      observedAt: T1,
      numericValue: 14.126,
      receivedAt: T1_RECEIVED,
      idempotencyKey: 'canonical-key',
    });

    const { producer } = buildProducer(prisma);
    const result = await producer.classify({
      organizationId: ORG,
      vehicleId: VEH,
      receivedAt: pollReceived,
      normalized: normalizedLv(),
      batteryMap: baseBatteryMap(T1) as never,
      lvBatteryObservedAt: T1,
    });

    expect(result.lvDecision?.outcome).toBe('DUPLICATE_OBSERVATION');
    expect(result.shouldEnqueue).toBe(false);
  });

  it('TEST_LEGACY_SNAPSHOT_DOES_NOT_SUPPRESS_CANONICAL_BOOTSTRAP: legacy snapshot ignored without canonical measurement', async () => {
    prisma.batteryMeasurement.findFirst.mockResolvedValue(null);
    prisma.batteryHealthSnapshot.findFirst.mockResolvedValue({
      recordedAt: T1,
      voltageV: 14.126,
    });

    const { producer, queueAdd } = buildProducer(prisma);
    const receivedAt = new Date('2026-09-22T10:00:00.000Z');

    const classify = await producer.classify({
      organizationId: ORG,
      vehicleId: VEH,
      receivedAt,
      normalized: normalizedLv(),
      batteryMap: baseBatteryMap(T1) as never,
      lvBatteryObservedAt: T1,
    });

    expect(classify.lvDecision?.outcome).toBe('NEW_OBSERVATION');
    expect(classify.shouldEnqueue).toBe(true);

    const jobId = await producer.classifyAndEnqueue({
      organizationId: ORG,
      vehicleId: VEH,
      receivedAt,
      normalized: normalizedLv(),
      batteryMap: baseBatteryMap(T1) as never,
      lvBatteryObservedAt: T1,
    });
    expect(jobId).toBeTruthy();
    expect(queueAdd).toHaveBeenCalled();
  });

  it('TEST_ADVANCING_PROVIDER_TIMESTAMP_NEW_OBSERVATION: advanced observedAt enqueues even if value unchanged', async () => {
    const priorAt = T1;
    const freshAt = new Date('2026-09-22T08:00:00.000Z');
    prisma.batteryMeasurement.findFirst.mockResolvedValue({
      observedAt: priorAt,
      numericValue: 14.126,
      receivedAt: T1_RECEIVED,
      idempotencyKey: 'prior',
    });

    const { producer } = buildProducer(prisma);
    const result = await producer.classify({
      organizationId: ORG,
      vehicleId: VEH,
      receivedAt: new Date('2026-09-22T08:00:05.000Z'),
      normalized: normalizedLv(14.126),
      batteryMap: baseBatteryMap(freshAt) as never,
      lvBatteryObservedAt: freshAt,
    });

    expect(result.lvDecision?.outcome).toBe('NEW_OBSERVATION');
    expect(result.shouldEnqueue).toBe(true);
  });

  it('STALE_REPLAY gap hook receives decision when provider-gap runtime enabled', async () => {
    process.env[BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED_ENV] = 'true';
    process.env[BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED_ENV] = 'true';

    const observedAt = T1;
    mockHvDuplicate(prismaFixture, observedAt);
    prisma.batteryMeasurement.findFirst.mockResolvedValue({
      observedAt: T1,
      numericValue: 14.126,
      receivedAt: T1_RECEIVED,
      idempotencyKey: 'canonical-key',
    });

    const gapService = {
      handleSuccessfulPollWithoutPersist: jest.fn().mockResolvedValue('opened'),
    };

    const receivedAt = new Date(T1.getTime() + 6 * 60_000);
    const { producer } = buildProducer(prisma, {
      gap: gapService as never,
    });

    await producer.classifyAndEnqueue({
      organizationId: ORG,
      vehicleId: VEH,
      receivedAt,
      normalized: normalizedLv(),
      batteryMap: baseBatteryMap(T1) as never,
      lvBatteryObservedAt: T1,
    });

    expect(gapService.handleSuccessfulPollWithoutPersist).toHaveBeenCalledWith(
      expect.objectContaining({ vehicleId: VEH }),
      expect.objectContaining({
        lvDecision: expect.objectContaining({ outcome: 'STALE_REPLAY' }),
        shouldEnqueue: false,
      }),
    );
  });
});

describe('BatteryProviderLastStoredLiveVoltageResolver', () => {
  it('returns full canonical anchor fields tenant-scoped', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      observedAt: new Date('2026-09-21T18:47:56.000Z'),
      numericValue: 14.126,
      receivedAt: new Date('2026-09-21T18:47:58.000Z'),
      idempotencyKey: 'key-1',
    });
    const resolver = new BatteryProviderLastStoredLiveVoltageResolver({
      batteryMeasurement: { findFirst },
    } as never);

    const ctx = await resolver.resolveLastStoredLiveVoltageObservation(ORG, VEH);
    expect(ctx).toEqual(
      expect.objectContaining({
        normalizedValue: 14.126,
        idempotencyKey: 'key-1',
        receivedAt: expect.any(Date),
        observedAt: expect.any(Date),
      }),
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, vehicleId: VEH, type: 'LIVE_VOLTAGE' },
      }),
    );
  });
});
