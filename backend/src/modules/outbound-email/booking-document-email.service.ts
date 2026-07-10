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
import { DOCUMENT_STATUS } from '@modules/documents/documents.constants';
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

    const voided = documents.filter((d) => d.status === DOCUMENT_STATUS.VOID);
    if (voided.length > 0) {
      throw new BadRequestException('Voided documents cannot be sent');
    }

    const identity = await this.policy.resolveIdentity(orgId);
    const settings = await this.prisma.orgEmailSettings.findUnique({
      where: { organizationId: orgId },
    });

    const bodyHtml = this.composeBodyHtml(input.bodyHtml, settings?.signatureHtml);
    const bodyText = input.bodyText?.trim() || this.stripHtml(bodyHtml);

    const attachments = [];
    let totalBytes = 0;
    const maxBytes = this.config.get<number>('email.maxAttachmentsBytes', 20 * 1024 * 1024);

    for (const doc of documents) {
      await this.generatedDocuments.getById(orgId, doc.id);
      const buffer = await this.documentStorage.getObject(doc.objectKey);
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

  private composeBodyHtml(bodyHtml: string | undefined, signatureHtml: string | null | undefined) {
    const main = bodyHtml?.trim() || '<p>Im Anhang finden Sie die angeforderten Dokumente.</p>';
    if (!signatureHtml?.trim()) return main;
    return `${main}<br/><br/>${signatureHtml.trim()}`;
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
