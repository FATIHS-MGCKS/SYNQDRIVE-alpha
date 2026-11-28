import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { RequireStepUp } from '@shared/decorators/require-step-up.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { IamMfaService } from '@modules/iam-mfa/iam-mfa.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { PaginationParams } from '@shared/utils/pagination';
import { SecurityGovernanceService } from './security-governance.service';
import {
  SecurityGovernanceSessionAuditService,
  type SessionRevocationAuditRequest,
} from './security-governance-session-audit.service';
import { SecurityGovernancePlatformPermissionAuditService } from './security-governance-platform-permission-audit.service';
import { PlatformPermissionService } from '@modules/users/platform-permissions/platform-permission.service';
import { MasterGlobalIdentityService } from '@modules/users/master-global-identity.service';
import {
  GovernanceCreateGlobalUserDto,
  GovernanceUpdateGlobalProfileDto,
} from '@modules/users/dto';

type AuthedRequest = SessionRevocationAuditRequest;

@Controller('admin/security')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@Roles('MASTER_ADMIN')
export class SecurityGovernanceController {
  constructor(
    private readonly governance: SecurityGovernanceService,
    private readonly mfa: IamMfaService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly sessionAudit: SecurityGovernanceSessionAuditService,
    private readonly platformPermissionAudit: SecurityGovernancePlatformPermissionAuditService,
    private readonly platformPermissions: PlatformPermissionService,
    private readonly globalIdentity: MasterGlobalIdentityService,
  ) {}

  @Get('attention-summary')
  getAttentionSummary() {
    return this.governance.getAttentionSummary();
  }

  @Get('users')
  listUsers(
    @Query()
    query: PaginationParams & {
      search?: string;
      platformRole?: string;
      mfaState?: string;
      attention?: string;
      organizationId?: string;
    },
  ) {
    return this.governance.listUsers(query);
  }

  @Get('users/:userId')
  getUser(@Param('userId') userId: string) {
    return this.governance.getUserDetail(userId);
  }

  @Post('users')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_USER_MANAGEMENT)
  @UseGuards(StepUpGuard)
  @RequireStepUp(STEP_UP_ACTION.MASTER_USER_MANAGEMENT)
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() body: GovernanceCreateGlobalUserDto, @Req() req: AuthedRequest) {
    return this.globalIdentity.provisionGlobalUser(body, req.user ?? {}, req);
  }

  @Patch('users/:userId')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_USER_MANAGEMENT)
  @UseGuards(StepUpGuard)
  @RequireStepUp(STEP_UP_ACTION.MASTER_USER_MANAGEMENT)
  @HttpCode(HttpStatus.OK)
  async updateUserProfile(
    @Param('userId') userId: string,
    @Body() body: GovernanceUpdateGlobalProfileDto,
    @Req() req: AuthedRequest,
  ) {
    const user = await this.globalIdentity.updateGlobalProfile(userId, body, req.user ?? {}, req);
    return { user };
  }

  @Get('users/:userId/sessions')
  listSessions(@Param('userId') userId: string) {
    return this.governance.listUserSessions(userId);
  }

  @Post('users/:userId/sessions/:sessionId/revoke')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_USER_MANAGEMENT)
  @UseGuards(StepUpGuard)
  @RequireStepUp(STEP_UP_ACTION.REVOKE_OTHER_USER_SESSIONS)
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Req() req: AuthedRequest,
  ) {
    const { revoked } = await this.sessionAudit.revokeTargetSessionWithAtomicAudit({
      req,
      targetUserId: userId,
      sessionId,
    });
    return { revoked };
  }

  @Post('users/:userId/sessions/revoke-all')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_USER_MANAGEMENT)
  @UseGuards(StepUpGuard)
  @RequireStepUp(STEP_UP_ACTION.REVOKE_OTHER_USER_SESSIONS)
  @HttpCode(HttpStatus.OK)
  async revokeAllSessions(@Param('userId') userId: string, @Req() req: AuthedRequest) {
    await this.sessionAudit.revokeAllTargetSessionsWithAtomicAudit({
      req,
      targetUserId: userId,
    });
    return { revoked: true };
  }

  @Post('users/:userId/mfa/reset')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_USER_MANAGEMENT)
  @UseGuards(StepUpGuard)
  @RequireStepUp(STEP_UP_ACTION.MFA_RESET_OTHER_USER)
  @HttpCode(HttpStatus.OK)
  async resetMfa(
    @Param('userId') userId: string,
    @Req() req: AuthedRequest,
    @Body() body: { reason: string; idempotencyKey?: string },
  ) {
    return this.mfa.resetUserMfa({
      organizationId: 'platform',
      targetUserId: userId,
      actorUserId: req.user?.id ?? '',
      idempotencyKey: body.idempotencyKey ?? `master-mfa-reset:${userId}:${Date.now()}`,
      reason: body.reason,
    });
  }

  @Post('users/:userId/platform-permissions/master-billing/grant')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_USER_MANAGEMENT)
  @HttpCode(HttpStatus.OK)
  async grantMasterBilling(@Param('userId') userId: string, @Req() req: AuthedRequest) {
    const actorUserId = req.user?.id;
    if (!actorUserId) {
      return { granted: false };
    }
    return this.platformPermissions.grantMasterBillingWithMandatoryAudit(
      userId,
      actorUserId,
      (result) =>
        this.platformPermissionAudit.buildMasterBillingGrantAudit({
          req,
          targetUserId: userId,
          grantId: result.grantId,
          idempotent: result.idempotent,
        }),
    );
  }

  @Post('users/:userId/platform-permissions/master-billing/revoke')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_USER_MANAGEMENT)
  @HttpCode(HttpStatus.OK)
  async revokeMasterBilling(@Param('userId') userId: string, @Req() req: AuthedRequest) {
    const actorUserId = req.user?.id;
    if (!actorUserId) {
      return { revoked: false };
    }
    return this.platformPermissions.revokeMasterBillingWithMandatoryAudit(
      userId,
      actorUserId,
      (result) =>
        this.platformPermissionAudit.buildMasterBillingRevokeAudit({
          req,
          targetUserId: userId,
          grantId: result.grantId,
          idempotent: result.idempotent,
        }),
    );
  }

  @Get('platform-roles')
  listPlatformRoles() {
    return this.governance.listPlatformRoles();
  }

  @Get('org-roles')
  listOrgRoles(
    @Query()
    query: PaginationParams & { organizationId?: string; search?: string },
  ) {
    return this.governance.listOrgRoles(query);
  }

  @Get('roles/:roleId')
  getRoleDetail(
    @Param('roleId') roleId: string,
    @Query('scope') scope: 'platform' | 'organization' = 'organization',
    @Query('organizationId') organizationId?: string,
  ) {
    return this.governance.getRoleDetail(roleId, scope, organizationId);
  }
}
