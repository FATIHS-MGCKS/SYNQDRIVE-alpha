import { randomUUID } from 'crypto';
import {
  PrismaClient,
  TripStatus,
  type Organization,
  type Vehicle,
  type VehicleTrip,
} from '@prisma/client';

export type BoundaryRepairPostgresFixture = {
  suffix: string;
  org: Organization;
  vehicle: Vehicle;
  trip: VehicleTrip;
};

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function probeBoundaryRepairDatabase(): Promise<boolean> {
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

export async function createBoundaryRepairPostgresFixture(
  prisma: PrismaClient,
): Promise<BoundaryRepairPostgresFixture> {
  const suffix = uniqueSuffix();
  const org = await prisma.organization.create({
    data: {
      companyName: `Boundary Repair PG ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `BR-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'Boundary',
      year: 2024,
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
    },
  });

  const start = new Date('2026-08-29T12:30:00.000Z');
  const end = new Date('2026-08-29T12:50:00.000Z');
  const trip = await prisma.vehicleTrip.create({
    data: {
      vehicleId: vehicle.id,
      tripStatus: TripStatus.COMPLETED,
      startTime: start,
      endTime: end,
      startLatitude: 51.2,
      startLongitude: 9.3,
      endLatitude: 51.25,
      endLongitude: 9.35,
      rawDetectionMeta: {},
    },
  });

  return { suffix, org, vehicle, trip };
}

export async function cleanupBoundaryRepairPostgresFixture(
  prisma: PrismaClient,
  fixture: BoundaryRepairPostgresFixture,
): Promise<void> {
  await prisma.tripRepair.deleteMany({ where: { vehicleId: fixture.vehicle.id } });
  await prisma.vehicleTripWaypoint.deleteMany({ where: { tripId: fixture.trip.id } });
  await prisma.tripBehaviorEvent.deleteMany({ where: { tripId: fixture.trip.id } });
  await prisma.tripDrivingImpact.deleteMany({ where: { tripId: fixture.trip.id } });
  await prisma.vehicleTrip.deleteMany({ where: { vehicleId: fixture.vehicle.id } });
  await prisma.vehicle.delete({ where: { id: fixture.vehicle.id } }).catch(() => undefined);
  await prisma.organization.delete({ where: { id: fixture.org.id } }).catch(() => undefined);
}
