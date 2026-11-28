import type { Prisma } from '@prisma/client';
import { acquireCanonicalSecurityMutationLocks } from '@modules/auth/iam-security-mutation-concurrency';
import {
  acquireIdentityEmailProvisionLock,
  acquireInviteDeliveryContinuityLock,
  acquireSecurityOperationAdmissionLock,
} from '@modules/auth/refresh-token-session-concurrency';

/**
 * Canonical IAM identity / invite mutation lock hierarchy (USR-P3A.3A FL-R02):
 *
 * 1. Security operation admission (913106) — when securityOperationId applies
 * 2. Invite delivery continuity (913108) — invite-scoped lifecycle / accept
 * 3. Organization session write locks (913105) — sorted org ids via canonical helper
 * 4. User session write locks (913104) — sorted user ids via canonical helper
 * 5. Identity email provision (913107) — net-new identity by normalized email
 *
 * Provisioning (org path): (1) → (3) → (5) → user locks after row exists.
 * Invite accept (net-new): (2) → (3) → (5) → user locks after row exists.
 * Invite accept (existing user): (2) → (3+user id).
 */
export async function acquireMasterProvisionOrgMutationLocks(
  tx: Prisma.TransactionClient,
  input: { securityOperationId: string; organizationId: string; normalizedEmail: string },
): Promise<void> {
  await acquireSecurityOperationAdmissionLock(tx, input.securityOperationId);
  await acquireCanonicalSecurityMutationLocks(tx, {
    organizationIds: [input.organizationId],
    userIds: [],
  });
  await acquireIdentityEmailProvisionLock(tx, input.normalizedEmail);
}

export async function acquireMasterProvisionGlobalMutationLocks(
  tx: Prisma.TransactionClient,
  input: { securityOperationId: string; normalizedEmail: string },
): Promise<void> {
  await acquireSecurityOperationAdmissionLock(tx, input.securityOperationId);
  await acquireIdentityEmailProvisionLock(tx, input.normalizedEmail);
}

export async function acquireInviteAcceptMutationLocks(
  tx: Prisma.TransactionClient,
  input: {
    inviteId: string;
    organizationId: string;
    userId?: string | null;
    normalizedEmail?: string | null;
  },
): Promise<void> {
  await acquireInviteDeliveryContinuityLock(tx, input.inviteId);
  await acquireCanonicalSecurityMutationLocks(tx, {
    organizationIds: [input.organizationId],
    userIds: input.userId ? [input.userId] : [],
  });
  if (!input.userId && input.normalizedEmail) {
    await acquireIdentityEmailProvisionLock(tx, input.normalizedEmail);
  }
}