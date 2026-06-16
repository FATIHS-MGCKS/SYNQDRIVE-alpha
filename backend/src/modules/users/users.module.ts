import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { OrganizationInvitesController } from './organization-invites.controller';
import { OrganizationRolesController } from './organization-roles.controller';
import { PublicInvitesController } from './public-invites.controller';
import { UsersService } from './users.service';
import { OrganizationInviteService } from './organization-invite.service';
import { OrganizationRoleService } from './organization-role.service';
import { UserAccessAuditService } from './user-access-audit.service';
import { TransactionalMailService } from './transactional-mail.service';

@Module({
  controllers: [
    UsersController,
    OrganizationInvitesController,
    OrganizationRolesController,
    PublicInvitesController,
  ],
  providers: [
    UsersService,
    OrganizationInviteService,
    OrganizationRoleService,
    UserAccessAuditService,
    TransactionalMailService,
  ],
  exports: [
    UsersService,
    OrganizationInviteService,
    OrganizationRoleService,
    UserAccessAuditService,
  ],
})
export class UsersModule {}
