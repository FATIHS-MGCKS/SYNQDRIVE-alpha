import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Request } from 'express';
import { SmsWebhookProcessorService } from '../services/sms-webhook-processor.service';
import { SmsWebhookSecurityService } from '../services/sms-webhook-security.service';

@Controller('webhooks/sentdm')
export class SmsWebhookController {
  constructor(
    private readonly security: SmsWebhookSecurityService,
    private readonly processor: SmsWebhookProcessorService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      throw new BadRequestException('MISSING_RAW_BODY');
    }

    const verified = await this.security.verifyIngress({ rawBody, headers });
    try {
      await this.processor.processVerifiedIngress(verified);
    } catch {
      throw new ServiceUnavailableException('SMS webhook processing failed');
    }
    return { success: true };
  }
}
