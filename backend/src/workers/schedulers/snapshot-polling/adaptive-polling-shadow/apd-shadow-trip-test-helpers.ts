import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

/** True when DB enum matches production (includes CANCELLED). */
export async function dbSupportsCancelledTripStatus(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'TripStatus' AND e.enumlabel = 'CANCELLED'
    ) AS ok`;
  return rows[0]?.ok === true;
}

/** Production Arteon pattern: trip_status=CANCELLED with NULL end_time. */
export async function seedCancelledOpenVehicleTrip(
  prisma: PrismaClient,
  vehicleId: string,
  startTime: Date,
): Promise<string> {
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO vehicle_trips (id, vehicle_id, start_time, end_time, trip_status)
    VALUES (
      ${id}::uuid,
      ${vehicleId}::uuid,
      ${startTime}::timestamptz,
      NULL,
      CAST('CANCELLED' AS "TripStatus")
    )`;
  return id;
}
