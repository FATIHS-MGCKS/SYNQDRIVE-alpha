import { Prisma } from '@prisma/client';
import { HvBatteryHealthService } from './hv-battery-health.service';
import { TripMetricsService } from '../../observability/trip-metrics.service';

describe('HvBatteryHealthService observation dedup persistence', () => {
  const vehicleId = 'veh-ev-1';
  const organizationId = 'org-1';
  const socAt = new Date('2026-07-16T12:59:35.000Z');
  const pollAt = new Date('2026-07-16T13:00:08.000Z');

  const buildService = () => {
    const prisma = {
      vehicle: { findUnique: jest.fn() },
      hvBatteryHealthSnapshot: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      hvBatteryHealthCurrent: { findUnique: jest.fn() },
    } as any;
    const batteryEvidence = {
      recordMany: jest.fn(),
    } as any;
    const tripMetrics = {
      hvSnapshotDuplicatesDiscarded: { inc: jest.fn() },
    } as unknown as TripMetricsService;
    const svc = new HvBatteryHealthService(prisma, batteryEvidence, tripMetrics);
    return { svc, prisma, batteryEvidence, tripMetrics };
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(pollAt);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('skips duplicate polls without creating a snapshot or evidence', async () => {
    const { svc, prisma, batteryEvidence, tripMetrics } = buildService();

    prisma.vehicle.findUnique.mockResolvedValue({ organizationId });
    prisma.hvBatteryHealthSnapshot.findFirst.mockResolvedValue({
      socPercent: 73.82,
      energyUsedKwh: 41.38,
      energyObservedAt: new Date('2026-07-16T12:59:14.000Z'),
      isCharging: false,
      chargingCableConnected: false,
      providerSohPercent: null,
      recordedAt: socAt,
      providerReceivedAt: pollAt,
      idempotencyKey: 'hv-snap:existing',
    });

    const result = await svc.recordSnapshot({
      vehicleId,
      socPercent: 73.82,
      currentEnergyKwh: 41.38,
      isCharging: false,
      receivedAt: new Date('2026-07-16T13:00:38.000Z'),
      signalObservedAt: {
        soc: socAt,
        currentEnergyKwh: new Date('2026-07-16T12:59:14.000Z'),
      },
    });

    expect(result).toBeNull();
    expect(prisma.hvBatteryHealthSnapshot.create).not.toHaveBeenCalled();
    expect(batteryEvidence.recordMany).not.toHaveBeenCalled();
    expect(tripMetrics.hvSnapshotDuplicatesDiscarded.inc).toHaveBeenCalledWith({
      reason: 'UNCHANGED_POLL',
    });
  });

  it('persists when provider timestamp advances', async () => {
    const { svc, prisma, batteryEvidence } = buildService();

    prisma.vehicle.findUnique.mockResolvedValue({ organizationId });
    prisma.hvBatteryHealthSnapshot.findFirst.mockResolvedValue({
      socPercent: 73.82,
      energyUsedKwh: 41.38,
      energyObservedAt: new Date('2026-07-16T12:59:14.000Z'),
      isCharging: false,
      chargingCableConnected: false,
      providerSohPercent: null,
      recordedAt: socAt,
      providerReceivedAt: pollAt,
      idempotencyKey: 'hv-snap:old',
    });
    prisma.hvBatteryHealthSnapshot.create.mockImplementation(async ({ data }: any) => ({
      id: 'snap-new',
      ...data,
    }));

    const nextSocAt = new Date('2026-07-16T13:01:05.000Z');
    const result = await svc.recordSnapshot({
      vehicleId,
      socPercent: 74.1,
      currentEnergyKwh: 41.55,
      isCharging: false,
      receivedAt: new Date('2026-07-16T13:01:10.000Z'),
      signalObservedAt: { soc: nextSocAt },
    });

    expect(result?.socPercent).toBe(74.1);
    expect(prisma.hvBatteryHealthSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: expect.stringContaining('hv-snap:'),
          recordedAt: nextSocAt,
          providerReceivedAt: new Date('2026-07-16T13:01:10.000Z'),
        }),
      }),
    );
    expect(batteryEvidence.recordMany).toHaveBeenCalled();
  });

  it('persists charging state transitions', async () => {
    const { svc, prisma } = buildService();

    prisma.vehicle.findUnique.mockResolvedValue({ organizationId });
    prisma.hvBatteryHealthSnapshot.findFirst.mockResolvedValue({
      socPercent: 73.82,
      energyUsedKwh: 41.38,
      energyObservedAt: new Date('2026-07-16T12:59:14.000Z'),
      isCharging: false,
      chargingCableConnected: false,
      providerSohPercent: null,
      recordedAt: socAt,
      providerReceivedAt: pollAt,
      idempotencyKey: 'hv-snap:old',
    });
    prisma.hvBatteryHealthSnapshot.create.mockImplementation(async ({ data }: any) => ({
      id: 'snap-charging',
      ...data,
    }));

    await svc.recordSnapshot({
      vehicleId,
      socPercent: 73.82,
      currentEnergyKwh: 41.38,
      isCharging: true,
      receivedAt: new Date('2026-07-16T13:00:38.000Z'),
      signalObservedAt: { soc: socAt, isCharging: socAt },
    });

    expect(prisma.hvBatteryHealthSnapshot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isCharging: true,
          idempotencyKey: expect.stringContaining(':charging:'),
        }),
      }),
    );
  });

  it('returns existing row on concurrent duplicate insert (P2002)', async () => {
    const { svc, prisma, batteryEvidence, tripMetrics } = buildService();
    const existing = {
      id: 'snap-existing',
      vehicleId,
      socPercent: 73.82,
      idempotencyKey: 'hv-snap:race',
    };

    prisma.vehicle.findUnique.mockResolvedValue({ organizationId });
    prisma.hvBatteryHealthSnapshot.findFirst.mockResolvedValue(null);
    prisma.hvBatteryHealthSnapshot.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }),
    );
    prisma.hvBatteryHealthSnapshot.findUnique.mockResolvedValue(existing);

    const result = await svc.recordSnapshot({
      vehicleId,
      socPercent: 73.82,
      currentEnergyKwh: 41.38,
      isCharging: false,
      receivedAt: pollAt,
      signalObservedAt: { soc: socAt },
    });

    expect(result).toEqual(existing);
    expect(batteryEvidence.recordMany).toHaveBeenCalled();
    expect(tripMetrics.hvSnapshotDuplicatesDiscarded.inc).toHaveBeenCalledWith({
      reason: 'DUPLICATE_OBSERVATION',
    });
  });
});
