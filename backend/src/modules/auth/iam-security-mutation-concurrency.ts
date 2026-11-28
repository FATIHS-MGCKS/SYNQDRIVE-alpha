import type { Prisma } from '@prisma/client';
import {
  acquireOrgSessionWriteLock,
  acquireUserSessionWriteLock,
} from './refresh-token-session-concurrency';

/**
 * Canonical IAM security-mutation lock hierarchy (P2-R20 / USR-P3A.3A FL-R02):
 *
 * See `iam-identity-mutation-lock-order.ts` for invite/provision entry paths.
 *
 * Within `acquireCanonicalSecurityMutationLocks` only:
 * 1) organization advisory locks (sorted, 913105)
 * 2) user advisory locks (sorted, 913104)
 * 3) row mutations and authoritative invalidation (caller responsibility)
 */
export async function acquireCanonicalSecurityMutationLocks(
  tx: Prisma.TransactionClient,
  input: {
    organizationIds?: Iterable<string | null | undefined>;
    userIds: Iterable<string>;
  },
): Promise<void> {
  const orgIds = [...new Set([...(input.organizationIds ?? [])].filter(Boolean) as string[])].sort();
  const userIds = [...new Set(input.userIds)].sort();
  for (const organizationId of orgIds) {
    await acquireOrgSessionWriteLock(tx, organizationId);
  }
  for (const userId of userIds) {
    await acquireUserSessionWriteLock(tx, userId);
  }
}