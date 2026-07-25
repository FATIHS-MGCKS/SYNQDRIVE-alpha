import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboundSmsEventType, OutboundSmsStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  parseTwilioFormBody,
  validateTwilioWebhookSignature,
} from '@modules/twilio/twilio-signature.util';
import { SmsConsentService } from './sms-consent.service';

const TERMINAL_STATUSES = new Set(['delivered', 'failed', 'undelivered']);

@Injectable()
export class SmsWebhookService {
  private readonly logger = new Logger(SmsWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly consent: SmsConsentService,
  ) {}

  async handleMessageStatus(params: {
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
    requestUrl: string;
  }): Promise<void> {
    const form = parseTwilioFormBody(params.body);
    this.assertSignatureValid(params.requestUrl, form, params.headers);

    const messageSid = form.MessageSid ?? '';
    const smsStatus = (form.MessageStatus ?? form.SmsStatus ?? '').toLowerCase();
    if (!messageSid || !smsStatus) return;

    const externalEventId = `sms:${messageSid}:${smsStatus}:${form.Timestamp ?? Date.now()}`;
    const existing = await this.prisma.twilioWebhookEvent.findUnique({
      where: { externalEventId },
    });
    if (existing?.processedAt) return;

    const outbound = await this.prisma.outboundSms.findFirst({
      where: { providerMessageSid: messageSid },
    });

    let webhookEvent = existing;
    if (!webhookEvent) {
      try {
        webhookEvent = await this.prisma.twilioWebhookEvent.create({
          data: {
            organizationId: outbound?.organizationId ?? null,
            messageSid,
            externalEventId,
            eventType: 'sms.status',
            payload: form as Prisma.InputJsonValue,
            headers: params.headers as Prisma.InputJsonValue,
            signatureValid: true,
          },
        });
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
        throw err;
      }
    }

    try {
      if (outbound) {
        await this.applyDeliveryStatus(outbound.id, smsStatus, form.ErrorCode, form.ErrorMessage);
      }
      await this.prisma.twilioWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processedAt: new Date(), processingError: null },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      await this.prisma.twilioWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processingError: message },
      });
      this.logger.error(`SMS status webhook error: ${message}`);
    }
  }

  async handleInboundSms(params: {
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
    requestUrl: string;
  }): Promise<void> {
    const form = parseTwilioFormBody(params.body);
    this.assertSignatureValid(params.requestUrl, form, params.headers);

    const from = form.From ?? '';
    const body = form.Body ?? '';
    const messageSid = form.MessageSid ?? '';
    if (!from || !messageSid) return;

    const externalEventId = `sms:inbound:${messageSid}`;
    const existing = await this.prisma.twilioWebhookEvent.findUnique({
      where: { externalEventId },
    });
    if (existing?.processedAt) return;

    const orgId = await this.resolveOrgByAccountSid(form.AccountSid ?? '');
    if (!existing) {
      try {
        await this.prisma.twilioWebhookEvent.create({
          data: {
            organizationId: orgId,
            messageSid,
            externalEventId,
            eventType: 'sms.inbound',
            payload: form as Prisma.InputJsonValue,
            headers: params.headers as Prisma.InputJsonValue,
            signatureValid: true,
            processedAt: new Date(),
          },
        });
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
        throw err;
      }
    }

    if (orgId && body.trim()) {
      await this.consent.processInboundConsentKeywords(orgId, from, body);
    }
  }

  private async applyDeliveryStatus(
    outboundSmsId: string,
    smsStatus: string,
    errorCode?: string,
    errorMessage?: string,
  ) {
    const mapped = this.mapStatus(smsStatus);
    if (!mapped) return;

    const webhookKey = `status:${smsStatus}`;
    const existingEvent = await this.prisma.outboundSmsEvent.findFirst({
      where: { outboundSmsId, webhookIdempotencyKey: webhookKey },
    });
    if (existingEvent) return;

    const data: Prisma.OutboundSmsUpdateInput = {
      status: mapped.status,
      errorCode: errorCode ?? undefined,
      errorMessage: errorMessage ?? undefined,
    };
    if (mapped.status === OutboundSmsStatus.DELIVERED) {
      data.deliveredAt = new Date();
    }

    await this.prisma.outboundSms.update({ where: { id: outboundSmsId }, data });
    await this.prisma.outboundSmsEvent.create({
      data: {
        outboundSmsId,
        eventType: mapped.eventType,
        webhookIdempotencyKey: webhookKey,
        payload: { smsStatus, errorCode, errorMessage },
      },
    });
  }

  private mapStatus(
    smsStatus: string,
  ): { status: OutboundSmsStatus; eventType: OutboundSmsEventType } | null {
    switch (smsStatus) {
      case 'queued':
      case 'accepted':
      case 'sending':
        return { status: OutboundSmsStatus.SENDING, eventType: OutboundSmsEventType.SENDING };
      case 'sent':
        return { status: OutboundSmsStatus.SENT, eventType: OutboundSmsEventType.SENT };
      case 'delivered':
        return { status: OutboundSmsStatus.DELIVERED, eventType: OutboundSmsEventType.DELIVERED };
      case 'undelivered':
        return { status: OutboundSmsStatus.UNDELIVERED, eventType: OutboundSmsEventType.UNDELIVERED };
      case 'failed':
        return { status: OutboundSmsStatus.FAILED, eventType: OutboundSmsEventType.FAILED };
      default:
        return TERMINAL_STATUSES.has(smsStatus) ? null : null;
    }
  }

  private async resolveOrgByAccountSid(accountSid: string): Promise<string | null> {
    if (!accountSid.trim()) return null;
    const suffix = accountSid.slice(-6);
    const account = await this.prisma.voiceProviderAccount.findFirst({
      where: {
        provider: 'TWILIO',
        accountType: 'SUBACCOUNT',
        maskedExternalRef: { endsWith: suffix },
        archivedAt: null,
      },
      select: { organizationId: true },
    });
    return account?.organizationId ?? null;
  }

  private assertSignatureValid(
    requestUrl: string,
    form: Record<string, string>,
    headers: Record<string, string | string[] | undefined>,
  ): void {
    const authToken = this.config.get<string>('twilio.authToken', '');
    if (!authToken.trim()) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Twilio webhook signing is not configured');
      }
      return;
    }

    const signatureHeader = headers['x-twilio-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    const valid = validateTwilioWebhookSignature({
      authToken,
      signature,
      url: requestUrl,
      body: form,
    });
    if (!valid && process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Invalid Twilio webhook signature');
    }
  }
}
