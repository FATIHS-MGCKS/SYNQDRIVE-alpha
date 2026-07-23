import { Injectable } from '@nestjs/common';
import {
  OutboundEmailEventType,
  OutboundEmailSourceType,
  OutboundEmailStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { OutboundEmailPolicyService } from './outbound-email-policy.service';
import { OutboundEmailService } from './outbound-email.service';
import { EmailProviderRegistry } from './providers/email-provider.registry';

export type BookingInternalEmailResult = {
  sent: boolean;
  reason?: string;
  outboundEmailId?: string;
  recipientEmail?: string;
  deduplicated?: boolean;
};

@Injectable()
export class BookingInternalNotificationEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: OutboundEmailPolicyService,
    private readonly outboundEmail: OutboundEmailService,
    private readonly providers: EmailProviderRegistry,
  ) {}

  async maybeSendBookingInternalNotification(params: {
    organizationId: string;
    bookingId: string;
    eventType: string;
    idempotencyKey: string;
    actorUserId?: string | null;
  }): Promise<BookingInternalEmailResult> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: params.bookingId, organizationId: params.organizationId },
      include: {
        customer: { select: { firstName: true, lastName: true, company: true } },
        vehicle: { select: { licensePlate: true, make: true, model: true } },
      },
    });
    if (!booking) {
      return { sent: false, reason: 'BOOKING_NOT_FOUND' };
    }

    const settings = await this.prisma.orgEmailSettings.findUnique({
      where: { organizationId: params.organizationId },
    });
    const recipient = settings?.replyToEmail?.trim();
    if (!recipient || !this.policy.isValidEmail(recipient)) {
      return { sent: false, reason: 'NO_INTERNAL_RECIPIENT' };
    }

    const existing = await this.prisma.outboundEmail.findFirst({
      where: {
        organizationId: params.organizationId,
        sendIdempotencyKey: params.idempotencyKey,
      },
      select: { id: true, status: true },
    });
    if (existing) {
      return {
        sent: true,
        deduplicated: true,
        outboundEmailId: existing.id,
        recipientEmail: recipient,
      };
    }

    const bookingRef = `BK-${booking.id.slice(-6).toUpperCase()}`;
    const customerLabel =
      [booking.customer?.firstName, booking.customer?.lastName].filter(Boolean).join(' ').trim() ||
      booking.customer?.company?.trim() ||
      'Kunde';
    const vehicleLabel = [booking.vehicle?.make, booking.vehicle?.model, booking.vehicle?.licensePlate]
      .filter(Boolean)
      .join(' ');

    const identity = await this.policy.resolveIdentity(params.organizationId);
    const subject = `Neue Buchung ${bookingRef} (${params.eventType})`;
    const bodyHtml = `<p>Interne Benachrichtigung: Buchung <strong>${bookingRef}</strong> (${params.eventType}).</p>
<p>Kunde: ${customerLabel}<br/>Fahrzeug: ${vehicleLabel}<br/>Zeitraum: ${booking.startDate.toLocaleDateString('de-DE')} – ${booking.endDate.toLocaleDateString('de-DE')}</p>`;

    const outbound = await this.prisma.outboundEmail.create({
      data: {
        organizationId: params.organizationId,
        bookingId: booking.id,
        customerId: booking.customerId,
        sourceType: OutboundEmailSourceType.BOOKING_DOCUMENTS,
        status: OutboundEmailStatus.QUEUED,
        fromEmail: identity.fromEmail,
        fromName: identity.fromName,
        replyToEmail: identity.replyToEmail,
        toEmail: recipient,
        subject,
        bodyHtml,
        bodyText: this.stripHtml(bodyHtml),
        sentByUserId: params.actorUserId ?? null,
        sendIdempotencyKey: params.idempotencyKey,
        events: { create: { eventType: OutboundEmailEventType.QUEUED } },
      },
    });

    await this.outboundEmail.recordEvent(outbound.id, OutboundEmailEventType.SENDING);
    const provider = this.providers.resolve();
    const result = await provider.sendEmail({
      fromEmail: identity.fromEmail,
      fromName: identity.fromName,
      replyToEmail: identity.replyToEmail,
      toEmail: recipient,
      subject,
      bodyHtml,
      bodyText: this.stripHtml(bodyHtml),
      attachments: [],
      idempotencyKey: outbound.id,
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
          finalStatus === OutboundEmailStatus.SENT ||
          finalStatus === OutboundEmailStatus.SENT_SIMULATED
            ? new Date()
            : null,
      },
    });

    if (finalStatus === OutboundEmailStatus.FAILED) {
      return {
        sent: false,
        reason: result.errorMessage ?? 'SEND_FAILED',
        outboundEmailId: outbound.id,
        recipientEmail: recipient,
      };
    }

    await this.outboundEmail.recordEvent(
      outbound.id,
      finalStatus === OutboundEmailStatus.SENT
        ? OutboundEmailEventType.DELIVERED
        : OutboundEmailEventType.ACCEPTED,
    );

    return {
      sent: true,
      outboundEmailId: outbound.id,
      recipientEmail: recipient,
    };
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
