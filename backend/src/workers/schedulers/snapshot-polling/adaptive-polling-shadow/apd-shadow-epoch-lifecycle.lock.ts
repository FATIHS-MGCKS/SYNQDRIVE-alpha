import type { Prisma } from '@prisma/client';

/**
 * Shared PostgreSQL advisory lock namespace for APDS shadow activation epoch lifecycle
 * vs scientific decision **create** linearization.
 *
 * Lock ordering (deadlock avoidance):
 * 1. At most one `apd_shadow_epoch_lifecycle:{epochId}` xact lock per transaction.
 * 2. Never acquire two different epoch lifecycle locks in one transaction.
 * 3. Scope-level activation lock (`apd_shadow_epoch:{activationScopeKey}`) is only used
 *    during activateEpoch and never nested with a second epoch lifecycle lock.
 *
 * Post-poll correlation updates to **existing** decision rows do not take this lock and
 * remain permitted after PAUSE/CLOSE (scientific attribution already authorized at create).
 */
export const APD_SHADOW_EPOCH_LIFECYCLE_LOCK_PREFIX = 'apd_shadow_epoch_lifecycle:';

export function buildApdShadowEpochLifecycleLockMaterial(epochId: string): string {
  return `${APD_SHADOW_EPOCH_LIFECYCLE_LOCK_PREFIX}${epochId}`;
}

export async function acquireApdShadowEpochLifecycleXactLock(
  tx: Prisma.TransactionClient,
  epochId: string,
): Promise<void> {
  const material = buildApdShadowEpochLifecycleLockMaterial(epochId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${material}))`;
}
