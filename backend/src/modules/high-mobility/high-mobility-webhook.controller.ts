import {
  Controller,
  Post,
  Req,
  Headers,
  RawBodyRequest,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { HighMobilityWebhookService } from './high-mobility-webhook.service';
import type { HmWebhookPayloadDto } from './dto/high-mobility.dto';

/** Public webhook endpoint — no RolesGuard, signature verified instead */
@Controller('integrations/high-mobility')
export class HighMobilityWebhookController {
  private readonly logger = new Logger(HighMobilityWebhookController.name);

  constructor(private readonly webhookService: HighMobilityWebhookService) {}

  /** POST /api/v1/integrations/high-mobility/webhook */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hm-signature') signature: string | undefined,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
    this.webhookService.verifySignature(rawBody, signature);

    const payload: HmWebhookPayloadDto = req.body as HmWebhookPayloadDto;
    await this.webhookService.processWebhook(payload);
    return { received: true };
  }
}
