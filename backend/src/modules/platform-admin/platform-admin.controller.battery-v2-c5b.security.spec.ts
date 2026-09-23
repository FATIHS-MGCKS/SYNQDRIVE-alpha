import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@shared/auth/roles.guard';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { PlatformAdminController } from './platform-admin.controller';

const ROUTES = {
  listSessions: 'listBatteryV2RestSessions',
  inspect: 'getBatteryV2RestSessionFeatureInspection',
} as const;

function contextFor(user: unknown, route: keyof typeof ROUTES): ExecutionContext {
  return {
    getHandler: () =>
      (PlatformAdminController.prototype as unknown as Record<string, unknown>)[ROUTES[route]],
    getClass: () => PlatformAdminController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PlatformAdminController Battery V2 C5B inspection — authorization', () => {
  const guard = new RolesGuard(new Reflector());

  it('controller declares MASTER_ADMIN at class level', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, PlatformAdminController);
    expect(roles).toEqual(['MASTER_ADMIN']);
  });

  it.each(Object.values(ROUTES))('handler %s is on MASTER_ADMIN controller', (handlerName) => {
    expect(
      typeof (PlatformAdminController.prototype as unknown as Record<string, unknown>)[handlerName],
    ).toBe('function');
  });

  it('controller applies RolesGuard', () => {
    const guards = Reflect.getMetadata('__guards__', PlatformAdminController) as
      | Array<new (...args: never[]) => unknown>
      | undefined;
    expect(guards?.map((g) => g.name)).toContain(RolesGuard.name);
  });

  it('non-master user is denied for inspection route', () => {
    expect(() =>
      guard.canActivate(
        contextFor({ platformRole: 'ORG_ADMIN', roles: ['ORG_ADMIN'] }, 'inspect'),
      ),
    ).toThrow(ForbiddenException);
  });
});
