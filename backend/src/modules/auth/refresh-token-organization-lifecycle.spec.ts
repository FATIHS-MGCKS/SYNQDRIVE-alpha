import { OrganizationStatus } from '@prisma/client';
import { createRefreshTokenHarness } from '@modules/users/iam-security-regression.harness';
import { IAM_REGRESSION_IDS } from '@modules/users/iam-security-regression.harness';

describe('RefreshTokenService — organization lifecycle on refresh', () => {
  it('denies refresh when organization is SUSPENDED (current DB status)', async () => {
    const { service, prisma } = createRefreshTokenHarness();
    prisma.organization.findUnique.mockResolvedValue({ status: OrganizationStatus.SUSPENDED });
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: IAM_REGRESSION_IDS.multiOrgUser,
      tokenHash: 'hash',
      family: 'fam-1',
      scope: 'ORG_MEMBERSHIP_BOUND',
      organizationId: IAM_REGRESSION_IDS.orgA,
      membershipId: IAM_REGRESSION_IDS.membershipA,
      sessionVersion: 0,
      membershipVersion: 0,
      permissionVersion: 0,
      roleVersion: 0,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      replacedBy: null,
      authenticatedAt: new Date(),
      createdAt: new Date(),
      user: {
        id: IAM_REGRESSION_IDS.multiOrgUser,
        status: 'ACTIVE',
        sessionVersion: 0,
        lastSelectedOrganizationId: IAM_REGRESSION_IDS.orgA,
      },
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      id: IAM_REGRESSION_IDS.membershipA,
      userId: IAM_REGRESSION_IDS.multiOrgUser,
      organizationId: IAM_REGRESSION_IDS.orgA,
      role: 'WORKER',
      status: 'ACTIVE',
      membershipVersion: 0,
      permissions: {},
      organizationRoleId: null,
      organization: { companyName: 'Org A', logoUrl: null, status: OrganizationStatus.SUSPENDED },
    });
    prisma.organizationMembership.findMany.mockResolvedValue([]);

    await expect(service.rotate('raw-token')).rejects.toThrow(/lifecycle|SUSPENDED|not allow/i);
  });
});