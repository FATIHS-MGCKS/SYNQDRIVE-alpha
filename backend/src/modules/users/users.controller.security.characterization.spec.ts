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
    'orgRequestPasswordReset',
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

  it('orgRequestPasswordReset requires users-roles.manage (not write)', () => {
    expect(permissionOf(UsersController.prototype, 'orgRequestPasswordReset')).toEqual({
      module: USERS_ROLES_MODULE,
      level: 'manage',
    });
  });

  it('orgRequestPasswordReset exposes reset-request contract (not direct password body)', () => {
    const paramNames = Reflect.getMetadata(
      'design:paramtypes',
      UsersController.prototype,
      'orgRequestPasswordReset',
    );
    const dtoName = paramNames?.[3]?.name ?? '';
    expect(dtoName).toMatch(/ResetRequest|TriggerReset|RequestOrgUserPasswordReset/i);
    expect(dtoName).not.toMatch(/ChangeOrgUserPasswordDto/i);
  });

  it('deprecated orgChangePassword route returns 410 at controller (no service password write)', () => {
    const source = UsersController.prototype.orgChangePassword.toString();
    expect(source).toMatch(/GoneException|410|deprecated/i);
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
});
