import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { ROLES_KEY } from '@shared/decorators/roles.decorator';
import { USERS_ROLES_MODULE } from '@shared/auth/permission.constants';
import { UsersController } from './users.controller';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

function rolesOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(ROLES_KEY, handler);
}

function guardsOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
}

describe('UsersController security characterization', () => {
  const orgWriteHandlers = [
    'orgCreate',
    'orgUpdate',
    'orgChangePassword',
    'orgDelete',
    'orgCreateMembership',
    'assignRole',
  ] as const;

  const orgReadHandlers = ['orgFindAll', 'orgFindOne', 'securityActivity'] as const;

  it.each(orgWriteHandlers)('%s applies OrgScopingGuard and PermissionsGuard', (method) => {
    const guards = guardsOf(UsersController.prototype, method);
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, PermissionsGuard]),
    );
  });

  it.each(orgReadHandlers)('%s requires users-roles.read', (method) => {
    expect(permissionOf(UsersController.prototype, method)).toEqual({
      module: USERS_ROLES_MODULE,
      level: 'read',
    });
  });

  it('orgChangePassword requires users-roles.manage (not write)', () => {
    expect(permissionOf(UsersController.prototype, 'orgChangePassword')).toEqual({
      module: USERS_ROLES_MODULE,
      level: 'manage',
    });
  });

  it('admin routes require MASTER_ADMIN via RolesGuard', () => {
    const adminHandlers = [
      'adminFindAll',
      'adminCreate',
      'adminUpdate',
      'adminChangePassword',
      'adminDelete',
    ] as const;
    for (const method of adminHandlers) {
      expect(rolesOf(UsersController.prototype, method)).toEqual(['MASTER_ADMIN']);
      expect(guardsOf(UsersController.prototype, method)).toContain(RolesGuard);
    }
  });

  it('TARGET RED: orgChangePassword route should expose reset-request not direct password body', () => {
    const paramNames = Reflect.getMetadata(
      'design:paramtypes',
      UsersController.prototype,
      'orgChangePassword',
    );
    const dtoName = paramNames?.[3]?.name ?? '';
    expect(dtoName).toMatch(/ResetRequest|TriggerReset/i);
    expect(dtoName).not.toMatch(/ChangeOrgUserPasswordDto/i);
  });
});
