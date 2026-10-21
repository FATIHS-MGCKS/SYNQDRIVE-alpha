import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

/**
 * Bootstrap: `bash backend/scripts/test/di-v0-shadow-persistence-postgres-bootstrap.sh`
 * (resilient `migrate deploy` — production migration path).
 *
 * Fixture seeding uses raw SQL with migrate-chain column sets so integration tests
 * do not depend on `schema.prisma` columns that lack migrations yet.
 */
export async function assertShadowPostgresIntegrationReady(prisma: PrismaClient): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL required for DI shadow integration tests');
  }
  await prisma.$queryRaw`SELECT 1`;
}

export interface ShadowTripFixtures {
  org: { id: string };
  vehicle: { id: string };
  trip: { id: string };
}

export async function seedShadowTripFixtures(prisma: PrismaClient): Promise<ShadowTripFixtures> {
  const suffix = randomUUID().slice(0, 8);
  const orgId = randomUUID();
  const vehicleId = randomUUID();
  const tripId = randomUUID();
  const now = new Date();
  await prisma.$executeRawUnsafe(
    `INSERT INTO organizations (id, company_name, business_type, status, created_at, updated_at)
     VALUES ($1, $2, 'RENTAL', 'ACTIVE', $3, $3)`,
    orgId,
    `DI-${suffix}`,
    now,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO vehicles (id, organization_id, vin, license_plate, make, model, year, fuel_type, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Test', 'DI', 2024, 'GASOLINE', 'AVAILABLE', $5, $5)`,
    vehicleId,
    orgId,
    `D2${suffix}`.padEnd(17, '0'),
    `D2-${suffix}`,
    now,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO vehicle_trips (
       id, vehicle_id, trip_status, start_time, end_time,
       start_latitude, start_longitude, distance_km, max_speed_kmh, avg_speed_kmh,
       harsh_brake_count, driving_score
     ) VALUES ($1, $2, 'COMPLETED', $3, $4, 52, 9, 12, 77, 45, 2, 88)`,
    tripId,
    vehicleId,
    new Date('2026-01-01T10:00:00Z'),
    new Date('2026-01-01T11:00:00Z'),
  );
  return { org: { id: orgId }, vehicle: { id: vehicleId }, trip: { id: tripId } };
}

export async function cleanupShadowTripFixtures(
  prisma: PrismaClient,
  tripId: string,
  vehicleId: string,
  orgId: string,
): Promise<void> {
  await prisma.diV0ShadowInterval.deleteMany({ where: { tripId } });
  await prisma.diV0ShadowRun.deleteMany({ where: { tripId } });
  await prisma.tripBehaviorEvent.deleteMany({ where: { tripId } });
  await prisma.vehicleTrip.deleteMany({ where: { id: tripId } });
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
}
