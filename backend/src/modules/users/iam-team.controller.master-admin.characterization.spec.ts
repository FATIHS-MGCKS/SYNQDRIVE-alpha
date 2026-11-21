import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { USERS_ROLES_MODULE } from '@shared/auth/permission.constants';
import { IamTeamController } from './iam-team.controller';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

describe('IamTeamController master-admin org IAM characterization', () => {
  it('applies OrgScopingGuard and PermissionsGuard (MASTER_ADMIN pass-through is guard-level)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, IamTeamController) ?? [];
    expect(guards).toEqual(expect.arrayContaining([OrgScopingGuard, PermissionsGuard]));
  });

  it('listTeam requires users-roles.read on explicit orgId route', () => {
    expect(permissionOf(IamTeamController.prototype, 'listTeam')).toEqual({
      module: USERS_ROLES_MODULE,
      level: 'read',
    });
  });
});