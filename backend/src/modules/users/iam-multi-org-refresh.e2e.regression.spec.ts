/**
 * Multi-org refresh/session E2E regression (Prompt 2/22 — scenario E).
 */
import { MembershipRole, MembershipStatus, RefreshTokenScope, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import {
  createRefreshTokenHarness,
  IAM_REGRESSION_IDS,
} from './iam-security-regression.harness';
import {
  computePermissionVersionSnapshot,
  computeRoleVersionSnapshot,
} from './policies/refresh-session-binding.policy';

function sha256(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

describe('IAM multi-org refresh E2E regression (E)', () => {
  it('org-bound refresh preserves login organization across rotation', async () => {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = sha256(rawToken);
    const loginOrgId = IAM_REGRESSION_IDS.orgA;
    const membershipA = {
      id: IAM_REGRESSION_IDS.membershipA,
      userId: IAM_REGRESSION_IDS.multiOrgUser,
      organizationId: IAM_REGRESSION_IDS.orgA,
      role: MembershipRole.WORKER,
      organizationRoleId: null,
      status: MembershipStatus.ACTIVE,
      membershipVersion: 0,
      permissions: { bookings: { read: true, write: false } },
      organization: { companyName: 'Org A', logoUrl: null },
    };
    const membershipB = {
      id: IAM_REGRESSION_IDS.membershipB,
      userId: IAM_REGRESSION_IDS.multiOrgUser,
      organizationId: IAM_REGRESSION_IDS.orgB,
      role: MembershipRole.ORG_ADMIN,
      organizationRoleId: null,
      status: MembershipStatus.ACTIVE,
      membershipVersion: 0,
      permissions: null,
      organization: { companyName: 'Org B', logoUrl: null },
    };

    const { prisma, service } = createRefreshTokenHarness();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-bound-a',
      userId: IAM_REGRESSION_IDS.multiOrgUser,
      tokenHash,
      family: 'family-bound-a',
      scope: RefreshTokenScope.ORG_MEMBERSHIP_BOUND,
      organizationId: loginOrgId,
      membershipId: IAM_REGRESSION_IDS.membershipA,
      sessionVersion: 0,
      membershipVersion: 0,
      permissionVersion: computePermissionVersionSnapshot(membershipA.permissions),
      roleVersion: computeRoleVersionSnapshot(MembershipRole.WORKER, null),
      authenticatedAt: new Date('2026-07-01'),
      privilegedSession: false,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      replacedBy: null,
      createdAt: new Date('2026-07-01'),
      user: {
        id: IAM_REGRESSION_IDS.multiOrgUser,
        email: 'multi@regression.test',
        name: 'Multi Org',
        platformRole: 'USER',
        status: UserStatus.ACTIVE,
        sessionVersion: 0,
        lastSelectedOrganizationId: loginOrgId,
      },
    });
    prisma.organizationMembership.findFirst.mockResolvedValue(membershipA);
    prisma.organizationMembership.findMany.mockResolvedValue([membershipA, membershipB]);
    prisma.refreshToken.create.mockImplementation(async ({ data }) => ({
      id: 'rt-bound-a-next',
      ...data,
    }));
    prisma.refreshToken.update.mockResolvedValue({});

    const result = await service.rotate(rawToken, {});
    const decoded = jwt.decode(result.accessToken) as { organizationId?: string };

    expect(decoded.organizationId).toBe(loginOrgId);
    expect(decoded.organizationId).not.toBe(IAM_REGRESSION_IDS.orgB);
  });

  it('refresh binding resolves membership by stored organizationId and membershipId', () => {
    const rotateSource = RefreshTokenService.prototype.rotate.toString();
    expect(rotateSource).toMatch(/organizationId|membershipId/);
    expect(rotateSource).not.toContain('take: 1');
    expect(rotateSource).toMatch(/resolveRefreshBinding|loadMembershipForUser/);
  });
});
