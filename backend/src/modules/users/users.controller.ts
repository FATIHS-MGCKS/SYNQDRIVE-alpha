import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  GoneException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { RequireStepUp } from '@shared/decorators/require-step-up.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { USERS_ROLES_MODULE } from '@shared/auth/permission.constants';
import {
  AdminChangePasswordDto,
  AdminCreateUserDto,
  AdminUpdateUserDto,
  ChangeOrgUserPasswordDto,
  RequestOrgUserPasswordResetDto,
  CreateMembershipDto,
  CreateOrgUserDto,
  UpdateOrgUserDto,
} from './dto';
import { AssignOrganizationRoleDto } from './dto/organization-role.dto';
import { OrganizationRoleService } from './organization-role.service';
import { OrganizationInviteService } from './organization-invite.service';

interface AuthedRequest {
  user?: {
    id?: string;
    platformRole?: string;
    membershipRole?: string;
    organizationId?: string;
  };
}

const USERS_MODULE = USERS_ROLES_MODULE;

/**
 * Org-scoped user management — guarded by OrgScopingGuard + PermissionsGuard.
 * Platform admin routes remain MASTER_ADMIN-only via RolesGuard.
 */
@Controller()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly roleService: OrganizationRoleService,
    private readonly inviteService: OrganizationInviteService,
  ) {}

  // ─── Master Admin routes ─────────────────────────────

  @Get('admin/users')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async adminFindAll() {
    return this.usersService.findAll();
  }

  @Get('admin/users/:id')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async adminFindOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post('admin/users')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async adminCreate(@Body() body: AdminCreateUserDto) {
    return this.usersService.create(body);
  }

  @Patch('admin/users/:id')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async adminUpdate(@Param('id') id: string, @Body() body: AdminUpdateUserDto) {
    return this.usersService.update(id, body);
  }

  @Post('admin/users/:id/change-password')
  @UseGuards(RolesGuard, StepUpGuard)
  @Roles('MASTER_ADMIN')
  @RequireStepUp(STEP_UP_ACTION.PRIVILEGED_PERMISSION_CHANGE)
  async adminChangePassword(
    @Param('id') id: string,
    @Body() body: AdminChangePasswordDto,
  ) {
    return this.usersService.changePasswordAdmin(id, body.password);
  }

  @Delete('admin/users/:id')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async adminDelete(@Param('id') id: string) {
    return this.usersService.delete(id);
  }

  // ─── Org-scoped routes ───────────────────────────────

  @Get('organizations/:orgId/users')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission(USERS_MODULE, 'read')
  async orgFindAll(@Param('orgId') orgId: string) {
    return this.usersService.findByOrganization(orgId);
  }

  @Get('organizations/:orgId/users/:id')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission(USERS_MODULE, 'read')
  async orgFindOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.usersService.findOrgUserDetail(orgId, id);
  }

  @Post('organizations/:orgId/users')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission(USERS_MODULE, 'write')
  async orgCreate(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
    @Body() body: CreateOrgUserDto,
  ) {
    return this.usersService.createOrgUser(orgId, body, req.user ?? {});
  }

  @Patch('organizations/:orgId/users/:id')
  @UseGuards(OrgScopingGuard, PermissionsGuard, StepUpGuard)
  @RequirePermission(USERS_MODULE, 'write')
  @RequireStepUp(STEP_UP_ACTION.ADMIN_ROLE_ASSIGN)
  async orgUpdate(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Body() body: UpdateOrgUserDto,
  ) {
    return this.usersService.updateOrgUser(orgId, id, body, req.user ?? {});
  }

  @Post('organizations/:orgId/users/:userId/request-password-reset')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission(USERS_MODULE, 'manage')
  async orgRequestPasswordReset(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Req() req: AuthedRequest,
    @Body() body: RequestOrgUserPasswordResetDto,
  ) {
    return this.usersService.requestOrgUserPasswordReset(
      orgId,
      userId,
      req.user ?? {},
      {
        reason: body.reason,
        ipAddress: (req as { ip?: string }).ip,
        userAgent: (req as { headers?: Record<string, string> }).headers?.['user-agent'],
      },
    );
  }

  /**
   * @deprecated Direct password write removed — returns 410 with migration hint.
   */
  @Post('organizations/:orgId/users/:userId/change-password')
  @UseGuards(OrgScopingGuard, PermissionsGuard, StepUpGuard)
  @RequirePermission(USERS_MODULE, 'manage')
  @RequireStepUp(STEP_UP_ACTION.PRIVILEGED_PERMISSION_CHANGE)
  async orgChangePassword(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body() _body: ChangeOrgUserPasswordDto,
  ) {
    throw new GoneException({
      statusCode: 410,
      code: 'ORG_ADMIN_DIRECT_PASSWORD_WRITE_DEPRECATED',
      message:
        'Direct password changes by organization administrators are not allowed. ' +
        'Use POST /organizations/:orgId/users/:userId/request-password-reset instead.',
      resetRequestRoute: `POST /organizations/${orgId}/users/${userId}/request-password-reset`,
    });
  }

  @Delete('organizations/:orgId/users/:id')
  @UseGuards(OrgScopingGuard, PermissionsGuard, StepUpGuard)
  @RequirePermission(USERS_MODULE, 'manage')
  @RequireStepUp(STEP_UP_ACTION.ADMIN_ROLE_ASSIGN)
  async orgDelete(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: AuthedRequest,
  ) {
    return this.usersService.removeOrgUser(orgId, id, req.user ?? {});
  }

  @Post('organizations/:orgId/users/:userId/membership')
  @UseGuards(OrgScopingGuard, PermissionsGuard)
  @RequirePermission(USERS_MODULE, 'manage')
  async orgCreateMembership(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body() body: CreateMembershipDto,
  ) {
    return this.usersService.createMembership(userId, orgId, body.role);
  }

  @Post('organizations/:orgId/users/:userId/assign-role')
  @UseGuards(OrgScopingGuard, PermissionsGuard, StepUpGuard)
  @RequirePermission(USERS_MODULE, 'manage')
  @RequireStepUp(STEP_UP_ACTION.ADMIN_ROLE_ASSIGN)
  async assignRole(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Req() req: AuthedRequest,
    @Body() body: AssignOrganizationRoleDto,
  ) {
    await this.roleService.assignRoleToUser(
      orgId,
      userId,
      body.roleId,
      req.user?.id,
    );
    return this.usersService.findOrgUserDetail(orgId, userId);
  }

  @Get('organizations/:orgId/users/:userId/security-activity')
  @UseGuards(OrgScopingGuard, PermissionsGuard, StepUpGuard)
  @RequirePermission(USERS_MODULE, 'read')
  @RequireStepUp(STEP_UP_ACTION.AUDIT_EXPORT)
  async securityActivity(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
  ) {
    return this.inviteService.getUserSecurityActivity(orgId, userId);
  }
}
