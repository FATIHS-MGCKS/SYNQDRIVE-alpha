import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { VehiclesController } from './vehicles.controller';

function guardsOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
}

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

describe('VehiclesController — vehicle detail security characterization', () => {
  it('applies RolesGuard on controller class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, VehiclesController) ?? [];
    expect(guards).toContain(RolesGuard);
  });

  describe('read endpoints (vehicle detail page)', () => {
    it('findOneByOrg requires OrgScopingGuard only (no fleet:read)', () => {
      const guards = guardsOf(VehiclesController.prototype, 'findOneByOrg');
      expect(guards).toContain(OrgScopingGuard);
      expect(guards).not.toContain(PermissionsGuard);
      expect(permissionOf(VehiclesController.prototype, 'findOneByOrg')).toBeUndefined();
    });

    it('getVehicleTelemetry requires OrgScopingGuard + fleet.read', () => {
      const guards = guardsOf(VehiclesController.prototype, 'getVehicleTelemetry');
      expect(guards).toEqual(
        expect.arrayContaining([OrgScopingGuard, PermissionsGuard]),
      );
      expect(permissionOf(VehiclesController.prototype, 'getVehicleTelemetry')).toEqual({
        module: 'fleet',
        level: 'read',
      });
    });

    it('getLiveGps requires OrgScopingGuard + fleet.read', () => {
      const guards = guardsOf(VehiclesController.prototype, 'getLiveGps');
      expect(guards).toEqual(
        expect.arrayContaining([OrgScopingGuard, PermissionsGuard]),
      );
      expect(permissionOf(VehiclesController.prototype, 'getLiveGps')).toEqual({
        module: 'fleet',
        level: 'read',
      });
    });

    it('getDeviceConnection requires OrgScopingGuard only', () => {
      const guards = guardsOf(VehiclesController.prototype, 'getDeviceConnection');
      expect(guards).toContain(OrgScopingGuard);
      expect(guards).not.toContain(PermissionsGuard);
      expect(permissionOf(VehiclesController.prototype, 'getDeviceConnection')).toBeUndefined();
    });

    it('getFleetMap requires OrgScopingGuard only', () => {
      const guards = guardsOf(VehiclesController.prototype, 'getFleetMap');
      expect(guards).toContain(OrgScopingGuard);
      expect(guards).not.toContain(PermissionsGuard);
    });
  });

  describe('write endpoints (status / cleaning)', () => {
    it('updateVehicleStatus requires OrgScopingGuard + fleet.write', () => {
      const guards = guardsOf(VehiclesController.prototype, 'updateVehicleStatus');
      expect(guards).toEqual(
        expect.arrayContaining([OrgScopingGuard, PermissionsGuard]),
      );
      expect(permissionOf(VehiclesController.prototype, 'updateVehicleStatus')).toEqual({
        module: 'fleet',
        level: 'write',
      });
    });

    it('updateByOrg requires OrgScopingGuard + fleet.write', () => {
      const guards = guardsOf(VehiclesController.prototype, 'updateByOrg');
      expect(guards).toEqual(
        expect.arrayContaining([OrgScopingGuard, PermissionsGuard]),
      );
      expect(permissionOf(VehiclesController.prototype, 'updateByOrg')).toEqual({
        module: 'fleet',
        level: 'write',
      });
    });
  });

  describe('org-scoped route parameters', () => {
    const orgScopedHandlers = [
      'findOneByOrg',
      'getVehicleTelemetry',
      'getLiveGps',
      'getDeviceConnection',
      'updateVehicleStatus',
      'getFleetMap',
    ] as const;

    it.each(orgScopedHandlers)('%s is an org-scoped handler', (method) => {
      const guards = guardsOf(VehiclesController.prototype, method);
      expect(guards).toContain(OrgScopingGuard);
    });
  });

  describe('legacy unscoped vehicle routes (must not be used for tenant detail)', () => {
    it('GET vehicles/:vehicleId has no OrgScopingGuard', () => {
      const guards = guardsOf(VehiclesController.prototype, 'findOne');
      expect(guards).not.toContain(OrgScopingGuard);
    });
  });
});
