import { Injectable, NotFoundException } from '@nestjs/common';
import {
  OutboundEmailDeliveryStatus,
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
import { sanitizeOutboundErrorMessage } from './outbound-email-audit.util';
import { resolveWebhookStatusPatch } from './outbound-email-status.transitions';

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
  generatedDocumentId: string | null;
  documentVersionNumber: number | null;
  sourceType: OutboundEmailSourceType;
  status: OutboundEmailStatus;
  deliveryStatus: OutboundEmailDeliveryStatus;
  fromEmail: string;
  fromName: string | null;
  replyToEmail: string | null;
  toEmail: string;
  ccEmails: string[];
  bccEmails: string[];
  subject: string;
  provider: string | null;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  sentByUserId: string | null;
  requestedAt: string;
  acceptedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  idempotencyKey: string | null;
  correlationId: string | null;
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
    params: PaginationParams & {
      bookingId?: string;
      customerId?: string;
      invoiceId?: string;
    },
  ) {
    const { skip, take } = parsePagination(params);
    const where = {
      organizationId: orgId,
      ...(params.bookingId ? { bookingId: params.bookingId } : {}),
      ...(params.customerId ? { customerId: params.customerId } : {}),
      ...(params.invoiceId ? { invoiceId: params.invoiceId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.outboundEmail.findMany({
        where,
        include: { attachments: true, events: { orderBy: { occurredAt: 'asc' } } },
        orderBy: { requestedAt: 'desc' },
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
  ) {
    const email = await this.prisma.outboundEmail.findFirst({
      where: { providerMessageId },
    });
    if (!email) return null;

    const duplicate = await this.prisma.outboundEmailEvent.findFirst({
      where: { outboundEmailId: email.id, eventType },
    });
    if (duplicate) return email.id;

    const statusPatch = resolveWebhookStatusPatch(
      eventType,
      {
        status: email.status,
        deliveryStatus: email.deliveryStatus,
        acceptedAt: email.acceptedAt,
        sentAt: email.sentAt,
      },
      payload,
    );

    await this.prisma.$transaction([
      this.prisma.outboundEmailEvent.create({
        data: {
          outboundEmailId: email.id,
          eventType,
          payload: payload as object,
        },
      }),
      ...(statusPatch
        ? [
            this.prisma.outboundEmail.update({
              where: { id: email.id },
              data: {
                ...statusPatch,
                errorMessage: sanitizeOutboundErrorMessage(statusPatch.errorMessage),
              },
            }),
          ]
        : []),
    ]);

    return email.id;
  }

  toDto(row: {
    id: string;
    organizationId: string;
    bookingId: string | null;
    customerId: string | null;
    invoiceId: string | null;
    generatedDocumentId?: string | null;
    documentVersionNumber?: number | null;
    sourceType: OutboundEmailSourceType;
    status: OutboundEmailStatus;
    deliveryStatus: OutboundEmailDeliveryStatus;
    fromEmail: string;
    fromName: string | null;
    replyToEmail: string | null;
    toEmail: string;
    ccEmails: string[];
    bccEmails: string[];
    subject: string;
    bodyText?: string | null;
    bodyHtml?: string | null;
    provider: string | null;
    providerMessageId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    sentByUserId: string | null;
    requestedAt: Date;
    acceptedAt: Date | null;
    sentAt: Date | null;
    deliveredAt: Date | null;
    failedAt: Date | null;
    idempotencyKey: string | null;
    correlationId: string | null;
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
      generatedDocumentId: row.generatedDocumentId ?? null,
      documentVersionNumber: row.documentVersionNumber ?? null,
      sourceType: row.sourceType,
      status: row.status,
      deliveryStatus: row.deliveryStatus,
      fromEmail: row.fromEmail,
      fromName: row.fromName,
      replyToEmail: row.replyToEmail,
      toEmail: row.toEmail,
      ccEmails: row.ccEmails,
      bccEmails: row.bccEmails,
      subject: row.subject,
      provider: row.provider,
      providerMessageId: row.providerMessageId,
      errorCode: row.errorCode,
      errorMessage: sanitizeOutboundErrorMessage(row.errorMessage),
      sentByUserId: row.sentByUserId,
      requestedAt: row.requestedAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      sentAt: row.sentAt?.toISOString() ?? null,
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      failedAt: row.failedAt?.toISOString() ?? null,
      idempotencyKey: row.idempotencyKey,
      correlationId: row.correlationId,
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
