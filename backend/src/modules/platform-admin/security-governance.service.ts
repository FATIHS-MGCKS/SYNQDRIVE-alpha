import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ActivityEntity,
  MembershipStatus,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamMfaService } from '@modules/iam-mfa/iam-mfa.service';
import { resolveIamMfaMasterAdminEnabled } from '@modules/iam-mfa/iam-mfa-feature-flags.resolver';
import {
  buildPaginatedResult,
  parsePagination,
  type PaginationParams,
} from '@shared/utils/pagination';
import { MASTER_ADMIN_AUDIT_DOMAIN } from '@modules/activity-log/master-admin-audit.contract';
import {
  buildPermissionGroups,
  extractCriticalCapabilities,
} from './security-governance-permissions.util';
import type {
  GovernanceMfaState,
  GovernanceRoleDetailDto,
  GovernanceUserDetailDto,
  GovernanceUserListItemDto,
  OrgRoleSummaryDto,
  PlatformRoleSummaryDto,
  SecurityAttentionCode,
  SecurityAttentionItem,
  SecurityAttentionSummaryDto,
} from './security-governance.types';

const ROLE_DISPLAY: Record<string, string> = {
  ORG_ADMIN: 'Org Admin',
  SUB_ADMIN: 'Sub Admin',
  WORKER: 'Worker',
  DRIVER: 'Driver',
};

const USER_STATUS_MAP: Record<string, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
};

@Injectable()
export class SecurityGovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly iamMfa: IamMfaService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async getAttentionSummary(): Promise<SecurityAttentionSummaryDto> {
    const mfaPolicy = resolveIamMfaMasterAdminEnabled();
    const masterAdmins = await this.prisma.user.findMany({
      where: { platformRole: UserPlatformRole.MASTER_ADMIN },
      select: { id: true, email: true, name: true, status: true },
    });
    const enrolled = await this.getMfaEnrolledUserIds(masterAdmins.map((u) => u.id));

    const byCode: Record<SecurityAttentionCode, number> = {
      MFA_MISSING: 0,
      MFA_REQUIRED: 0,
      ACCOUNT_LOCKED: 0,
      ACCOUNT_SUSPENDED: 0,
      PRIVILEGE_CHANGED: 0,
    };
    const topItems: SecurityAttentionItem[] = [];

    for (const admin of masterAdmins) {
      if (mfaPolicy && !enrolled.has(admin.id)) {
        byCode.MFA_MISSING++;
        topItems.push({
          code: 'MFA_MISSING',
          userId: admin.id,
          displayName: admin.name || admin.email,
          email: admin.email,
          message: 'Plattform-Administrator ohne MFA',
        });
      }
      if (admin.status === UserStatus.SUSPENDED) {
        byCode.ACCOUNT_SUSPENDED++;
        topItems.push({
          code: 'ACCOUNT_SUSPENDED',
          userId: admin.id,
          displayName: admin.name || admin.email,
          email: admin.email,
          message: 'Konto gesperrt',
        });
      }
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentPrivileged = await this.prisma.activityLog.count({
      where: {
        createdAt: { gte: since },
        OR: [
          {
            metaJson: {
              path: ['auditDomain'],
              equals: MASTER_ADMIN_AUDIT_DOMAIN,
            },
          },
          { entity: ActivityEntity.ADMIN_OPERATION },
        ],
      },
    });
    if (recentPrivileged > 0) {
      byCode.PRIVILEGE_CHANGED = Math.min(recentPrivileged, 99);
    }

    const total = Object.values(byCode).reduce((a, b) => a + b, 0);

    return {
      total,
      byCode,
      topItems: topItems.slice(0, 10),
      generatedAt: new Date().toISOString(),
      mfaMasterAdminPolicyEnabled: mfaPolicy,
    };
  }

