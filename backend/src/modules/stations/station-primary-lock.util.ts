import type { Prisma } from '@prisma/client';

export const STATION_PRIMARY_ADVISORY_LOCK_PREFIX = 'stations:primary:';

export async function lockOrganizationPrimarySlot(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${STATION_PRIMARY_ADVISORY_LOCK_PREFIX}${organizationId}`}))`;
}
