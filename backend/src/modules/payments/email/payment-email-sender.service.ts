import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActivityAction,
  ActivityEntity,
  BookingPaymentRequestStatus,
  OutboundEmailEventType,
  OutboundEmailStatus,
  PaymentEmailType,
} from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import { OutboundEmailPolicyService } from '@modules/outbound-email/outbound-email-policy.service';
import { OutboundEmailService } from '@modules/outbound-email/outbound-email.service';
import { EmailProviderRegistry } from '@modules/outbound-email/providers/email-provider.registry';
import {
  composeBookingPaymentRequestEmail,
  composePaymentConfirmationEmail,
  formatGermanDateTime,
  formatMoneyCents,
  mapPaymentEmailTypeToSourceType,
  resolveBookingReference,
} from './payment-email-templates.util';

export interface SendPaymentEmailResult {
  success: boolean;
  outboundEmailId?: string;
  retryable: boolean;
  errorCode?: string;
  errorMessage?: string;
}

@Injectable()
export class PaymentEmailSenderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly policy: OutboundEmailPolicyService,
    private readonly outboundEmail: OutboundEmailService,
    private readonly providers: EmailProviderRegistry,
    private readonly activityLog: ActivityLogService,
  ) {}

  async sendFromOutbox(params: {
    organizationId: string;
    paymentRequestId: string;
    emailType: PaymentEmailType;
    sentByUserId?: string | null;
    outboxId: string;
  }): Promise<SendPaymentEmailResult> {
    const request = await this.prisma.bookingPaymentRequest.findFirst({
      where: {
        id: params.paymentRequestId,
        organizationId: params.organizationId,
      },
      include: {
        booking: { include: { customer: true } },
        organization: {
          select: { companyName: true, orgEmailSettings: true, emailSignature: true },
        },
      },
    });
    if (!request) {
      return {
        success: false,
        retryable: false,
        errorCode: 'NOT_FOUND',
        errorMessage: 'Payment request not found',
      };
    }

    const toEmail = request.recipientEmail?.trim();
    if (!toEmail || !this.policy.isValidEmail(toEmail)) {
      return {
        success: false,
        retryable: false,
        errorCode: 'INVALID_RECIPIENT',
        errorMessage: 'Invalid or missing recipient email',
      };
    }

    try {
      await this.assertRateLimit(params.organizationId);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        return {
          success: false,
          retryable: true,
          errorCode: 'RATE_LIMIT',
          errorMessage: error.message,
        };
      }
      throw error;
    }

    if (params.emailType === PaymentEmailType.BOOKING_PAYMENT_REQUEST) {
      if (!request.checkoutUrl?.trim()) {
        return {
          success: false,
          retryable: false,
          errorCode: 'NO_CHECKOUT_URL',
          errorMessage: 'Checkout URL missing — create checkout session first',
        };
      }
      if (
        request.status !== BookingPaymentRequestStatus.CHECKOUT_READY
        && request.status !== BookingPaymentRequestStatus.LINK_SENT
      ) {
        return {
          success: false,
          retryable: false,
          errorCode: 'INVALID_STATUS',
          errorMessage: `Cannot send payment link email in status ${request.status}`,
        };
      }
    }

    if (params.emailType === PaymentEmailType.PAYMENT_CONFIRMATION) {
      if (request.status !== BookingPaymentRequestStatus.PAID) {
        return {
          success: false,
          retryable: false,
          errorCode: 'NOT_PAID',
          errorMessage: 'Payment confirmation only allowed after PAID',
        };
      }
    }

    const customerName = [
      request.booking.customer.firstName,
      request.booking.customer.lastName,
    ]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Kunde';

    const bookingReference = resolveBookingReference(request.bookingId);
    const amountFormatted = formatMoneyCents(request.amountCents, request.currency);

    let subject: string;
    let bodyText: string;
    let bodyHtml: string;

    if (params.emailType === PaymentEmailType.BOOKING_PAYMENT_REQUEST) {
      const composed = composeBookingPaymentRequestEmail({
        organizationName: request.organization.companyName,
        customerName,
        bookingReference,
        amountFormatted,
        currency: request.currency.toUpperCase(),
        paymentDeadline: request.checkoutExpiresAt
          ? formatGermanDateTime(request.checkoutExpiresAt)
          : null,
        checkoutUrl: request.checkoutUrl!,
      });
      subject = composed.subject;
      bodyText = composed.bodyText;
      bodyHtml = this.composeBodyHtml(
        composed.bodyHtml,
        request.organization.orgEmailSettings?.signatureHtml,
        request.organization.emailSignature,
      );
    } else if (params.emailType === PaymentEmailType.PAYMENT_CONFIRMATION) {
      const composed = composePaymentConfirmationEmail({
        organizationName: request.organization.companyName,
        customerName,
        bookingReference,
        amountFormatted,
        currency: request.currency.toUpperCase(),
        paidAtFormatted: request.paidAt
          ? formatGermanDateTime(request.paidAt)
          : formatGermanDateTime(new Date()),
      });
      subject = composed.subject;
      bodyText = composed.bodyText;
      bodyHtml = this.composeBodyHtml(
        composed.bodyHtml,
        request.organization.orgEmailSettings?.signatureHtml,
        request.organization.emailSignature,
      );
    } else {
      return {
        success: false,
        retryable: false,
        errorCode: 'UNSUPPORTED_TYPE',
        errorMessage: `Email type ${params.emailType} not implemented`,
      };
    }

    const identity = await this.policy.resolveIdentity(params.organizationId);
    const sourceType = mapPaymentEmailTypeToSourceType(params.emailType);

    const outbound = await this.prisma.outboundEmail.create({
      data: {
        organizationId: params.organizationId,
        bookingId: request.bookingId,
        customerId: request.customerId,
        invoiceId: request.invoiceId,
        bookingPaymentRequestId: request.id,
        sourceType,
        status: OutboundEmailStatus.QUEUED,
        fromEmail: identity.fromEmail,
        fromName: identity.fromName,
        replyToEmail: identity.replyToEmail,
        toEmail,
        subject,
        bodyText,
        bodyHtml,
        sentByUserId: params.sentByUserId ?? null,
        events: { create: { eventType: OutboundEmailEventType.QUEUED } },
      },
    });

    await this.prisma.outboundEmail.update({
      where: { id: outbound.id },
      data: { status: OutboundEmailStatus.SENDING },
    });
    await this.outboundEmail.recordEvent(outbound.id, OutboundEmailEventType.SENDING);

    const provider = this.providers.resolve();
    const result = await provider.sendEmail({
      fromEmail: identity.fromEmail,
      fromName: identity.fromName,
      replyToEmail: identity.replyToEmail,
      toEmail,
      subject,
      bodyText,
      bodyHtml,
      idempotencyKey: params.outboxId,
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

    await this.outboundEmail.recordEvent(
      outbound.id,
      finalStatus === OutboundEmailStatus.FAILED
        ? OutboundEmailEventType.FAILED
        : OutboundEmailEventType.SENT,
      {
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      },
    );

    const success =
      finalStatus === OutboundEmailStatus.SENT
      || finalStatus === OutboundEmailStatus.SENT_SIMULATED;

    await this.activityLog.log({
      organizationId: params.organizationId,
      userId: params.sentByUserId ?? undefined,
      action: ActivityAction.SEND,
      entity: ActivityEntity.OUTBOUND_EMAIL,
      entityId: outbound.id,
      description: success
        ? `Payment email ${params.emailType} sent to ${toEmail}`
        : `Payment email ${params.emailType} failed for ${toEmail}`,
      metaJson: {
        paymentRequestId: request.id,
        emailType: params.emailType,
        status: finalStatus,
        outboxId: params.outboxId,
      },
    });

    if (!success) {
      const retryable =
        result.errorCode === 'RATE_LIMIT'
        || result.errorCode === 'PROVIDER_UNAVAILABLE'
        || (result.errorMessage?.includes('429') ?? false);
      return {
        success: false,
        outboundEmailId: outbound.id,
        retryable,
        errorCode: result.errorCode ?? 'SEND_FAILED',
        errorMessage: result.errorMessage ?? 'Email provider returned failure',
      };
    }

    return { success: true, outboundEmailId: outbound.id, retryable: false };
  }

  private async assertRateLimit(orgId: string) {
    const max = this.config.get<number>('email.maxSendsPerHourPerOrg', 60);
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const count = await this.prisma.outboundEmail.count({
      where: { organizationId: orgId, createdAt: { gte: since } },
    });
    if (count >= max) {
      throw new HttpException(
        'Hourly email send limit reached for this organization',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private composeBodyHtml(
    bodyHtml: string,
    signatureHtml: string | null | undefined,
    legacyOrgSignature: string | null | undefined,
  ) {
    const signature = signatureHtml?.trim() || legacyOrgSignature?.trim();
    if (!signature) return bodyHtml;
    const sigBlock = signature.includes('<') ? signature : `<p>${signature.replace(/\n/g, '<br/>')}</p>`;
    return `${bodyHtml}<br/><br/>${sigBlock}`;
  }
}
