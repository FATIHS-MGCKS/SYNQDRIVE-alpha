import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { VehicleIntelligenceController } from './vehicle-intelligence.controller';

describe('VehicleIntelligenceController device-connection evidence security', () => {
  it('requires fleet-connectivity.read permission', () => {
    const permission = Reflect.getMetadata(
      PERMISSION_KEY,
      VehicleIntelligenceController.prototype.getTripDeviceConnectionEvidence,
    );
    expect(permission).toEqual({
      module: 'fleet-connectivity',
      level: 'read',
    });
  });

  it('applies PermissionsGuard on trip device-connection evidence', () => {
    const guards =
      Reflect.getMetadata(
        GUARDS_METADATA,
        VehicleIntelligenceController.prototype.getTripDeviceConnectionEvidence,
      ) ?? [];
    expect(guards).toEqual(expect.arrayContaining([PermissionsGuard]));
  });
});
