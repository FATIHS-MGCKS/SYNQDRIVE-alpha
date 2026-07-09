import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OutboundEmailEventType,
  OutboundEmailStatus,
} from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import type { ResendEmailWebhookPayload } from './resend-api.types';

interface SvixHeaders {
  id?: string;
  timestamp?: string;
  signature?: string;
}

@Injectable()
export class ResendWebhookService {
  private readonly logger = new Logger(ResendWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  verifySignature(rawBody: Buffer, headers: SvixHeaders): void {
    const secret = this.config.get<string>('email.resendWebhookSecret', '');
    if (!secret?.trim()) {
      throw new BadRequestException('Resend webhook secret is not configured');
    }
    if (!headers.id || !headers.timestamp || !headers.signature) {
      throw new BadRequestException('Missing Svix signature headers');
    }

    const payload = rawBody.toString('utf8');
    const signedContent = `${headers.id}.${headers.timestamp}.${payload}`;
    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const expected = createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');

    const signatures = headers.signature.split(' ');
    const valid = signatures.some((entry) => {
      const [version, signature] = entry.split(',');
      if (version !== 'v1' || !signature) return false;
      try {
        return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
      } catch {
        return false;
      }
    });

    if (!valid) {
      throw new BadRequestException('Invalid Resend webhook signature');
    }
  }

  async ingest(rawBody: Buffer, headers: SvixHeaders) {
    this.verifySignature(rawBody, headers);
    const event = JSON.parse(rawBody.toString('utf8')) as ResendEmailWebhookPayload;
    const emailId = event.data?.email_id;
    if (!emailId) {
      return { received: true, ignored: true, reason: 'missing_email_id' };
    }

    const outbound = await this.prisma.outboundEmail.findFirst({
      where: { providerMessageId: emailId },
    });
    if (!outbound) {
      this.logger.warn(`Resend webhook for unknown providerMessageId=${emailId}`);
      return { received: true, ignored: true, reason: 'unknown_email' };
    }

    const mapped = this.mapEvent(event.type);
    if (!mapped) {
      return { received: true, ignored: true, type: event.type };
    }

    if (mapped.status) {
      await this.prisma.outboundEmail.update({
        where: { id: outbound.id },
        data: {
          status: mapped.status,
          errorMessage: mapped.errorMessage ?? outbound.errorMessage,
        },
      });
    }

    await this.prisma.outboundEmailEvent.create({
      data: {
        outboundEmailId: outbound.id,
        eventType: mapped.eventType,
        payload: {
          provider: 'resend',
          webhookType: event.type,
          providerMessageId: emailId,
          ...mapped.payload,
        } as object,
      },
    });

    return {
      received: true,
      outboundEmailId: outbound.id,
      eventType: mapped.eventType,
      webhookType: event.type,
    };
  }

  private mapEvent(type: string): {
    eventType: OutboundEmailEventType;
    status?: OutboundEmailStatus;
    errorMessage?: string;
    payload?: Record<string, unknown>;
  } | null {
    switch (type) {
      case 'email.delivered':
        return { eventType: OutboundEmailEventType.SENT, payload: { delivery: 'delivered' } };
      case 'email.bounced':
        return {
          eventType: OutboundEmailEventType.BOUNCED,
          status: OutboundEmailStatus.BOUNCED,
          payload: { delivery: 'bounced' },
        };
      case 'email.complained':
        return {
          eventType: OutboundEmailEventType.FAILED,
          status: OutboundEmailStatus.FAILED,
          errorMessage: 'Spam-Beschwerde (complaint)',
          payload: { delivery: 'complained' },
        };
      case 'email.failed':
        return {
          eventType: OutboundEmailEventType.FAILED,
          status: OutboundEmailStatus.FAILED,
          payload: { delivery: 'failed' },
        };
      case 'email.opened':
        return { eventType: OutboundEmailEventType.OPENED, payload: { engagement: 'opened' } };
      case 'email.clicked':
        return { eventType: OutboundEmailEventType.CLICKED, payload: { engagement: 'clicked' } };
      case 'email.sent':
        return { eventType: OutboundEmailEventType.SENT, payload: { delivery: 'sent' } };
      default:
        return null;
    }
  }
}
