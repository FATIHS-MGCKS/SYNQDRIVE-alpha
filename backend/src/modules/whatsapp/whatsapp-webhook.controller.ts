import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(private readonly webhookService: WhatsAppWebhookService) {}

  @Get()
  async verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Query('phone_number_id') phoneNumberId: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const result = await this.webhookService.verifySubscription(
        phoneNumberId,
        mode,
        token,
        challenge,
      );
      if (result) {
        return res.status(200).send(result);
      }
      return res.sendStatus(403);
    } catch {
      return res.sendStatus(403);
    }
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
    @Body() body: unknown,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));
    await this.webhookService.receiveWebhook(rawBody, body, headers);
    return { success: true };
  }
}
