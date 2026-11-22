import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard — UI audit bound users', () => {
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
  };
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector, prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denies write-level module permission for audit-bound ORG_ADMIN membership', async () => {
    reflector.getAllAndOverride = jest
      .fn()
      .mockReturnValueOnce({ module: 'bookings', level: 'write' })
      .mockReturnValue(undefined);

    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'ORG_ADMIN',
      permissions: {},
    });

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'audit-1',
            platformRole: 'USER',
            organizationId: 'org-1',
            platformPermissions: ['ui-audit-rental'],
          },
          params: { orgId: 'org-1' },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };

    await expect(guard.canActivate(ctx as never)).rejects.toThrow(ForbiddenException);
    expect(prisma.organizationMembership.findFirst).toHaveBeenCalled();
  });
});