import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { VehiclesController } from './vehicles.controller';

describe('VehiclesController device-connection security', () => {
  it('applies OrgScopingGuard and PermissionsGuard', () => {
    const guards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        VehiclesController.prototype.getDeviceConnection,
      ) ?? [];
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, PermissionsGuard]),
    );
  });

  it('requires fleet-connectivity.read permission', () => {
    const permission = Reflect.getMetadata(
      PERMISSION_KEY,
      VehiclesController.prototype.getDeviceConnection,
    );
    expect(permission).toEqual({
      module: 'fleet-connectivity',
      level: 'read',
    });
  });

  it('declares rate limiting via Throttle decorator', () => {
    const keys = Reflect.getMetadataKeys(VehiclesController.prototype.getDeviceConnection);
    expect(keys.some((key) => String(key).includes('THROTTLER'))).toBe(true);
  });
});
