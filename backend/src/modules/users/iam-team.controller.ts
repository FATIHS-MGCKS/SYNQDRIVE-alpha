import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { RequireStepUp } from '@shared/decorators/require-step-up.decorator';
import { USERS_ROLES_MODULE } from '@shared/auth/permission.constants';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { IamTeamService } from './iam-team.service';

type AuthedRequest = { user?: { id?: string } };

const USERS_MODULE = USERS_ROLES_MODULE;

@Controller('organizations/:orgId/iam')
@UseGuards(OrgScopingGuard, PermissionsGuard)
export class IamTeamController {
  constructor(private readonly team: IamTeamService) {}

  @Get('team/kpis')
  @RequirePermission(USERS_MODULE, 'read')
  getKpis(@Param('orgId') orgId: string) {
    return this.team.getKpis(orgId);
  }

  @Get('team')
  @RequirePermission(USERS_MODULE, 'read')
  listTeam(@Param('orgId') orgId: string, @Query('search') search?: string) {
    return this.team.listTeam(orgId, { search });
  }

  @Get('team/members/:membershipId')
  @RequirePermission(USERS_MODULE, 'read')
  getMember(@Param('orgId') orgId: string, @Param('membershipId') membershipId: string) {
    return this.team.getMemberDetail(orgId, membershipId);
  }

  @Post('team/members/:membershipId/send-reset-link')
  @UseGuards(StepUpGuard)
  @RequirePermission(USERS_MODULE, 'manage')
  @RequireStepUp(STEP_UP_ACTION.PRIVILEGED_PERMISSION_CHANGE)
  sendResetLink(
    @Param('orgId') orgId: string,
    @Param('membershipId') membershipId: string,
    @Req() req: AuthedRequest,
  ) {
    void req;
    return this.team
      .getMemberDetail(orgId, membershipId)
      .then((detail) => this.team.sendPasswordResetLink(orgId, detail.userId));
  }

  @Get('roles')
  @RequirePermission(USERS_MODULE, 'read')
  listRoles(@Param('orgId') orgId: string) {
    return this.team.listRoles(orgId);
  }

  @Get('roles/:roleId')
  @RequirePermission(USERS_MODULE, 'read')
  getRole(@Param('orgId') orgId: string, @Param('roleId') roleId: string) {
    return this.team.getRoleDetail(orgId, roleId);
  }

  @Get('security')
  @RequirePermission(USERS_MODULE, 'read')
  getSecurity(@Param('orgId') orgId: string) {
    return this.team.getSecurityOverview(orgId);
  }
}
