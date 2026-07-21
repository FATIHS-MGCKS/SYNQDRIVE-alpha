import { Injectable } from '@nestjs/common';
import {
  MembershipStatus,
  Prisma,
  UserPlatformRole,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import {
  ACCESS_REVIEW_RISK,
  EffectiveAccessSnapshot,
  computeRiskReasons,
  extractPrivilegedCapabilities,
} from './iam-access-review.policy';

type MembershipRow = {
  id: string;
  userId: string;
  organizationId: string;
  role: EffectiveAccessSnapshot['effectiveRole'];
  organizationRoleId: string | null;
  roleLabel: string | null;
  stationScope: string | null;
  stationIds: Prisma.JsonValue;
  permissions: Prisma.JsonValue;
  status: MembershipStatus;
  membershipVersion: number;
  user: {
    email: string;
    status: EffectiveAccessSnapshot['userStatus'];
    platformRole: UserPlatformRole;
    lastLoginAt: Date | null;
  };
  organizationRole: { isActive: boolean } | null;
};

@Injectable()
export class IamAccessReviewSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async buildSnapshotsForOrganization(
    organizationId: string,
    membershipFilter?: (
      row: MembershipRow,
      ctx: {
        flags: {
          privileged: boolean;
          isSingleOrgAdmin: boolean;
          inactive: boolean;
          invalidRole: boolean;
          overdueReview: boolean;
        };
      },
    ) => boolean,
  ): Promise<EffectiveAccessSnapshot[]> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED] },
      },
      include: {
        user: {
          select: {
            email: true,
            status: true,
            platformRole: true,
            lastLoginAt: true,
          },
        },
        organizationRole: { select: { isActive: true } },
      },
    });

    const adminCount = memberships.filter(
      (m) => m.role === 'ORG_ADMIN' && m.status === MembershipStatus.ACTIVE,
    ).length;

    const overdueUserIds = await this.findOverdueReviewUserIds(organizationId);

    const snapshots: EffectiveAccessSnapshot[] = [];
    for (const membership of memberships) {
      const ctx = await this.buildMembershipContext(
        organizationId,
        membership as MembershipRow,
        adminCount,
        overdueUserIds.has(membership.userId),
      );
      if (membershipFilter && !membershipFilter(membership as MembershipRow, ctx)) {
        continue;
      }
      snapshots.push(ctx.snapshot);
    }
    return snapshots;
  }

  async buildSnapshotForMembership(
    organizationId: string,
    membershipId: string,
  ): Promise<EffectiveAccessSnapshot | null> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId },
      include: {
        user: {
          select: {
            email: true,
            status: true,
            platformRole: true,
            lastLoginAt: true,
          },
        },
        organizationRole: { select: { isActive: true } },
      },
    });
    if (!membership) return null;

    const adminCount = await this.prisma.organizationMembership.count({
      where: {
        organizationId,
        role: 'ORG_ADMIN',
        status: MembershipStatus.ACTIVE,
      },
    });
    const overdueUserIds = await this.findOverdueReviewUserIds(organizationId);
    const ctx = await this.buildMembershipContext(
      organizationId,
      membership as MembershipRow,
      adminCount,
      overdueUserIds.has(membership.userId),
    );
    return ctx.snapshot;
  }

  private async buildMembershipContext(
    organizationId: string,
    membership: MembershipRow,
    adminCount: number,
    hasOverdueReview: boolean,
  ) {
    const permissions = normalizeMembershipPermissions(membership.permissions);
    const stationIds = Array.isArray(membership.stationIds)
      ? (membership.stationIds as string[])
      : null;

    const [lastActivityAt, mfaEnrolled, activeSessionCount] = await Promise.all([
      this.resolveLastActivity(organizationId, membership.userId, membership.user.lastLoginAt),
      this.isMfaEnrolled(membership.userId),
      this.countActiveSessions(membership.userId),
    ]);

    const roleIsActive = membership.organizationRole?.isActive ?? false;
    const isSingleOrgAdmin =
      membership.role === 'ORG_ADMIN' &&
      membership.status === MembershipStatus.ACTIVE &&
      adminCount === 1;

    const riskReasons = computeRiskReasons({
      platformRole: membership.user.platformRole,
      userStatus: membership.user.status,
      membershipRole: membership.role,
      permissions,
      mfaEnrolled,
      lastActivityAt,
      roleIsActive,
      organizationRoleId: membership.organizationRoleId,
      isSingleOrgAdmin,
      hasOverdueReview,
    });

    const privilegedCapabilities = extractPrivilegedCapabilities(permissions);
    if (
      membership.role === 'ORG_ADMIN' ||
      membership.role === 'SUB_ADMIN' ||
      membership.user.platformRole === UserPlatformRole.MASTER_ADMIN
    ) {
      privilegedCapabilities.push(`role:${membership.role}`);
    }

    const snapshot: EffectiveAccessSnapshot = {
      membershipId: membership.id,
      userId: membership.userId,
      membershipStatus: membership.status,
      membershipVersion: membership.membershipVersion,
      effectiveRole: membership.role,
      effectiveRoleId: membership.organizationRoleId,
      effectiveRoleLabel: membership.roleLabel,
      privilegedCapabilities,
      stationScope: membership.stationScope,
      stationIds,
      permissions,
      lastActivityAt: lastActivityAt?.toISOString() ?? null,
      mfaEnrolled,
      activeSessionCount,
      riskReasons,
      platformRole: membership.user.platformRole,
      userStatus: membership.user.status,
      userEmail: membership.user.email,
      roleIsActive,
    };

    return {
      snapshot,
      flags: {
        privileged: riskReasons.includes(ACCESS_REVIEW_RISK.PRIVILEGED_ACCOUNT) ||
          riskReasons.includes(ACCESS_REVIEW_RISK.BREAK_GLASS_CANDIDATE),
        isSingleOrgAdmin,
        inactive: riskReasons.includes(ACCESS_REVIEW_RISK.INACTIVE_USER),
        invalidRole: riskReasons.includes(ACCESS_REVIEW_RISK.INVALID_ROLE),
        overdueReview: riskReasons.includes(ACCESS_REVIEW_RISK.OVERDUE_REVIEW),
      },
    };
  }

  private async resolveLastActivity(
    organizationId: string,
    userId: string,
    lastLoginAt: Date | null,
  ): Promise<Date | null> {
    const latestLog = await this.prisma.activityLog.findFirst({
      where: {
        organizationId,
        userId,
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const candidates = [lastLoginAt, latestLog?.createdAt].filter(Boolean) as Date[];
    if (candidates.length === 0) return null;
    return candidates.reduce((a, b) => (a > b ? a : b));
  }

  private async isMfaEnrolled(userId: string): Promise<boolean> {
    const factor = await this.prisma.userMfaFactor.findFirst({
      where: { userId, enabledAt: { not: null } },
      select: { id: true },
    });
    return Boolean(factor);
  }

  private async countActiveSessions(userId: string): Promise<number> {
    const now = new Date();
    return this.prisma.refreshToken.count({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
        replacedBy: null,
      },
    });
  }

  private async findOverdueReviewUserIds(organizationId: string): Promise<Set<string>> {
    const overdueCampaigns = await this.prisma.accessReviewCampaign.findMany({
      where: {
        organizationId,
        status: 'OVERDUE',
      },
      select: { id: true },
    });
    if (overdueCampaigns.length === 0) return new Set();

    const pendingItems = await this.prisma.accessReviewItem.findMany({
      where: {
        organizationId,
        campaignId: { in: overdueCampaigns.map((c) => c.id) },
        status: 'PENDING',
      },
      select: { userId: true },
    });
    return new Set(pendingItems.map((i) => i.userId));
  }
}
