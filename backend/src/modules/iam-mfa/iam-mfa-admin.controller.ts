import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { RequireStepUp } from '@shared/decorators/require-step-up.decorator';
import { USERS_ROLES_MODULE } from '@shared/auth/permission.constants';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamMfaService } from './iam-mfa.service';
import { STEP_UP_ACTION } from './iam-mfa.policy';

type AuthedRequest = {
  user?: { id?: string };
};

const USERS_MODULE = USERS_ROLES_MODULE;

@Controller('organizations/:orgId/users/:userId')
@UseGuards(OrgScopingGuard, PermissionsGuard, StepUpGuard)
export class IamMfaAdminController {
  constructor(
    private readonly mfa: IamMfaService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  @Post('mfa/reset')
  @RequirePermission(USERS_MODULE, 'manage')
  @RequireStepUp(STEP_UP_ACTION.MFA_RESET_OTHER_USER)
  @HttpCode(HttpStatus.OK)
  async resetMfa(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Req() req: AuthedRequest,
    @Body() body: { idempotencyKey: string; reason?: string },
  ) {
    return this.mfa.resetUserMfa({
      organizationId: orgId,
      targetUserId: userId,
      actorUserId: req.user?.id ?? '',
      idempotencyKey: body.idempotencyKey,
      reason: body.reason,
    });
  }

  @Post('sessions/revoke-all')
  @RequirePermission(USERS_MODULE, 'manage')
  @RequireStepUp(STEP_UP_ACTION.REVOKE_OTHER_USER_SESSIONS)
  @HttpCode(HttpStatus.OK)
  async revokeAllSessions(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Req() req: AuthedRequest,
    @Body() body: { idempotencyKey: string },
  ) {
    void orgId;
    void body.idempotencyKey;
    await this.refreshTokens.revokeAllForUser(userId);
    return { revoked: true };
  }
}
