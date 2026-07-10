import { Body, Controller, Headers, HttpCode, Logger, Post } from '@nestjs/common';
import { OutboundEmailEventType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { OutboundEmailService } from './outbound-email.service';

@Controller('webhooks/resend')
export class ResendWebhookController {
  private readonly logger = new Logger(ResendWebhookController.name);

  constructor(
    private readonly outboundEmail: OutboundEmailService,
    private readonly config: ConfigService,
  ) {}

  @Post('outbound-email')
  @HttpCode(200)
  async handle(
    @Body() body: { type?: string; data?: { email_id?: string; bounce?: unknown } },
    @Headers('svix-signature') signature?: string,
  ) {
    const secret = this.config.get<string>('email.webhookSecret', '');
    if (secret && !signature) {
      this.logger.warn('Resend webhook received without signature');
      return { ok: false };
    }

    const type = body.type || '';
    const emailId = body.data?.email_id;
    if (!emailId) return { ok: true };

    const mapped = this.mapEventType(type);
    if (!mapped) return { ok: true };

    await this.outboundEmail.applyWebhookEvent(emailId, mapped, body.data as Record<string, unknown>);
    return { ok: true };
  }

  private mapEventType(type: string): OutboundEmailEventType | null {
    switch (type) {
      case 'email.delivered':
        return OutboundEmailEventType.DELIVERED;
      case 'email.bounced':
        return OutboundEmailEventType.BOUNCED;
      case 'email.complained':
        return OutboundEmailEventType.COMPLAINED;
      case 'email.opened':
        return OutboundEmailEventType.OPENED;
      default:
        return null;
    }
  }
}
