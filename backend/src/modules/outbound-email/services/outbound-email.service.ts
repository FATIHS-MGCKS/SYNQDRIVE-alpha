import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OutboundEmailEventType,
  OutboundEmailSourceType,
  OutboundEmailStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { EmailProviderFactory } from '../providers/email-provider.factory';
import { EmailAddressPolicyService } from './email-address-policy.service';
import { EmailSendGuardService } from './email-send-guard.service';
import { OrgEmailSettingsService } from './org-email-settings.service';

export interface SendOutboundEmailInput {
  organizationId: string;
  sentByUserId: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  cc?: string[];
  bcc?: string[];
  sourceType?: OutboundEmailSourceType;
  bookingId?: string;
  customerId?: string;
  invoiceId?: string;
  requestedFromEmail?: string;
  attachments?: Array<{
    fileName: string;
    mimeType: string;
    content: Buffer;
    sizeBytes?: number;
    generatedDocumentId?: string;
    documentType?: string;
  }>;
}

@Injectable()
export class OutboundEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: OrgEmailSettingsService,
    private readonly policy: EmailAddressPolicyService,
    private readonly providerFactory: EmailProviderFactory,
    private readonly sendGuard: EmailSendGuardService,
  ) {}

  async sendExplicit(input: SendOutboundEmailInput) {
    const to = input.to.trim();
    if (!to) throw new BadRequestException('Recipient is required');

    await this.sendGuard.assertCanSend(input.organizationId, {
      to,
      cc: input.cc,
      bcc: input.bcc,
      attachments: input.attachments,
    });

    const [organization, settings, verifiedDomain] = await Promise.all([
      this.settingsService.getOrganizationForPolicy(input.organizationId),
      this.settingsService.getOrCreate(input.organizationId),
      this.settingsService.getVerifiedDomain(input.organizationId),
    ]);

    const resolved = this.policy.resolve({
      organization,
      settings,
      verifiedDomain,
      requestedFromEmail: input.requestedFromEmail,
    });

    const provider = this.providerFactory.getProvider();

    const email = await this.prisma.outboundEmail.create({
      data: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        customerId: input.customerId,
        invoiceId: input.invoiceId,
        sourceType: input.sourceType ?? OutboundEmailSourceType.MANUAL,
        to,
        cc: input.cc?.length ? input.cc : undefined,
        bcc: input.bcc?.length ? input.bcc : undefined,
        fromEmail: resolved.fromEmail,
        fromName: resolved.fromName,
        replyToEmail: resolved.replyToEmail,
        subject: input.subject,
        bodyText: input.bodyText,
        bodyHtml: input.bodyHtml,
        status: OutboundEmailStatus.QUEUED,
        provider: provider.providerId,
        sentByUserId: input.sentByUserId,
        events: {
          create: [{ eventType: OutboundEmailEventType.CREATED }],
        },
        attachments: input.attachments?.length
          ? {
              create: input.attachments.map((a) => ({
                fileName: a.fileName,
                mimeType: a.mimeType,
                sizeBytes: a.sizeBytes ?? a.content.length,
                generatedDocumentId: a.generatedDocumentId,
                documentType: a.documentType,
              })),
            }
          : undefined,
      },
      include: { attachments: true },
    });

    await this.appendEvent(email.id, OutboundEmailEventType.QUEUED);

    if (resolved.usedVerifiedDomain) {
      await this.appendEvent(email.id, OutboundEmailEventType.DOMAIN_USED, {
        domain: verifiedDomain?.domain,
        fromEmail: resolved.fromEmail,
      });
    } else if (resolved.usedFallback) {
      await this.appendEvent(email.id, OutboundEmailEventType.FALLBACK_USED, {
        reason: resolved.fallbackReason,
        fromEmail: resolved.fromEmail,
      });
    }

    await this.prisma.outboundEmail.update({
      where: { id: email.id },
      data: { status: OutboundEmailStatus.SENDING },
    });

    const result = await provider.send({
      fromEmail: resolved.fromEmail,
      fromName: resolved.fromName,
      replyToEmail: resolved.replyToEmail,
      to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      bodyText: input.bodyText,
      bodyHtml: input.bodyHtml,
      attachments: input.attachments,
    });

    if (!result.success) {
      await this.prisma.outboundEmail.update({
        where: { id: email.id },
        data: {
          status: OutboundEmailStatus.FAILED,
          errorMessage: result.errorMessage ?? 'Send failed',
        },
      });
      await this.appendEvent(email.id, OutboundEmailEventType.FAILED, {
        errorMessage: result.errorMessage,
      });
      throw new BadRequestException(result.errorMessage ?? 'Email send failed');
    }

    const finalStatus = result.simulated
      ? OutboundEmailStatus.SENT_SIMULATED
      : OutboundEmailStatus.SENT;

    const updated = await this.prisma.outboundEmail.update({
      where: { id: email.id },
      data: {
        status: finalStatus,
        providerMessageId: result.providerMessageId,
        sentAt: new Date(),
      },
      include: { events: { orderBy: { createdAt: 'asc' } }, attachments: true },
    });

    await this.appendEvent(email.id, OutboundEmailEventType.SENT, {
      providerMessageId: result.providerMessageId,
      simulated: result.simulated ?? false,
    });

    return updated;
  }

  async getById(organizationId: string, emailId: string) {
    const row = await this.prisma.outboundEmail.findFirst({
      where: { id: emailId, organizationId },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
        attachments: true,
      },
    });
    if (!row) throw new NotFoundException('Outbound email not found');
    return row;
  }

  private async appendEvent(
    outboundEmailId: string,
    eventType: OutboundEmailEventType,
    payload?: Record<string, unknown>,
  ) {
    await this.prisma.outboundEmailEvent.create({
      data: {
        outboundEmailId,
        eventType,
        payload: payload as object | undefined,
      },
    });
  }
}
