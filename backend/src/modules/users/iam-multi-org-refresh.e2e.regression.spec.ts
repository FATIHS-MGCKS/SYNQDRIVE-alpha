/**
 * Multi-org refresh/session E2E regression (Prompt 2/22 — scenario E).
 */
import { MembershipRole, MembershipStatus, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import {
  createRefreshTokenHarness,
  IAM_REGRESSION_IDS,
} from './iam-security-regression.harness';

function sha256(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

describe('IAM multi-org refresh E2E regression (E)', () => {
  it('characterization: refresh rotate picks newest active membership (take:1) — not login org', async () => {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = sha256(rawToken);
    const user = {
      id: IAM_REGRESSION_IDS.multiOrgUser,
      email: 'multi@regression.test',
      name: 'Multi Org',
      platformRole: 'USER',
      status: UserStatus.ACTIVE,
      memberships: [
        {
          role: MembershipRole.ORG_ADMIN,
          organizationId: IAM_REGRESSION_IDS.orgB,
          permissions: null,
          organization: { companyName: 'Org B' },
          createdAt: new Date('2026-06-01'),
        },
      ],
    };

    const { prisma, service } = createRefreshTokenHarness();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: user.id,
      tokenHash,
      family: 'family-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      replacedBy: null,
      user,
    });
    prisma.refreshToken.create.mockImplementation(async ({ data }) => ({
      id: 'rt-2',
      ...data,
    }));
    prisma.refreshToken.update.mockResolvedValue({});

    const result = await service.rotate(rawToken, {});
    const decoded = jwt.decode(result.accessToken) as {
      organizationId?: string;
      membershipRole?: string;
    };

    expect(decoded.organizationId).toBe(IAM_REGRESSION_IDS.orgB);
    expect(decoded.membershipRole).toBe(MembershipRole.ORG_ADMIN);
  });

  it('TARGET RED: refresh must not switch organization without explicit org switch', async () => {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = sha256(rawToken);
    const loginOrgId = IAM_REGRESSION_IDS.orgA;
    const user = {
      id: IAM_REGRESSION_IDS.multiOrgUser,
      email: 'multi@regression.test',
      name: 'Multi Org',
      platformRole: 'USER',
      status: UserStatus.ACTIVE,
      memberships: [
        {
          role: MembershipRole.WORKER,
          organizationId: IAM_REGRESSION_IDS.orgA,
          status: MembershipStatus.ACTIVE,
          permissions: null,
          organization: { companyName: 'Org A' },
          createdAt: new Date('2026-06-01'),
        },
        {
          role: MembershipRole.ORG_ADMIN,
          organizationId: IAM_REGRESSION_IDS.orgB,
          status: MembershipStatus.ACTIVE,
          permissions: null,
          organization: { companyName: 'Org B' },
          createdAt: new Date('2026-01-01'),
        },
      ],
    };

    const { prisma, service } = createRefreshTokenHarness();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-bound-a',
      userId: user.id,
      tokenHash,
      family: 'family-bound-a',
      organizationId: loginOrgId,
      membershipId: IAM_REGRESSION_IDS.membershipA,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      replacedBy: null,
      user,
    });
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

  it('TARGET RED: membership selection must not depend on take:1 ordering alone', () => {
    const rotateSource = RefreshTokenService.prototype.rotate.toString();
    expect(rotateSource).toMatch(/organizationId|membershipId/);
    expect(rotateSource).not.toContain('take: 1');
  });
});
