import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { MASTER_ADMIN_MFA_ACTION_KEY } from '@shared/decorators/require-master-admin-mfa.decorator';
import { PlatformAdminController } from './platform-admin.controller';

function contextFor(user: unknown): ExecutionContext {
  return {
    getHandler: () => PlatformAdminController.prototype.getOpsDrivingIntelligenceS4,
    getClass: () => PlatformAdminController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PlatformAdminController — driving-intelligence-s4 ops route', () => {
  const guard = new RolesGuard(new Reflector());

  it('getOpsDrivingIntelligenceS4 exists on MASTER_ADMIN controller', () => {
    expect(typeof PlatformAdminController.prototype.getOpsDrivingIntelligenceS4).toBe('function');
    expect(Reflect.getMetadata(ROLES_KEY, PlatformAdminController)).toEqual(['MASTER_ADMIN']);
  });

  it('denies non-master-admin users', () => {
    expect(() =>
      guard.canActivate(contextFor({ platformRole: 'ORG_ADMIN', roles: ['ORG_ADMIN'] })),
    ).toThrow(ForbiddenException);
  });
});

describe('PlatformAdminController — S4 ops GET MFA policy', () => {
  const reflector = new Reflector();
  const mfaGuard = new MasterAdminMfaGuard(reflector, {} as never, {} as never);

  it('GET driving-intelligence-s4 does not require MFA step-up (read-only MASTER_PLATFORM_SETTINGS)', async () => {
    const ctx = {
      getHandler: () => PlatformAdminController.prototype.getOpsDrivingIntelligenceS4,
      getClass: () => PlatformAdminController,
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          user: {
            id: 'user-1',
            platformRole: 'MASTER_ADMIN',
            organizationId: null,
            sessionClaims: {},
          },
        }),
      }),
    } as unknown as ExecutionContext;
    const action = reflector.getAllAndOverride(MASTER_ADMIN_MFA_ACTION_KEY, [ctx.getHandler(), ctx.getClass()]);
    expect(action).toBeDefined();
    await expect(mfaGuard.canActivate(ctx)).resolves.toBe(true);
  });
});
