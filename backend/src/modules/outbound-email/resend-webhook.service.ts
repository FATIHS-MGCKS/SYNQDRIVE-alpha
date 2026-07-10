import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboundEmailEventType } from '@prisma/client';
import { OutboundEmailService } from './outbound-email.service';

const SVIX_TOLERANCE_SECONDS = 5 * 60;

@Injectable()
export class ResendWebhookService {
  private readonly logger = new Logger(ResendWebhookService.name);

  constructor(
    private readonly outboundEmail: OutboundEmailService,
    private readonly config: ConfigService,
  ) {}

  async handle(
    rawBody: Buffer,
    body: { type?: string; data?: { email_id?: string; bounce?: unknown } },
    headers: Record<string, string | undefined>,
  ) {
    const secret = this.config.get<string>('email.webhookSecret', '');
    if (secret) {
      this.verifySvixSignature(rawBody, headers, secret);
    }

    const type = body.type || '';
    const emailId = body.data?.email_id;
    if (!emailId) return { ok: true };

    const mapped = this.mapEventType(type);
    if (!mapped) return { ok: true };

    await this.outboundEmail.applyWebhookEvent(emailId, mapped, body.data as Record<string, unknown>);
    return { ok: true };
  }

  private verifySvixSignature(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
    secret: string,
  ) {
    const svixId = headers['svix-id'];
    const svixTimestamp = headers['svix-timestamp'];
    const svixSignature = headers['svix-signature'];

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new UnauthorizedException('Missing Svix webhook headers');
    }

    const ts = parseInt(svixTimestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(ts) || Math.abs(now - ts) > SVIX_TOLERANCE_SECONDS) {
      throw new UnauthorizedException('Svix timestamp outside tolerance');
    }

    const signedContent = `${svixId}.${svixTimestamp}.${rawBody.toString('utf8')}`;
    const key = this.decodeSvixSecret(secret);
    const expected = createHmac('sha256', key).update(signedContent).digest('base64');

    const signatures = svixSignature.split(' ');
    const valid = signatures.some((part) => {
      const [version, sig] = part.split(',');
      if (version !== 'v1' || !sig) return false;
      try {
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        return a.length === b.length && timingSafeEqual(a, b);
      } catch {
        return false;
      }
    });

    if (!valid) {
      this.logger.warn('Resend webhook Svix signature mismatch');
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  private decodeSvixSecret(secret: string): Buffer {
    const trimmed = secret.trim();
    const raw = trimmed.startsWith('whsec_') ? trimmed.slice('whsec_'.length) : trimmed;
    return Buffer.from(raw, 'base64');
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
