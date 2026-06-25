import {
  Controller,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { DiditWebhookService } from './didit-webhook.service';

@Controller('webhooks/didit')
export class DiditWebhookController {
  constructor(private readonly webhookService: DiditWebhookService) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new UnauthorizedException('Missing raw webhook body');
    }

    return this.webhookService.receiveWebhook(rawBody, headers);
  }
}
