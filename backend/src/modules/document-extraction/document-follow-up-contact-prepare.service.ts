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
  Prisma,
} from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { OutboundEmailPolicyService } from '@modules/outbound-email/outbound-email-policy.service';
import { OutboundEmailService } from '@modules/outbound-email/outbound-email.service';
import { EmailProviderRegistry } from '@modules/outbound-email/providers/email-provider.registry';
import { PrismaService } from '@shared/database/prisma.service';
import { isMalwareScanDownloadAllowed } from './document-malware-scan.util';
import { appendExtractionActionAudit } from './document-content-cache.util';
import {
  buildContactDraft,
  buildDocumentReference,
  listExcludedSensitiveFieldKeys,
} from './document-follow-up-contact.draft';
import { resolveContactRecipient } from './document-follow-up-contact-recipient.util';
import {
  isContactPrepareSuggestionType,
  resolveContactTargetFromSuggestionType,
  type PublicDocumentFollowUpContactPrepareDto,
  type SendDocumentFollowUpContactInput,
} from './document-follow-up-contact.types';
import { readFollowUpSuggestions } from './document-follow-up-suggestion.store';
import type { DocumentFollowUpSuggestion } from './document-follow-up-suggestion.types';
import { DOCUMENT_STORAGE, type DocumentStoragePort } from './storage/document-storage.interface';

type ExtractionRecord = {
  id: string;
  organizationId: string | null;
  vehicleId: string | null;
  sourceFileName?: string | null;
  effectiveDocumentType?: string | null;
  documentType?: string | null;
  detectedDocumentSubtype?: string | null;
  objectKey?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  confirmedData: unknown;
  plausibility: unknown;
};

