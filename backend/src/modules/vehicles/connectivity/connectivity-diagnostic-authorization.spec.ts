/**
 * Authorization contract for `GET admin/vehicles/:vehicleId/operational/diagnostics`.
 *
 * The route serves Master-Admin-only connectivity internals, so the guard chain
 * is part of the security boundary and is asserted here rather than assumed:
 * authentication is global (`AuthGuard` as `APP_GUARD`), the controller applies
 * `RolesGuard`, and the handler requires the `MASTER_ADMIN` platform role.
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '@shared/auth/roles.guard';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { VehiclesController } from '../vehicles.controller';

const ROUTE = 'getVehicleOperationalDiagnostics';

function contextFor(user: unknown): ExecutionContext {
  return {
    getHandler: () =>
      (VehiclesController.prototype as unknown as Record<string, unknown>)[ROUTE],
    getClass: () => VehiclesController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('admin connectivity diagnostics — authorization', () => {
  const guard = new RolesGuard(new Reflector());

  it('the route declares MASTER_ADMIN', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      (VehiclesController.prototype as unknown as Record<string, unknown>)[ROUTE] as object,
    );

    expect(roles).toEqual(['MASTER_ADMIN']);
  });

  it('the controller applies the RolesGuard', () => {
    const guards = Reflect.getMetadata('__guards__', VehiclesController) as
      | Array<new (...args: never[]) => unknown>
      | undefined;

    expect(guards?.map((g) => g.name)).toContain(RolesGuard.name);
  });

  it('allows a MASTER_ADMIN platform role', () => {
    expect(guard.canActivate(contextFor({ platformRole: 'MASTER_ADMIN' }))).toBe(true);
  });

  it.each([
    ['ORG_ADMIN', { membershipRole: 'ORG_ADMIN' }],
    ['SUB_ADMIN', { membershipRole: 'SUB_ADMIN' }],
    ['WORKER', { membershipRole: 'WORKER' }],
    ['DRIVER', { membershipRole: 'DRIVER' }],
    ['tenant platform role', { platformRole: 'USER', membershipRole: 'ORG_ADMIN' }],
  ])('rejects %s', (_label, user) => {
    expect(() => guard.canActivate(contextFor(user))).toThrow(ForbiddenException);
  });

  it('rejects an unauthenticated request', () => {
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a request with no organizationId instead of doing an unscoped lookup', async () => {
    const controller = new (VehiclesController as unknown as {
      new (...args: unknown[]): VehiclesController;
    })({}, {}, {}, { getDiagnostics: jest.fn() });

    await expect(
      controller.getVehicleOperationalDiagnostics('veh-1', ''),
    ).rejects.toThrow('organizationId is required');
  });

  it('forwards the requested organization scope to the service', async () => {
    const getDiagnostics = jest.fn().mockResolvedValue({});
    const controller = new (VehiclesController as unknown as {
      new (...args: unknown[]): VehiclesController;
    })({}, {}, {}, { getDiagnostics });

    await controller.getVehicleOperationalDiagnostics('veh-1', 'org-1');

    expect(getDiagnostics).toHaveBeenCalledWith('veh-1', 'org-1');
  });
});
