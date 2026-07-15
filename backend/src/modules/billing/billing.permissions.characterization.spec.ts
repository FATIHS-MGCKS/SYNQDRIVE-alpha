import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '@shared/auth/permissions.guard';

describe('Billing permissions characterization', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
  };
  let guard: PermissionsGuard;

  const buildCtx = (user: Record<string, unknown>, query: Record<string, string> = {}) => ({
    switchToHttp: () => ({
      getRequest: () => ({ user, params: {}, query }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  });

  beforeEach(() => {
    guard = new PermissionsGuard(reflector, prisma as never);
    jest.clearAllMocks();
  });

  it('allows tenant with billing.read for read-level route', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      module: 'billing',
      level: 'read',
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { billing: { read: true, write: false } },
    });

    await expect(
      guard.canActivate(
        buildCtx({ id: 'u1', organizationId: 'org-a' }, { orgId: 'org-a' }) as never,
      ),
    ).resolves.toBe(true);
  });

  it('denies tenant with billing.read only for billing.write route', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      module: 'billing',
      level: 'write',
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { billing: { read: true, write: false } },
    });

    await expect(
      guard.canActivate(
        buildCtx({ id: 'u1', organizationId: 'org-a' }, { orgId: 'org-a' }) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows tenant with billing.write for write-level route', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      module: 'billing',
      level: 'write',
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { billing: { read: true, write: true } },
    });

    await expect(
      guard.canActivate(
        buildCtx({ id: 'u1', organizationId: 'org-a' }, { orgId: 'org-a' }) as never,
      ),
    ).resolves.toBe(true);
  });

  it('allows MASTER_ADMIN without membership lookup', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      module: 'billing',
      level: 'write',
    });

    await expect(
      guard.canActivate(buildCtx({ id: 'admin', platformRole: 'MASTER_ADMIN' }) as never),
    ).resolves.toBe(true);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });
});
