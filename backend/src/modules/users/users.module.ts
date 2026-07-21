import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { OrganizationInvitesController } from './organization-invites.controller';
import { OrganizationRolesController } from './organization-roles.controller';
import { PublicInvitesController } from './public-invites.controller';
import { UsersService } from './users.service';
import { OrganizationInviteService } from './organization-invite.service';
import { OrganizationRoleService } from './organization-role.service';
import { OrganizationRoleVersionService } from './organization-role-version.service';
import { OrganizationRoleChangeService } from './organization-role-change.service';
import { RoleAssignmentDriftReconciliationService } from './role-assignment-drift-reconciliation.service';
import { UserAccessAuditService } from './user-access-audit.service';
import { TransactionalMailService } from './transactional-mail.service';
import { AuthApiModule } from '@modules/auth/auth.module';

@Module({
  imports: [AuthApiModule],
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
    OrganizationRoleVersionService,
    OrganizationRoleChangeService,
    RoleAssignmentDriftReconciliationService,
    UserAccessAuditService,
    TransactionalMailService,
  ],
  exports: [
    UsersService,
    OrganizationInviteService,
    OrganizationRoleService,
    OrganizationRoleVersionService,
    OrganizationRoleChangeService,
    RoleAssignmentDriftReconciliationService,
    UserAccessAuditService,
  ],
})
export class UsersModule {}
