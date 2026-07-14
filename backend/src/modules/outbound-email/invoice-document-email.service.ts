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
import { DOCUMENT_STATUS, isEmailSendableDocumentStatus } from '@modules/documents/documents.constants';
import {
  DOCUMENTS_STORAGE,
  DocumentStoragePort,
} from '@modules/documents/storage/document-storage.interface';
import { displayInvoiceNumber } from '@modules/invoices/invoice-domain.util';
import { OutboundEmailPolicyService } from './outbound-email-policy.service';
import { OutboundEmailService } from './outbound-email.service';
import { EmailProviderRegistry } from './providers/email-provider.registry';

export interface SendInvoiceEmailInput {
  toEmail: string;
  ccEmails?: string[];
  bccEmails?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  documentId?: string;
}

@Injectable()
export class InvoiceDocumentEmailService {
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

  async sendInvoiceEmail(
    orgId: string,
    invoiceId: string,
    userId: string | null,
    input: SendInvoiceEmailInput,
  ) {
    if (!this.policy.isValidEmail(input.toEmail)) {
      throw new BadRequestException('Ungültige Empfänger-E-Mail');
    }
    this.policy.validateRecipientEmails(input.ccEmails, 'CC');
    this.policy.validateRecipientEmails(input.bccEmails, 'BCC');
    await this.assertRateLimit(orgId);

    const invoice = await this.prisma.orgInvoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const document = await this.resolveDocument(orgId, invoiceId, invoice.bookingId, input.documentId);
    if (!isEmailSendableDocumentStatus(document.status)) {
      throw new BadRequestException('Dieses Dokument kann derzeit nicht per E-Mail versendet werden');
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

    const buffer = await this.loadAttachmentBuffer(orgId, document);
    const attachments = [
      {
        fileName: document.fileName,
        mimeType: document.mimeType,
        content: buffer,
        generatedDocumentId: document.id,
        documentType: document.documentType,
        sizeBytes: buffer.length,
      },
    ];

    const outbound = await this.prisma.outboundEmail.create({
      data: {
        organizationId: orgId,
        invoiceId,
        customerId: invoice.customerId,
        bookingId: invoice.bookingId,
        sourceType: OutboundEmailSourceType.INVOICE_SINGLE,
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
        events: { create: { eventType: OutboundEmailEventType.QUEUED } },
      },
      include: { attachments: true, events: true },
    });

    return this.dispatchOutbound(orgId, invoiceId, userId, outbound.id, attachments, [document.id]);
  }

  async retryInvoiceEmail(orgId: string, invoiceId: string, outboundEmailId: string, userId: string | null) {
    const failed = await this.prisma.outboundEmail.findFirst({
      where: {
        id: outboundEmailId,
        organizationId: orgId,
        invoiceId,
        status: OutboundEmailStatus.FAILED,
      },
      include: { attachments: true },
    });
    if (!failed) throw new NotFoundException('Fehlgeschlagene E-Mail nicht gefunden');

    await this.assertRateLimit(orgId);
    const identity = await this.policy.resolveIdentity(orgId);
    const attachments = [];
    const documentIds: string[] = [];

    for (const att of failed.attachments) {
      if (!att.generatedDocumentId) continue;
      const doc = await this.generatedDocuments.getById(orgId, att.generatedDocumentId);
      const buffer = await this.loadAttachmentBuffer(orgId, doc);
      attachments.push({
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        content: buffer,
        generatedDocumentId: doc.id,
        documentType: doc.documentType,
        sizeBytes: buffer.length,
      });
      documentIds.push(doc.id);
    }

    const outbound = await this.prisma.outboundEmail.create({
      data: {
        organizationId: orgId,
        invoiceId,
        customerId: failed.customerId,
        bookingId: failed.bookingId,
        sourceType: OutboundEmailSourceType.INVOICE_SINGLE,
        status: OutboundEmailStatus.QUEUED,
        fromEmail: identity.fromEmail,
        fromName: identity.fromName,
        replyToEmail: identity.replyToEmail,
        toEmail: failed.toEmail,
        ccEmails: failed.ccEmails,
        bccEmails: failed.bccEmails,
        subject: failed.subject,
        bodyText: failed.bodyText,
        bodyHtml: failed.bodyHtml,
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
        events: { create: { eventType: OutboundEmailEventType.QUEUED } },
      },
      include: { attachments: true, events: true },
    });

    return this.dispatchOutbound(orgId, invoiceId, userId, outbound.id, attachments, documentIds);
  }

  private async dispatchOutbound(
    orgId: string,
    invoiceId: string,
    userId: string | null,
    outboundId: string,
    attachments: Array<{
      fileName: string;
      mimeType: string;
      content: Buffer;
      generatedDocumentId: string;
      documentType: string;
      sizeBytes: number;
    }>,
    documentIds: string[],
  ) {
    const outbound = await this.prisma.outboundEmail.findUniqueOrThrow({
      where: { id: outboundId },
      include: { attachments: true, events: { orderBy: { occurredAt: 'asc' } } },
    });

    await this.prisma.outboundEmail.update({
      where: { id: outbound.id },
      data: { status: OutboundEmailStatus.SENDING },
    });
    await this.outboundEmail.recordEvent(outbound.id, OutboundEmailEventType.SENDING);

    const provider = this.providers.resolve();
    const result = await provider.sendEmail({
      fromEmail: outbound.fromEmail,
      fromName: outbound.fromName ?? undefined,
      replyToEmail: outbound.replyToEmail ?? undefined,
      toEmail: outbound.toEmail,
      ccEmails: outbound.ccEmails,
      bccEmails: outbound.bccEmails,
      subject: outbound.subject,
      bodyText: outbound.bodyText ?? undefined,
      bodyHtml: outbound.bodyHtml ?? undefined,
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
      await this.prisma.orgInvoice.updateMany({
        where: { id: invoiceId, organizationId: orgId, status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] } },
        data: { sentAt: new Date(), status: 'SENT' },
      });
    }

    await this.activityLog.log({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: ActivityAction.SEND,
      entity: ActivityEntity.OUTBOUND_EMAIL,
      entityId: outbound.id,
      description: `Sent invoice email to ${outbound.toEmail}`,
      metaJson: { invoiceId, documentIds, status: finalStatus, provider: result.provider },
    });

    return this.outboundEmail.toDto(updated);
  }

