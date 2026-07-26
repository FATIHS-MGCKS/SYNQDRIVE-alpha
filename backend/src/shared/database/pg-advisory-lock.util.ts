import type { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

/** Serialize critical writes that share a string identity (hashed for pg_advisory_xact_lock). */
export async function acquirePgAdvisoryXactLock(
  tx: TxClient,
  lockKey: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
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
