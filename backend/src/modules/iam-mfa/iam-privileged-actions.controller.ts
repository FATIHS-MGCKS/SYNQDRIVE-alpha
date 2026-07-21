import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
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
import { STEP_UP_ACTION } from './iam-mfa.policy';

type AuthedRequest = {
  user?: { id?: string };
};

const USERS_MODULE = USERS_ROLES_MODULE;

/**
 * Step-up protected privileged IAM actions.
 * Endpoints return structured placeholders until dedicated flows ship.
 */
@Controller('organizations/:orgId/privileged-actions')
@UseGuards(OrgScopingGuard, PermissionsGuard, StepUpGuard)
export class IamPrivilegedActionsController {
  @Post('break-glass')
  @RequirePermission(USERS_MODULE, 'manage')
  @RequireStepUp(STEP_UP_ACTION.BREAK_GLASS)
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  breakGlass(
    @Req() req: AuthedRequest,
    @Body() body: { reason: string; idempotencyKey: string },
  ) {
    void req;
    void body;
    return {
      code: 'NOT_IMPLEMENTED',
      message: 'Break-glass activation flow is not yet available',
    };
  }

  @Post('privacy/export')
  @RequirePermission(USERS_MODULE, 'manage')
  @RequireStepUp(STEP_UP_ACTION.PRIVACY_DATA_EXPORT)
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  privacyExport(@Req() req: AuthedRequest, @Body() body: { idempotencyKey: string }) {
    void req;
    void body;
    return {
      code: 'NOT_IMPLEMENTED',
      message: 'Privacy data export flow is not yet available',
    };
  }

  @Post('privacy/delete')
  @RequirePermission(USERS_MODULE, 'manage')
  @RequireStepUp(STEP_UP_ACTION.PRIVACY_DATA_DELETION)
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  privacyDelete(
    @Req() req: AuthedRequest,
    @Body() body: { idempotencyKey: string; confirmation: string },
  ) {
    void req;
    void body;
    return {
      code: 'NOT_IMPLEMENTED',
      message: 'Privacy data deletion flow is not yet available',
    };
  }
}
