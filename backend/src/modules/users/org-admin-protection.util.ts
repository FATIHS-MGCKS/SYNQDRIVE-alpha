import { BadRequestException } from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { LAST_ORG_ADMIN_MESSAGE } from '@shared/auth/permission.constants';

type PrismaLike = {
  organizationMembership: {
    count: (args: unknown) => Promise<number>;
    findFirst: (args: unknown) => Promise<{
      role: MembershipRole;
      status: MembershipStatus;
    } | null>;
  };
};

export async function assertNotLastActiveOrgAdmin(
  prisma: PrismaLike,
  orgId: string,
  targetUserId: string,
): Promise<void> {
  const membership = await prisma.organizationMembership.findFirst({
    where: { organizationId: orgId, userId: targetUserId },
    select: { role: true, status: true },
  });
  if (!membership) return;
  if (membership.role !== MembershipRole.ORG_ADMIN) return;
  if (membership.status !== MembershipStatus.ACTIVE) return;

  const others = await prisma.organizationMembership.count({
    where: {
      organizationId: orgId,
      role: MembershipRole.ORG_ADMIN,
      status: MembershipStatus.ACTIVE,
      userId: { not: targetUserId },
    },
  });
  if (others === 0) {
    throw new BadRequestException(LAST_ORG_ADMIN_MESSAGE);
  }
}
