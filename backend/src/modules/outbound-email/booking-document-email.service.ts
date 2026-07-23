import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActivityAction,
  ActivityEntity,
  OutboundEmailEventType,
  OutboundEmailSourceType,
  OutboundEmailStatus,
} from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { DOCUMENT_STATUS, DOCUMENT_ORIGIN, DOCUMENT_TITLE_DE, isEmailSendableDocumentStatus } from '@modules/documents/documents.constants';
import {
  DOCUMENTS_STORAGE,
  DocumentStoragePort,
} from '@modules/documents/storage/document-storage.interface';
import { OutboundEmailPolicyService } from './outbound-email-policy.service';
import { OutboundEmailService } from './outbound-email.service';
import { EmailProviderRegistry } from './providers/email-provider.registry';

export interface SendBookingDocumentsEmailInput {
  toEmail: string;
  ccEmails?: string[];
  bccEmails?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  documentIds: string[];
  /** Durable send deduplication key (org-scoped unique). */
  sendIdempotencyKey?: string | null;
  /** When true, legal attachments use only frozen GeneratedDocument storage keys. */
  useFrozenAttachmentsOnly?: boolean;
}

@Injectable()
export class BookingDocumentEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly policy: OutboundEmailPolicyService,
    private readonly outboundEmail: OutboundEmailService,
    private readonly providers: EmailProviderRegistry,
    private readonly generatedDocuments: GeneratedDocumentsService,
    @Inject(DOCUMENTS_STORAGE) private readonly documentStorage: DocumentStoragePort,
    private readonly activityLog: ActivityLogService,
  ) {}

  async sendBookingDocuments(
    orgId: string,
    bookingId: string,
    userId: string | null,
    input: SendBookingDocumentsEmailInput,
  ) {
    if (!this.policy.isValidEmail(input.toEmail)) {
      throw new BadRequestException('Invalid recipient email');
    }
    this.policy.validateRecipientEmails(input.ccEmails, 'CC');
    this.policy.validateRecipientEmails(input.bccEmails, 'BCC');

    await this.assertRateLimit(orgId);

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      include: { customer: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const documentIds = [...new Set(input.documentIds)];
    if (documentIds.length === 0) {
      throw new BadRequestException('At least one document must be selected');
    }

    const documents = await this.prisma.generatedDocument.findMany({
      where: {
        id: { in: documentIds },
        organizationId: orgId,
        bookingId,
      },
    });

    if (documents.length !== documentIds.length) {
      throw new ForbiddenException('One or more documents are not part of this booking');
    }

    const blocked = documents.filter((d) => !isEmailSendableDocumentStatus(d.status));
    if (blocked.length > 0) {
      const types = [...new Set(blocked.map((d) => d.status))].join(', ');
      throw new BadRequestException(
        `Documents cannot be sent in status: ${types}. Only generated or previously sent PDFs are allowed.`,
      );
    }

    const identity = await this.policy.resolveIdentity(orgId);
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { emailSignature: true, orgEmailSettings: true },
    });

    const bodyHtml = this.composeBodyHtml(
      input.bodyHtml,
      org?.orgEmailSettings?.signatureHtml,
      org?.emailSignature,
    );
    const bodyText = input.bodyText?.trim() || this.stripHtml(bodyHtml);

    const attachments = [];
    let totalBytes = 0;
    const maxBytes = this.config.get<number>('email.maxAttachmentsBytes', 20 * 1024 * 1024);

    for (const doc of documents) {
      await this.generatedDocuments.getById(orgId, doc.id);
      const buffer = await this.loadAttachmentBuffer(orgId, doc, {
        useFrozenAttachmentsOnly: input.useFrozenAttachmentsOnly === true,
      });
      totalBytes += buffer.length;
      if (totalBytes > maxBytes) {
        throw new BadRequestException('Total attachment size exceeds the allowed limit');
      }
      attachments.push({
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        content: buffer,
        generatedDocumentId: doc.id,
        documentType: doc.documentType,
        sizeBytes: buffer.length,
      });
    }

    const outbound = await this.prisma.outboundEmail.create({
      data: {
        organizationId: orgId,
        bookingId,
        customerId: booking.customerId,
        sourceType: OutboundEmailSourceType.BOOKING_DOCUMENTS,
        status: OutboundEmailStatus.QUEUED,
        fromEmail: identity.fromEmail,
        fromName: identity.fromName,
        replyToEmail: identity.replyToEmail,
        toEmail: input.toEmail.trim(),
        ccEmails: (input.ccEmails ?? []).map((e) => e.trim()).filter(Boolean),
        bccEmails: (input.bccEmails ?? []).map((e) => e.trim()).filter(Boolean),
        subject: input.subject.trim(),
        bodyText,
        bodyHtml,
        sentByUserId: userId,
        sendIdempotencyKey: input.sendIdempotencyKey?.trim() || null,
        attachments: {
          create: attachments.map((a) => ({
            generatedDocumentId: a.generatedDocumentId,
            fileName: a.fileName,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            documentType: a.documentType,
          })),
        },
        events: {
          create: { eventType: OutboundEmailEventType.QUEUED },
        },
      },
      include: { attachments: true, events: true },
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
      toEmail: outbound.toEmail,
      ccEmails: outbound.ccEmails,
      bccEmails: outbound.bccEmails,
      subject: outbound.subject,
      bodyText,
      bodyHtml,
      attachments: attachments.map((a) => ({
        fileName: a.fileName,
        mimeType: a.mimeType,
        content: a.content,
      })),
      idempotencyKey: outbound.id,
    });

    const finalStatus =
      result.status === 'SENT'
        ? OutboundEmailStatus.SENT
        : result.status === 'SENT_SIMULATED'
          ? OutboundEmailStatus.SENT_SIMULATED
          : OutboundEmailStatus.FAILED;

    const updated = await this.prisma.outboundEmail.update({
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
      include: { attachments: true, events: { orderBy: { occurredAt: 'asc' } } },
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

    if (
      finalStatus === OutboundEmailStatus.SENT ||
      finalStatus === OutboundEmailStatus.SENT_SIMULATED
    ) {
      await this.prisma.generatedDocument.updateMany({
        where: { id: { in: documentIds }, organizationId: orgId },
        data: { status: DOCUMENT_STATUS.SENT, sentAt: new Date() },
      });
    }

    await this.activityLog.log({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: ActivityAction.SEND,
      entity: ActivityEntity.OUTBOUND_EMAIL,
      entityId: outbound.id,
      description: `Sent booking documents email to ${input.toEmail} (${documents.length} attachment(s))`,
      metaJson: {
        bookingId,
        documentIds,
        status: finalStatus,
        provider: result.provider,
      },
    });

    return this.outboundEmail.toDto(updated);
  }

  toOutboundDto(email: Parameters<OutboundEmailService['toDto']>[0]) {
    return this.outboundEmail.toDto(email);
  }

  /**
   * When enabled in org email settings, sends all email-ready booking documents
   * to the customer after confirmation. Best-effort — never throws to callers.
   */
  async maybeAutoSendBookingDocuments(
    orgId: string,
    bookingId: string,
    userId: string | null,
  ) {
    try {
      const settings = await this.prisma.orgEmailSettings.findUnique({
        where: { organizationId: orgId },
      });
      if (!settings?.autoSendBookingDocumentsOnConfirm) {
        return { sent: false as const, reason: 'DISABLED' as const };
      }

      const recentSend = await this.prisma.outboundEmail.count({
        where: {
          organizationId: orgId,
          bookingId,
          sourceType: OutboundEmailSourceType.BOOKING_DOCUMENTS,
          status: {
            in: [
              OutboundEmailStatus.QUEUED,
              OutboundEmailStatus.SENDING,
              OutboundEmailStatus.SENT,
              OutboundEmailStatus.SENT_SIMULATED,
            ],
          },
          createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        },
      });
      if (recentSend > 0) {
        return { sent: false as const, reason: 'ALREADY_SENT_RECENTLY' as const };
      }

      const booking = await this.prisma.booking.findFirst({
        where: { id: bookingId, organizationId: orgId },
        include: { customer: true },
      });
      if (!booking) return { sent: false as const, reason: 'BOOKING_NOT_FOUND' as const };

      const toEmail = booking.customer?.email?.trim();
      if (!toEmail) return { sent: false as const, reason: 'NO_CUSTOMER_EMAIL' as const };

      const docs = await this.generatedDocuments.listForBooking(orgId, bookingId);
      const sendable = docs.filter((d) => isEmailSendableDocumentStatus(d.status));
      if (sendable.length === 0) {
        return { sent: false as const, reason: 'NO_SENDABLE_DOCUMENTS' as const };
      }

      const bookingNumber = `BK-${booking.id.slice(-6).toUpperCase()}`;
      const period = this.formatBookingPeriod(booking.startDate, booking.endDate);
      const customerName = this.formatCustomerName(booking.customer);
      const docLabels = sendable.map((d) => DOCUMENT_TITLE_DE[d.documentType as keyof typeof DOCUMENT_TITLE_DE] ?? d.title);
      const subject = `Ihre Buchung ${bookingNumber} am ${period}`;
      const bodyHtml = this.buildDefaultBookingDocumentsBody(customerName, docLabels);

      const result = await this.sendBookingDocuments(orgId, bookingId, userId, {
        toEmail,
        subject,
        bodyHtml,
        documentIds: sendable.map((d) => d.id),
      });

      return { sent: true as const, email: result };
    } catch (err) {
      return {
        sent: false as const,
        reason: 'FAILED' as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async sendTestEmail(orgId: string, userId: string | null, toEmail: string) {
    if (!this.policy.isValidEmail(toEmail)) {
      throw new BadRequestException('Invalid recipient email');
    }

    await this.assertRateLimit(orgId);
    const identity = await this.policy.resolveIdentity(orgId);
    const provider = this.providers.resolve();

    const outbound = await this.prisma.outboundEmail.create({
      data: {
        organizationId: orgId,
        sourceType: OutboundEmailSourceType.TEST,
        status: OutboundEmailStatus.SENDING,
        fromEmail: identity.fromEmail,
        fromName: identity.fromName,
        replyToEmail: identity.replyToEmail,
        toEmail: toEmail.trim(),
        subject: 'SynqDrive E-Mail Test',
        bodyText: 'Dies ist eine Test-E-Mail von SynqDrive.',
        bodyHtml: '<p>Dies ist eine <strong>Test-E-Mail</strong> von SynqDrive.</p>',
        sentByUserId: userId,
        events: { create: { eventType: OutboundEmailEventType.SENDING } },
      },
      include: { attachments: true, events: { orderBy: { occurredAt: 'asc' } } },
    });

    const result = await provider.sendEmail({
      fromEmail: identity.fromEmail,
      fromName: identity.fromName,
      replyToEmail: identity.replyToEmail,
      toEmail,
      subject: outbound.subject,
      bodyText: outbound.bodyText ?? undefined,
      bodyHtml: outbound.bodyHtml ?? undefined,
      idempotencyKey: outbound.id,
    });

    const finalStatus =
      result.status === 'SENT'
        ? OutboundEmailStatus.SENT
        : result.status === 'SENT_SIMULATED'
          ? OutboundEmailStatus.SENT_SIMULATED
          : OutboundEmailStatus.FAILED;

    const updated = await this.prisma.outboundEmail.update({
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
      include: { attachments: true, events: { orderBy: { occurredAt: 'asc' } } },
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

    await this.activityLog.log({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: ActivityAction.SEND,
      entity: ActivityEntity.OUTBOUND_EMAIL,
      entityId: outbound.id,
      description: `Sent test email to ${toEmail}`,
      metaJson: { sourceType: 'TEST', status: finalStatus, provider: result.provider },
    });

    return this.outboundEmail.toDto(updated);
  }

  private async assertRateLimit(orgId: string) {
    const max = this.config.get<number>('email.maxSendsPerHourPerOrg', 60);
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const count = await this.prisma.outboundEmail.count({
      where: { organizationId: orgId, createdAt: { gte: since } },
    });
    if (count >= max) {
      throw new HttpException('Hourly email send limit reached for this organization', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private composeBodyHtml(
    bodyHtml: string | undefined,
    signatureHtml: string | null | undefined,
    legacyOrgSignature: string | null | undefined,
  ) {
    const main = bodyHtml?.trim() || '<p>Im Anhang finden Sie die angeforderten Dokumente.</p>';
    const signature = signatureHtml?.trim() || legacyOrgSignature?.trim();
    if (!signature) return main;
    const sigBlock = signature.includes('<') ? signature : `<p>${signature.replace(/\n/g, '<br/>')}</p>`;
    return `${main}<br/><br/>${sigBlock}`;
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private async loadAttachmentBuffer(
    orgId: string,
    doc: { objectKey: string; legalDocumentId: string | null; origin: string; title: string },
    options: { useFrozenAttachmentsOnly?: boolean } = {},
  ): Promise<Buffer> {
    const keys = [doc.objectKey];
    if (
      !options.useFrozenAttachmentsOnly &&
      doc.origin === DOCUMENT_ORIGIN.STATIC_LEGAL &&
      doc.legalDocumentId
    ) {
      const legal = await this.prisma.organizationLegalDocument.findFirst({
        where: { id: doc.legalDocumentId, organizationId: orgId },
        select: { objectKey: true },
      });
      if (legal?.objectKey && !keys.includes(legal.objectKey)) {
        keys.unshift(legal.objectKey);
      }
    }
    let lastErr: Error | null = null;
    for (const key of keys) {
      try {
        return await this.documentStorage.getObject(key);
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw new BadRequestException(
      `Datei für „${doc.title}“ nicht gefunden. Bitte Buchungsdokumente neu generieren oder Rechtstexte in Administration prüfen.`,
      { cause: lastErr ?? undefined },
    );
  }

  private formatBookingPeriod(start: Date, end: Date): string {
    const fmt = (d: Date) =>
      d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
  }

  private formatCustomerName(customer: { firstName?: string | null; lastName?: string | null; company?: string | null } | null): string {
    if (!customer) return 'Damen und Herren';
    const person = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
    if (person) return person;
    if (customer.company?.trim()) return customer.company.trim();
    return 'Damen und Herren';
  }

  private buildDefaultBookingDocumentsBody(customerName: string, docLabels: string[]): string {
    const items = docLabels.map((label) => `<li>${label}</li>`).join('');
    return [
      `<p>Sehr geehrte/r ${customerName},</p>`,
      '<p>vielen Dank für Ihre Buchung.</p>',
      '<p>Im Anhang finden Sie folgende Dokumente sowie Ihre Rechnung:</p>',
      `<ul>${items}</ul>`,
      '<p>Mit freundlichen Grüßen</p>',
    ].join('');
  }
}
