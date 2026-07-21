import { MembershipRole, MembershipStatus, UserStatus } from '@prisma/client';
import { OrganizationSwitchService } from './organization-switch.service';
import { RefreshTokenService } from './refresh-token.service';
import { IAM_REGRESSION_IDS } from '@modules/users/iam-security-regression.harness';

describe('OrganizationSwitchService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    organizationMembership: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const refreshTokens = {
    revoke: jest.fn().mockResolvedValue(undefined),
    issueTokenPair: jest.fn().mockResolvedValue({
      accessToken: 'access-new',
      refreshToken: 'refresh-new',
      expiresIn: '15m',
    }),
  };
  const audit = { record: jest.fn() };
  const userAudit = { record: jest.fn() };

  let service: OrganizationSwitchService;

  const targetMembership = {
    id: IAM_REGRESSION_IDS.membershipB,
    userId: IAM_REGRESSION_IDS.multiOrgUser,
    organizationId: IAM_REGRESSION_IDS.orgB,
    role: MembershipRole.ORG_ADMIN,
    organizationRoleId: null,
    status: MembershipStatus.ACTIVE,
    membershipVersion: 2,
    permissions: { users: { read: true, write: true, manage: true } },
    organization: { companyName: 'Org B', logoUrl: null },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrganizationSwitchService(
      prisma as never,
      refreshTokens as unknown as RefreshTokenService,
      audit as never,
      userAudit as never,
    );
    prisma.user.findUnique.mockResolvedValue({
      id: IAM_REGRESSION_IDS.multiOrgUser,
      email: 'multi@regression.test',
      name: 'Multi Org',
      platformRole: 'USER',
      status: UserStatus.ACTIVE,
      sessionVersion: 0,
    });
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: IAM_REGRESSION_IDS.membershipA,
        userId: IAM_REGRESSION_IDS.multiOrgUser,
        organizationId: IAM_REGRESSION_IDS.orgA,
        role: MembershipRole.WORKER,
        organizationRoleId: null,
        status: MembershipStatus.ACTIVE,
        membershipVersion: 0,
        permissions: null,
        organization: { companyName: 'Org A', logoUrl: null },
      },
      targetMembership,
    ]);
    prisma.organizationMembership.findFirst.mockResolvedValue(targetMembership);
    prisma.user.update.mockResolvedValue({});
  });

  it('switches organization and issues new org-bound token pair', async () => {
    const result = await service.switchOrganization({
      userId: IAM_REGRESSION_IDS.multiOrgUser,
      currentOrganizationId: IAM_REGRESSION_IDS.orgA,
      targetOrganizationId: IAM_REGRESSION_IDS.orgB,
      refreshToken: 'old-refresh',
      context: { route: 'POST /auth/switch-organization' },
    });

    expect(refreshTokens.revoke).toHaveBeenCalledWith(
      'old-refresh',
      'ORGANIZATION_SWITCHED',
    );
    expect(refreshTokens.issueTokenPair).toHaveBeenCalledWith(
      expect.objectContaining({ id: IAM_REGRESSION_IDS.multiOrgUser }),
      expect.objectContaining({
        organizationId: IAM_REGRESSION_IDS.orgB,
        membershipId: IAM_REGRESSION_IDS.membershipB,
        membershipVersion: 2,
      }),
      expect.any(Object),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: IAM_REGRESSION_IDS.multiOrgUser },
      data: { lastSelectedOrganizationId: IAM_REGRESSION_IDS.orgB },
    });
    expect(result.user.organizationId).toBe(IAM_REGRESSION_IDS.orgB);
    expect(audit.record).toHaveBeenCalled();
    expect(userAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        auditAction: 'ORGANIZATION_SESSION_SWITCHED',
      }),
    );
  });

  it('rejects switch to organization without membership', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);
    await expect(
      service.switchOrganization({
        userId: IAM_REGRESSION_IDS.multiOrgUser,
        currentOrganizationId: IAM_REGRESSION_IDS.orgA,
        targetOrganizationId: IAM_REGRESSION_IDS.orgB,
        refreshToken: 'old-refresh',
        context: {},
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ORGANIZATION_NOT_ACCESSIBLE' }),
    });
  });

  it('rejects switch for suspended membership', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      ...targetMembership,
      status: MembershipStatus.SUSPENDED,
    });
    await expect(
      service.switchOrganization({
        userId: IAM_REGRESSION_IDS.multiOrgUser,
        currentOrganizationId: IAM_REGRESSION_IDS.orgA,
        targetOrganizationId: IAM_REGRESSION_IDS.orgB,
        refreshToken: 'old-refresh',
        context: {},
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MEMBERSHIP_INACTIVE' }),
    });
  });

  it('rejects switch when already active in target organization', async () => {
    await expect(
      service.switchOrganization({
        userId: IAM_REGRESSION_IDS.multiOrgUser,
        currentOrganizationId: IAM_REGRESSION_IDS.orgB,
        targetOrganizationId: IAM_REGRESSION_IDS.orgB,
        refreshToken: 'old-refresh',
        context: {},
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ALREADY_ACTIVE_ORGANIZATION' }),
    });
  });
});
