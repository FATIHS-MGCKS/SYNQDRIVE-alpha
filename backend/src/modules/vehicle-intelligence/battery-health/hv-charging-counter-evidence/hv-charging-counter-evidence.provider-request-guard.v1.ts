import type { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';

const LOCK_NAMESPACE = 'hv-r22-charging-counter-provider';

export type HvChargingCounterProviderRequestGuardClientV1 =
  | PrismaService
  | Prisma.TransactionClient;

function lockKey(vehicleId: string): string {
  return `${LOCK_NAMESPACE}:${vehicleId}`;
}

/**
 * Cross-replica guard: at most one in-flight DIMO provider query per vehicle.
 * Uses session-level pg_try_advisory_lock on the caller's PostgreSQL session.
 *
 * IMPORTANT: acquire/fetch/release must share one connection — use
 * `runWithHvChargingCounterProviderRequestGuardV1` or an interactive Prisma transaction.
 */
export async function tryAcquireHvChargingCounterProviderRequestGuardV1(
  client: HvChargingCounterProviderRequestGuardClientV1,
  vehicleId: string,
): Promise<boolean> {
  const key = lockKey(vehicleId);
  const rows = await client.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(hashtext(${key})) AS locked
  `;
  return rows[0]?.locked === true;
}

export async function releaseHvChargingCounterProviderRequestGuardV1(
  client: HvChargingCounterProviderRequestGuardClientV1,
  vehicleId: string,
): Promise<void> {
  const key = lockKey(vehicleId);
  await client.$queryRaw`SELECT pg_advisory_unlock(hashtext(${key}))`;
}

export type HvChargingCounterProviderRequestGuardOutcomeV1<T> =
  | { status: 'busy' }
  | { status: 'ok'; value: T };

/**
 * Pins a single pooled connection for the guarded async work (required for session advisory locks).
 */
export async function runWithHvChargingCounterProviderRequestGuardV1<T>(
  prisma: PrismaService,
  vehicleId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<HvChargingCounterProviderRequestGuardOutcomeV1<T>> {
  return prisma.$transaction(
    async (tx) => {
      const acquired = await tryAcquireHvChargingCounterProviderRequestGuardV1(tx, vehicleId);
      if (!acquired) {
        return { status: 'busy' as const };
      }
      try {
        const value = await work(tx);
        return { status: 'ok' as const, value };
      } finally {
        await releaseHvChargingCounterProviderRequestGuardV1(tx, vehicleId);
      }
    },
    { timeout: options?.timeoutMs ?? 180_000 },
  );
}
