import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { VehicleMotionPhysicsReferenceController } from './vehicle-motion-physics-reference.controller';

describe('VehicleMotionPhysicsReferenceController security', () => {
  it('requires org scoping and permission guards at controller level', () => {
    const guards = Reflect.getMetadata('__guards__', VehicleMotionPhysicsReferenceController) as Array<{
      name: string;
    }>;
    expect(guards?.map((g) => g.name)).toEqual(
      expect.arrayContaining([OrgScopingGuard.name, RolesGuard.name, PermissionsGuard.name]),
    );
  });

  it('maps fleet-condition read/write/manage permissions to handlers', () => {
    const readPerm = Reflect.getMetadata(
      PERMISSION_KEY,
      VehicleMotionPhysicsReferenceController.prototype.getActive,
    ) as { module: string; level: string };
    expect(readPerm).toEqual({ module: 'fleet-condition', level: 'read' });

    const writePerm = Reflect.getMetadata(
      PERMISSION_KEY,
      VehicleMotionPhysicsReferenceController.prototype.create,
    ) as { module: string; level: string };
    expect(writePerm).toEqual({ module: 'fleet-condition', level: 'write' });

    const managePerm = Reflect.getMetadata(
      PERMISSION_KEY,
      VehicleMotionPhysicsReferenceController.prototype.verify,
    ) as { module: string; level: string };
    expect(managePerm).toEqual({ module: 'fleet-condition', level: 'manage' });
  });
});
