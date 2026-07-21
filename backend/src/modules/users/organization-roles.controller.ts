import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { RequireStepUp } from '@shared/decorators/require-step-up.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { USERS_ROLES_MODULE } from '@shared/auth/permission.constants';
import { OrganizationRoleService } from './organization-role.service';
import {
  AssignOrganizationRoleDto,
  CreateOrganizationRoleDto,
  UpdateOrganizationRoleDto,
} from './dto/organization-role.dto';

interface AuthedRequest {
  user?: { id?: string };
}

const USERS_MODULE = USERS_ROLES_MODULE;

@Controller('organizations/:orgId/roles')
@UseGuards(OrgScopingGuard, PermissionsGuard, StepUpGuard)
export class OrganizationRolesController {
  constructor(private readonly roles: OrganizationRoleService) {}

  @Get()
  @RequirePermission(USERS_MODULE, 'read')
  list(@Param('orgId') orgId: string) {
    return this.roles.listRoles(orgId);
  }

  @Get(':roleId')
  @RequirePermission(USERS_MODULE, 'read')
  get(@Param('orgId') orgId: string, @Param('roleId') roleId: string) {
    return this.roles.getRole(orgId, roleId);
  }

  @Get(':roleId/permission-preview')
  @RequirePermission(USERS_MODULE, 'read')
  preview(@Param('orgId') orgId: string, @Param('roleId') roleId: string) {
    return this.roles.permissionPreview(orgId, roleId);
  }

  @Post()
  @RequirePermission(USERS_MODULE, 'manage')
  @RequireStepUp(STEP_UP_ACTION.PRIVILEGED_PERMISSION_CHANGE)
  create(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
    @Body() body: CreateOrganizationRoleDto,
  ) {
    return this.roles.createRole(orgId, body, req.user?.id);
  }

  @Patch(':roleId')
  @RequirePermission(USERS_MODULE, 'manage')
  @RequireStepUp(STEP_UP_ACTION.PRIVILEGED_PERMISSION_CHANGE)
  update(
    @Param('orgId') orgId: string,
    @Param('roleId') roleId: string,
    @Req() req: AuthedRequest,
    @Body() body: UpdateOrganizationRoleDto,
  ) {
    return this.roles.updateRole(orgId, roleId, body, req.user?.id);
  }

  @Post(':roleId/duplicate')
  @RequirePermission(USERS_MODULE, 'manage')
  duplicate(
    @Param('orgId') orgId: string,
    @Param('roleId') roleId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.roles.duplicateRole(orgId, roleId, req.user?.id);
  }

  @Delete(':roleId')
  @RequirePermission(USERS_MODULE, 'manage')
  @RequireStepUp(STEP_UP_ACTION.ROLE_BULK_ASSIGNMENT_CHANGE)
  delete(
    @Param('orgId') orgId: string,
    @Param('roleId') roleId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.roles.deleteRole(orgId, roleId, req.user?.id);
  }
}
