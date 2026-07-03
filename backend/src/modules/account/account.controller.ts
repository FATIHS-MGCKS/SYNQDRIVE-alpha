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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccountService } from './account.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { UpdateMyPreferencesDto } from './dto/update-my-preferences.dto';
import { UpdateMyNotificationPreferencesDto } from './dto/update-my-notification-preferences.dto';
import { ChangeMyPasswordDto } from './dto/change-my-password.dto';
import { RevokeOtherSessionsDto } from './dto/revoke-session.dto';
import {
  DisableTotpDto,
  RegenerateRecoveryCodesDto,
  VerifyTotpCodeDto,
} from './dto/two-factor.dto';
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

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('me/2fa/totp/setup')
  @HttpCode(HttpStatus.OK)
  async setupTotp(@Req() req: AuthedRequest) {
    const c = this.ctx(req);
    return this.account.setupTotp(this.userId(req), this.orgId(req), {
      ip: c.ipAddress,
      userAgent: c.userAgent,
      route: 'POST /account/me/2fa/totp/setup',
    });
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('me/2fa/totp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyTotp(@Req() req: AuthedRequest, @Body() body: VerifyTotpCodeDto) {
    const c = this.ctx(req);
    return this.account.verifyTotp(this.userId(req), this.orgId(req), body.code, {
      ip: c.ipAddress,
      userAgent: c.userAgent,
      route: 'POST /account/me/2fa/totp/verify',
    });
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('me/2fa/totp/disable')
  @HttpCode(HttpStatus.OK)
  async disableTotp(@Req() req: AuthedRequest, @Body() body: DisableTotpDto) {
    const c = this.ctx(req);
    return this.account.disableTotp(this.userId(req), this.orgId(req), body, {
      ip: c.ipAddress,
      userAgent: c.userAgent,
      route: 'POST /account/me/2fa/totp/disable',
    });
  }

  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('me/2fa/recovery-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  async regenerateRecoveryCodes(
    @Req() req: AuthedRequest,
    @Body() body: RegenerateRecoveryCodesDto,
  ) {
    const c = this.ctx(req);
    return this.account.regenerateRecoveryCodes(this.userId(req), this.orgId(req), body.totpCode, {
      ip: c.ipAddress,
      userAgent: c.userAgent,
      route: 'POST /account/me/2fa/recovery-codes/regenerate',
    });
  }
}
