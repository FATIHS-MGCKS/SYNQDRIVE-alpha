import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CoreAppM2mTokenExchangeService } from './core-app-m2m-token-exchange.service';
import { CoreAppM2mTokenExchangeRequestDto } from './dto/core-app-m2m-token-exchange.dto';
import type { CoreAppM2mTokenExchangeResponse } from './core-app-m2m-token.types';

@Controller('auth/core-app')
export class CoreAppM2mTokenController {
  constructor(private readonly tokenExchange: CoreAppM2mTokenExchangeService) {}

  /** Client credential exchange — public (no user JWT); M2M runtime gates apply inside service. */
  @Post('token')
  @HttpCode(HttpStatus.OK)
  exchangeToken(
    @Body() body: CoreAppM2mTokenExchangeRequestDto,
  ): Promise<CoreAppM2mTokenExchangeResponse> {
    return this.tokenExchange.exchangeToken(body);
  }
}