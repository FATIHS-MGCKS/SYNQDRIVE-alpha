import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { VehicleDetailAccessAuditAction } from '@modules/activity-log/vehicle-detail-access-audit.service';

describe('PermissionsGuard — vehicle detail permission denial audit', () => {
  const prisma = {
    organizationMembership: {
      findFirst: jest.fn(),
    },
  };
  const vehicleDetailAudit = { record: jest.fn() };
  const reflector = new Reflector();

  function makeGuard() {
    return new PermissionsGuard(
      reflector,
      prisma as never,
      undefined,
      vehicleDetailAudit as never,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'MEMBER',
      permissions: { fleet: { read: false, write: false } },
    });
  });

  it('audits permission denials on vehicle-scoped routes', async () => {
    const guard = makeGuard();
    const handler = function liveGps() {};
    Reflect.defineMetadata(PERMISSION_KEY, { module: 'fleet', level: 'read' }, handler);

    const request = {
      user: { id: 'user-1', platformRole: 'USER', organizationId: 'org-1' },
      params: { orgId: 'org-1', vehicleId: 'veh-1' },
      method: 'GET',
      route: { path: '/organizations/:orgId/vehicles/:vehicleId/live-gps' },
      requestId: 'req-deny',
    };

    const context = {
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({ getRequest: () => request }),
    };

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(vehicleDetailAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        auditAction: VehicleDetailAccessAuditAction.PERMISSION_DENIED,
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        actorUserId: 'user-1',
        requestId: 'req-deny',
        outcome: 'denied',
        errorClass: 'PERMISSION_DENIED',
      }),
    );
  });

  it('does not audit unrelated module denials without vehicle context', async () => {
    const guard = makeGuard();
    const handler = function invoices() {};
    Reflect.defineMetadata(
      PERMISSION_KEY,
      { module: 'invoices', level: 'read' },
      handler,
    );

    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'MEMBER',
      permissions: { invoices: { read: false, write: false } },
    });

    const request = {
      user: { id: 'user-1', platformRole: 'USER', organizationId: 'org-1' },
      params: { orgId: 'org-1' },
      method: 'GET',
      route: { path: '/organizations/:orgId/invoices' },
    };

    const context = {
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({ getRequest: () => request }),
    };

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(vehicleDetailAudit.record).not.toHaveBeenCalled();
  });
});
