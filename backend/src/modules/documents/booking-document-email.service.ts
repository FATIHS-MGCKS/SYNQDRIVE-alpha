import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  CustomerTimelineEventType,
  OutboundEmailSourceType,
  OutboundEmailStatus,
  type GeneratedDocument,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { CustomerTimelineService } from '@modules/customers/customer-timeline.service';
import { OutboundEmailService } from '@modules/outbound-email/services/outbound-email.service';
import { OrgEmailSettingsService } from '@modules/outbound-email/services/org-email-settings.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  appendSignature,
  buildDefaultBodyText,
  buildDefaultSubject,
  formatBookingNumber,
  formatBookingPeriod,
} from './booking-document-email-content.util';
import { DOCUMENT_STATUS, DOCUMENT_TYPE } from './documents.constants';
import type { SendBookingDocumentsEmailDto } from './dto/send-booking-documents-email.dto';
import { GeneratedDocumentsService } from './generated-documents.service';
import { isValidEmail } from '@modules/outbound-email/utils/email-domain.util';

export interface SendBookingDocumentsEmailResult {
  outboundEmailId: string;
  status: OutboundEmailStatus;
  to: string;
  fromEmail: string;
  fromName: string | null;
  replyToEmail: string;
  documents: Array<{
    id: string;
    documentType: string;
    fileName: string;
    status: string;
  }>;
  providerMessageId?: string | null;
  errorMessage?: string | null;
}

