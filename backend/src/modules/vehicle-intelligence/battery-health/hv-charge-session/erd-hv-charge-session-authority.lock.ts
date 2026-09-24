import type { Prisma } from '@prisma/client';

/** Canonical PostgreSQL advisory lock scope for ERD HvChargeSession physical authority. */
export const ERD_HV_CHARGE_SESSION_AUTHORITY_LOCK_ORDER =
  'VEHICLE_ADVISORY_THEN_SESSION_READ_WRITE' as const;

/**
 * One vehicle-scoped transaction lock for all native + fallback physical writes.
 * Uses pg_advisory_xact_lock (released on COMMIT/ROLLBACK).
 */
export async function acquireErdHvChargeSessionVehicleAuthorityLock(
  tx: Prisma.TransactionClient,
  vehicleId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${vehicleId}))`;
}
