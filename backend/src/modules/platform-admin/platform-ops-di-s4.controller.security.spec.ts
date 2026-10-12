import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@shared/auth/roles.guard';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
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