@Injectable()
export class BookingDocumentEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generatedDocs: GeneratedDocumentsService,
    private readonly outboundEmail: OutboundEmailService,
    private readonly emailSettings: OrgEmailSettingsService,
    private readonly timeline: CustomerTimelineService,
    private readonly audit: AuditService,
  ) {}

  async sendBookingDocumentsEmail(
    orgId: string,
    bookingId: string,
    dto: SendBookingDocumentsEmailDto,
    sentByUserId: string,
    auditCtx?: {
      ipAddress?: string;
      userAgent?: string;
      route?: string;
    },
  ): Promise<SendBookingDocumentsEmailResult> {
    if (!dto.documentIds?.length) {
      throw new BadRequestException('Mindestens ein Dokument muss ausgewählt werden.');
    }

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      include: {
        customer: true,
        vehicle: { select: { licensePlate: true, model: true, make: true } },
        organization: { select: { companyName: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const documents = await this.validateDocuments(orgId, bookingId, dto.documentIds);

    const recipient = dto.to?.trim() || booking.customer.email?.trim() || '';
    if (!recipient || !isValidEmail(recipient)) {
      throw new BadRequestException(
        'Für diesen Kunden ist keine gültige E-Mail-Adresse hinterlegt. Bitte geben Sie eine Empfänger-Adresse an.',
      );
    }

    const attachments = await Promise.all(
      documents.map(async (doc) => {
        const loaded = await this.generatedDocs.getAttachmentBuffer(orgId, doc.id);
        return {
          fileName: loaded.fileName,
          mimeType: loaded.mimeType,
          content: loaded.buffer,
          sizeBytes: loaded.sizeBytes ?? loaded.buffer.length,
          generatedDocumentId: doc.id,
          documentType: doc.documentType,
        };
      }),
    );

    const bookingNumber = formatBookingNumber(booking.id);
    const customerName = `${booking.customer.firstName} ${booking.customer.lastName}`.trim();
    const vehicleLabel =
      booking.vehicle.licensePlate?.trim() ||
      [booking.vehicle.make, booking.vehicle.model].filter(Boolean).join(' ') ||
      'Fahrzeug';
    const periodLabel = formatBookingPeriod(booking.startDate, booking.endDate);
    const organizationName = booking.organization.companyName;

    const documentTypes = documents.map((d) => d.documentType);
    const subject =
      dto.subject?.trim() ||
      buildDefaultSubject(bookingNumber, documentTypes);

    let bodyText = buildDefaultBodyText(
      {
        bookingNumber,
        customerName,
        vehicleLabel,
        periodLabel,
        organizationName,
      },
      documentTypes,
      dto.message,
    );
    let bodyHtml: string | undefined;

    if (dto.includeSignature) {
      const settings = await this.emailSettings.getOrCreate(orgId);
      const signed = appendSignature(
        bodyText,
        settings.signatureText,
        settings.signatureHtml,
      );
      bodyText = signed.bodyText;
      bodyHtml = signed.bodyHtml;
    }

    const sourceType = this.resolveSourceType(documentTypes);

    try {
      const sent = await this.outboundEmail.sendExplicit({
        organizationId: orgId,
        sentByUserId,
        to: recipient,
        cc: dto.cc,
        bcc: dto.bcc,
        subject,
        bodyText,
        bodyHtml,
        sourceType,
        bookingId,
        customerId: booking.customerId,
        attachments,
      });

      await this.prisma.generatedDocument.updateMany({
        where: { id: { in: documents.map((d) => d.id) } },
        data: { status: DOCUMENT_STATUS.SENT, sentAt: new Date() },
      });

      void this.audit.record({
        actorUserId: sentByUserId,
        actorOrganizationId: orgId,
        action: ActivityAction.UPDATE,
        entity: ActivityEntity.BOOKING,
        entityId: bookingId,
        description: 'Booking documents sent via email',
        route: auditCtx?.route,
        ipAddress: auditCtx?.ipAddress,
        userAgent: auditCtx?.userAgent,
        metaJson: {
          eventType: 'DOCUMENT_EMAIL_SENT',
          outboundEmailId: sent.id,
          documentIds: documents.map((d) => d.id),
          to: recipient,
        },
      });

      void this.timeline.addEvent(
        orgId,
        booking.customerId,
        CustomerTimelineEventType.NOTE_ADDED,
        `Dokumente per E-Mail gesendet (${bookingNumber})`,
        {
          outboundEmailId: sent.id,
          bookingId,
          documentIds: documents.map((d) => d.id),
          to: recipient,
        },
        sentByUserId,
        subject,
      );

      return {
        outboundEmailId: sent.id,
        status: sent.status,
        to: sent.to,
        fromEmail: sent.fromEmail,
        fromName: sent.fromName,
        replyToEmail: sent.replyToEmail,
        documents: documents.map((d) => ({
          id: d.id,
          documentType: d.documentType,
          fileName: d.fileName,
          status: DOCUMENT_STATUS.SENT,
        })),
        providerMessageId: sent.providerMessageId,
        errorMessage: sent.errorMessage,
      };
    } catch (err: unknown) {
      const message =
        err instanceof BadRequestException
          ? (err.getResponse() as string | { message?: string | string[] })
          : 'E-Mail-Versand fehlgeschlagen';

      const errorMessage =
        typeof message === 'string'
          ? message
          : Array.isArray(message.message)
            ? message.message.join(', ')
            : message.message ?? 'E-Mail-Versand fehlgeschlagen';

      void this.audit.record({
        actorUserId: sentByUserId,
        actorOrganizationId: orgId,
        action: ActivityAction.UPDATE,
        entity: ActivityEntity.BOOKING,
        entityId: bookingId,
        description: 'Booking document email failed',
        level: 'WARN',
        route: auditCtx?.route,
        ipAddress: auditCtx?.ipAddress,
        userAgent: auditCtx?.userAgent,
        metaJson: {
          eventType: 'DOCUMENT_EMAIL_FAILED',
          documentIds: documents.map((d) => d.id),
          to: recipient,
          errorMessage,
        },
      });

      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(errorMessage);
    }
  }

  private async validateDocuments(
    orgId: string,
    bookingId: string,
    documentIds: string[],
  ): Promise<GeneratedDocument[]> {
    const uniqueIds = [...new Set(documentIds)];
    const docs = await Promise.all(
      uniqueIds.map((id) => this.generatedDocs.getById(orgId, id)),
    );

    for (const doc of docs) {
      if (doc.bookingId !== bookingId) {
        throw new BadRequestException(
          `Dokument ${doc.fileName} gehört nicht zu dieser Buchung.`,
        );
      }
      if (doc.status === DOCUMENT_STATUS.VOID) {
        throw new BadRequestException(
          `Dokument ${doc.fileName} ist ungültig (VOID) und kann nicht versendet werden.`,
        );
      }
      if (doc.status === DOCUMENT_STATUS.FAILED) {
        throw new BadRequestException(
          `Dokument ${doc.fileName} ist fehlgeschlagen und kann nicht versendet werden.`,
        );
      }
    }

    return docs;
  }

  private resolveSourceType(documentTypes: string[]): OutboundEmailSourceType {
    const unique = [...new Set(documentTypes)];
    const invoiceTypes = [DOCUMENT_TYPE.BOOKING_INVOICE, DOCUMENT_TYPE.FINAL_INVOICE];
    const handoverTypes = [DOCUMENT_TYPE.HANDOVER_PICKUP, DOCUMENT_TYPE.HANDOVER_RETURN];

    if (unique.every((t) => (invoiceTypes as string[]).includes(t))) {
      return OutboundEmailSourceType.INVOICE;
    }
    if (unique.every((t) => (handoverTypes as string[]).includes(t))) {
      return OutboundEmailSourceType.HANDOVER;
    }
    return OutboundEmailSourceType.BOOKING_DOCUMENTS;
  }
}
