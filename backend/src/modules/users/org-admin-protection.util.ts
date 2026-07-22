import { BadRequestException } from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { LAST_ORG_ADMIN_MESSAGE } from '@shared/auth/permission.constants';
import { membershipHasEffectiveAdminPrivileges } from './policies/role-change-impact.policy';

type PrismaLike = {
  organizationMembership: {
    count: (args: unknown) => Promise<number>;
    findFirst: (args: unknown) => Promise<{
      role: MembershipRole;
      status: MembershipStatus;
      permissions: unknown;
    } | null>;
    findMany: (args: unknown) => Promise<
      Array<{
        id: string;
        userId: string;
        role: MembershipRole;
        status: MembershipStatus;
        permissions: unknown;
      }>
    >;
  };
};

function normalizePermissions(raw: unknown): Record<
  string,
  { read?: boolean; write?: boolean; manage?: boolean }
> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, { read?: boolean; write?: boolean; manage?: boolean }>;
}

export async function countEffectiveOrgAdmins(
  prisma: PrismaLike,
  orgId: string,
  excludeUserId?: string,
): Promise<number> {
  const memberships = await prisma.organizationMembership.findMany({
    where: {
      organizationId: orgId,
      status: MembershipStatus.ACTIVE,
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
    select: { role: true, permissions: true },
  });

  return memberships.filter((m) =>
    membershipHasEffectiveAdminPrivileges({
      membershipRole: m.role,
      permissions: normalizePermissions(m.permissions),
    }),
  ).length;
}

export async function assertNotLastEffectiveOrgAdmin(
  prisma: PrismaLike,
  orgId: string,
  targetUserId: string,
): Promise<void> {
  const membership = await prisma.organizationMembership.findFirst({
    where: { organizationId: orgId, userId: targetUserId },
    select: { role: true, status: true, permissions: true },
  });
  if (!membership) return;
  if (membership.status !== MembershipStatus.ACTIVE) return;

  const isAdmin = membershipHasEffectiveAdminPrivileges({
    membershipRole: membership.role,
    permissions: normalizePermissions(membership.permissions),
  });
  if (!isAdmin) return;

  const others = await countEffectiveOrgAdmins(prisma, orgId, targetUserId);
  if (others === 0) {
    throw new BadRequestException(LAST_ORG_ADMIN_MESSAGE);
  }
}

/** @deprecated Prefer assertNotLastEffectiveOrgAdmin — enum-only check */
export async function assertNotLastActiveOrgAdmin(
  prisma: PrismaLike,
  orgId: string,
  targetUserId: string,
): Promise<void> {
  return assertNotLastEffectiveOrgAdmin(prisma, orgId, targetUserId);
}

export async function listEffectiveOrgAdmins(
  prisma: PrismaLike,
  orgId: string,
): Promise<Array<{ membershipId: string; userId: string }>> {
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId: orgId, status: MembershipStatus.ACTIVE },
    select: { id: true, userId: true, role: true, permissions: true },
  });

  return memberships
    .filter((m) =>
      membershipHasEffectiveAdminPrivileges({
        membershipRole: m.role,
        permissions: normalizePermissions(m.permissions),
      }),
    )
    .map((m) => ({ membershipId: m.id, userId: m.userId }));
}
