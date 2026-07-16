import { DrivingImpactService } from './driving-impact.service';
import { DRIVING_IMPACT_CONFIG as C } from './driving-impact.config';
import { DrivingImpactStatusSyncService } from './driving-impact-status-sync.service';

function makeBaseTripRow(overrides: Partial<any> = {}) {
  return {
    id: 'trip-1',
    vehicleId: 'vehicle-1',
    vehicle: { organizationId: 'org-1', hardwareType: 'UNKNOWN' },
    startTime: new Date('2026-03-01T08:00:00Z'),
    endTime: new Date('2026-03-01T09:00:00Z'),
    distanceKm: 50,
    citySharePercent: 30,
    highwaySharePercent: 60,
    countrySharePercent: 10,
    hardAccelerationCount: 4,
    hardBrakingCount: 6,
    fullBrakingCount: 2,
    kickdownCount: 1,
    brakingEventCount: 12,
    ...overrides,
  };
}

function makeMockPrisma() {
  return {
    vehicleTrip: { findUnique: jest.fn(), update: jest.fn() },
    tripBehaviorEvent: { count: jest.fn(), findMany: jest.fn() },
    drivingEvent: { findMany: jest.fn() },
    tripDrivingImpact: { upsert: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    vehicleDrivingImpactCurrent: { upsert: jest.fn(), findUnique: jest.fn() },
  } as any;
}

describe('DrivingImpactService status sync', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let statusSync: {
    persistImpactWithStatus: jest.Mock;
    applyOutcomeWithoutImpactRow: jest.Mock;
  };
  let service: DrivingImpactService;

  beforeEach(() => {
    prisma = makeMockPrisma();
    statusSync = {
      persistImpactWithStatus: jest.fn().mockResolvedValue(undefined),
      applyOutcomeWithoutImpactRow: jest.fn().mockResolvedValue(undefined),
    };
    prisma.drivingEvent.findMany.mockResolvedValue([]);
    prisma.vehicleTrip.update.mockResolvedValue({});
    prisma.tripDrivingImpact.findMany.mockResolvedValue([]);
    prisma.vehicleDrivingImpactCurrent.upsert.mockResolvedValue({});
    service = new DrivingImpactService(
      prisma,
      undefined,
      statusSync as unknown as DrivingImpactStatusSyncService,
    );
  });

  it('successful complete calculation sets READY via transactional sync', async () => {
    prisma.vehicleTrip.findUnique.mockResolvedValue(makeBaseTripRow());
    prisma.tripBehaviorEvent.count.mockResolvedValue(0);
    prisma.tripBehaviorEvent.findMany.mockResolvedValue([
      { startSpeedKmh: 90, endSpeedKmh: 10, peakValue: 6.5 },
    ]);

    const result = await service.computeForTrip('trip-1', 'vehicle-1');

    expect(result.kind).toBe('persisted');
    if (result.kind === 'persisted') {
      expect(result.quality).toBe('COMPLETE');
      expect(result.modelVersion).toBe(C.MODEL_VERSION);
    }
    expect(statusSync.persistImpactWithStatus).toHaveBeenCalledTimes(1);
    const [, , outcome] = statusSync.persistImpactWithStatus.mock.calls[0];
    expect(outcome.drivingImpactStatus).toBe('READY');
    expect(outcome.calculatedAt).toBeInstanceOf(Date);
    expect(prisma.tripDrivingImpact.upsert).not.toHaveBeenCalled();
  });

  it('limited source calculation sets PARTIAL', async () => {
    prisma.vehicleTrip.findUnique.mockResolvedValue(
      makeBaseTripRow({
        citySharePercent: null,
        highwaySharePercent: null,
        countrySharePercent: null,
      }),
    );
    prisma.tripBehaviorEvent.count.mockResolvedValue(0);
    prisma.tripBehaviorEvent.findMany.mockResolvedValue([]);

    const result = await service.computeForTrip('trip-1', 'vehicle-1');

    expect(result.kind).toBe('persisted');
    if (result.kind === 'persisted') {
      expect(result.quality).toBe('PARTIAL');
    }
    const [, , outcome] = statusSync.persistImpactWithStatus.mock.calls[0];
    expect(outcome.drivingImpactStatus).toBe('PARTIAL');
  });

  it('retry produces the same terminal READY status without direct upsert drift', async () => {
    prisma.vehicleTrip.findUnique.mockResolvedValue(makeBaseTripRow());
    prisma.tripBehaviorEvent.count.mockResolvedValue(0);
    prisma.tripBehaviorEvent.findMany.mockResolvedValue([
      { startSpeedKmh: 60, endSpeedKmh: 5, peakValue: 4.0 },
    ]);

    await service.computeForTrip('trip-1', 'vehicle-1');
    await service.computeForTrip('trip-1', 'vehicle-1');

    expect(statusSync.persistImpactWithStatus).toHaveBeenCalledTimes(2);
    const firstOutcome = statusSync.persistImpactWithStatus.mock.calls[0][2];
    const secondOutcome = statusSync.persistImpactWithStatus.mock.calls[1][2];
    expect(firstOutcome.drivingImpactStatus).toBe('READY');
    expect(secondOutcome.drivingImpactStatus).toBe('READY');
    expect(firstOutcome.modelVersion).toBe(secondOutcome.modelVersion);
  });

  it('short trip sets SKIPPED without persisting impact row', async () => {
    prisma.vehicleTrip.findUnique.mockResolvedValue(makeBaseTripRow({ distanceKm: 1 }));

    const result = await service.computeForTrip('trip-1', 'vehicle-1');

    expect(result.kind).toBe('skipped');
    expect(statusSync.persistImpactWithStatus).not.toHaveBeenCalled();
    expect(statusSync.applyOutcomeWithoutImpactRow).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({ drivingImpactStatus: 'SKIPPED' }),
    );
  });
});
