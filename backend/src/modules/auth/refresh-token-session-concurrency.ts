import { MembershipStatus, RefreshTokenScope, type Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';

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

/**
 * Plan organization advisory locks before user/row locks (P2-R19 legacy upgrade).
 * Includes stored org, last-selected org, and all active membership orgs for legacy tokens.
 */
export async function planRotateOrganizationAdvisoryLocks(
  client: PrismaService | Prisma.TransactionClient,
  input: {
    userId: string;
    storedOrganizationId: string | null;
    scope: RefreshTokenScope;
  },
): Promise<string[]> {
  const ids = new Set<string>();
  if (input.storedOrganizationId) {
    ids.add(input.storedOrganizationId);
  }
  if (input.scope === RefreshTokenScope.LEGACY_UNSCOPED) {
    const user = await client.user.findUnique({
      where: { id: input.userId },
      select: { lastSelectedOrganizationId: true },
    });
    if (user?.lastSelectedOrganizationId) {
      ids.add(user.lastSelectedOrganizationId);
    }
    const memberships = await client.organizationMembership.findMany({
      where: { userId: input.userId, status: MembershipStatus.ACTIVE },
      select: { organizationId: true },
    });
    for (const row of memberships) {
      ids.add(row.organizationId);
    }
  }
  return [...ids].sort();
}

/** Canonical order: sorted org advisories, then user advisory (never org after user). */
export async function acquireOrderedOrganizationLocksThenUser(
  tx: Prisma.TransactionClient,
  organizationIds: string[],
  userId: string,
): Promise<void> {
  for (const organizationId of organizationIds) {
    await acquireOrgSessionWriteLock(tx, organizationId);
  }
  await acquireUserSessionWriteLock(tx, userId);
}