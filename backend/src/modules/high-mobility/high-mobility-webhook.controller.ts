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

/** Public webhook endpoints — no RolesGuard; signatures verified per app-container secret */
@Controller('integrations/high-mobility')
export class HighMobilityWebhookController {
  private readonly logger = new Logger(HighMobilityWebhookController.name);

  constructor(private readonly webhookService: HighMobilityWebhookService) {}

  /**
   * POST /api/v1/integrations/high-mobility/webhook
   * Legacy single-path webhook — routes to HM Health-APP by default.
   * Kept for backward compatibility; new setups should use /webhook/health or /webhook/telemetry.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hm-signature') signature: string | undefined,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
    this.webhookService.verifySignature(rawBody, signature, 'healthApp');
    const payload: HmWebhookPayloadDto = req.body as HmWebhookPayloadDto;
    await this.webhookService.processWebhook(payload, 'healthApp');
    return { received: true };
  }

  /**
   * POST /api/v1/integrations/high-mobility/webhook/health
   * HM Health-APP specific webhook endpoint.
   * Verified with HM_HEALTH_APP_WEBHOOK_SECRET.
   */
  @Post('webhook/health')
  @HttpCode(HttpStatus.OK)
  async handleHealthAppWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hm-signature') signature: string | undefined,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
    this.webhookService.verifySignature(rawBody, signature, 'healthApp');
    const payload: HmWebhookPayloadDto = req.body as HmWebhookPayloadDto;
    await this.webhookService.processWebhook(payload, 'healthApp');
    return { received: true };
  }

  /**
   * POST /api/v1/integrations/high-mobility/webhook/telemetry
   * HM Telemetry-APP specific webhook endpoint.
   * Verified with HM_TELEMETRY_APP_WEBHOOK_SECRET.
   */
  @Post('webhook/telemetry')
  @HttpCode(HttpStatus.OK)
  async handleTelemetryAppWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hm-signature') signature: string | undefined,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
    this.webhookService.verifySignature(rawBody, signature, 'telemetryApp');
    const payload: HmWebhookPayloadDto = req.body as HmWebhookPayloadDto;
    await this.webhookService.processWebhook(payload, 'telemetryApp');
    return { received: true };
  }
}
