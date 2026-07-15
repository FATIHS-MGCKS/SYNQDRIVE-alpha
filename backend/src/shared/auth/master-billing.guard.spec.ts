import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MasterBillingGuard } from './master-billing.guard';
import { MASTER_BILLING_PLATFORM_PERMISSION } from '@shared/decorators/require-master-billing.decorator';

describe('MasterBillingGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  let guard: MasterBillingGuard;

  const ctx = (user?: Record<string, unknown>) => ({
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  });

  beforeEach(() => {
    guard = new MasterBillingGuard(reflector);
    jest.clearAllMocks();
  });

  it('passes when master billing is not required', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    expect(guard.canActivate(ctx({ platformRole: 'USER' }) as never)).toBe(true);
  });

  it('allows MASTER_ADMIN', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    expect(
      guard.canActivate(ctx({ platformRole: 'MASTER_ADMIN', membershipRole: 'ORG_ADMIN' }) as never),
    ).toBe(true);
  });

  it('allows users with master-billing platform permission', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    expect(
      guard.canActivate(
        ctx({
          platformRole: 'USER',
          membershipRole: 'ORG_ADMIN',
          platformPermissions: [MASTER_BILLING_PLATFORM_PERMISSION],
        }) as never,
      ),
    ).toBe(true);
  });

  it('rejects tenant org admins without master billing permission', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    expect(() =>
      guard.canActivate(
        ctx({
          platformRole: 'USER',
          membershipRole: 'ORG_ADMIN',
          platformPermissions: [],
        }) as never,
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects workers without master billing permission', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    expect(() =>
      guard.canActivate(
        ctx({
          platformRole: 'USER',
          membershipRole: 'WORKER',
          platformPermissions: [],
        }) as never,
      ),
    ).toThrow(new ForbiddenException('Master billing access required'));
  });

  it('rejects unauthenticated requests', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    expect(() => guard.canActivate(ctx(undefined) as never)).toThrow(
      new ForbiddenException('Authentication required'),
    );
  });
});
