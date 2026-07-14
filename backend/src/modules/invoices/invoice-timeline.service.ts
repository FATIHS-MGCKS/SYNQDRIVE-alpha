import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityEntity } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { userDisplayName } from './invoice-documents.labels';
import { buildInvoiceTimeline, type InvoiceTimelineBuildInput } from './invoice-timeline.builder';
import type { InvoiceTimelineDto } from './invoice-timeline.types';

@Injectable()
export class InvoiceTimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generatedDocs: GeneratedDocumentsService,
  ) {}

  async getTimeline(orgId: string, invoiceId: string): Promise<InvoiceTimelineDto> {
    const invoice = await this.prisma.orgInvoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
      include: {
        payments: {
          orderBy: { paidAt: 'asc' },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const [org, documents, emailRows, activityLogs] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { timezone: true },
      }),
      this.generatedDocs.listForInvoice(
        orgId,
        invoiceId,
        invoice.bookingId,
        invoice.generatedDocumentId,
      ),
      this.loadEmails(orgId, invoiceId),
      this.loadActivityLogs(orgId, invoiceId),
    ]);

    const userIds = new Set<string>();
    for (const payment of invoice.payments) {
      if (payment.createdByUserId) userIds.add(payment.createdByUserId);
    }
    for (const doc of documents) {
      if (doc.generatedByUserId) userIds.add(doc.generatedByUserId);
    }
    for (const email of emailRows) {
      if (email.sentByUserId) userIds.add(email.sentByUserId);
    }

    const users = userIds.size
      ? await this.prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, name: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const emails = emailRows.map((row, index) => ({
      id: row.id,
      toEmail: row.toEmail,
      status: row.status,
      createdAt: row.createdAt,
      sentAt: row.sentAt,
      errorMessage: row.errorMessage,
      sentByName: row.sentByUserId ? userDisplayName(userMap.get(row.sentByUserId)) : null,
      isRetry:
        index > 0 &&
        emailRows.slice(0, index).some((prev) => prev.status === 'FAILED'),
      events: row.events,
      attachmentFileName: row.attachmentFileName,
    }));

    const input: InvoiceTimelineBuildInput = {
      invoice: {
        id: invoice.id,
        type: invoice.type,
        status: invoice.status,
        currency: invoice.currency,
        totalCents: invoice.totalCents,
        paidCents: invoice.paidCents,
        invoiceNumberDisplay: invoice.invoiceNumberDisplay,
        sequenceNumber: invoice.sequenceNumber,
        createdAt: invoice.createdAt,
        issuedAt: invoice.issuedAt,
        sentAt: invoice.sentAt,
        paidAt: invoice.paidAt,
        dueDate: invoice.dueDate,
        cancelledAt: invoice.cancelledAt,
        voidedAt: invoice.voidedAt,
        creditedAt: invoice.creditedAt,
      },
      payments: invoice.payments.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        method: p.method,
        paidAt: p.paidAt,
        reference: p.reference,
        note: p.note,
        createdByUserId: p.createdByUserId,
        createdByName: p.createdByUserId ? userDisplayName(userMap.get(p.createdByUserId)) : null,
      })),
      documents: documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        status: d.status,
        generatedAt: d.generatedAt,
        createdAt: d.createdAt,
        voidedAt: d.voidedAt,
        generatedByName: d.generatedByUserId ? userDisplayName(userMap.get(d.generatedByUserId)) : null,
      })),
      emails,
      activityLogs: activityLogs.map((log) => ({
        id: log.id,
        action: log.action,
        description: log.description,
        changeSummary: log.changeSummary,
        createdAt: log.createdAt,
        userName: log.user ? userDisplayName(log.user) : null,
        metaJson: (log.metaJson as Record<string, unknown> | null) ?? null,
      })),
      timezone: org?.timezone?.trim() || 'Europe/Berlin',
    };

    return buildInvoiceTimeline(input);
  }

  private async loadEmails(orgId: string, invoiceId: string) {
    const rows = await this.prisma.outboundEmail.findMany({
      where: { organizationId: orgId, invoiceId },
      orderBy: { createdAt: 'asc' },
      include: {
        events: { orderBy: { occurredAt: 'asc' } },
        attachments: { take: 1 },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      toEmail: row.toEmail,
      status: row.status,
      createdAt: row.createdAt,
      sentAt: row.sentAt,
      errorMessage: row.errorMessage,
      sentByUserId: row.sentByUserId,
      events: row.events.map((e) => ({ eventType: e.eventType, occurredAt: e.occurredAt })),
      attachmentFileName: row.attachments[0]?.fileName ?? null,
    }));
  }

  private async loadActivityLogs(orgId: string, invoiceId: string) {
    return this.prisma.activityLog.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { entity: ActivityEntity.INVOICE, entityId: invoiceId },
          { metaJson: { path: ['invoiceId'], equals: invoiceId } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        user: {
          select: { name: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }
}
