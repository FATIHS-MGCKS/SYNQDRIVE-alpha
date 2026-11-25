import type { Prisma } from '@prisma/client';

/** Advisory lock class: user session write serialization (P2-R07). */
export const IAM_USER_SESSION_WRITE_LOCK_CLASS = 913_104;
/** Advisory lock class: organization-scoped session writes. */
export const IAM_ORG_SESSION_WRITE_LOCK_CLASS = 913_105;

/**
 * Canonical lock hierarchy (P2-R12 / P2-R13):
 * 1) organization advisory (913105) when organizationId present
 * 2) user advisory (913104)
 * 3) refresh_tokens row FOR UPDATE (caller responsibility)
 *
 * Never acquire FOR UPDATE on refresh_tokens before advisory locks.
 */
export async function acquireSessionWriteLocks(
  tx: Prisma.TransactionClient,
  scope: { userId: string; organizationId?: string | null },
): Promise<void> {
  if (scope.organizationId) {
    await acquireOrgSessionWriteLock(tx, scope.organizationId);
  }
  await acquireUserSessionWriteLock(tx, scope.userId);
}

/**
 * Serialize all refresh-token mutations for one user within the current transaction.
 * Participating writers must acquire this before mutating refresh_tokens for the user.
 */
export async function acquireUserSessionWriteLock(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      ${IAM_USER_SESSION_WRITE_LOCK_CLASS}::integer,
      hashtext(${userId}::text)
    )
  `;
}

export async function acquireOrgSessionWriteLock(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      ${IAM_ORG_SESSION_WRITE_LOCK_CLASS}::integer,
      hashtext(${organizationId}::text)
    )
  `;
}

export async function acquireOrgScopeSessionWriteLock(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await acquireOrgSessionWriteLock(tx, organizationId);
}