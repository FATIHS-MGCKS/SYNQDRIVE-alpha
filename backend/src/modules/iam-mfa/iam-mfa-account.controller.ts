import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IamMfaService } from './iam-mfa.service';
import { RequireStepUp } from '@shared/decorators/require-step-up.decorator';
import { StepUpGuard } from '@shared/auth/step-up.guard';
import { UseGuards } from '@nestjs/common';
import { STEP_UP_ACTION } from './iam-mfa.policy';

type AuthedRequest = {
  user?: {
    id?: string;
    email?: string;
    platformRole?: string;
    membershipRole?: string;
    organizationId?: string | null;
    sessionClaims?: { authenticatedAt?: string; securityVersion?: number };
  };
  headers?: Record<string, string | string[] | undefined>;
};

@Controller('account/mfa')
export class IamMfaAccountController {
  constructor(private readonly mfa: IamMfaService) {}

  private userId(req: AuthedRequest): string {
    const id = req.user?.id;
    if (!id) throw new Error('Auth context missing user id');
    return id;
  }

  @Get('status')
  async status(@Req() req: AuthedRequest) {
    return this.mfa.getStatus({
      userId: this.userId(req),
      email: req.user?.email ?? '',
      platformRole: req.user?.platformRole,
      membershipRole: req.user?.membershipRole,
      organizationId: req.user?.organizationId ?? null,
    });
  }

  @Post('totp/enroll/start')
  @HttpCode(HttpStatus.OK)
  async enrollStart(@Req() req: AuthedRequest) {
    return this.mfa.startTotpEnrollment(
      this.userId(req),
      req.user?.email ?? '',
      req.user?.organizationId ?? null,
    );
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('totp/enroll/confirm')
  @HttpCode(HttpStatus.OK)
  async enrollConfirm(
    @Req() req: AuthedRequest,
    @Body() body: { code: string; idempotencyKey: string },
  ) {
    return this.mfa.confirmTotpEnrollment(
      this.userId(req),
      body.code,
      req.user?.organizationId ?? null,
      body.idempotencyKey,
    );
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  async challenge(
    @Req() req: AuthedRequest,
    @Body()
    body: { code?: string; recoveryCode?: string; idempotencyKey?: string },
    @Headers('authorization') authorization?: string,
  ) {
    const bearer = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;
    return this.mfa.challenge({
      userId: this.userId(req),
      code: body.code,
      recoveryCode: body.recoveryCode,
      accessToken: bearer,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @UseGuards(StepUpGuard)
  @RequireStepUp(STEP_UP_ACTION.PRIVACY_DATA_DELETION)
  @Post('reset')
  @HttpCode(HttpStatus.OK)
  async reset(@Req() req: AuthedRequest, @Body() body: { idempotencyKey: string }) {
    return this.mfa.resetOwnMfa({
      userId: this.userId(req),
      organizationId: req.user?.organizationId ?? null,
      idempotencyKey: body.idempotencyKey,
    });
  }
}
