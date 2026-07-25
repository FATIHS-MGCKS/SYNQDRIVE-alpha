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
  OutboundEmailEventType,
  OutboundEmailSourceType,
  OutboundEmailStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DOCUMENTS_STORAGE,
  type DocumentStoragePort,
} from '@modules/documents/storage/document-storage.interface';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { isEmailSendableDocumentStatus } from '@modules/documents/documents.constants';
import { OutboundEmailPolicyService } from '@modules/outbound-email/outbound-email-policy.service';
import { OutboundEmailService } from '@modules/outbound-email/outbound-email.service';
import { EmailProviderRegistry } from '@modules/outbound-email/providers/email-provider.registry';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type {
  EmailSendActionConfig,
  WorkflowEmailDeliveryStatus,
  WorkflowEmailLocale,
} from './workflow-action-adapter.types';
import { WorkflowEmailCommunicationPolicyService } from './workflow-email-communication-policy.service';
import { WorkflowCommunicationPolicyEngineService } from '../../communication-policy';
import type { WorkflowCommunicationPolicySnapshot } from '../../communication-policy';
import { maskEmailAddress } from './workflow-email-mask.util';
import {
  isAllowedWorkflowEmailAttachmentMime,
  renderWorkflowEmailTemplate,
  WORKFLOW_EMAIL_TEMPLATES,
} from './workflow-email-templates';

export interface WorkflowEmailSendResult {
  outboundEmailId: string;
  deliveryStatus: WorkflowEmailDeliveryStatus;
  providerMessageId: string | null;
  idempotencyKey: string;
  maskedRecipient: string;
  duplicate: boolean;
  locale: WorkflowEmailLocale;
  templateId: string;
  templateVersion: string;
}

