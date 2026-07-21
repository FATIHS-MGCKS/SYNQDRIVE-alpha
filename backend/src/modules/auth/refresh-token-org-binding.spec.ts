import {
  MembershipRole,
  MembershipStatus,
  RefreshTokenScope,
  SessionAssuranceLevel,
  UserStatus,
} from '@prisma/client';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import {
  createRefreshTokenHarness,
  IAM_REGRESSION_IDS,
} from '@modules/users/iam-security-regression.harness';
import {
  computePermissionVersionSnapshot,
  computeRoleVersionSnapshot,
} from '@modules/users/policies/refresh-session-binding.policy';

function sha256(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function membershipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: IAM_REGRESSION_IDS.membershipA,
    userId: IAM_REGRESSION_IDS.multiOrgUser,
    organizationId: IAM_REGRESSION_IDS.orgA,
    role: MembershipRole.WORKER,
    organizationRoleId: null,
    status: MembershipStatus.ACTIVE,
    membershipVersion: 0,
    permissions: { bookings: { read: true, write: false } },
    organization: { companyName: 'Org A', logoUrl: null },
    ...overrides,
  };
}

describe('RefreshTokenService org-bound sessions (Prompt 7)', () => {
  const rawToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = sha256(rawToken);

  function baseStored(overrides: Record<string, unknown> = {}) {
    return {
      id: 'rt-bound-a',
      userId: IAM_REGRESSION_IDS.multiOrgUser,
      tokenHash,
      family: 'family-bound-a',
      scope: RefreshTokenScope.ORG_MEMBERSHIP_BOUND,
      organizationId: IAM_REGRESSION_IDS.orgA,
      membershipId: IAM_REGRESSION_IDS.membershipA,
      sessionVersion: 0,
      membershipVersion: 0,
      permissionVersion: computePermissionVersionSnapshot({
        bookings: { read: true, write: false },
      }),
      roleVersion: computeRoleVersionSnapshot(MembershipRole.WORKER, null),
      assuranceLevel: SessionAssuranceLevel.PASSWORD,
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
        lastAuthOrganizationId: IAM_REGRESSION_IDS.orgA,
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('single org: refresh preserves organization binding on rotation', async () => {
    const { prisma, service } = createRefreshTokenHarness();
    const row = membershipRow();
    prisma.refreshToken.findUnique.mockResolvedValue(baseStored());
    prisma.organizationMembership.findFirst.mockResolvedValue(row);
    prisma.organizationMembership.findMany.mockResolvedValue([row]);
    prisma.refreshToken.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'rt-next',
      ...data,
    }));
    prisma.refreshToken.update.mockResolvedValue({});

    const result = await service.rotate(rawToken, {});
    const decoded = jwt.decode(result.accessToken) as { organizationId?: string };

    expect(decoded.organizationId).toBe(IAM_REGRESSION_IDS.orgA);
    expect(prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: IAM_REGRESSION_IDS.orgA,
          membershipId: IAM_REGRESSION_IDS.membershipA,
          scope: RefreshTokenScope.ORG_MEMBERSHIP_BOUND,
        }),
      }),
    );
  });

  it('multi org: refresh does not switch to another organization', async () => {
    const { prisma, service } = createRefreshTokenHarness();
    const rowA = membershipRow();
    const rowB = membershipRow({
      id: IAM_REGRESSION_IDS.membershipB,
      organizationId: IAM_REGRESSION_IDS.orgB,
      role: MembershipRole.ORG_ADMIN,
      createdAt: new Date('2026-06-01'),
    });
    prisma.refreshToken.findUnique.mockResolvedValue(baseStored());
    prisma.organizationMembership.findFirst.mockResolvedValue(rowA);
    prisma.organizationMembership.findMany.mockResolvedValue([rowA, rowB]);
    prisma.refreshToken.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'rt-next',
      ...data,
    }));
    prisma.refreshToken.update.mockResolvedValue({});

    const result = await service.rotate(rawToken, {});
    const decoded = jwt.decode(result.accessToken) as { organizationId?: string };

    expect(decoded.organizationId).toBe(IAM_REGRESSION_IDS.orgA);
    expect(decoded.organizationId).not.toBe(IAM_REGRESSION_IDS.orgB);
  });

  it('suspended membership: denies refresh and revokes session', async () => {
    const { prisma, service, sessionPolicy } = createRefreshTokenHarness();
    const row = membershipRow({ status: MembershipStatus.SUSPENDED });
    prisma.refreshToken.findUnique.mockResolvedValue(baseStored());
    prisma.organizationMembership.findFirst.mockResolvedValue(row);
    prisma.organizationMembership.findMany.mockResolvedValue([]);

    await expect(service.rotate(rawToken, {})).rejects.toThrow(
      /no longer active/i,
    );
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ revocationReason: expect.any(String) }),
      }),
    );
    expect(sessionPolicy.recordAndExecute).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'MEMBERSHIP_SUSPENDED' }),
    );
  });

  it('removed membership: denies refresh, revokes session, audits', async () => {
    const { prisma, service, sessionPolicy } = createRefreshTokenHarness();
    const row = membershipRow({ status: MembershipStatus.REMOVED });
    prisma.refreshToken.findUnique.mockResolvedValue(baseStored());
    prisma.organizationMembership.findFirst.mockResolvedValue(row);
    prisma.organizationMembership.findMany.mockResolvedValue([]);

    await expect(service.rotate(rawToken, {})).rejects.toThrow(
      /no longer active/i,
    );
    expect(sessionPolicy.recordAndExecute).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'MEMBERSHIP_REMOVED' }),
    );
  });

  it('membership version changed: denies refresh', async () => {
    const { prisma, service } = createRefreshTokenHarness();
    const row = membershipRow({ membershipVersion: 3 });
    prisma.refreshToken.findUnique.mockResolvedValue(baseStored());
    prisma.organizationMembership.findFirst.mockResolvedValue(row);
    prisma.organizationMembership.findMany.mockResolvedValue([row]);

    await expect(service.rotate(rawToken, {})).rejects.toThrow(/version mismatch/i);
  });

  it('role version changed: denies refresh', async () => {
    const { prisma, service } = createRefreshTokenHarness();
    const row = membershipRow({
      role: MembershipRole.ORG_ADMIN,
      organizationRoleId: 'custom-role',
    });
    prisma.refreshToken.findUnique.mockResolvedValue(baseStored());
    prisma.organizationMembership.findFirst.mockResolvedValue(row);
    prisma.organizationMembership.findMany.mockResolvedValue([row]);

    await expect(service.rotate(rawToken, {})).rejects.toThrow(/version mismatch/i);
  });

  it('legacy unscoped session rejected without grace', async () => {
    const { prisma, service } = createRefreshTokenHarness();
    prisma.refreshToken.findUnique.mockResolvedValue(
      baseStored({
        scope: RefreshTokenScope.LEGACY_UNSCOPED,
        organizationId: null,
        membershipId: null,
      }),
    );
    prisma.organizationMembership.findMany.mockResolvedValue([membershipRow()]);

    await expect(service.rotate(rawToken, {})).rejects.toThrow(/sign in again/i);
  });

  it('legacy session upgrades once when grace enabled and single org', async () => {
    const { prisma, service, config } = createRefreshTokenHarness();
    config.get.mockImplementation((key: string, fallback?: unknown) => {
      if (key === 'iam.enableLegacyUnscopedRefreshGrace') return true;
      if (key === 'iam.enableOrgBoundRefreshSessions') return true;
      if (key === 'app.jwtSecret') return 'test-jwt-secret';
      if (key === 'app.jwtExpiresIn') return '15m';
      return fallback;
    });
    const row = membershipRow();
    prisma.refreshToken.findUnique.mockResolvedValue(
      baseStored({
        scope: RefreshTokenScope.LEGACY_UNSCOPED,
        organizationId: null,
        membershipId: null,
      }),
    );
    prisma.organizationMembership.findMany.mockResolvedValue([row]);
    prisma.refreshToken.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'rt-upgraded',
      ...data,
    }));
    prisma.refreshToken.update.mockResolvedValue({});

    const result = await service.rotate(rawToken, {});
    const decoded = jwt.decode(result.accessToken) as { organizationId?: string };
    expect(decoded.organizationId).toBe(IAM_REGRESSION_IDS.orgA);
    expect(prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scope: RefreshTokenScope.ORG_MEMBERSHIP_BOUND,
        }),
      }),
    );
  });

  it('token reuse detection revokes family via session policy', async () => {
    const { prisma, service, sessionPolicy } = createRefreshTokenHarness();
    prisma.refreshToken.findUnique.mockResolvedValue(
      baseStored({
        revokedAt: new Date(),
        replacedBy: 'rt-successor',
      }),
    );

    await expect(service.rotate(rawToken, {})).rejects.toThrow(/no longer valid/i);
    expect(sessionPolicy.recordAndExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'REFRESH_TOKEN_REUSE_DETECTED',
        highRiskReuse: true,
      }),
    );
  });

  it('cross-tenant binding rejected when membership org differs', async () => {
    const { prisma, service } = createRefreshTokenHarness();
    const row = membershipRow({ organizationId: IAM_REGRESSION_IDS.orgB });
    prisma.refreshToken.findUnique.mockResolvedValue(baseStored());
    prisma.organizationMembership.findFirst.mockResolvedValue(row);
    prisma.organizationMembership.findMany.mockResolvedValue([row]);

    await expect(service.rotate(rawToken, {})).rejects.toThrow(/organization does not match/i);
  });

  it('rotation preserves authenticatedAt and org binding metadata', async () => {
    const { prisma, service } = createRefreshTokenHarness();
    const authenticatedAt = new Date('2026-07-01T10:00:00.000Z');
    const row = membershipRow();
    prisma.refreshToken.findUnique.mockResolvedValue(
      baseStored({ authenticatedAt }),
    );
    prisma.organizationMembership.findFirst.mockResolvedValue(row);
    prisma.organizationMembership.findMany.mockResolvedValue([row]);
    prisma.refreshToken.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'rt-rotated',
      ...data,
    }));
    prisma.refreshToken.update.mockResolvedValue({});

    await service.rotate(rawToken, {});

    expect(prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authenticatedAt,
          family: 'family-bound-a',
          organizationId: IAM_REGRESSION_IDS.orgA,
          membershipId: IAM_REGRESSION_IDS.membershipA,
        }),
      }),
    );
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
      }),
    );
  });
});
