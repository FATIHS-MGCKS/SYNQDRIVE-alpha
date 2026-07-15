import { Injectable, NotFoundException } from '@nestjs/common';
import {
  OutboundEmailEventType,
  OutboundEmailSourceType,
  OutboundEmailStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildPaginatedResult,
  parsePagination,
  PaginationParams,
} from '@shared/utils/pagination';

export interface OutboundEmailAttachmentDto {
  id: string;
  generatedDocumentId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  documentType: string | null;
}

export interface OutboundEmailEventDto {
  id: string;
  eventType: OutboundEmailEventType;
  occurredAt: string;
  payload: unknown;
}

export interface OutboundEmailDto {
  id: string;
  organizationId: string;
  bookingId: string | null;
  customerId: string | null;
  invoiceId: string | null;
  sourceType: OutboundEmailSourceType;
  status: OutboundEmailStatus;
  fromEmail: string;
  fromName: string | null;
  replyToEmail: string | null;
  toEmail: string;
  ccEmails: string[];
  bccEmails: string[];
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  provider: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  sentByUserId: string | null;
  sentAt: string | null;
  createdAt: string;
  attachments: OutboundEmailAttachmentDto[];
  events: OutboundEmailEventDto[];
}

@Injectable()
export class OutboundEmailService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(orgId: string, emailId: string): Promise<OutboundEmailDto> {
    const row = await this.prisma.outboundEmail.findFirst({
      where: { id: emailId, organizationId: orgId },
      include: { attachments: true, events: { orderBy: { occurredAt: 'asc' } } },
    });
    if (!row) throw new NotFoundException('Outbound email not found');
    return this.toDto(row);
  }

  async listForOrg(
    orgId: string,
    params: PaginationParams & { bookingId?: string; customerId?: string },
  ) {
    const { skip, take } = parsePagination(params);
    const where = {
      organizationId: orgId,
      ...(params.bookingId ? { bookingId: params.bookingId } : {}),
      ...(params.customerId ? { customerId: params.customerId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.outboundEmail.findMany({
        where,
        include: { attachments: true, events: { orderBy: { occurredAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.outboundEmail.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((r) => this.toDto(r)),
      total,
      params,
    );
  }

  async recordEvent(
    outboundEmailId: string,
    eventType: OutboundEmailEventType,
    payload?: Record<string, unknown>,
  ) {
    return this.prisma.outboundEmailEvent.create({
      data: {
        outboundEmailId,
        eventType,
        payload: payload as object,
      },
    });
  }

  async applyWebhookEvent(
    providerMessageId: string,
    eventType: OutboundEmailEventType,
    payload?: Record<string, unknown>,
    webhookIdempotencyKey?: string | null,
  ) {
    const email = await this.prisma.outboundEmail.findFirst({
      where: { providerMessageId },
    });
    if (!email) return null;

    if (webhookIdempotencyKey) {
      const duplicate = await this.prisma.outboundEmailEvent.findFirst({
        where: {
          outboundEmailId: email.id,
          webhookIdempotencyKey,
        },
      });
      if (duplicate) return email.id;
    } else {
      const duplicate = await this.prisma.outboundEmailEvent.findFirst({
        where: { outboundEmailId: email.id, eventType },
      });
      if (duplicate) return email.id;
    }

    const statusPatch = this.resolveStatusPatch(eventType, email.status, payload);

    await this.prisma.$transaction([
      this.prisma.outboundEmailEvent.create({
        data: {
          outboundEmailId: email.id,
          eventType,
          payload: payload as object,
          webhookIdempotencyKey: webhookIdempotencyKey ?? null,
        },
      }),
      ...(statusPatch
        ? [
            this.prisma.outboundEmail.update({
              where: { id: email.id },
              data: statusPatch,
            }),
          ]
        : []),
    ]);

    return email.id;
  }

  private resolveStatusPatch(
    eventType: OutboundEmailEventType,
    currentStatus: OutboundEmailStatus,
    payload?: Record<string, unknown>,
  ): {
    status?: OutboundEmailStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
  } | null {
    switch (eventType) {
      case OutboundEmailEventType.BOUNCED:
        return {
          status: OutboundEmailStatus.FAILED,
          errorCode: 'BOUNCED',
          errorMessage: this.extractWebhookErrorMessage(payload) ?? 'Email bounced',
        };
      case OutboundEmailEventType.COMPLAINED:
        return {
          status: OutboundEmailStatus.FAILED,
          errorCode: 'COMPLAINED',
          errorMessage: 'Recipient marked email as spam',
        };
      case OutboundEmailEventType.DELIVERED:
        if (currentStatus === OutboundEmailStatus.SENDING) {
          return { status: OutboundEmailStatus.SENT };
        }
        return null;
      default:
        return null;
    }
  }

  private extractWebhookErrorMessage(payload?: Record<string, unknown>): string | null {
    if (!payload) return null;
    const bounce = payload.bounce as { message?: string } | undefined;
    if (bounce?.message?.trim()) return bounce.message.trim();
    const message = payload.message;
    return typeof message === 'string' && message.trim() ? message.trim() : null;
  }

  toDto(row: {
    id: string;
    organizationId: string;
    bookingId: string | null;
    customerId: string | null;
    invoiceId: string | null;
    sourceType: OutboundEmailSourceType;
    status: OutboundEmailStatus;
    fromEmail: string;
    fromName: string | null;
    replyToEmail: string | null;
    toEmail: string;
    ccEmails: string[];
    bccEmails: string[];
    subject: string;
    bodyText: string | null;
    bodyHtml: string | null;
    provider: string | null;
    providerMessageId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    sentByUserId: string | null;
    sentAt: Date | null;
    createdAt: Date;
    attachments: Array<{
      id: string;
      generatedDocumentId: string | null;
      fileName: string;
      mimeType: string;
      sizeBytes: number | null;
      documentType: string | null;
    }>;
    events: Array<{
      id: string;
      eventType: OutboundEmailEventType;
      occurredAt: Date;
      payload: unknown;
    }>;
  }): OutboundEmailDto {
    return {
      id: row.id,
      organizationId: row.organizationId,
      bookingId: row.bookingId,
      customerId: row.customerId,
      invoiceId: row.invoiceId,
      sourceType: row.sourceType,
      status: row.status,
      fromEmail: row.fromEmail,
      fromName: row.fromName,
      replyToEmail: row.replyToEmail,
      toEmail: row.toEmail,
      ccEmails: row.ccEmails,
      bccEmails: row.bccEmails,
      subject: row.subject,
      bodyText: row.bodyText,
      bodyHtml: row.bodyHtml,
      provider: row.provider,
      providerMessageId: row.providerMessageId,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      sentByUserId: row.sentByUserId,
      sentAt: row.sentAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      attachments: row.attachments.map((a) => ({
        id: a.id,
        generatedDocumentId: a.generatedDocumentId,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        documentType: a.documentType,
      })),
      events: row.events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        occurredAt: e.occurredAt.toISOString(),
        payload: e.payload,
      })),
    };
  }
}
