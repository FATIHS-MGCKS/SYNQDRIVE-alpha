import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';
import { USERS_ROLES_MODULE } from '@shared/auth/permission.constants';
import { MembershipRole } from '@prisma/client';
import { OrganizationInvitesController } from './organization-invites.controller';
import { OrganizationInviteService } from './organization-invite.service';

function permissionOf(target: object, method: string) {
  const handler = (target as Record<string, (...args: unknown[]) => unknown>)[method];
  return Reflect.getMetadata(PERMISSION_KEY, handler);
}

describe('OrganizationInvitesController security characterization', () => {
  it('applies OrgScopingGuard and PermissionsGuard on controller class', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, OrganizationInvitesController) ?? [];
    expect(guards).toEqual(expect.arrayContaining([OrgScopingGuard, PermissionsGuard]));
  });

  it('create requires users-roles.write', () => {
    expect(permissionOf(OrganizationInvitesController.prototype, 'create')).toEqual({
      module: USERS_ROLES_MODULE,
      level: 'write',
    });
  });

  it('resend and revoke require users-roles.manage', () => {
    for (const method of ['resend', 'revoke'] as const) {
      expect(permissionOf(OrganizationInvitesController.prototype, method)).toEqual({
        module: USERS_ROLES_MODULE,
        level: 'manage',
      });
    }
  });

  it('characterization: createInvite service returns inviteToken (secret exposure)', async () => {
    const invites = {
      createInvite: jest.fn().mockResolvedValue({
        id: 'invite-1',
        inviteToken: 'plaintext-secret-token',
        inviteUrl: 'https://app.example/invite?token=plaintext-secret-token',
      }),
    };
    const controller = new OrganizationInvitesController(
      invites as unknown as OrganizationInviteService,
    );
    const result = await controller.create(
      'org-1',
      { user: { id: 'admin-1' } },
      { email: 'x@regression.test', membershipRole: MembershipRole.WORKER },
    );
    expect(result.inviteToken).toBeDefined();
  });

  it('TARGET RED: create response must not include inviteToken or inviteUrl', async () => {
    const invites = {
      createInvite: jest.fn().mockResolvedValue({
        id: 'invite-1',
        email: 'x@regression.test',
        status: 'PENDING',
      }),
    };
    const controller = new OrganizationInvitesController(
      invites as unknown as OrganizationInviteService,
    );
    const result = await controller.create(
      'org-1',
      { user: { id: 'admin-1' } },
      { email: 'x@regression.test', membershipRole: MembershipRole.WORKER },
    );
    expect(result).not.toHaveProperty('inviteToken');
    expect(result).not.toHaveProperty('inviteUrl');
  });
});
