import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
describe('RolesGuard — UI audit master read', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  it('permits master audit GET on allowlisted admin path without MASTER_ADMIN role', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(['MASTER_ADMIN']);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/api/v1/admin/connectivity/platform-summary',
          user: {
            id: 'audit-ma',
            platformRole: 'USER',
            platformPermissions: ['ui-audit-master'],
          },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    expect(guard.canActivate(ctx as never)).toBe(true);
  });

  it('denies master audit GET on non-allowlisted admin path', () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(['MASTER_ADMIN']);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/api/v1/admin/users/search',
          user: {
            id: 'audit-ma',
            platformRole: 'USER',
            platformPermissions: ['ui-audit-master'],
          },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    expect(() => guard.canActivate(ctx as never)).toThrow(ForbiddenException);
  });
});