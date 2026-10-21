import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@shared/auth/roles.guard';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { PlatformAdminController } from './platform-admin.controller';

describe('PlatformAdminController — DIMO R9 webhook health', () => {
  const guard = new RolesGuard(new Reflector());

  it('declares MASTER_ADMIN on controller', () => {
    expect(Reflect.getMetadata(ROLES_KEY, PlatformAdminController)).toEqual(['MASTER_ADMIN']);
  });

  it('denies non-master for dimo webhook health route', () => {
    const ctx = {
      getHandler: () => PlatformAdminController.prototype.getDimoWebhookHealth,
      getClass: () => PlatformAdminController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles: ['ORG_ADMIN'] } }) }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
