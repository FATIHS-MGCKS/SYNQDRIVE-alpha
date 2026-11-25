import type { Prisma } from '@prisma/client';

/** Advisory lock class: user session write serialization (P2-R07). */
export const IAM_USER_SESSION_WRITE_LOCK_CLASS = 913_104;
/** Advisory lock class: organization-scoped session writes. */
export const IAM_ORG_SESSION_WRITE_LOCK_CLASS = 913_105;

/**
 * Serialize all refresh-token mutations for one user within the current transaction.
 * Participating writers must acquire this before mutating refresh_tokens for the user.
 */
export async function acquireUserSessionWriteLock(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${IAM_USER_SESSION_WRITE_LOCK_CLASS}, hashtext(${userId}))`;
}

export async function acquireOrgSessionWriteLock(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${IAM_ORG_SESSION_WRITE_LOCK_CLASS}, hashtext(${organizationId}))`;
}