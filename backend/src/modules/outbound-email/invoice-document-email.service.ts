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
  OutboundEmailDeliveryStatus,
  OutboundEmailEventType,
  OutboundEmailSourceType,
  OutboundEmailStatus,
} from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DOCUMENT_ORIGIN,
  DOCUMENT_STATUS,
  isEmailSendableDocumentStatus,
} from '@modules/documents/documents.constants';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import {
  DOCUMENTS_STORAGE,
  DocumentStoragePort,
} from '@modules/documents/storage/document-storage.interface';
import { InvoiceDocumentsReadService } from '@modules/invoices/invoice-documents-read.service';
import { validateInvoiceEmailSend } from '@modules/invoices/invoice-send-email.util';
import { logInvoiceCommunicationStatusChange } from '@modules/invoices/invoice-outbound-status-coordinator.util';
import {
  buildDefaultInvoiceEmailHtml,
  buildDefaultInvoiceEmailSubject,
  buildDefaultInvoiceEmailText,
} from './invoice-email.template';
import { OutboundEmailPolicyService } from './outbound-email-policy.service';
import { OutboundEmailService } from './outbound-email.service';
import { sanitizeOutboundErrorMessage } from './outbound-email-audit.util';
import {
  buildPreparingPatch,
  buildProviderFailurePatch,
  buildProviderResultPatch,
  deriveOutboundCommunicationPhase,
} from './outbound-email-status.transitions';
import { EmailProviderRegistry } from './providers/email-provider.registry';

