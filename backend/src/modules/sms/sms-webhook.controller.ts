import { Body, Controller, HttpCode, Logger, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { SmsWebhookService } from './sms-webhook.service';

@Controller('webhooks/twilio')
export class SmsWebhookController {
  private readonly logger = new Logger(SmsWebhookController.name);

  constructor(private readonly webhookService: SmsWebhookService) {}

  @Post('message-status')
  @HttpCode(200)
  async messageStatus(@Req() req: Request, @Body() body: unknown) {
    try {
      await this.webhookService.handleMessageStatus({
        body,
        headers: req.headers as Record<string, string | string[] | undefined>,
        requestUrl: this.resolveRequestUrl(req),
      });
      return { success: true };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(
        `Twilio SMS status webhook failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      throw err;
    }
  }

  @Post('sms')
  @HttpCode(200)
  async inboundSms(@Req() req: Request, @Body() body: unknown) {
    try {
      await this.webhookService.handleInboundSms({
        body,
        headers: req.headers as Record<string, string | string[] | undefined>,
        requestUrl: this.resolveRequestUrl(req),
      });
      return { success: true };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error(
        `Twilio inbound SMS webhook failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      throw err;
    }
  }

  private resolveRequestUrl(req: Request): string {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : forwardedProto ?? req.protocol;
    const host = req.get('host') ?? 'localhost';
    return `${proto}://${host}${req.originalUrl}`;
  }
}
