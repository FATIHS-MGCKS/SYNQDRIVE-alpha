import {
  Body,
  Controller,
  Header,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { TwilioWebhookService } from './twilio-webhook.service';

@Controller('webhooks/twilio')
export class TwilioWebhookController {
  private readonly logger = new Logger(TwilioWebhookController.name);

  constructor(private readonly webhookService: TwilioWebhookService) {}

  @Post('voice')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  async inboundVoice(@Req() req: Request, @Body() body: unknown): Promise<string> {
    try {
      return await this.webhookService.handleInboundVoice({
        body,
        headers: req.headers as Record<string, string | string[] | undefined>,
        requestUrl: this.resolveRequestUrl(req),
      });
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      this.logger.error(
        `Twilio voice webhook failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      throw err;
    }
  }

  @Post('status')
  @HttpCode(200)
  async statusCallback(@Req() req: Request, @Body() body: unknown) {
    try {
      await this.webhookService.handleStatusCallback({
        body,
        headers: req.headers as Record<string, string | string[] | undefined>,
        requestUrl: this.resolveRequestUrl(req),
      });
      return { success: true };
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      this.logger.error(
        `Twilio status webhook failed: ${err instanceof Error ? err.message : 'unknown'}`,
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
