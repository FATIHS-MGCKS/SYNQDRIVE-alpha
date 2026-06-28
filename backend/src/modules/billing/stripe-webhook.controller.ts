import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common/interfaces';
import { Request } from 'express';
import { StripeWebhookService } from './stripe-webhook.service';

/** Public Stripe webhook — signature verified in service; no JWT auth */
@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(private readonly webhookService: StripeWebhookService) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      throw new Error('Stripe webhook requires raw request body');
    }
    return this.webhookService.ingestRawWebhook(rawBody, signature);
  }
}
