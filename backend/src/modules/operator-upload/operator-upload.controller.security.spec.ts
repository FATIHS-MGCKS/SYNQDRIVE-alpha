import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OperatorUploadController } from './operator-upload.controller';

describe('OperatorUploadController security', () => {
  it('requires org scoping, roles, and permissions guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, OperatorUploadController) ?? [];
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, RolesGuard, PermissionsGuard]),
    );
  });
});