  async listUsers(
    params: PaginationParams & {
      search?: string;
      platformRole?: string;
      mfaState?: string;
      attention?: string;
      organizationId?: string;
    },
  ) {
    const { skip, take } = parsePagination(params);
    const where: Record<string, unknown> = {};

    if (params.platformRole === 'MASTER_ADMIN') {
      where.platformRole = UserPlatformRole.MASTER_ADMIN;
    }

    if (params.organizationId) {
      where.memberships = {
        some: { organizationId: params.organizationId, status: { not: MembershipStatus.REMOVED } },
      };
    }

    if (params.search?.trim()) {
      const q = params.search.trim();
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { lastLoginAt: 'desc' },
        include: {
          memberships: {
            include: { organization: { select: { id: true, companyName: true } } },
            where: { status: { not: MembershipStatus.REMOVED } },
            orderBy: { createdAt: 'asc' },
            take: 3,
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const enrolled = await this.getMfaEnrolledUserIds(users.map((u) => u.id));
    const sessionCounts = await this.countActiveSessions(users.map((u) => u.id));
    const mfaPolicy = resolveIamMfaMasterAdminEnabled();

    const mapped: GovernanceUserListItemDto[] = [];
    for (const user of users) {
      const item = await this.mapListItem(user, enrolled, sessionCounts, mfaPolicy);
      if (params.mfaState && item.mfaState !== params.mfaState) continue;
      if (params.attention === 'any' && item.attentionCodes.length === 0) continue;
      if (params.attention && params.attention !== 'any') {
        if (!item.attentionCodes.includes(params.attention as SecurityAttentionCode)) continue;
      }
      mapped.push(item);
    }

    return buildPaginatedResult(mapped, total, params);
  }

  async getUserDetail(userId: string): Promise<GovernanceUserDetailDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            organization: { select: { id: true, companyName: true } },
            organizationRole: { select: { id: true, name: true } },
          },
          where: { status: { not: MembershipStatus.REMOVED } },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const enrolled = await this.getMfaEnrolledUserIds([userId]);
    const sessionCounts = await this.countActiveSessions([userId]);
    const mfaPolicy = resolveIamMfaMasterAdminEnabled();
    const base = await this.mapListItem(user, enrolled, sessionCounts, mfaPolicy);

    const mfaStatus = await this.iamMfa.getStatus({
      userId: user.id,
      email: user.email,
      platformRole: user.platformRole,
      membershipRole: user.memberships[0]?.role ?? null,
      organizationId: user.memberships[0]?.organizationId ?? null,
    });

    const recentPrivilegedActivity = await this.prisma.activityLog.findMany({
      where: {
        OR: [{ userId }, { entityId: userId }],
        AND: [
          {
            OR: [
              { entity: ActivityEntity.ADMIN_OPERATION },
              { entity: ActivityEntity.AUTH_EVENT },
              {
                metaJson: {
                  path: ['auditDomain'],
                  equals: MASTER_ADMIN_AUDIT_DOMAIN,
                },
              },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      ...base,
      createdAt: user.createdAt.toISOString(),
      memberships: user.memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization?.companyName ?? '',
        role: m.role,
        roleLabel: m.organizationRole?.name ?? ROLE_DISPLAY[m.role] ?? m.role,
        status: m.status,
      })),
      mfa: {
        enrolled: mfaStatus.enrolled,
        factorTypes: mfaStatus.factorTypes,
        recoveryCodesRemaining: mfaStatus.recoveryCodesRemaining,
        enrollmentRequired: mfaStatus.enrollmentRequired,
        stepUpEnforced: mfaStatus.stepUpEnforced,
      },
      recentPrivilegedActivity: recentPrivilegedActivity.map((e) => ({
        id: e.id,
        action: e.action,
        description: e.description,
        createdAt: e.createdAt.toISOString(),
        result: 'success',
      })),
    };
  }

  async listUserSessions(userId: string) {
    const tokens = await this.refreshTokens.listSessionsForUser(userId);
    return tokens.map((t) => ({
      id: t.id,
      current: false,
      userAgent: t.userAgent,
      browser: this.parseUa(t.userAgent).browser,
      device: this.parseUa(t.userAgent).device,
      os: this.parseUa(t.userAgent).os,
      ipAddress: this.maskIp(t.ipAddress),
      ipAddressFull: t.ipAddress,
      createdAt: t.createdAt.toISOString(),
      expiresAt: t.expiresAt.toISOString(),
      revokedAt: t.revokedAt?.toISOString() ?? null,
      lastUsedAt: t.createdAt.toISOString(),
      status: t.revokedAt ? 'revoked' : t.expiresAt < new Date() ? 'expired' : 'active',
    }));
  }

  async listPlatformRoles(): Promise<PlatformRoleSummaryDto[]> {
    const masterCount = await this.prisma.user.count({
      where: { platformRole: UserPlatformRole.MASTER_ADMIN },
    });

    return [
      {
        id: 'MASTER_ADMIN',
        name: 'Plattform-Administrator',
        scope: 'platform',
        type: 'system',
        userCount: masterCount,
        criticalCapabilities: [
          'Vollzugriff Control Plane',
          'Alle Mandanten',
          'Privilegierte Mutationen',
        ],
        description: 'Vollständiger Zugriff auf die Master-Admin Control Plane.',
        lastModified: null,
      },
    ];
  }

  async listOrgRoles(params: PaginationParams & { organizationId?: string; search?: string }) {
    const { skip, take } = parsePagination(params);
    const where: Record<string, unknown> = { isActive: true };
    if (params.organizationId) where.organizationId = params.organizationId;
    if (params.search?.trim()) {
      where.name = { contains: params.search.trim(), mode: 'insensitive' };
    }

    const [roles, total] = await Promise.all([
      this.prisma.organizationRole.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: { organization: { select: { companyName: true } } },
      }),
      this.prisma.organizationRole.count({ where }),
    ]);

    const roleIds = roles.map((r) => r.id);
    const assignmentCounts = roleIds.length
      ? await this.prisma.organizationMembership.groupBy({
          by: ['organizationRoleId'],
          where: { organizationRoleId: { in: roleIds }, status: MembershipStatus.ACTIVE },
          _count: true,
        })
      : [];
    const countMap = new Map(
      assignmentCounts.map((a) => [a.organizationRoleId, a._count]),
    );

    const data: OrgRoleSummaryDto[] = roles.map((role) => {
      const perms = role.permissions as Record<
        string,
        { read?: boolean; write?: boolean; manage?: boolean }
      > | null;
      return {
        id: role.id,
        name: role.name,
        scope: 'organization',
        organizationId: role.organizationId,
        organizationName: role.organization?.companyName ?? '',
        type: role.isSystemTemplate ? 'system' : 'custom',
        userCount: countMap.get(role.id) ?? 0,
        criticalCapabilities: extractCriticalCapabilities(perms),
        description: role.description,
        lastModified: role.updatedAt.toISOString(),
      };
    });

    return buildPaginatedResult(data, total, params);
  }

  async getRoleDetail(
    roleId: string,
    scope: 'platform' | 'organization',
    orgId?: string,
  ): Promise<GovernanceRoleDetailDto> {
    if (scope === 'platform') {
      const platformRoles = await this.listPlatformRoles();
      const role = platformRoles.find((r) => r.id === roleId);
      if (!role) throw new NotFoundException('Role not found');
      return {
        id: role.id,
        name: role.name,
        scope: 'platform',
        organizationId: null,
        organizationName: null,
        type: 'system',
        description: role.description,
        userCount: role.userCount,
        criticalCapabilities: role.criticalCapabilities,
        permissionGroups: [],
        assignedUserIds: [],
        lastModified: role.lastModified,
        modifiedBy: null,
      };
    }

    const role = await this.prisma.organizationRole.findFirst({
      where: { id: roleId, organizationId: orgId },
      include: {
        organization: { select: { companyName: true } },
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!role) throw new NotFoundException('Role not found');

    const memberships = await this.prisma.organizationMembership.findMany({
      where: { organizationRoleId: roleId, status: MembershipStatus.ACTIVE },
      select: { userId: true },
      take: 20,
    });

    const perms = role.permissions as Record<
      string,
      { read?: boolean; write?: boolean; manage?: boolean }
    > | null;

    const lastVersion = role.versions[0];

    return {
      id: role.id,
      name: role.name,
      scope: 'organization',
      organizationId: role.organizationId,
      organizationName: role.organization?.companyName ?? '',
      type: role.isSystemTemplate ? 'system' : 'custom',
      description: role.description ?? '',
      userCount: memberships.length,
      criticalCapabilities: extractCriticalCapabilities(perms),
      permissionGroups: buildPermissionGroups(perms),
      assignedUserIds: memberships.map((m) => m.userId),
      lastModified: role.updatedAt.toISOString(),
      modifiedBy: lastVersion?.createdByUserId ?? null,
    };
  }

  private async getMfaEnrolledUserIds(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const factors = await this.prisma.userMfaFactor.findMany({
      where: { userId: { in: userIds }, enabledAt: { not: null } },
      select: { userId: true },
      distinct: ['userId'],
    });
    return new Set(factors.map((f) => f.userId));
  }

  private async countActiveSessions(userIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (userIds.length === 0) return map;
    const rows = await this.prisma.refreshToken.groupBy({
      by: ['userId'],
      where: {
        userId: { in: userIds },
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      _count: true,
    });
    for (const row of rows) {
      map.set(row.userId, row._count);
    }
    return map;
  }

  private resolveMfaState(
    user: { id: string; platformRole: UserPlatformRole },
    enrolled: Set<string>,
    mfaPolicy: boolean,
  ): GovernanceMfaState {
    const isEnrolled = enrolled.has(user.id);
    if (isEnrolled) return 'ENABLED';
    if (user.platformRole === UserPlatformRole.MASTER_ADMIN && mfaPolicy) {
      return 'REQUIRED';
    }
    return 'DISABLED';
  }

  private resolveAttentionCodes(
    user: { id: string; platformRole: UserPlatformRole; status: UserStatus },
    mfaState: GovernanceMfaState,
  ): SecurityAttentionCode[] {
    const codes: SecurityAttentionCode[] = [];
    if (mfaState === 'REQUIRED') codes.push('MFA_MISSING');
    if (user.status === UserStatus.SUSPENDED) codes.push('ACCOUNT_SUSPENDED');
    if (user.status === UserStatus.INACTIVE) codes.push('ACCOUNT_LOCKED');
    return codes;
  }

  private async mapListItem(
    user: {
      id: string;
      email: string;
      name: string | null;
      platformRole: UserPlatformRole;
      status: UserStatus;
      lastLoginAt: Date | null;
      updatedAt: Date;
      memberships: Array<{
        role: string;
        status: MembershipStatus;
        organizationId: string;
        organization?: { id: string; companyName: string };
      }>;
    },
    enrolled: Set<string>,
    sessionCounts: Map<string, number>,
    mfaPolicy: boolean,
  ): Promise<GovernanceUserListItemDto> {
    const isMasterAdmin = user.platformRole === UserPlatformRole.MASTER_ADMIN;
    const membership = user.memberships[0];
    const mfaState = this.resolveMfaState(user, enrolled, mfaPolicy);
    const attentionCodes = this.resolveAttentionCodes(user, mfaState);

    let role = 'Worker';
    let organizationId = '';
    let organizationName = '';
    let status = USER_STATUS_MAP[user.status] || 'Active';

    if (isMasterAdmin) {
      role = 'Master Admin';
      if (membership) {
        organizationId = membership.organizationId;
        organizationName = membership.organization?.companyName ?? '';
      }
    } else if (membership) {
      role = ROLE_DISPLAY[membership.role] || membership.role;
      organizationId = membership.organizationId;
      organizationName = membership.organization?.companyName ?? '';
      status =
        membership.status === MembershipStatus.INVITED
          ? 'Invited'
          : USER_STATUS_MAP[user.status] || 'Active';
    }

    return {
      id: user.id,
      name: user.name || '',
      email: user.email,
      role,
      platformRole: isMasterAdmin ? 'MASTER_ADMIN' : null,
      organizationId,
      organizationName,
      accountState: status,
      status,
      mfaState,
      attentionCodes,
      lastActive: user.lastLoginAt?.toISOString() ?? user.updatedAt.toISOString(),
      activeSessionCount: sessionCounts.get(user.id) ?? 0,
    };
  }

  private maskIp(ip: string | null | undefined): string | null {
    if (!ip) return null;
    if (ip.includes('.')) {
      const parts = ip.split('.');
      if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
    }
    return ip.length > 8 ? `${ip.slice(0, 8)}…` : ip;
  }

  private parseUa(ua: string | null): { browser: string; device: string; os: string } {
    if (!ua) return { browser: 'Unbekannt', device: 'Unbekannt', os: 'Unbekannt' };
    const browser = /Chrome/i.test(ua)
      ? 'Chrome'
      : /Firefox/i.test(ua)
        ? 'Firefox'
        : /Safari/i.test(ua)
          ? 'Safari'
          : 'Browser';
    const os = /Windows/i.test(ua)
      ? 'Windows'
      : /Mac OS/i.test(ua)
        ? 'macOS'
        : /Android/i.test(ua)
          ? 'Android'
          : /iPhone|iPad/i.test(ua)
            ? 'iOS'
            : /Linux/i.test(ua)
              ? 'Linux'
              : 'Unbekannt';
    return { browser, device: os, os };
  }
}
