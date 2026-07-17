import { DriverAttributionRepository } from './driver-attribution.repository';
import { DRIVER_ATTRIBUTION_MODEL_VERSION } from './driver-attribution.config';
import { DriverAttributionSource, DriverAttributionType } from '@prisma/client';

function makePrisma() {
  return {
    vehicleTrip: { findFirst: jest.fn() },
    driverAttribution: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  } as any;
}

describe('DriverAttributionRepository', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repository: DriverAttributionRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repository = new DriverAttributionRepository(prisma);
  });

  it('scopes findByTrip to organization + trip', async () => {
    prisma.driverAttribution.findMany.mockResolvedValue([]);
    await repository.findByTrip('org-1', 'trip-1');
    expect(prisma.driverAttribution.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', tripId: 'trip-1' },
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    });
  });

  it('rejects upsert when trip is outside organization', async () => {
    prisma.vehicleTrip.findFirst.mockResolvedValue(null);
    await expect(
      repository.upsertSnapshot({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tripId: 'trip-foreign',
        attributionType: DriverAttributionType.UNKNOWN,
        confidence: 'LOW',
        source: DriverAttributionSource.PIPELINE_SNAPSHOT,
        validFrom: new Date(),
        modelVersion: DRIVER_ATTRIBUTION_MODEL_VERSION,
      }),
    ).rejects.toThrow('Trip not found for organization');
  });

  it('upserts snapshot with tenant trip check', async () => {
    prisma.vehicleTrip.findFirst.mockResolvedValue({ id: 'trip-1', vehicleId: 'veh-1' });
    prisma.driverAttribution.findFirst.mockResolvedValue(null);
    prisma.driverAttribution.create.mockResolvedValue({ id: 'attr-1' });

    await repository.upsertSnapshot({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
      bookingId: 'book-1',
      customerId: 'cust-1',
      driverId: 'driver-9',
      attributionType: DriverAttributionType.CONFIRMED_DRIVER,
      confidence: 'HIGH',
      source: DriverAttributionSource.EXPLICIT_BOOKING_LINK,
      validFrom: new Date('2026-07-16T08:00:00Z'),
      validUntil: new Date('2026-07-16T09:00:00Z'),
      modelVersion: DRIVER_ATTRIBUTION_MODEL_VERSION,
      evidence: { reason: 'explicit' },
    });

    expect(prisma.driverAttribution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
          tripId: 'trip-1',
          customerId: 'cust-1',
          driverId: 'driver-9',
          attributionType: DriverAttributionType.CONFIRMED_DRIVER,
        }),
      }),
    );
  });
});