@Injectable()
export class DocumentFollowUpContactPrepareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly policy: OutboundEmailPolicyService,
    private readonly outboundEmail: OutboundEmailService,
    private readonly providers: EmailProviderRegistry,
    private readonly activityLog: ActivityLogService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStoragePort,
  ) {}

  async buildPreparePreview(input: {
    orgId: string;
    record: ExtractionRecord;
    suggestionId: string;
  }): Promise<PublicDocumentFollowUpContactPrepareDto> {
    const suggestion = this.findSuggestion(input.record, input.suggestionId);
    this.assertContactPrepareSuggestion(suggestion);

    const contactTarget = resolveContactTargetFromSuggestionType(suggestion.type);
    if (!contactTarget) {
      throw new BadRequestException('Suggestion type does not support contact preparation');
    }

    const confirmedData = (input.record.confirmedData ?? {}) as Record<string, unknown>;
    const [recipient, sender] = await Promise.all([
      resolveContactRecipient({
        orgId: input.orgId,
        contactTarget,
        confirmedData,
        prisma: this.prisma,
      }),
      this.policy.resolveIdentity(input.orgId),
    ]);

    const documentReference = buildDocumentReference({
      extractionId: input.record.id,
      fileName: input.record.sourceFileName,
      documentType: input.record.effectiveDocumentType ?? input.record.documentType ?? null,
      documentSubtype: input.record.detectedDocumentSubtype ?? null,
      confirmedData,
    });

    const draft = buildContactDraft({
      contactTarget,
      recipientDisplayName: recipient.displayName,
      documentReference,
      suggestionTitle: suggestion.title,
      suggestionRationale: suggestion.rationale,
    });

    const attachmentAvailable = this.isAttachmentAvailable(input.record);
    const canSend = this.policy.isValidEmail(recipient.email ?? '');
    const sendBlockedReason = canSend
      ? null
      : 'Empfänger-E-Mail fehlt oder ist ungültig — bitte manuell eingeben.';

    return {
      suggestionId: suggestion.suggestionId,
      extractionId: input.record.id,
      contactTarget,
      recipient,
      sender: {
        fromEmail: sender.fromEmail,
        fromName: sender.fromName,
        replyToEmail: sender.replyToEmail,
      },
      subject: draft.subject,
      bodyText: draft.bodyText,
      bodyHtml: draft.bodyHtml,
      documentReference,
      attachmentOffer: {
        extractionId: input.record.id,
        fileName: input.record.sourceFileName ?? null,
        mimeType: input.record.mimeType ?? null,
        sizeBytes: input.record.sizeBytes ?? null,
        available: attachmentAvailable,
        defaultSelected: false,
      },
      excludedSensitiveFields: listExcludedSensitiveFieldKeys(confirmedData),
      preparedOnly: true,
      canSend,
      sendBlockedReason,
    };
  }

  async recordPrepareOpened(input: {
    orgId: string;
    record: ExtractionRecord;
    suggestionId: string;
    userId: string | null;
  }): Promise<void> {
    const suggestion = this.findSuggestion(input.record, input.suggestionId);
    this.assertContactPrepareSuggestion(suggestion);

    const plausibility = appendExtractionActionAudit(input.record.plausibility, {
      action: 'follow_up_contact_prepare_opened',
      at: new Date().toISOString(),
      userId: input.userId,
      details: {
        suggestionId: suggestion.suggestionId,
        suggestionType: suggestion.type,
        contactTarget: resolveContactTargetFromSuggestionType(suggestion.type),
      },
    });

    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: input.record.id },
      data: { plausibility: plausibility as Prisma.InputJsonValue },
    });

    await this.activityLog.log({
      organizationId: input.orgId,
      userId: input.userId ?? undefined,
      action: ActivityAction.CREATE,
      entity: ActivityEntity.OUTBOUND_EMAIL,
      entityId: input.record.id,
      description: `Follow-up contact draft opened (${suggestion.type})`,
      metaJson: {
        extractionId: input.record.id,
        suggestionId: suggestion.suggestionId,
        suggestionType: suggestion.type,
        preparedOnly: true,
      },
    });
  }

  async sendPreparedContact(input: {
    orgId: string;
    record: ExtractionRecord;
    suggestionId: string;
    userId: string | null;
    payload: SendDocumentFollowUpContactInput;
  }) {
    const suggestion = this.findSuggestion(input.record, input.suggestionId);
    this.assertContactPrepareSuggestion(suggestion);

    if (!this.policy.isValidEmail(input.payload.toEmail)) {
      throw new BadRequestException('Invalid recipient email');
    }
    this.policy.validateRecipientEmails(input.payload.ccEmails, 'CC');
    this.policy.validateRecipientEmails(input.payload.bccEmails, 'BCC');
    if (!input.payload.subject?.trim()) {
      throw new BadRequestException('Subject is required');
    }
    if (!input.payload.bodyHtml?.trim()) {
      throw new BadRequestException('Message body is required');
    }

    await this.assertRateLimit(input.orgId);

    const preview = await this.buildPreparePreview({
      orgId: input.orgId,
      record: input.record,
      suggestionId: input.suggestionId,
    });

    const identity = await this.policy.resolveIdentity(input.orgId);
    const org = await this.prisma.organization.findUnique({
      where: { id: input.orgId },
      select: { emailSignature: true, orgEmailSettings: true },
    });
    const bodyHtml = this.composeBodyHtml(
      input.payload.bodyHtml,
      org?.orgEmailSettings?.signatureHtml,
      org?.emailSignature,
    );
    const bodyText = input.payload.bodyText?.trim() || this.stripHtml(bodyHtml);

    const attachments: Array<{
      fileName: string;
      mimeType: string;
      content: Buffer;
      sizeBytes: number;
    }> = [];

    if (input.payload.attachDocument) {
      if (!preview.attachmentOffer.available) {
        throw new BadRequestException('Document attachment is not available');
      }
      const buffer = await this.loadExtractionAttachment(input.record);
      attachments.push({
        fileName: preview.attachmentOffer.fileName ?? `document-${input.record.id}.pdf`,
        mimeType: preview.attachmentOffer.mimeType ?? 'application/octet-stream',
        content: buffer,
        sizeBytes: buffer.length,
      });
      const maxBytes = this.config.get<number>('email.maxAttachmentsBytes', 20 * 1024 * 1024);
      if (buffer.length > maxBytes) {
        throw new BadRequestException('Attachment exceeds allowed size limit');
      }
    }

    const customerId =
      preview.recipient.entityType === 'customer' || preview.recipient.entityType === 'driver'
        ? preview.recipient.entityId
        : null;

    const outbound = await this.prisma.outboundEmail.create({
      data: {
        organizationId: input.orgId,
        customerId,
        bookingId: null,
        sourceType: OutboundEmailSourceType.NOTIFICATION,
        status: OutboundEmailStatus.QUEUED,
        fromEmail: identity.fromEmail,
        fromName: identity.fromName,
        replyToEmail: identity.replyToEmail,
        toEmail: input.payload.toEmail.trim(),
        ccEmails: (input.payload.ccEmails ?? []).map((e) => e.trim()).filter(Boolean),
        bccEmails: (input.payload.bccEmails ?? []).map((e) => e.trim()).filter(Boolean),
        subject: input.payload.subject.trim(),
        bodyText,
        bodyHtml,
        sentByUserId: input.userId,
        attachments: {
          create: attachments.map((a) => ({
            fileName: a.fileName,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            documentType: preview.documentReference.documentType,
          })),
        },
        events: { create: { eventType: OutboundEmailEventType.QUEUED } },
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

    const plausibility = appendExtractionActionAudit(input.record.plausibility, {
      action: 'follow_up_contact_sent',
      at: new Date().toISOString(),
      userId: input.userId,
      details: {
        suggestionId: suggestion.suggestionId,
        outboundEmailId: outbound.id,
        toEmail: input.payload.toEmail,
        attachDocument: Boolean(input.payload.attachDocument),
        status: finalStatus,
      },
    });
    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: input.record.id },
      data: { plausibility: plausibility as Prisma.InputJsonValue },
    });

    await this.activityLog.log({
      organizationId: input.orgId,
      userId: input.userId ?? undefined,
      action: ActivityAction.SEND,
      entity: ActivityEntity.OUTBOUND_EMAIL,
      entityId: outbound.id,
      description: `Document follow-up contact sent to ${input.payload.toEmail}`,
      metaJson: {
        extractionId: input.record.id,
        suggestionId: suggestion.suggestionId,
        contactTarget: preview.contactTarget,
        attachDocument: Boolean(input.payload.attachDocument),
        status: finalStatus,
        preparedOnly: false,
      },
    });

    return this.outboundEmail.toDto(updated);
  }

  private findSuggestion(record: ExtractionRecord, suggestionId: string): DocumentFollowUpSuggestion {
    const suggestion = readFollowUpSuggestions(record.plausibility).find(
      (row) => row.suggestionId === suggestionId,
    );
    if (!suggestion) {
      throw new NotFoundException('Follow-up suggestion not found');
    }
    return suggestion;
  }

  private assertContactPrepareSuggestion(suggestion: DocumentFollowUpSuggestion): void {
    if (!isContactPrepareSuggestionType(suggestion.type)) {
      throw new BadRequestException('Suggestion does not support contact preparation');
    }
  }

  private isAttachmentAvailable(record: ExtractionRecord): boolean {
    if (!record.objectKey) return false;
    return isMalwareScanDownloadAllowed(record.plausibility);
  }

  private async loadExtractionAttachment(record: ExtractionRecord): Promise<Buffer> {
    if (!record.objectKey) {
      throw new NotFoundException('Document file is no longer available');
    }
    if (!isMalwareScanDownloadAllowed(record.plausibility)) {
      throw new ForbiddenException('Document cannot be attached until malware scan passes');
    }
    return this.storage.getObject(record.objectKey);
  }

  private async assertRateLimit(orgId: string): Promise<void> {
    const windowMs = this.config.get<number>('email.rateLimitWindowMs', 60_000);
    const maxPerWindow = this.config.get<number>('email.rateLimitMaxPerOrg', 30);
    const since = new Date(Date.now() - windowMs);
    const count = await this.prisma.outboundEmail.count({
      where: {
        organizationId: orgId,
        createdAt: { gte: since },
        status: {
          in: [
            OutboundEmailStatus.QUEUED,
            OutboundEmailStatus.SENDING,
            OutboundEmailStatus.SENT,
            OutboundEmailStatus.SENT_SIMULATED,
          ],
        },
      },
    });
    if (count >= maxPerWindow) {
      throw new HttpException('Email rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private composeBodyHtml(
    bodyHtml: string | undefined,
    settingsSignatureHtml?: string | null,
    legacySignature?: string | null,
  ): string {
    const base = bodyHtml?.trim() || '';
    const signature = settingsSignatureHtml?.trim() || legacySignature?.trim();
    if (!signature) return base;
    if (base.includes(signature)) return base;
    return `${base}<br/><br/>${signature}`;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
