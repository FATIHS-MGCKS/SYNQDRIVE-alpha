import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  MembershipStatus,
  OrganizationInviteStatus,
  UserStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { isPrivilegedAccount } from '@modules/iam-mfa/iam-mfa.policy';
import { resolveIamMfaEffectiveFeatureFlags } from '@modules/iam-mfa/iam-mfa-feature-flags.resolver';
import { IamAccessReviewSnapshotService } from './iam-access-review-snapshot.service';
import {
  ACCESS_REVIEW_RISK,
  type AccessReviewRiskReason,
} from './iam-access-review.policy';
import { OrganizationRoleService } from './organization-role.service';
import { TransactionalMailService } from './transactional-mail.service';
import type {
  IamEffectiveAccess,
  IamMfaState,
  IamReviewState,
  IamRiskClassification,
  IamRoleDetail,
  IamRoleListItem,
  IamSecurityOverview,
  IamTeamKpis,
  IamTeamListItem,
  IamTeamMemberDetail,
  IamUserSummary,
} from './iam-team.contract';

@Injectable()
export class IamTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: IamAccessReviewSnapshotService,
    private readonly roles: OrganizationRoleService,
    private readonly mail: TransactionalMailService,
    private readonly config: ConfigService,
  ) {}

  async getKpis(organizationId: string): Promise<IamTeamKpis> {
    const [snapshots, openInvites] = await Promise.all([
      this.snapshots.buildSnapshotsForOrganization(organizationId),
      this.prisma.organizationUserInvite.count({
        where: { organizationId, status: OrganizationInviteStatus.PENDING },
      }),
    ]);

    const activeUsers = snapshots.filter(
      (s) => s.membershipStatus === MembershipStatus.ACTIVE && s.userStatus === UserStatus.ACTIVE,
    ).length;

    const privilegedAccounts = snapshots.filter((s) =>
      s.riskReasons.includes(ACCESS_REVIEW_RISK.PRIVILEGED_ACCOUNT) ||
      s.riskReasons.includes(ACCESS_REVIEW_RISK.BREAK_GLASS_CANDIDATE),
    ).length;

    const reviewRequired = snapshots.filter(
      (s) =>
        s.riskReasons.includes(ACCESS_REVIEW_RISK.OVERDUE_REVIEW) ||
        s.riskReasons.some((r) =>
          [
            ACCESS_REVIEW_RISK.SINGLE_ORG_ADMIN,
            ACCESS_REVIEW_RISK.MFA_NOT_ENROLLED,
            ACCESS_REVIEW_RISK.INVALID_ROLE,
          ].includes(r as typeof ACCESS_REVIEW_RISK.SINGLE_ORG_ADMIN),
        ),
    ).length;

    return { activeUsers, openInvites, privilegedAccounts, reviewRequired };
  }

  async listTeam(organizationId: string, query?: { search?: string }): Promise<IamTeamListItem[]> {
    const [snapshots, invites, stations] = await Promise.all([
      this.snapshots.buildSnapshotsForOrganization(organizationId),
      this.prisma.organizationUserInvite.findMany({
        where: {
          organizationId,
          status: { in: [OrganizationInviteStatus.PENDING, OrganizationInviteStatus.EXPIRED] },
        },
        include: {
          organizationRole: { select: { name: true, membershipRole: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.station.findMany({
        where: { organizationId },
        select: { id: true, name: true },
      }),
    ]);

    const stationNameById = new Map(stations.map((s) => [s.id, s.name]));
    const memberEmails = new Set(snapshots.map((s) => s.userEmail.toLowerCase()));

    const members: IamTeamListItem[] = await Promise.all(
      snapshots.map(async (snapshot) => {
        const membership = await this.prisma.organizationMembership.findUnique({
          where: { id: snapshot.membershipId },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
                status: true,
              },
            },
          },
        });
        const user = membership?.user;
        return this.mapListItemFromSnapshot(snapshot, user, stationNameById, organizationId);
      }),
    );

    const inviteItems: IamTeamListItem[] = invites
      .filter((inv) => !memberEmails.has(inv.email.toLowerCase()))
      .map((inv) => ({
        kind: 'INVITE' as const,
        membershipId: null,
        inviteId: inv.id,
        userSummary: {
          userId: null,
          email: inv.email,
          displayName: inv.email,
          avatarUrl: null,
          status: 'Invited',
        },
        membershipStatus: 'INVITED',
        effectiveRole: inv.membershipRole,
        effectiveRoleLabel: inv.organizationRole?.name ?? inv.membershipRole,
        riskClassification: 'LOW' as IamRiskClassification,
        stationScopeSummary: '—',
        mfaState: this.resolveMfaState(false, this.isMfaFeatureActive(organizationId), []),
        activeSessionCount: 0,
        lastActivityAt: null,
        reviewState: 'NONE' as IamReviewState,
        requiresAction: inv.status === OrganizationInviteStatus.PENDING,
        reasonCodes: [] as AccessReviewRiskReason[],
      }));

    let items = [...members, ...inviteItems];
    const q = query?.search?.trim().toLowerCase();
    if (q) {
      items = items.filter((item) => {
        const hay = `${item.userSummary.displayName} ${item.userSummary.email} ${item.effectiveRoleLabel ?? ''}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return items;
  }

  async getMemberDetail(
    organizationId: string,
    membershipId: string,
  ): Promise<IamTeamMemberDetail> {
    const snapshot = await this.snapshots.buildSnapshotForMembership(organizationId, membershipId);
    if (!snapshot) throw new NotFoundException('Membership not found');

    const membership = await this.prisma.organizationMembership.findFirst({
      where: { id: membershipId, organizationId },
      include: {
        user: true,
        organizationRole: true,
      },
    });
    if (!membership) throw new NotFoundException('Membership not found');

    const stations = await this.prisma.station.findMany({
      where: { organizationId },
      select: { id: true, name: true },
    });
    const stationNameById = new Map(stations.map((s) => [s.id, s.name]));
    const stationIds = snapshot.stationIds ?? [];
    const stationNames = stationIds.map((id) => stationNameById.get(id) ?? id);

    const rolePermissions = membership.organizationRole
      ? normalizeMembershipPermissions(membership.organizationRole.permissions)
      : null;
    const effectivePermissions = snapshot.permissions;

    const [sessions, securityEvents, inviteHistory, accessReviews, auditTimeline] =
      await Promise.all([
        this.loadSessions(membership.userId),
        this.loadSecurityEvents(organizationId, membership.userId),
        this.loadInviteHistory(organizationId, membership.user.email),
        this.loadAccessReviews(organizationId, membership.userId),
        this.loadAuditTimeline(organizationId, membership.userId),
      ]);

    const mfaState = this.resolveMfaState(
      snapshot.mfaEnrolled,
      this.isMfaFeatureActive(organizationId),
      snapshot.riskReasons,
    );
    const reviewState = this.resolveReviewState(snapshot.riskReasons);
    const riskClassification = this.classifyRisk(snapshot.riskReasons);
    const isLastOrgAdmin = snapshot.riskReasons.includes(ACCESS_REVIEW_RISK.SINGLE_ORG_ADMIN);

    const availableActions = await this.buildAvailableActions({
      organizationId,
      userId: membership.userId,
      membershipId,
      membershipStatus: membership.status,
      isLastOrgAdmin,
      activeSessionCount: snapshot.activeSessionCount,
      hasPendingReview: reviewState === 'PENDING' || reviewState === 'OVERDUE',
    });

    return {
      membershipId,
      userId: membership.userId,
      userSummary: this.mapUserSummary(membership.user),
      membershipStatus: membership.status,
      effectiveAccess: {
        membershipId,
        membershipVersion: snapshot.membershipVersion,
        effectiveRole: snapshot.effectiveRole,
        effectiveRoleId: snapshot.effectiveRoleId,
        effectiveRoleLabel: snapshot.effectiveRoleLabel,
        privilegedCapabilities: snapshot.privilegedCapabilities,
        permissions: effectivePermissions,
        stationScope: snapshot.stationScope,
        stationIds: snapshot.stationIds,
        stationNames,
        fieldAgentAccess: membership.fieldAgentAccess,
        riskClassification,
        reasonCodes: snapshot.riskReasons,
        isLastOrgAdmin,
      },
      inheritedPermissions: rolePermissions,
      overrides: {
        permissions: this.diffPermissions(rolePermissions, effectivePermissions),
        stationScope: membership.stationScope,
        stationIds,
        fieldAgentAccess: membership.fieldAgentAccess,
      },
      roleVersion: membership.organizationRole?.updatedAt.toISOString() ?? membership.updatedAt.toISOString(),
      scope: {
        stationScope: membership.stationScope,
        stationIds,
        stationNames,
        fieldAgentAccess: membership.fieldAgentAccess,
      },
      sessions,
      securityEvents,
      inviteHistory,
      accessReviews,
      auditTimeline,
      mfaState,
      reviewState,
      requiresAction: snapshot.riskReasons.length > 0,
      reasonCodes: snapshot.riskReasons,
      availableActions,
    };
  }

  async listRoles(organizationId: string): Promise<IamRoleListItem[]> {
    await this.roles.ensureDefaultRoles(organizationId);
    const roleRows = await this.prisma.organizationRole.findMany({
      where: { organizationId, isActive: true },
      orderBy: [{ isSystemTemplate: 'desc' }, { name: 'asc' }],
    });

    const assignmentCounts = await this.prisma.organizationMembership.groupBy({
      by: ['organizationRoleId'],
      where: {
        organizationId,
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED] },
        organizationRoleId: { not: null },
      },
      _count: { _all: true },
    });
    const countByRole = new Map(
      assignmentCounts.map((row) => [row.organizationRoleId!, row._count._all]),
    );

    return roleRows.map((role) => {
      const permissions = normalizeMembershipPermissions(role.permissions);
      const privileged = isPrivilegedAccount({
        membershipRole: role.membershipRole,
        permissions,
      });
      return {
        id: role.id,
        name: role.name,
        description: role.description,
        membershipRole: role.membershipRole,
        assignmentCount: countByRole.get(role.id) ?? 0,
        riskClassification: privileged ? 'HIGH' : 'LOW',
        roleVersion: role.updatedAt.toISOString(),
        lastChangedAt: role.updatedAt.toISOString(),
        isSystemTemplate: role.isSystemTemplate,
        isDefault: role.isDefault,
        followsLatest: role.isSystemTemplate,
        pinned: role.isDefault,
        isActive: role.isActive,
      };
    });
  }

  async getRoleDetail(organizationId: string, roleId: string): Promise<IamRoleDetail> {
    const preview = await this.roles.permissionPreview(organizationId, roleId);
    const list = await this.listRoles(organizationId);
    const base = list.find((r) => r.id === roleId);
    if (!base) throw new NotFoundException('Role not found');

    const assignments = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        organizationRoleId: roleId,
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED] },
      },
      include: {
        user: { select: { id: true, email: true, name: true, firstName: true, lastName: true } },
      },
      take: 50,
    });

    const privilegedCapabilities = Object.entries(preview.permissions ?? {})
      .filter(([, level]) => Boolean(level?.manage))
      .map(([module]) => `${module}:manage`);

    return {
      ...base,
      effectivePermissions: preview.permissions,
      overrides: {
        stationScopeDefault: preview.stationScopeDefault,
        defaultStationIds: Array.isArray(preview.defaultStationIds)
          ? (preview.defaultStationIds as string[])
          : [],
        fieldAgentAccessDefault: preview.fieldAgentAccessDefault,
      },
      impactPreview: {
        affectedMemberCount: assignments.length,
        privilegedCapabilities,
        stationScopeImpact: preview.stationScopeDefault ?? 'all',
      },
      assignments: assignments.map((m) => ({
        membershipId: m.id,
        userId: m.userId,
        displayName: m.user.name || `${m.user.firstName ?? ''} ${m.user.lastName ?? ''}`.trim() || m.user.email,
        email: m.user.email,
        membershipStatus: m.status,
      })),
    };
  }

  async getSecurityOverview(organizationId: string): Promise<IamSecurityOverview> {
    const [items, kpis, campaigns, auditRows, loginEvents] = await Promise.all([
      this.listTeam(organizationId),
      this.getKpis(organizationId),
      this.prisma.accessReviewCampaign.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          _count: { select: { items: { where: { status: 'PENDING' } } } },
        },
      }),
      this.prisma.activityLog.findMany({
        where: {
          organizationId,
          entity: {
            in: [
              ActivityEntity.USER,
              ActivityEntity.ORGANIZATION_INVITE,
              ActivityEntity.ORGANIZATION_ROLE,
              ActivityEntity.REFRESH_TOKEN,
              ActivityEntity.AUTH_EVENT,
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.activityLog.findMany({
        where: {
          organizationId,
          action: { in: [ActivityAction.AUTH_FAIL, ActivityAction.LOGIN, ActivityAction.LOGOUT] },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const mfaSummary: Record<IamMfaState, number> = {
      ENABLED: 0,
      DISABLED: 0,
      REQUIRED: 0,
      UNKNOWN: 0,
      NOT_SUPPORTED: 0,
      ACTION_REQUIRED: 0,
    };
    let activeSessions = 0;
    for (const item of items.filter((i) => i.kind === 'MEMBER')) {
      mfaSummary[item.mfaState]++;
      activeSessions += item.activeSessionCount;
    }

    const privilegedMembers = items
      .filter((i) => i.kind === 'MEMBER' && (i.riskClassification === 'HIGH' || i.riskClassification === 'CRITICAL'))
      .map((i) => ({
        membershipId: i.membershipId!,
        userId: i.userSummary.userId!,
        displayName: i.userSummary.displayName,
        email: i.userSummary.email,
        riskClassification: i.riskClassification,
        mfaState: i.mfaState,
      }));

    return {
      mfaSummary,
      activeSessions,
      privilegedAccounts: kpis.privilegedAccounts,
      reviewRequired: kpis.reviewRequired,
      loginSecurityEvents: loginEvents.map((row) => ({
        id: row.id,
        userId: row.userId,
        description: row.description,
        createdAt: row.createdAt.toISOString(),
        level: row.level ?? 'INFO',
      })),
      iamAudit: auditRows.map((row) => ({
        id: row.id,
        auditAction: (row.metaJson as Record<string, unknown> | null)?.auditAction as string | null,
        description: row.description,
        createdAt: row.createdAt.toISOString(),
        level: row.level ?? 'INFO',
      })),
      accessReviews: campaigns.map((c) => ({
        id: c.id,
        status: c.status,
        scope: c.scope,
        dueAt: c.dueAt.toISOString(),
        pendingItems: c._count.items,
      })),
      privilegedMembers,
    };
  }

  async sendPasswordResetLink(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId },
      include: { user: { select: { email: true } } },
    });
    if (!membership) throw new NotFoundException('User not found in organization');

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const baseUrl = this.config.get<string>('app.publicUrl') ?? 'https://app.synqdrive.eu';
    await this.mail.sendPasswordReset({
      to: membership.user.email,
      resetUrl: `${baseUrl}/reset-password?token=admin-initiated`,
      expiresAt,
      purpose: 'ADMIN_INITIATED',
    });

    return { queued: true, expiresAt: expiresAt.toISOString() };
  }

  private mapListItemFromSnapshot(
    snapshot: Awaited<ReturnType<IamAccessReviewSnapshotService['buildSnapshotForMembership']>> & object,
    user: {
      id: string;
      email: string;
      name: string | null;
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
      status: UserStatus;
    } | null | undefined,
    stationNameById: Map<string, string>,
    organizationId: string,
  ): IamTeamListItem {
    const stationIds = snapshot.stationIds ?? [];
    const stationScopeSummary =
      stationIds.length > 0
        ? stationIds.map((id) => stationNameById.get(id) ?? id).join(', ')
        : snapshot.stationScope?.trim() || 'Alle Stationen';

    return {
      kind: 'MEMBER',
      membershipId: snapshot.membershipId,
      inviteId: null,
      userSummary: user
        ? this.mapUserSummary(user)
        : {
            userId: snapshot.userId,
            email: snapshot.userEmail,
            displayName: snapshot.userEmail,
            avatarUrl: null,
            status: snapshot.userStatus,
          },
      membershipStatus: snapshot.membershipStatus,
      effectiveRole: snapshot.effectiveRole,
      effectiveRoleLabel: snapshot.effectiveRoleLabel,
      riskClassification: this.classifyRisk(snapshot.riskReasons),
      stationScopeSummary,
      mfaState: this.resolveMfaState(
        snapshot.mfaEnrolled,
        this.isMfaFeatureActive(organizationId),
        snapshot.riskReasons,
      ),
      activeSessionCount: snapshot.activeSessionCount,
      lastActivityAt: snapshot.lastActivityAt,
      reviewState: this.resolveReviewState(snapshot.riskReasons),
      requiresAction: snapshot.riskReasons.length > 0,
      reasonCodes: snapshot.riskReasons,
    };
  }

  private mapUserSummary(user: {
    id: string;
    email: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    status: UserStatus | string;
  }): IamUserSummary {
    const displayName =
      user.name?.trim() ||
      `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
      user.email;
    return {
      userId: user.id,
      email: user.email,
      displayName,
      avatarUrl: user.avatarUrl,
      status: String(user.status),
    };
  }

  private classifyRisk(reasons: AccessReviewRiskReason[]): IamRiskClassification {
    if (reasons.includes(ACCESS_REVIEW_RISK.BREAK_GLASS_CANDIDATE)) return 'CRITICAL';
    if (reasons.includes(ACCESS_REVIEW_RISK.SINGLE_ORG_ADMIN)) return 'HIGH';
    if (
      reasons.includes(ACCESS_REVIEW_RISK.PRIVILEGED_ACCOUNT) ||
      reasons.includes(ACCESS_REVIEW_RISK.MFA_NOT_ENROLLED)
    ) {
      return 'HIGH';
    }
    if (reasons.length > 0) return 'MEDIUM';
    return 'LOW';
  }

  private resolveReviewState(reasons: AccessReviewRiskReason[]): IamReviewState {
    if (reasons.includes(ACCESS_REVIEW_RISK.OVERDUE_REVIEW)) return 'OVERDUE';
    if (reasons.length > 0) return 'PENDING';
    return 'NONE';
  }

  private resolveMfaState(
    enrolled: boolean,
    featureActive: boolean,
    reasons: AccessReviewRiskReason[],
  ): IamMfaState {
    if (!featureActive) return 'NOT_SUPPORTED';
    if (enrolled) return 'ENABLED';
    if (reasons.includes(ACCESS_REVIEW_RISK.MFA_NOT_ENROLLED)) return 'REQUIRED';
    if (reasons.some((r) => r !== ACCESS_REVIEW_RISK.NO_RECENT_ACTIVITY)) return 'ACTION_REQUIRED';
    return 'DISABLED';
  }

  private isMfaFeatureActive(organizationId: string): boolean {
    return resolveIamMfaEffectiveFeatureFlags(organizationId).mfaEnrollmentEnabled;
  }

  private diffPermissions(
    inherited: Record<string, { read: boolean; write: boolean; manage?: boolean }> | null,
    effective: Record<string, { read: boolean; write: boolean; manage?: boolean }> | null,
  ) {
    if (!effective) return null;
    if (!inherited) return effective;
    const diff: Record<string, { read: boolean; write: boolean; manage?: boolean }> = {};
    for (const [key, level] of Object.entries(effective)) {
      const base = inherited[key];
      if (
        !base ||
        base.read !== level.read ||
        base.write !== level.write ||
        Boolean(base.manage) !== Boolean(level.manage)
      ) {
        diff[key] = level;
      }
    }
    return Object.keys(diff).length > 0 ? diff : null;
  }

  private async loadSessions(userId: string) {
    const now = new Date();
    const rows = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now }, replacedBy: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
      },
    });
    return {
      activeSessionCount: rows.length,
      items: rows.map((row, index) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        isCurrent: index === 0,
      })),
    };
  }

  private async loadSecurityEvents(organizationId: string, userId: string) {
    const rows = await this.prisma.activityLog.findMany({
      where: {
        organizationId,
        userId,
        action: { in: [ActivityAction.AUTH_FAIL, ActivityAction.LOGIN, ActivityAction.LOGOUT] },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      description: row.description,
      auditAction: ((row.metaJson as Record<string, unknown> | null)?.auditAction as string) ?? null,
      createdAt: row.createdAt.toISOString(),
      level: row.level ?? 'INFO',
    }));
  }

  private async loadInviteHistory(organizationId: string, email: string) {
    const rows = await this.prisma.organizationUserInvite.findMany({
      where: { organizationId, email },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
    }));
  }

  private async loadAccessReviews(organizationId: string, userId: string) {
    const rows = await this.prisma.accessReviewItem.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return rows.map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      status: row.status,
      effectiveRole: row.effectiveRole,
      riskReasons: Array.isArray(row.riskReasons) ? (row.riskReasons as string[]) : [],
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async loadAuditTimeline(organizationId: string, userId: string) {
    const rows = await this.prisma.activityLog.findMany({
      where: {
        organizationId,
        OR: [{ entityId: userId }, { userId }],
        entity: {
          in: [
            ActivityEntity.USER,
            ActivityEntity.ORGANIZATION_INVITE,
            ActivityEntity.ORGANIZATION_ROLE,
            ActivityEntity.REFRESH_TOKEN,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      description: row.description,
      auditAction: ((row.metaJson as Record<string, unknown> | null)?.auditAction as string) ?? null,
      createdAt: row.createdAt.toISOString(),
      level: row.level ?? 'INFO',
    }));
  }

  private async buildAvailableActions(input: {
    organizationId: string;
    userId: string;
    membershipId: string;
    membershipStatus: MembershipStatus;
    isLastOrgAdmin: boolean;
    activeSessionCount: number;
    hasPendingReview: boolean;
  }) {
    const lastAdminBlocked = input.isLastOrgAdmin;
    const active = input.membershipStatus === MembershipStatus.ACTIVE;

    return {
      sendResetLink: {
        enabled: active,
        requiresStepUp: true,
        impactPreview: 'Sendet einen Passwort-Reset-Link per E-Mail — kein Klartext-Passwort.',
      },
      revokeSessions: {
        enabled: active && input.activeSessionCount > 0,
        requiresStepUp: true,
        impactPreview: `${input.activeSessionCount} aktive Sitzung(en) werden beendet.`,
      },
      suspendMembership: {
        enabled: active && !lastAdminBlocked,
        requiresStepUp: true,
        blockedReason: lastAdminBlocked ? 'LAST_ORG_ADMIN' : null,
        impactPreview: lastAdminBlocked
          ? 'Letzter Organisations-Admin — Suspendierung blockiert.'
          : 'Mitgliedschaft wird suspendiert; aktive Sitzungen sollten widerrufen werden.',
      },
      changeRole: {
        enabled: active && !lastAdminBlocked,
        requiresStepUp: true,
        blockedReason: lastAdminBlocked ? 'LAST_ORG_ADMIN' : null,
      },
      changeScope: {
        enabled: active,
      },
      openAccessReview: {
        enabled: input.hasPendingReview || input.isLastOrgAdmin,
      },
    };
  }
}
