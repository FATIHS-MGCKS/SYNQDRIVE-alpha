import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserPlatformRole, UserStatus } from '@prisma/client';
import { UiAuditSessionEnforcementGuard } from './ui-audit-session-enforcement.guard';

function ctx(user: object, path = '/api/v1/organizations/org-a/bookings'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, url: path, method: 'GET' }),
    }),
  } as ExecutionContext;
}

describe('UiAuditSessionEnforcementGuard', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
  };
  const platformPermissions = { resolveJwtPermissions: jest.fn() };
  const guard = new UiAuditSessionEnforcementGuard(prisma as never, platformPermissions as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      status: UserStatus.ACTIVE,
      platformRole: UserPlatformRole.USER,
      sessionVersion: 1,
    });
    prisma.organizationMembership.findFirst.mockResolvedValue(null);
    platformPermissions.resolveJwtPermissions.mockResolvedValue(['ui-audit-rental']);
  });

  it('passes through users without audit JWT claims', async () => {
    await expect(
      guard.canActivate(ctx({ id: 'u1', platformRole: 'USER', platformPermissions: [] })),
    ).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('denies stale sessionVersion', async () => {
    await expect(
      guard.canActivate(
        ctx({
          id: 'u-audit',
          platformRole: 'USER',
          sessionVersion: 0,
          platformPermissions: ['ui-audit-rental'],
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('denies revoked grants still present in JWT', async () => {
    platformPermissions.resolveJwtPermissions.mockResolvedValue([]);
    await expect(
      guard.canActivate(
        ctx({
          id: 'u-audit',
          platformRole: 'USER',
          sessionVersion: 1,
          platformPermissions: ['ui-audit-rental'],
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('denies MASTER_ADMIN JWT carrying audit claims', async () => {
    await expect(
      guard.canActivate(
        ctx({
          id: 'ma',
          platformRole: 'MASTER_ADMIN',
          sessionVersion: 1,
          platformPermissions: ['ui-audit-master'],
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies inactive accounts', async () => {
    prisma.user.findUnique.mockResolvedValue({
      status: UserStatus.INACTIVE,
      platformRole: UserPlatformRole.USER,
      sessionVersion: 1,
    });
    await expect(
      guard.canActivate(
        ctx({
          id: 'u-audit',
          platformRole: 'USER',
          sessionVersion: 1,
          platformPermissions: ['ui-audit-rental'],
        }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});