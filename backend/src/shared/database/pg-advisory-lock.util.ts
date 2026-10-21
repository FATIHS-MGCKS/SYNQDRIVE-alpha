import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

/** 64-bit advisory lock keys derived from a stable seed (two signed int4 keys). */
export function pgAdvisoryLockKeysFromSeed(seed: string): [number, number] {
  const hash = createHash('sha256').update(seed).digest();
  return [hash.readInt32BE(0), hash.readInt32BE(4)];
}

/** Serialize critical writes that share a string identity (hashed for pg_advisory_xact_lock). */
export async function acquirePgAdvisoryXactLock(
  tx: TxClient,
  lockKey: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
}

/**
 * Transaction-scoped advisory lock with 64-bit key width (two int4 halves of SHA256).
 * Prefer over single hashtext() when collision surface matters.
 */
export async function acquirePgAdvisoryXactLock64(
  tx: TxClient,
  lockKey: string,
): Promise<void> {
  const [k1, k2] = pgAdvisoryLockKeysFromSeed(lockKey);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock((${k1})::int, (${k2})::int)`;
}

export function vehicleDimoBindingLockKey(dimoVehicleId: string): string {
  return `vehicle-dimo-binding:${dimoVehicleId}`;
}

export function subscriptionDraftLockKey(organizationId: string): string {
  return `subscription-draft:${organizationId}`;
}

export function userEmailRegistrationLockKey(email: string): string {
  return `user-email-registration:${email.trim().toLowerCase()}`;
}
