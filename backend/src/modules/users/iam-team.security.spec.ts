import { NotFoundException } from '@nestjs/common';
import { MembershipStatus, UserStatus } from '@prisma/client';
import { IamTeamService } from './iam-team.service';
import { ACCESS_REVIEW_RISK } from './iam-access-review.policy';

describe('IAM team canonical API (Prompt 21)', () => {
  const orgId = 'org-a';
  const membershipId = 'mem-1';
  const userId = 'user-1';

  const baseSnapshot = {
    membershipId,
    userId,
    membershipStatus: MembershipStatus.ACTIVE,
    membershipVersion: 2,
    effectiveRole: 'ORG_ADMIN',
    effectiveRoleId: 'role-1',
    effectiveRoleLabel: 'Org Admin',
    privilegedCapabilities: ['role:ORG_ADMIN'],
    stationScope: 'all',
    stationIds: null,
    permissions: { 'users-roles': { read: true, write: true, manage: true } },
    lastActivityAt: new Date().toISOString(),
    mfaEnrolled: true,
    activeSessionCount: 2,
    riskReasons: [ACCESS_REVIEW_RISK.PRIVILEGED_ACCOUNT],
    platformRole: 'USER',
    userStatus: UserStatus.ACTIVE,
    userEmail: 'admin@example.com',
    roleIsActive: true,
  };

  function buildService(overrides: Record<string, unknown> = {}) {
    const snapshots = {
      buildSnapshotsForOrganization: jest.fn().mockResolvedValue([baseSnapshot]),
      buildSnapshotForMembership: jest.fn().mockResolvedValue(baseSnapshot),
      ...(overrides.snapshots as object),
    };

    const prisma: Record<string, any> = {
      organizationUserInvite: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(1),
      },
      station: { findMany: jest.fn().mockResolvedValue([{ id: 'st-1', name: 'Berlin' }]) },
      organizationMembership: {
        findUnique: jest.fn().mockResolvedValue({
          id: membershipId,
          userId,
          organizationId: orgId,
          status: MembershipStatus.ACTIVE,
          fieldAgentAccess: false,
          stationScope: 'all',
          updatedAt: new Date(),
          user: {
            id: userId,
            email: 'admin@example.com',
            name: 'Admin User',
            firstName: 'Admin',
            lastName: 'User',
            avatarUrl: null,
            status: UserStatus.ACTIVE,
          },
          organizationRole: {
            id: 'role-1',
            name: 'Org Admin',
            permissions: { 'users-roles': { read: true, write: true, manage: true } },
            updatedAt: new Date(),
          },
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: membershipId,
          userId,
          organizationId: orgId,
          status: MembershipStatus.ACTIVE,
          fieldAgentAccess: false,
          stationScope: 'all',
          updatedAt: new Date(),
          user: {
            id: userId,
            email: 'admin@example.com',
            name: 'Admin User',
            firstName: 'Admin',
            lastName: 'User',
            avatarUrl: null,
            status: UserStatus.ACTIVE,
          },
          organizationRole: {
            id: 'role-1',
            name: 'Org Admin',
            permissions: { 'users-roles': { read: true, write: true, manage: true } },
            updatedAt: new Date(),
          },
        }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      organizationRole: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'role-1',
            name: 'Org Admin',
            description: null,
            membershipRole: 'ORG_ADMIN',
            isSystemTemplate: true,
            isDefault: false,
            isActive: true,
            permissions: {},
            updatedAt: new Date(),
          },
        ]),
      },
      refreshToken: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'rt-1', createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000), ipAddress: '1.2.3.4', userAgent: 'Chrome' },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      activityLog: { findMany: jest.fn().mockResolvedValue([]) },
      accessReviewItem: { findMany: jest.fn().mockResolvedValue([]) },
      accessReviewCampaign: { findMany: jest.fn().mockResolvedValue([]) },
      ...(overrides.prisma as object),
    };

    const roles = {
      ensureDefaultRoles: jest.fn().mockResolvedValue(undefined),
      permissionPreview: jest.fn().mockResolvedValue({
        roleId: 'role-1',
        name: 'Org Admin',
        membershipRole: 'ORG_ADMIN',
        permissions: { 'users-roles': { read: true, write: true, manage: true } },
        fieldAgentAccessDefault: false,
        stationScopeDefault: 'all',
        defaultStationIds: [],
      }),
      ...(overrides.roles as object),
    };

    const mail = { sendPasswordReset: jest.fn().mockResolvedValue({ sent: true }) };
    const config = { get: jest.fn().mockReturnValue('https://app.synqdrive.eu') };

    const service = new IamTeamService(
      prisma as never,
      snapshots as never,
      roles as never,
      mail as never,
      config as never,
    );

    return { service, prisma, snapshots, roles, mail };
  }

  it('computes KPIs server-side', async () => {
    const { service } = buildService();
    const kpis = await service.getKpis(orgId);
    expect(kpis.activeUsers).toBe(1);
    expect(kpis.openInvites).toBe(1);
    expect(kpis.privilegedAccounts).toBe(1);
    expect(typeof kpis.reviewRequired).toBe('number');
  });

  it('returns canonical team list items', async () => {
    const { service } = buildService();
    const items = await service.listTeam(orgId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'MEMBER',
      membershipId,
      effectiveRole: 'ORG_ADMIN',
      activeSessionCount: 2,
      requiresAction: true,
    });
    expect(items[0].reasonCodes).toContain(ACCESS_REVIEW_RISK.PRIVILEGED_ACCOUNT);
  });

  it('returns member detail with server effective access', async () => {
    const { service } = buildService();
    const detail = await service.getMemberDetail(orgId, membershipId);
    expect(detail.effectiveAccess.membershipVersion).toBe(2);
    expect(detail.effectiveAccess.isLastOrgAdmin).toBe(false);
    expect(detail.sessions.activeSessionCount).toBe(1);
    expect(detail.availableActions.sendResetLink.enabled).toBe(true);
    expect(detail.availableActions.revokeSessions.impactPreview).toContain('2');
  });

  it('blocks suspend for last org admin', async () => {
    const lastAdminSnapshot = {
      ...baseSnapshot,
      riskReasons: [ACCESS_REVIEW_RISK.SINGLE_ORG_ADMIN],
    };
    const { service, prisma } = buildService({
      snapshots: {
        buildSnapshotForMembership: jest.fn().mockResolvedValue(lastAdminSnapshot),
      },
    });
    prisma.organizationMembership.count = jest.fn().mockResolvedValue(1);
    const detail = await service.getMemberDetail(orgId, membershipId);
    expect(detail.effectiveAccess.isLastOrgAdmin).toBe(true);
    expect(detail.availableActions.suspendMembership.enabled).toBe(false);
    expect(detail.availableActions.suspendMembership.blockedReason).toBe('LAST_ORG_ADMIN');
  });

  it('returns role list with assignment counts', async () => {
    const { service } = buildService();
    const roles = await service.listRoles(orgId);
    expect(roles[0].followsLatest).toBe(true);
    expect(roles[0].riskClassification).toBe('HIGH');
  });

  it('returns security overview with MFA summary', async () => {
    const { service } = buildService();
    const overview = await service.getSecurityOverview(orgId);
    expect(overview.activeSessions).toBeGreaterThanOrEqual(0);
    expect(overview.mfaSummary).toBeDefined();
    expect(overview.privilegedMembers.length).toBeGreaterThanOrEqual(0);
  });

  it('throws when membership not found', async () => {
    const { service, snapshots } = buildService({
      snapshots: { buildSnapshotForMembership: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.getMemberDetail(orgId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(snapshots.buildSnapshotForMembership).toHaveBeenCalled();
  });
});
