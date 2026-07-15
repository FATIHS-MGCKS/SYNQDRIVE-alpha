import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  OutboundEmailEventType,
  OutboundEmailSourceType,
  OutboundEmailStatus,
} from '@prisma/client';
import billingEmailConfig from '@config/billing-email.config';
import { PrismaService } from '@shared/database/prisma.service';
import { PlatformEmailSettingsService } from '@modules/outbound-email/platform-email-settings.service';
import { OutboundEmailService } from '@modules/outbound-email/outbound-email.service';
import { EmailProviderRegistry } from '@modules/outbound-email/providers/email-provider.registry';
import { buildBillingEmailIdempotencyKey } from '../domain/billing-outbox';
import { BillingEmailContextService } from './billing-email-context.service';
import { composeBillingEmail } from './billing-email-templates.util';
import { fetchBillingPdfAttachment } from './billing-email.util';
import { BillingEmailRecipientService } from './billing-email-recipient.service';
import { sanitizeBillingEmailLogDetail } from './billing-email-delivery.util';

export interface BillingEmailSendResult {
  success: boolean;
  outboundEmailId?: string;
  retryable: boolean;
  skipped?: boolean;
  skipReason?: string;
  errorCode?: string;
  errorMessage?: string;
}

@Injectable()
export class BillingEmailSenderService {
  private readonly logger = new Logger(BillingEmailSenderService.name);

  constructor(
    @Inject(billingEmailConfig.KEY)
    private readonly config: ConfigType<typeof billingEmailConfig>,
    private readonly prisma: PrismaService,
    private readonly contextService: BillingEmailContextService,
    private readonly recipientService: BillingEmailRecipientService,
    private readonly platformEmail: PlatformEmailSettingsService,
    private readonly outboundEmail: OutboundEmailService,
    private readonly providers: EmailProviderRegistry,
  ) {}

