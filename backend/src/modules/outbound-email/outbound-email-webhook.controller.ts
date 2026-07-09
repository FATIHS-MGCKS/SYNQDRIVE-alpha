import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common/interfaces';
import { Request } from 'express';
import { ResendWebhookService } from './providers/resend/resend-webhook.service';

/** Public Resend webhook — Svix signature verified in service; no JWT auth */
@Controller('webhooks/resend')
export class OutboundEmailWebhookController {
  constructor(private readonly webhookService: ResendWebhookService) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId?: string,
    @Headers('svix-timestamp') svixTimestamp?: string,
    @Headers('svix-signature') svixSignature?: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      throw new Error('Resend webhook requires raw request body');
    }

    return this.webhookService.ingest(rawBody, {
      id: svixId,
      timestamp: svixTimestamp,
      signature: svixSignature,
    });
  }
}