  private async resolveDocument(
    orgId: string,
    invoiceId: string,
    bookingId: string | null,
    documentId?: string,
  ) {
    if (documentId) {
      const doc = await this.generatedDocuments.getById(orgId, documentId);
      if (doc.invoiceId !== invoiceId) {
        throw new ForbiddenException('Dokument gehört nicht zu dieser Rechnung');
      }
      return doc;
    }

    const doc = await this.prisma.generatedDocument.findFirst({
      where: {
        organizationId: orgId,
        OR: [
          { invoiceId },
          ...(bookingId
            ? [{ bookingId, documentType: 'BOOKING_INVOICE' as const }]
            : []),
        ],
        status: { in: [DOCUMENT_STATUS.GENERATED, DOCUMENT_STATUS.SENT] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!doc) {
      throw new BadRequestException('Kein versendbares PDF für diese Rechnung vorhanden');
    }
    return doc;
  }

  private async loadAttachmentBuffer(orgId: string, doc: { id: string; objectKey: string }) {
    await this.generatedDocuments.getById(orgId, doc.id);
    const stream = await this.documentStorage.getObjectStream(doc.objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private async assertRateLimit(orgId: string) {
    const max = this.config.get<number>('email.maxSendsPerHourPerOrg', 60);
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const count = await this.prisma.outboundEmail.count({
      where: { organizationId: orgId, createdAt: { gte: since } },
    });
    if (count >= max) {
      throw new HttpException(
        'Stündliches E-Mail-Limit für diese Organisation erreicht',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private composeBodyHtml(
    bodyHtml: string | undefined,
    settingsSignature: string | null | undefined,
    legacySignature: string | null | undefined,
  ): string {
    const base = bodyHtml?.trim() || '<p>Im Anhang finden Sie Ihre Rechnung.</p>';
    const signature = settingsSignature?.trim() || legacySignature?.trim();
    if (!signature) return base;
    return `${base}<br/><br/>${signature}`;
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

export function defaultInvoiceEmailSubject(invoiceNumberDisplay: string): string {
  return `Ihre Rechnung ${invoiceNumberDisplay}`;
}

export function buildInvoiceEmailSubject(invoice: {
  invoiceNumberDisplay?: string | null;
  legacyInvoiceNumber?: number | null;
  invoiceNumber?: number | null;
  sequenceYear?: number | null;
  sequenceNumber?: number | null;
  status?: string;
}): string {
  return defaultInvoiceEmailSubject(displayInvoiceNumber(invoice));
}
