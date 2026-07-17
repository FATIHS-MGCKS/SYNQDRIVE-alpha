import {
  Body,
  Controller,
  Header,
  HttpCode,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { TwilioWebhookService } from './twilio-webhook.service';

@Controller('webhooks/twilio')
export class TwilioWebhookController {
  private readonly logger = new Logger(TwilioWebhookController.name);

  constructor(private readonly webhookService: TwilioWebhookService) {}

  @Post('voice')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml')
  async inboundVoice(
    @Req() req: Request,
    @Body() body: unknown,
    @Res() res: Response,
  ) {
    try {
      const twiml = await this.webhookService.handleInboundVoice({
        body,
        headers: req.headers as Record<string, string | string[] | undefined>,
        requestUrl: this.resolveRequestUrl(req),
      });
      return res.status(200).send(twiml);
    } catch (err) {
      this.logger.warn(
        `Twilio voice webhook rejected: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return res
        .status(200)
        .type('text/xml')
        .send(
          '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Service unavailable.</Say></Response>',
        );
    }
  }

  @Post('status')
  @HttpCode(200)
  async statusCallback(@Req() req: Request, @Body() body: unknown) {
    await this.webhookService.handleStatusCallback({
      body,
      headers: req.headers as Record<string, string | string[] | undefined>,
      requestUrl: this.resolveRequestUrl(req),
    });
    return { success: true };
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
