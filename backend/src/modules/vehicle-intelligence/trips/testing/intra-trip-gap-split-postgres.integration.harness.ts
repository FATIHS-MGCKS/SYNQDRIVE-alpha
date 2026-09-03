import { PrismaClient, TripStatus } from '@prisma/client';

export type IntraTripGapSplitPostgresFixture = {
  suffix: string;
  org: { id: string };
  vehicle: { id: string; organizationId: string };
  trip: {
    id: string;
    startTime: Date;
    endTime: Date;
    endLatitude: number;
    endLongitude: number;
    distanceKm: number;
  };
  gap: {
    firstEndAt: Date;
    secondStartAt: Date;
    firstEndLat: number;
    firstEndLng: number;
    secondStartLat: number;
    secondStartLng: number;
    gapMs: number;
    seg1DistanceKm: number;
    seg2DistanceKm: number;
  };
};

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function probeIntraTripGapSplitDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

export async function createIntraTripGapSplitPostgresFixture(
  prisma: PrismaClient,
): Promise<IntraTripGapSplitPostgresFixture> {
  const suffix = uniqueSuffix();
  const org = await prisma.organization.create({
    data: {
      companyName: `INC07 PG ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `IG-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'GapSplit',
      year: 2024,
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
    },
    select: { id: true, organizationId: true },
  });

  const start = new Date('2026-09-02T12:00:00.000Z');
  const firstEndAt = new Date('2026-09-02T12:30:00.000Z');
  const secondStartAt = new Date('2026-09-02T12:34:00.000Z');
  const end = new Date('2026-09-02T13:00:00.000Z');

  const trip = await prisma.vehicleTrip.create({
    data: {
      vehicleId: vehicle.id,
      tripStatus: TripStatus.COMPLETED,
      startTime: start,
      endTime: end,
      startLatitude: 51.1,
      startLongitude: 9.2,
      endLatitude: 51.2,
      endLongitude: 9.3,
      distanceKm: 13,
      rawDetectionMeta: {},
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      endLatitude: true,
      endLongitude: true,
      distanceKm: true,
    },
  });

  return {
    suffix,
    org,
    vehicle,
    trip: {
      id: trip.id,
      startTime: trip.startTime,
      endTime: trip.endTime!,
      endLatitude: trip.endLatitude!,
      endLongitude: trip.endLongitude!,
      distanceKm: trip.distanceKm ?? 13,
    },
    gap: {
      firstEndAt,
      secondStartAt,
      firstEndLat: 51.11,
      firstEndLng: 9.21,
      secondStartLat: 51.1101,
      secondStartLng: 9.2101,
      gapMs: secondStartAt.getTime() - firstEndAt.getTime(),
      seg1DistanceKm: 8,
      seg2DistanceKm: 5,
    },
  };
}

export async function cleanupIntraTripGapSplitPostgresFixture(
  prisma: PrismaClient,
  fixture: IntraTripGapSplitPostgresFixture,
): Promise<void> {
  await prisma.tripRepair.deleteMany({ where: { vehicleId: fixture.vehicle.id } });
  await prisma.vehicleTripWaypoint.deleteMany({
    where: { trip: { vehicleId: fixture.vehicle.id } },
  });
  await prisma.vehicleTrip.deleteMany({ where: { vehicleId: fixture.vehicle.id } });
  await prisma.vehicle.delete({ where: { id: fixture.vehicle.id } }).catch(() => undefined);
  await prisma.organization.delete({ where: { id: fixture.org.id } }).catch(() => undefined);
}
