import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common/interfaces';
import type { Request } from 'express';
import { ResendWebhookService } from './resend-webhook.service';

@Controller('webhooks/resend')
export class ResendWebhookController {
  constructor(private readonly webhookService: ResendWebhookService) {}

  @Post('outbound-email')
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: { type?: string; data?: { email_id?: string; bounce?: unknown } },
    @Headers('svix-id') svixId?: string,
    @Headers('svix-timestamp') svixTimestamp?: string,
    @Headers('svix-signature') svixSignature?: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      throw new UnauthorizedException('Missing raw webhook body');
    }

    return this.webhookService.handle(
      rawBody,
      body,
      {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      },
    );
  }
}
