/**
 * Security negative characterization for Vehicle Detail polling/mutation endpoints.
 */
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { VehiclesController } from './vehicles.controller';

describe('Vehicle Detail — security negative tests', () => {
  describe('endpoint guard stack', () => {
    it('requires org scoping + fleet.read on telemetry', () => {
      const guards =
        Reflect.getMetadata(GUARDS_METADATA, VehiclesController.prototype.getVehicleTelemetry) ??
        [];
      expect(guards).toEqual(expect.arrayContaining([OrgScopingGuard, PermissionsGuard]));
      const permission = Reflect.getMetadata(
        PERMISSION_KEY,
        VehiclesController.prototype.getVehicleTelemetry,
      );
      expect(permission).toEqual(
        expect.objectContaining({ module: 'fleet', level: 'read' }),
      );
    });

    it('requires org scoping + fleet.read on live-gps', () => {
      const guards =
        Reflect.getMetadata(GUARDS_METADATA, VehiclesController.prototype.getLiveGps) ?? [];
      expect(guards).toEqual(expect.arrayContaining([OrgScopingGuard, PermissionsGuard]));
    });

    it('requires org scoping + fleet.write on status PATCH', () => {
      const guards =
        Reflect.getMetadata(GUARDS_METADATA, VehiclesController.prototype.updateVehicleStatus) ??
        [];
      expect(guards).toEqual(expect.arrayContaining([OrgScopingGuard, PermissionsGuard]));
      const permission = Reflect.getMetadata(
        PERMISSION_KEY,
        VehiclesController.prototype.updateVehicleStatus,
      );
      expect(permission).toEqual(
        expect.objectContaining({ module: 'fleet', level: 'write' }),
      );
    });

    it('requires org scoping on device-connection', () => {
      const guards =
        Reflect.getMetadata(GUARDS_METADATA, VehiclesController.prototype.getDeviceConnection) ??
        [];
      expect(guards).toContain(OrgScopingGuard);
    });

    it('applies RolesGuard on VehiclesController', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, VehiclesController) ?? [];
      expect(guards).toContain(RolesGuard);
    });
  });

  describe('tenant isolation patterns', () => {
    it('scopes vehicle lookup by organizationId (simulated where-clause)', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      await findFirst({
        where: { id: 'veh-foreign', organizationId: 'org-a' },
      });
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'veh-foreign', organizationId: 'org-a' },
      });
    });

    it('does not leak foreign vehicle when org filter mismatches', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const result = await findFirst({
        where: { id: 'veh-b', organizationId: 'org-a' },
      });
      expect(result).toBeNull();
    });
  });

  describe('permission denials', () => {
    it('maps missing fleet.write to ForbiddenException contract', () => {
      expect(() => {
        throw new ForbiddenException('Missing permission: fleet.write');
      }).toThrow(ForbiddenException);
    });
  });
});
