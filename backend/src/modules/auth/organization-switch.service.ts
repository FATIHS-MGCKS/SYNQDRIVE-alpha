import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RefreshTokenService } from './refresh-token.service';
import { AuditService } from '@modules/activity-log/audit.service';
import {
  UserAccessAuditService,
  UserAccessAuditAction,
} from '@modules/users/user-access-audit.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import {
  mapMembershipsToOrganizationOptions,
  validateOrganizationSwitchTarget,
} from '@modules/users/policies/organization-switch.policy';
import type { LoginMembershipCandidate } from '@modules/users/policies/refresh-session-binding.policy';

export interface SwitchOrganizationInput {
  userId: string;
  currentOrganizationId: string | null;
  targetOrganizationId: string;
  refreshToken: string;
  context: { userAgent?: string; ipAddress?: string; route?: string };
}

@Injectable()
export class OrganizationSwitchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
    private readonly userAudit: UserAccessAuditService,
  ) {}

  async listActiveOrganizations(userId: string) {
    const memberships = await this.loadActiveMemberships(userId);
    return mapMembershipsToOrganizationOptions(memberships);
  }

  async switchOrganization(input: SwitchOrganizationInput) {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is inactive');
    }

    const memberships = await this.loadActiveMemberships(input.userId);
    const targetMembership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: input.userId,
        organizationId: input.targetOrganizationId,
      },
      include: { organization: true },
    });

    const candidate = targetMembership
      ? this.toLoginMembershipCandidate(targetMembership)
      : null;

    const validation = validateOrganizationSwitchTarget(
      input.targetOrganizationId,
      input.currentOrganizationId,
      candidate,
    );
    if (!validation.ok) {
      throw new ForbiddenException({
        message: validation.message,
        code: validation.code,
      });
    }

    const membership = validation.membership;

    await this.refreshTokens.revoke(
      input.refreshToken,
      'ORGANIZATION_SWITCHED',
    );

    const tokens = await this.refreshTokens.issueTokenPair(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        platformRole: user.platformRole,
        sessionVersion: user.sessionVersion,
      },
      {
        role: membership.role,
        organizationId: membership.organizationId,
        organizationName: membership.organization?.companyName ?? null,
        organizationLogoUrl: membership.organization?.logoUrl ?? null,
        permissions: membership.permissions,
        membershipId: membership.id,
        membershipVersion: membership.membershipVersion,
        organizationRoleId: membership.organizationRoleId,
      },
      {
        userAgent: input.context.userAgent,
        ipAddress: input.context.ipAddress,
      },
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSelectedOrganizationId: membership.organizationId },
    });

    void this.audit.record({
      actorUserId: user.id,
      actorOrganizationId: membership.organizationId,
      action: ActivityAction.LOGIN,
      entity: ActivityEntity.AUTH_EVENT,
      entityId: user.id,
      description: `Organization session switched to ${membership.organizationId}`,
      route: input.context.route,
      ipAddress: input.context.ipAddress,
      userAgent: input.context.userAgent,
      metaJson: {
        previousOrganizationId: input.currentOrganizationId,
        targetOrganizationId: membership.organizationId,
        membershipId: membership.id,
        availableOrganizationCount: memberships.length,
      },
    });

    void this.userAudit.record({
      organizationId: membership.organizationId,
      actorUserId: user.id,
      auditAction: UserAccessAuditAction.ORGANIZATION_SESSION_SWITCHED,
      targetUserId: user.id,
      description: `User switched organization session to ${membership.organization?.companyName ?? membership.organizationId}`,
      metadata: {
        previousOrganizationId: input.currentOrganizationId,
        targetOrganizationId: membership.organizationId,
        membershipId: membership.id,
      },
    });

    return {
      ...tokens,
      user: this.buildUserPayload(membership),
      organizations: mapMembershipsToOrganizationOptions(memberships),
    };
  }

  buildUserPayload(membership: LoginMembershipCandidate) {
    return {
      membershipRole: membership.role,
      organizationId: membership.organizationId,
      organizationName: membership.organization?.companyName ?? null,
      organizationLogoUrl: membership.organization?.logoUrl ?? null,
      permissions:
        (membership.permissions as Record<
          string,
          { read: boolean; write: boolean; manage?: boolean }
        >) ?? null,
      membershipId: membership.id,
    };
  }

  private async loadActiveMemberships(userId: string) {
    const rows = await this.prisma.organizationMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.toLoginMembershipCandidate(row));
  }

  private toLoginMembershipCandidate(row: {
    id: string;
    userId: string;
    organizationId: string;
    role: string;
    organizationRoleId: string | null;
    status: MembershipStatus;
    membershipVersion: number;
    permissions: unknown;
    organization: { companyName: string | null; logoUrl: string | null } | null;
  }): LoginMembershipCandidate {
    return {
      id: row.id,
      userId: row.userId,
      organizationId: row.organizationId,
      role: row.role,
      status: row.status,
      membershipVersion: row.membershipVersion,
      permissions: row.permissions,
      organizationRoleId: row.organizationRoleId,
      organization: row.organization,
    };
  }
}
