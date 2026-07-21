import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccountService } from './account.service';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { RequireStepUp } from '@shared/decorators/require-step-up.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { UpdateMyPreferencesDto } from './dto/update-my-preferences.dto';
import { UpdateMyNotificationPreferencesDto } from './dto/update-my-notification-preferences.dto';
import { ChangeMyPasswordDto } from './dto/change-my-password.dto';
import { RevokeOtherSessionsDto } from './dto/revoke-session.dto';
import { AuditService } from '@modules/activity-log/audit.service';

type AuthedRequest = {
  user?: { id: string; organizationId?: string | null };
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  private ctx(req: AuthedRequest) {
    return AuditService.contextFromRequest(req as any);
  }

  private userId(req: AuthedRequest): string {
    const id = req.user?.id;
    if (!id) throw new Error('Auth context missing user id');
    return id;
  }

  private orgId(req: AuthedRequest): string | null {
    return req.user?.organizationId ?? null;
  }

  @Get('me')
  async getMe(@Req() req: AuthedRequest) {
    return this.account.getMe(this.userId(req), this.orgId(req));
  }

  @Patch('me/profile')
  async updateProfile(@Req() req: AuthedRequest, @Body() body: UpdateMyProfileDto) {
    const c = this.ctx(req);
    return this.account.updateProfile(this.userId(req), this.orgId(req), body, {
      ip: c.ipAddress,
      userAgent: c.userAgent,
      route: 'PATCH /account/me/profile',
    });
  }

  @Patch('me/preferences')
  async updatePreferences(@Req() req: AuthedRequest, @Body() body: UpdateMyPreferencesDto) {
    const c = this.ctx(req);
    return this.account.updatePreferences(this.userId(req), this.orgId(req), body, {
      ip: c.ipAddress,
      userAgent: c.userAgent,
      route: 'PATCH /account/me/preferences',
    });
  }

  @Patch('me/notifications')
  async updateNotifications(
    @Req() req: AuthedRequest,
    @Body() body: UpdateMyNotificationPreferencesDto,
  ) {
    const c = this.ctx(req);
    return this.account.updateNotifications(
      this.userId(req),
      this.orgId(req),
      body.preferences,
      {
        ip: c.ipAddress,
        userAgent: c.userAgent,
        route: 'PATCH /account/me/notifications',
      },
    );
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('me/change-password')
  @UseGuards(StepUpGuard)
  @RequireStepUp(STEP_UP_ACTION.PRIVILEGED_PERMISSION_CHANGE)
  @HttpCode(HttpStatus.OK)
  async changePassword(@Req() req: AuthedRequest, @Body() body: ChangeMyPasswordDto) {
    const c = this.ctx(req);
    return this.account.changePassword(this.userId(req), this.orgId(req), body, {
      ip: c.ipAddress,
      userAgent: c.userAgent,
      route: 'POST /account/me/change-password',
    });
  }

  @Get('me/sessions')
  async listSessions(@Req() req: AuthedRequest) {
    return this.account.listSessions(this.userId(req), this.orgId(req));
  }

  @Post('me/sessions/revoke-others')
  @UseGuards(StepUpGuard)
  @RequireStepUp(STEP_UP_ACTION.REVOKE_OTHER_USER_SESSIONS)
  @HttpCode(HttpStatus.OK)
  async revokeOtherSessions(@Req() req: AuthedRequest, @Body() body: RevokeOtherSessionsDto) {
    const c = this.ctx(req);
    return this.account.revokeOtherSessions(
      this.userId(req),
      this.orgId(req),
      body.keepSessionId,
      {
        ip: c.ipAddress,
        userAgent: c.userAgent,
        route: 'POST /account/me/sessions/revoke-others',
      },
    );
  }

  @Post('me/sessions/:sessionId/revoke')
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @Req() req: AuthedRequest,
    @Param('sessionId') sessionId: string,
  ) {
    const c = this.ctx(req);
    return this.account.revokeSession(this.userId(req), this.orgId(req), sessionId, {
      ip: c.ipAddress,
      userAgent: c.userAgent,
      route: 'POST /account/me/sessions/:sessionId/revoke',
    });
  }
}
