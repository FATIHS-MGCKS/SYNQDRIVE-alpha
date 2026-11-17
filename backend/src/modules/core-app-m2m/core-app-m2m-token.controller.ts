import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseFilters,
} from '@nestjs/common';
import type { Request } from 'express';
import { CoreAppM2mTokenExchangeService } from './core-app-m2m-token-exchange.service';
import { CoreAppM2mRateLimitExceptionFilter } from './core-app-m2m-rate-limit-exception.filter';
import { resolveCoreAppM2mTrustBoundaryClientIp } from './core-app-m2m-request-ip.util';
import { CoreAppM2mTokenRateLimitService } from './core-app-m2m-token-rate-limit.service';
import { CoreAppM2mTokenExchangeRequestDto } from './dto/core-app-m2m-token-exchange.dto';
import type { CoreAppM2mTokenExchangeResponse } from './core-app-m2m-token.types';

@UseFilters(CoreAppM2mRateLimitExceptionFilter)
@Controller('auth/core-app')
export class CoreAppM2mTokenController {
  constructor(
    private readonly rateLimit: CoreAppM2mTokenRateLimitService,
    private readonly tokenExchange: CoreAppM2mTokenExchangeService,
  ) {}

  /** Client credential exchange — public (no user JWT); M2M runtime gates apply inside service. */
  @Post('token')
  @HttpCode(HttpStatus.OK)
  async exchangeToken(
    @Req() req: Request,
    @Body() body: CoreAppM2mTokenExchangeRequestDto,
  ): Promise<CoreAppM2mTokenExchangeResponse> {
    await this.rateLimit.assertBeforeTokenExchange({
      clientId: body.clientId,
      clientIp: resolveCoreAppM2mTrustBoundaryClientIp(req),
    });
    return this.tokenExchange.exchangeToken(body);
  }
}