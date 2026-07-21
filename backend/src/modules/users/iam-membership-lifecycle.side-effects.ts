import { Prisma } from '@prisma/client';
import type { OwnershipConflict } from './iam-membership-lifecycle.types';

type Tx = Prisma.TransactionClient;

export async function detectOwnershipConflicts(
  tx: Tx,
  organizationId: string,
  userId: string,
): Promise<OwnershipConflict[]> {
  const conflicts: OwnershipConflict[] = [];

  const openTasks = await tx.orgTask.count({
    where: {
      organizationId,
      assignedUserId: userId,
      status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING'] },
    },
  });
  if (openTasks > 0) {
    conflicts.push({
      type: 'open_tasks',
      count: openTasks,
      message: `${openTasks} offene Aufgabe(n) sind dem Benutzer zugewiesen`,
    });
  }

  const overrides = await tx.orgTaskAutomationRuleOverride.count({
    where: {
      organizationId,
      assignedUserId: userId,
    },
  });
  if (overrides > 0) {
    conflicts.push({
      type: 'automation_override',
      count: overrides,
      message: `${overrides} Task-Automation-Override(s) referenzieren den Benutzer`,
    });
  }

  return conflicts;
}

export async function clearMembershipOverrides(
  tx: Tx,
  organizationId: string,
  userId: string,
): Promise<number> {
  const result = await tx.orgTaskAutomationRuleOverride.updateMany({
    where: {
      organizationId,
      assignedUserId: userId,
    },
    data: {
      assignedUserId: null,
    },
  });
  return result.count;
}

export async function revokePendingInvitesForEmail(
  tx: Tx,
  organizationId: string,
  email: string,
): Promise<number> {
  const result = await tx.organizationUserInvite.updateMany({
    where: {
      organizationId,
      email: email.toLowerCase(),
      status: 'PENDING',
    },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
    },
  });
  return result.count;
}

export async function revokeUserRefreshTokens(tx: Tx, userId: string): Promise<number> {
  const result = await tx.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
