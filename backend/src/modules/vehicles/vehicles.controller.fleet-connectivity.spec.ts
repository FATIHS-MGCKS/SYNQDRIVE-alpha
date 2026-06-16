import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { VehiclesController } from './vehicles.controller';

describe('VehiclesController fleet-connectivity security', () => {
  it('applies OrgScopingGuard and PermissionsGuard', () => {
    const guards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        VehiclesController.prototype.getFleetConnectivity,
      ) ?? [];
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, PermissionsGuard]),
    );
  });

  it('requires fleet-connectivity.read permission', () => {
    const permission = Reflect.getMetadata(
      PERMISSION_KEY,
      VehiclesController.prototype.getFleetConnectivity,
    );
    expect(permission).toEqual({
      module: 'fleet-connectivity',
      level: 'read',
    });
  });

  it('does not expose write handlers for fleet-connectivity', () => {
    const writeLike = Object.getOwnPropertyNames(VehiclesController.prototype)
      .filter((name) => name.toLowerCase().includes('fleetconnectivity'))
      .filter((name) =>
        /^(post|put|patch|delete)/i.test(name) ||
        name.toLowerCase().includes('sync') ||
        name.toLowerCase().includes('unlink') ||
        name.toLowerCase().includes('remap'),
      );
    expect(writeLike).toEqual([]);
  });
});