@Injectable()
export class WorkflowEmailSendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly policy: OutboundEmailPolicyService,
    private readonly outboundEmail: OutboundEmailService,
    private readonly providers: EmailProviderRegistry,
    private readonly communicationPolicy: WorkflowEmailCommunicationPolicyService,
    private readonly policyEngine: WorkflowCommunicationPolicyEngineService,
    private readonly generatedDocuments: GeneratedDocumentsService,
    @Inject(DOCUMENTS_STORAGE) private readonly documentStorage: DocumentStoragePort,
  ) {}

  buildIdempotencyKey(ctx: WorkflowActionExecutionContext): string {
    return `workflow:${ctx.organizationId}:${ctx.idempotencyKey}:action:${ctx.actionIndex}:email`;
  }

  async findExistingSend(
    orgId: string,
    idempotencyKey: string,
  ): Promise<{ id: string; status: OutboundEmailStatus; providerMessageId: string | null; toEmail: string } | null> {
    return this.prisma.outboundEmail.findFirst({
      where: { organizationId: orgId, sendIdempotencyKey: idempotencyKey },
      select: { id: true, status: true, providerMessageId: true, toEmail: true },
    });
  }

  async send(
    config: EmailSendActionConfig,
    ctx: WorkflowActionExecutionContext,
    options?: { allowExplicitRecipient?: boolean },
  ): Promise<WorkflowEmailSendResult> {
    const idempotencyKey = this.buildIdempotencyKey(ctx);
    const existing = await this.findExistingSend(ctx.organizationId, idempotencyKey);
    if (existing) {
      return {
        outboundEmailId: existing.id,
        deliveryStatus: this.mapDeliveryStatus(existing.status, existing.id),
        providerMessageId: existing.providerMessageId,
        idempotencyKey,
        maskedRecipient: maskEmailAddress(existing.toEmail),
        duplicate: true,
        locale: config.locale ?? 'de',
        templateId: config.templateId,
        templateVersion: config.templateVersion,
      };
    }

    const template = WORKFLOW_EMAIL_TEMPLATES[config.templateId];
    if (!template) {
      throw new BadRequestException(`Unknown email template: ${config.templateId}`);
    }
    if (template.version !== config.templateVersion) {
      throw new BadRequestException(
        `Template version mismatch: expected ${template.version}, got ${config.templateVersion}`,
      );
    }

    const resolved = await this.resolveRecipient(config, ctx, options?.allowExplicitRecipient === true);
    const locale = config.locale ?? 'de';

    const policyResult = await this.communicationPolicy.evaluate({
      organizationId: ctx.organizationId,
      recipientEmail: resolved.toEmail,
      templateCategory: template.category,
      enforceSendWindow: template.enforceSendWindow,
      respectSendWindow: config.respectSendWindow,
      bookingId: resolved.bookingId,
      customerId: resolved.customerId,
      phase: 'pre_send',
    });
    if (policyResult.decision === 'SUPPRESS') {
      return {
        outboundEmailId: '',
        deliveryStatus: 'SUPPRESSED',
        providerMessageId: null,
        idempotencyKey,
        maskedRecipient: maskEmailAddress(resolved.toEmail),
        duplicate: false,
        locale,
        templateId: config.templateId,
        templateVersion: config.templateVersion,
      };
    }
    this.policyEngine.assertSendPermitted(policyResult, {
      allowWithApproval: ctx.runApproved === true,
    });
    if (!policyResult.allowed) {
      if (policyResult.code === 'SUPPRESSED') {
        return {
          outboundEmailId: '',
          deliveryStatus: 'SUPPRESSED',
          providerMessageId: null,
          idempotencyKey,
          maskedRecipient: maskEmailAddress(resolved.toEmail),
          duplicate: false,
          locale,
          templateId: config.templateId,
          templateVersion: config.templateVersion,
        };
      }
      throw new BadRequestException(policyResult.reason ?? 'Communication policy blocked send');
    }
    const policySnapshot: WorkflowCommunicationPolicySnapshot | undefined = policyResult.snapshot;

    await this.assertRateLimit(ctx.organizationId);

    const org = await this.prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { companyName: true, emailSignature: true, orgEmailSettings: true },
    });
    const params = {
      orgName: org?.companyName ?? 'SynqDrive',
      message: config.params?.message ?? '',
      subject: config.subject ?? '',
      bookingRef: config.params?.bookingRef ?? resolved.bookingId ?? '',
      invoiceRef: config.params?.invoiceRef ?? '',
      ...config.params,
    };
    const rendered = renderWorkflowEmailTemplate(template, locale, params);
    const subject = config.subject?.trim() || rendered.subject;
    const identity = await this.policy.resolveIdentity(ctx.organizationId);
    const bodyHtml = this.appendSignature(
      rendered.bodyHtml,
      org?.orgEmailSettings?.signatureHtml,
      org?.emailSignature,
    );
    const bodyText = rendered.bodyText;

    const attachments = await this.loadAttachments(
      ctx.organizationId,
      config.attachmentDocumentIds ?? [],
      resolved.bookingId,
    );

    const outbound = await this.prisma.outboundEmail.create({
      data: {
        organizationId: ctx.organizationId,
        bookingId: resolved.bookingId,
        customerId: resolved.customerId,
        sourceType: OutboundEmailSourceType.WORKFLOW,
        status: OutboundEmailStatus.QUEUED,
        fromEmail: identity.fromEmail,
        fromName: identity.fromName,
        replyToEmail: identity.replyToEmail,
        toEmail: resolved.toEmail,
        subject,
        bodyText,
        bodyHtml,
        sendIdempotencyKey: idempotencyKey,
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
    });

    await this.prisma.outboundEmail.update({
      where: { id: outbound.id },
      data: { status: OutboundEmailStatus.SENDING },
    });
    await this.outboundEmail.recordEvent(outbound.id, OutboundEmailEventType.SENDING);

    const provider = this.providers.resolve();
    const timeoutMs = 30_000;
    let result;
    try {
      result = await Promise.race([
        provider.sendEmail({
          fromEmail: identity.fromEmail,
          fromName: identity.fromName,
          replyToEmail: identity.replyToEmail,
          toEmail: resolved.toEmail,
          subject,
          bodyText,
          bodyHtml,
          attachments: attachments.map((a) => ({
            fileName: a.fileName,
            mimeType: a.mimeType,
            content: a.content,
          })),
          idempotencyKey: outbound.id,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('EMAIL_PROVIDER_TIMEOUT')), timeoutMs),
        ),
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.outboundEmail.update({
        where: { id: outbound.id },
        data: {
          status: OutboundEmailStatus.FAILED,
          errorCode: message.includes('TIMEOUT') ? 'TIMEOUT' : 'PROVIDER_ERROR',
          errorMessage: message,
        },
      });
      await this.outboundEmail.recordEvent(outbound.id, OutboundEmailEventType.FAILED, {
        errorCode: message.includes('TIMEOUT') ? 'TIMEOUT' : 'PROVIDER_ERROR',
        errorMessage: message,
      });
      throw err;
    }

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
      include: { events: true },
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

    if (finalStatus === OutboundEmailStatus.FAILED) {
      throw new BadRequestException(result.errorMessage ?? 'Email provider failed');
    }

    return {
      outboundEmailId: updated.id,
      deliveryStatus: this.mapDeliveryStatus(updated.status, updated.id),
      providerMessageId: updated.providerMessageId,
      idempotencyKey,
      maskedRecipient: maskEmailAddress(resolved.toEmail),
      duplicate: false,
      locale,
      templateId: config.templateId,
      templateVersion: config.templateVersion,
    };
  }

  private mapDeliveryStatus(
    status: OutboundEmailStatus,
    outboundEmailId: string,
  ): WorkflowEmailDeliveryStatus {
    if (!outboundEmailId) return 'SUPPRESSED';
    switch (status) {
      case OutboundEmailStatus.QUEUED:
        return 'QUEUED';
      case OutboundEmailStatus.SENDING:
        return 'PREPARED';
      case OutboundEmailStatus.SENT:
      case OutboundEmailStatus.SENT_SIMULATED:
        return 'SENT';
      case OutboundEmailStatus.FAILED:
        return 'FAILED';
      default:
        return 'QUEUED';
    }
  }

  private async resolveRecipient(
    config: EmailSendActionConfig,
    ctx: WorkflowActionExecutionContext,
    allowExplicit: boolean,
  ): Promise<{ toEmail: string; customerId: string | null; bookingId: string | null }> {
    if (config.recipient.type === 'booking') {
      const bookingId = config.recipient.bookingId || this.bookingIdFromContext(ctx);
      if (!bookingId) throw new BadRequestException('booking recipient requires bookingId');
      const booking = await this.prisma.booking.findFirst({
        where: { id: bookingId, organizationId: ctx.organizationId },
        include: { customer: { select: { id: true, email: true } } },
      });
      if (!booking) throw new NotFoundException('Booking not found in organization');
      const email = booking.customer?.email?.trim();
      if (!email || !this.policy.isValidEmail(email)) {
        throw new BadRequestException('Booking customer has no valid email');
      }
      return { toEmail: email, customerId: booking.customerId, bookingId: booking.id };
    }

    const customerId = config.recipient.customerId || this.customerIdFromContext(ctx);
    if (!customerId) throw new BadRequestException('customer recipient requires customerId');
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId: ctx.organizationId },
      select: { id: true, email: true },
    });
    if (!customer) throw new NotFoundException('Customer not found in organization');
    const email = customer.email?.trim();
    if (!email || !this.policy.isValidEmail(email)) {
      if (allowExplicit && config.toEmail && this.policy.isValidEmail(config.toEmail)) {
        return { toEmail: config.toEmail.trim(), customerId: customer.id, bookingId: null };
      }
      throw new BadRequestException('Customer has no valid email');
    }
    return { toEmail: email, customerId: customer.id, bookingId: null };
  }

  private bookingIdFromContext(ctx: WorkflowActionExecutionContext): string | null {
    const payload = ctx.event.payload as Record<string, unknown> | undefined;
    const fromPayload = payload?.bookingId;
    if (typeof fromPayload === 'string' && fromPayload.trim()) return fromPayload.trim();
    if (ctx.event.entityType === 'booking' && ctx.event.entityId) return ctx.event.entityId;
    return null;
  }

  private customerIdFromContext(ctx: WorkflowActionExecutionContext): string | null {
    const payload = ctx.event.payload as Record<string, unknown> | undefined;
    const fromPayload = payload?.customerId;
    if (typeof fromPayload === 'string' && fromPayload.trim()) return fromPayload.trim();
    if (ctx.event.entityType === 'customer' && ctx.event.entityId) return ctx.event.entityId;
    return null;
  }

  private async loadAttachments(
    orgId: string,
    documentIds: string[],
    bookingId: string | null,
  ) {
    if (documentIds.length === 0) return [];
    const uniqueIds = [...new Set(documentIds)];
    const documents = await this.prisma.generatedDocument.findMany({
      where: { id: { in: uniqueIds }, organizationId: orgId },
    });
    if (documents.length !== uniqueIds.length) {
      throw new ForbiddenException('One or more attachment documents are not in this organization');
    }
    if (bookingId) {
      const foreign = documents.filter((d) => d.bookingId && d.bookingId !== bookingId);
      if (foreign.length > 0) {
        throw new ForbiddenException('Attachment documents must belong to the resolved booking');
      }
    }

    const maxBytes = this.config.get<number>('email.maxAttachmentsBytes', 20 * 1024 * 1024);
    let totalBytes = 0;
    const attachments = [];

    for (const doc of documents) {
      if (!isEmailSendableDocumentStatus(doc.status)) {
        throw new BadRequestException(`Document ${doc.id} is not sendable`);
      }
      if (!isAllowedWorkflowEmailAttachmentMime(doc.mimeType)) {
        throw new BadRequestException(`MIME type not allowed: ${doc.mimeType}`);
      }
      await this.generatedDocuments.getById(orgId, doc.id);
      const buffer = await this.documentStorage.getObject(doc.objectKey);
      totalBytes += buffer.length;
      if (totalBytes > maxBytes) {
        throw new BadRequestException('Total attachment size exceeds allowed limit');
      }
      attachments.push({
        generatedDocumentId: doc.id,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        sizeBytes: buffer.length,
        documentType: doc.documentType,
        content: buffer,
      });
    }
    return attachments;
  }

  private appendSignature(
    bodyHtml: string,
    signatureHtml?: string | null,
    legacySignature?: string | null,
  ): string {
    const signature = signatureHtml?.trim() || legacySignature?.trim();
    if (!signature) return bodyHtml;
    const sigBlock = signature.includes('<')
      ? signature
      : `<p>${signature.replace(/\n/g, '<br/>')}</p>`;
    return `${bodyHtml}<br/><br/>${sigBlock}`;
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
}