  async sendFromOutboxDelivery(input: {
    deliveryId: string;
    eventType: string;
    organizationId: string | null;
    outboxIdempotencyKey: string;
    outboxEventId?: string;
    payload: Record<string, unknown>;
    manual?: boolean;
    excludeRecipientEmails?: string[];
  }): Promise<BillingEmailSendResult> {
    if (!this.config.enabled) {
      return {
        success: true,
        skipped: true,
        skipReason: 'disabled',
        retryable: false,
      };
    }

    const idempotencyKey = buildBillingEmailIdempotencyKey(input.outboxIdempotencyKey);
    const existing = await this.prisma.outboundEmail.findFirst({
      where: { billingOutboxIdempotencyKey: input.outboxIdempotencyKey },
      include: { events: true },
    });
    if (existing && !input.manual) {
      return {
        success: true,
        outboundEmailId: existing.id,
        skipped: true,
        skipReason: 'already_sent',
        retryable: false,
      };
    }

    const hydrated = await this.contextService.buildTemplateContext({
      eventType: input.eventType,
      organizationId: input.organizationId,
      payload: input.payload,
      excludeRecipientEmails: input.excludeRecipientEmails,
    });

    if (!hydrated.context || !hydrated.recipientEmail || !input.organizationId) {
      return {
        success: true,
        skipped: true,
        skipReason: hydrated.skipReason ?? 'not_sendable',
        retryable: false,
      };
    }

    const composed = composeBillingEmail(hydrated.context);
    const platform = await this.platformEmail.getResolvedDefaults();

    const attachments = [];
    if (composed.includePdfAttachment && hydrated.invoicePdfUrl) {
      const attachment = await fetchBillingPdfAttachment({
        url: hydrated.invoicePdfUrl,
        maxBytes: this.config.maxPdfBytes,
        timeoutMs: this.config.pdfFetchTimeoutMs,
        fileName: hydrated.context.invoiceNumber
          ? `Rechnung-${hydrated.context.invoiceNumber}.pdf`
          : 'Rechnung.pdf',
      });
      if (attachment) attachments.push(attachment);
    }

    const outbound = await this.prisma.outboundEmail.create({
      data: {
        organizationId: input.organizationId,
        sourceType: OutboundEmailSourceType.BILLING_EMAIL,
        status: OutboundEmailStatus.QUEUED,
        fromEmail: platform.defaultFromEmail,
        fromName: platform.defaultFromName,
        replyToEmail: platform.defaultReplyToEmail,
        toEmail: hydrated.recipientEmail,
        subject: composed.subject,
        bodyText: composed.bodyText,
        bodyHtml: composed.bodyHtml,
        billingInvoiceId: hydrated.billingInvoiceId ?? null,
        billingSubscriptionId: hydrated.billingSubscriptionId ?? null,
        billingOutboxDeliveryId: input.deliveryId,
        billingOutboxEventId: input.outboxEventId ?? null,
        billingOutboxIdempotencyKey: input.outboxIdempotencyKey,
        events: {
          create: {
            eventType: OutboundEmailEventType.QUEUED,
            payload: {
              billingOutboxDeliveryId: input.deliveryId,
              billingOutboxIdempotencyKey: input.outboxIdempotencyKey,
              billingEventType: input.eventType,
              recipientSource: hydrated.recipientSource ?? null,
            },
          },
        },
      },
    });

    await this.prisma.outboundEmail.update({
      where: { id: outbound.id },
      data: { status: OutboundEmailStatus.SENDING },
    });
    await this.outboundEmail.recordEvent(outbound.id, OutboundEmailEventType.SENDING);

    const provider = this.providers.resolve();
    const result = await provider.sendEmail({
      fromEmail: platform.defaultFromEmail,
      fromName: platform.defaultFromName,
      replyToEmail: platform.defaultReplyToEmail,
      toEmail: hydrated.recipientEmail,
      subject: composed.subject,
      bodyText: composed.bodyText,
      bodyHtml: composed.bodyHtml,
      attachments: attachments.length ? attachments : undefined,
      idempotencyKey,
    });

    const finalStatus =
      result.status === 'SENT'
        ? OutboundEmailStatus.SENT
        : result.status === 'SENT_SIMULATED'
          ? OutboundEmailStatus.SENT_SIMULATED
          : OutboundEmailStatus.FAILED;

    await this.prisma.outboundEmail.update({
      where: { id: outbound.id },
      data: {
        status: finalStatus,
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
        sentAt:
          finalStatus === OutboundEmailStatus.SENT
          || finalStatus === OutboundEmailStatus.SENT_SIMULATED
            ? new Date()
            : null,
      },
    });

    if (finalStatus === OutboundEmailStatus.SENT || finalStatus === OutboundEmailStatus.SENT_SIMULATED) {
      await this.outboundEmail.recordEvent(outbound.id, OutboundEmailEventType.SENT, {
        provider: result.provider,
        providerMessageId: result.providerMessageId,
      });
      await this.outboundEmail.recordEvent(outbound.id, OutboundEmailEventType.ACCEPTED, {
        provider: result.provider,
        providerMessageId: result.providerMessageId,
      });
    } else {
      await this.outboundEmail.recordEvent(outbound.id, OutboundEmailEventType.FAILED, {
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
    }

    const success =
      finalStatus === OutboundEmailStatus.SENT
      || finalStatus === OutboundEmailStatus.SENT_SIMULATED;

    if (!success) {
      this.logger.warn(
        `Billing email send failed for delivery ${input.deliveryId}: ${sanitizeBillingEmailLogDetail(result.errorMessage) ?? result.errorCode ?? 'unknown'}`,
      );
      const retryable =
        result.errorCode === 'NOT_CONFIGURED'
        || result.errorCode === '429'
        || result.errorCode === 'RATE_LIMIT'
        || result.errorCode === 'PROVIDER_UNAVAILABLE'
        || (result.errorMessage?.toLowerCase().includes('timeout') ?? false)
        || (result.errorMessage?.includes('429') ?? false);
      return {
        success: false,
        outboundEmailId: outbound.id,
        retryable,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      };
    }

    return {
      success: true,
      outboundEmailId: outbound.id,
      retryable: false,
    };
  }
}
