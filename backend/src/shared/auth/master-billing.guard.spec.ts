import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MasterBillingGuard } from './master-billing.guard';
import { MASTER_BILLING_PLATFORM_PERMISSION } from '@shared/decorators/require-master-billing.decorator';
import type { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';

describe('MasterBillingGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const platformPermissions = {
    hasActiveMasterBillingGrant: jest.fn(),
  } as unknown as PlatformPermissionService;
  let guard: MasterBillingGuard;

  const ctx = (user?: Record<string, unknown>) => ({
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  });

  beforeEach(() => {
    guard = new MasterBillingGuard(reflector, platformPermissions);
    jest.clearAllMocks();
  });

  it('passes when master billing is not required', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    await expect(guard.canActivate(ctx({ platformRole: 'USER' }) as never)).resolves.toBe(true);
  });

  it('allows MASTER_ADMIN without DB grant lookup outcome', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    await expect(
      guard.canActivate(ctx({ id: 'ma-1', platformRole: 'MASTER_ADMIN' }) as never),
    ).resolves.toBe(true);
    expect(platformPermissions.hasActiveMasterBillingGrant).not.toHaveBeenCalled();
  });

  it('allows delegates with active DB grant and JWT claim', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    (platformPermissions.hasActiveMasterBillingGrant as jest.Mock).mockResolvedValue(true);
    await expect(
      guard.canActivate(
        ctx({
          id: 'delegate-1',
          platformRole: 'USER',
          platformPermissions: [MASTER_BILLING_PLATFORM_PERMISSION],
        }) as never,
      ),
    ).resolves.toBe(true);
  });

  it('rejects delegates when DB grant revoked even if JWT still lists permission', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    (platformPermissions.hasActiveMasterBillingGrant as jest.Mock).mockResolvedValue(false);
    await expect(
      guard.canActivate(
        ctx({
          id: 'delegate-1',
          platformRole: 'USER',
          platformPermissions: [MASTER_BILLING_PLATFORM_PERMISSION],
        }) as never,
      ),
    ).rejects.toThrow(new ForbiddenException('Master billing access required'));
  });

  it('rejects delegates with DB grant but stale JWT missing claim', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    (platformPermissions.hasActiveMasterBillingGrant as jest.Mock).mockResolvedValue(true);
    await expect(
      guard.canActivate(
        ctx({
          id: 'delegate-1',
          platformRole: 'USER',
          platformPermissions: [],
        }) as never,
      ),
    ).rejects.toThrow(new ForbiddenException('Master billing access requires a refreshed access token'));
  });

  it('rejects unauthenticated requests', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    await expect(guard.canActivate(ctx(undefined) as never)).rejects.toThrow(
      new ForbiddenException('Authentication required'),
    );
  });
});