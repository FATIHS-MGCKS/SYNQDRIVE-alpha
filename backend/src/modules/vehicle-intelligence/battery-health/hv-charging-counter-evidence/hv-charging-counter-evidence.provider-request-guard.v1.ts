import type { PrismaService } from '@shared/database/prisma.service';

const LOCK_NAMESPACE = 'hv-r22-charging-counter-provider';

function lockKey(vehicleId: string): string {
  return `${LOCK_NAMESPACE}:${vehicleId}`;
}

/**
 * Cross-replica guard: at most one in-flight DIMO provider query per vehicle.
 * Uses session-level pg_try_advisory_lock (must pair with release).
 */
export async function tryAcquireHvChargingCounterProviderRequestGuardV1(
  prisma: PrismaService,
  vehicleId: string,
): Promise<boolean> {
  const key = lockKey(vehicleId);
  const rows = await prisma.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(hashtext(${key})) AS locked
  `;
  return rows[0]?.locked === true;
}

export async function releaseHvChargingCounterProviderRequestGuardV1(
  prisma: PrismaService,
  vehicleId: string,
): Promise<void> {
  const key = lockKey(vehicleId);
  await prisma.$queryRaw`SELECT pg_advisory_unlock(hashtext(${key}))`;
}