export interface SendInvoiceEmailInput {
  recipient?: string;
  cc?: string[];
  bcc?: string[];
  subject?: string;
  message?: string;
  documentId?: string;
  idempotencyKey?: string;
  correlationId?: string;
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
    private readonly invoiceDocuments: InvoiceDocumentsReadService,
    @Inject(DOCUMENTS_STORAGE) private readonly documentStorage: DocumentStoragePort,
    private readonly activityLog: ActivityLogService,
  ) {}

  async sendInvoiceEmail(
    orgId: string,
    invoiceId: string,
    userId: string | null,
    input: SendInvoiceEmailInput,
  ) {
    if (input.idempotencyKey?.trim()) {
      const prior = await this.prisma.outboundEmail.findFirst({
        where: {
          organizationId: orgId,
          idempotencyKey: input.idempotencyKey.trim(),
        },
        include: {
          attachments: true,
          events: { orderBy: { occurredAt: 'asc' } },
        },
      });
      if (prior) {
        if (prior.invoiceId && prior.invoiceId !== invoiceId) {
          throw new BadRequestException('Idempotency key already used for another invoice');
        }
        return this.outboundEmail.toDto(prior);
      }
    }

    const invoice = await this.prisma.orgInvoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const customer = invoice.customerId
      ? await this.prisma.customer.findFirst({
          where: { id: invoice.customerId, organizationId: orgId },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            company: true,
          },
        })
      : null;

    if (input.recipient && !this.policy.isValidEmail(input.recipient)) {
      throw new BadRequestException('Invalid recipient email');
    }
    this.policy.validateRecipientEmails(input.cc, 'CC');
    this.policy.validateRecipientEmails(input.bcc, 'BCC');

    const documentsView = await this.invoiceDocuments.getDocumentsForInvoice({
      organizationId: orgId,
      invoiceId,
      invoiceType: invoice.type,
      cacheDocumentId: invoice.generatedDocumentId,
      includeInternalErrors: true,
    });

    const validation = validateInvoiceEmailSend({
      type: invoice.type,
      status: invoice.status,
      sequenceNumber: invoice.sequenceNumber,
      customerEmail: customer?.email ?? null,
      explicitRecipient: input.recipient,
      documentsView,
      documentId: input.documentId,
    });
    if (!validation.ok) {
      throw new BadRequestException(validation.message);
    }

    const toEmail = (input.recipient?.trim() || customer?.email?.trim())!;
    await this.assertRateLimit(orgId);

    const document = await this.prisma.generatedDocument.findFirst({
      where: {
        id: validation.documentId,
        organizationId: orgId,
        invoiceId,
      },
    });
    if (!document) {
      throw new ForbiddenException('Document is not linked to this invoice');
    }
    if (!isEmailSendableDocumentStatus(document.status)) {
      throw new BadRequestException(
        `Document cannot be sent in status: ${document.status}`,
      );
    }

    const identity = await this.policy.resolveIdentity(orgId);
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { emailSignature: true, orgEmailSettings: true },
    });

    const customerName = this.formatCustomerName(customer);
    const templateInput = {
      invoiceNumberDisplay: invoice.invoiceNumberDisplay,
      legacyInvoiceNumber: invoice.legacyInvoiceNumber,
      invoiceNumber: invoice.invoiceNumber,
      sequenceYear: invoice.sequenceYear,
      sequenceNumber: invoice.sequenceNumber,
      status: invoice.status,
      title: invoice.title,
      totalCents: invoice.totalCents,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      customerName,
    };

    const subject =
      input.subject?.trim() || buildDefaultInvoiceEmailSubject(templateInput);
    const defaultHtml = buildDefaultInvoiceEmailHtml(templateInput);
    const defaultText = buildDefaultInvoiceEmailText(templateInput);
    const bodyHtml = this.composeBodyHtml(
      input.message ? this.messageToHtml(input.message) : defaultHtml,
      org?.orgEmailSettings?.signatureHtml,
      org?.emailSignature,
    );
    const bodyText =
      input.message?.trim() || defaultText;

    await this.generatedDocuments.getById(orgId, document.id);
    const buffer = await this.loadAttachmentBuffer(orgId, document);
    const maxBytes = this.config.get<number>('email.maxAttachmentsBytes', 20 * 1024 * 1024);
    if (buffer.length > maxBytes) {
      throw new BadRequestException('Attachment exceeds the allowed size limit');
    }

    const requestedAt = new Date();
    const outbound = await this.prisma.outboundEmail.create({
      data: {
        organizationId: orgId,
        invoiceId,
        bookingId: invoice.bookingId,
        customerId: invoice.customerId,
        generatedDocumentId: document.id,
        documentVersionNumber: document.versionNumber,
        sourceType: OutboundEmailSourceType.INVOICE_SINGLE,
        status: OutboundEmailStatus.QUEUED,
        deliveryStatus: OutboundEmailDeliveryStatus.PENDING,
        idempotencyKey: input.idempotencyKey?.trim() || null,
        correlationId: input.correlationId?.trim() || null,
        requestedAt,
        fromEmail: identity.fromEmail,
        fromName: identity.fromName,
        replyToEmail: identity.replyToEmail,
        toEmail,
        ccEmails: (input.cc ?? []).map((e) => e.trim()).filter(Boolean),
        bccEmails: (input.bcc ?? []).map((e) => e.trim()).filter(Boolean),
        subject,
        bodyText,
        bodyHtml,
        sentByUserId: userId,
        attachments: {
          create: {
            generatedDocumentId: document.id,
            fileName: document.fileName,
            mimeType: document.mimeType,
            sizeBytes: buffer.length,
            documentType: document.documentType,
          },
        },
        events: {
          create: { eventType: OutboundEmailEventType.QUEUED },
        },
      },
      include: { attachments: true, events: true },
    });

    await this.prisma.outboundEmail.update({
      where: { id: outbound.id },
      data: buildPreparingPatch(),
    });
    await this.outboundEmail.recordEvent(outbound.id, OutboundEmailEventType.SENDING);

    const provider = this.providers.resolve();
    let result;
    try {
      result = await provider.sendEmail({
        fromEmail: identity.fromEmail,
        fromName: identity.fromName,
        replyToEmail: identity.replyToEmail,
        toEmail: outbound.toEmail,
        ccEmails: outbound.ccEmails,
        bccEmails: outbound.bccEmails,
        subject: outbound.subject,
        bodyText,
        bodyHtml,
        attachments: [
          {
            fileName: document.fileName,
            mimeType: document.mimeType,
            content: buffer,
          },
        ],
        idempotencyKey: outbound.id,
      });
    } catch (err) {
      const message = sanitizeOutboundErrorMessage(
        err instanceof Error ? err.message : String(err),
      );
      const failPatch = buildProviderFailurePatch('PROVIDER_ERROR', message);
      const previous = {
        status: OutboundEmailStatus.SENDING,
        deliveryStatus: OutboundEmailDeliveryStatus.PENDING,
      };
      await this.prisma.outboundEmail.update({
        where: { id: outbound.id },
        data: failPatch,
      });
      await this.outboundEmail.recordEvent(outbound.id, OutboundEmailEventType.FAILED, {
        errorCode: 'PROVIDER_ERROR',
        errorMessage: message,
      });
      await logInvoiceCommunicationStatusChange(this.activityLog, {
        organizationId: orgId,
        invoiceId,
        outboundEmailId: outbound.id,
        userId,
        previous,
        next: {
          status: failPatch.status!,
          deliveryStatus: failPatch.deliveryStatus!,
        },
        documentId: document.id,
      });
      await this.activityLog.log({
        organizationId: orgId,
        userId: userId ?? undefined,
        action: ActivityAction.SEND,
        entity: ActivityEntity.OUTBOUND_EMAIL,
        entityId: outbound.id,
        description: `Invoice email to ${toEmail} failed (provider error)`,
        metaJson: { invoiceId, documentId: document.id, status: 'FAILED' },
      });
      throw new HttpException(
        `E-Mail-Versand fehlgeschlagen: ${message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const previous = {
      status: OutboundEmailStatus.SENDING,
      deliveryStatus: OutboundEmailDeliveryStatus.PENDING,
    };
    const resultPatch = buildProviderResultPatch(previous, result);

    const updated = await this.prisma.outboundEmail.update({
      where: { id: outbound.id },
      data: resultPatch,
      include: { attachments: true, events: { orderBy: { occurredAt: 'asc' } } },
    });

    const finalStatus = resultPatch.status ?? OutboundEmailStatus.FAILED;

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
        communicationPhase: deriveOutboundCommunicationPhase({
          status: finalStatus,
          deliveryStatus: resultPatch.deliveryStatus!,
        }),
      },
    );

    await logInvoiceCommunicationStatusChange(this.activityLog, {
      organizationId: orgId,
      invoiceId,
      outboundEmailId: outbound.id,
      userId,
      previous,
      next: {
        status: updated.status,
        deliveryStatus: updated.deliveryStatus,
      },
      documentId: document.id,
      provider: result.provider,
    });

    if (
      finalStatus === OutboundEmailStatus.SENT ||
      finalStatus === OutboundEmailStatus.SENT_SIMULATED
    ) {
      await this.prisma.generatedDocument.updateMany({
        where: { id: document.id, organizationId: orgId },
        data: { status: DOCUMENT_STATUS.SENT, sentAt: new Date() },
      });
    }

    await this.activityLog.log({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: ActivityAction.SEND,
      entity: ActivityEntity.OUTBOUND_EMAIL,
      entityId: outbound.id,
      description: `Sent invoice email to ${toEmail}`,
      metaJson: {
        invoiceId,
        documentId: document.id,
        status: finalStatus,
        provider: result.provider,
      },
    });

    await this.activityLog.log({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: ActivityAction.SEND,
      entity: ActivityEntity.INVOICE,
      entityId: invoiceId,
      description: `Rechnung per E-Mail an ${toEmail} gesendet`,
      metaJson: {
        outboundEmailId: outbound.id,
        documentId: document.id,
        status: finalStatus,
      },
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
    const main = bodyHtml.trim() || '<p>Im Anhang finden Sie Ihre Rechnung.</p>';
    const signature = signatureHtml?.trim() || legacyOrgSignature?.trim();
    if (!signature) return main;
    const sigBlock = signature.includes('<')
      ? signature
      : `<p>${signature.replace(/\n/g, '<br/>')}</p>`;
    return `${main}<br/><br/>${sigBlock}`;
  }

  private messageToHtml(message: string): string {
    const trimmed = message.trim();
    if (trimmed.includes('<')) return trimmed;
    return `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`;
  }

  private formatCustomerName(
    customer: {
      firstName?: string | null;
      lastName?: string | null;
      company?: string | null;
    } | null,
  ): string {
    if (!customer) return 'Damen und Herren';
    const person = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
    if (person) return person;
    if (customer.company?.trim()) return customer.company.trim();
    return 'Damen und Herren';
  }

  private async loadAttachmentBuffer(
    orgId: string,
    doc: {
      objectKey: string;
      legalDocumentId: string | null;
      origin: string;
      title: string;
    },
  ): Promise<Buffer> {
    const keys = [doc.objectKey];
    if (doc.origin === DOCUMENT_ORIGIN.STATIC_LEGAL && doc.legalDocumentId) {
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
      `Datei für „${doc.title}“ nicht gefunden. Bitte Rechnungsdokument neu generieren.`,
      { cause: lastErr ?? undefined },
    );
  }
}
