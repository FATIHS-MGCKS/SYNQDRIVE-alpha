import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common/interfaces';
import { Request } from 'express';
import { StripeConnectWebhookService } from './stripe-connect-webhook.service';

/** Public Stripe Connect webhook — separate from platform billing `/webhooks/stripe`. */
@Controller('webhooks/stripe-connect')
export class StripeConnectWebhookController {
  constructor(private readonly webhookService: StripeConnectWebhookService) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      throw new Error('Stripe Connect webhook requires raw request body');
    }
    return this.webhookService.ingestRawWebhook(rawBody, signature);
  }
}
