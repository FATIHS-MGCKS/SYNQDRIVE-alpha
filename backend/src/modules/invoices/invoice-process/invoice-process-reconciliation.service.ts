import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import {
  OrgInvoiceProcessEntityType,
  OrgInvoiceProcessType,
  OutboundEmailStatus,
  Prisma,
} from '@prisma/client';
import { BUNDLE_STATUS, DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import invoiceProcessConfig from '@config/invoice-process.config';
import { PrismaService } from '@shared/database/prisma.service';
import { buildProcessIdempotencyKey } from './invoice-process-backoff.util';
import { InvoiceProcessOutboxService } from './invoice-process-outbox.service';
import type { InvoiceProcessReconciliationReport } from './invoice-process.types';

@Injectable()
export class InvoiceProcessReconciliationService {
  private readonly logger = new Logger(InvoiceProcessReconciliationService.name);

  constructor(
    @Inject(invoiceProcessConfig.KEY)
    private readonly config: ConfigType<typeof invoiceProcessConfig>,
    private readonly prisma: PrismaService,
    private readonly outbox: InvoiceProcessOutboxService,
  ) {}

  async runForOrganization(
    organizationId: string,
  ): Promise<InvoiceProcessReconciliationReport> {
    const findings: InvoiceProcessReconciliationReport['findings'] = [];
    let processesEnqueued = 0;

    const enqueue = async (
      kind: string,
      processType: OrgInvoiceProcessType,
      entityType: OrgInvoiceProcessEntityType,
      entityId: string,
      message: string,
      payload?: Record<string, unknown>,
    ) => {
      findings.push({ kind, entityType, entityId, message });
      const row = await this.outbox.enqueue({
        organizationId,
        processType,
        entityType,
        entityId,
        idempotencyKey: buildProcessIdempotencyKey(
          processType,
          entityType,
          entityId,
          `reconcile:${kind}`,
        ),
        payloadJson: payload as Prisma.InputJsonValue | undefined,
      });
      if (row) processesEnqueued += 1;
    };

    await this.findBookingsWithoutInvoice(organizationId, enqueue);
    await this.findInvoicesWithoutDocument(organizationId, enqueue);
    await this.findDocumentsWithoutInvoiceLink(organizationId, enqueue);
    await this.findStuckOutboundEmails(organizationId, enqueue);
    await this.findPaymentTotalMismatches(organizationId, enqueue);
    await this.findPaidInvoicesWithOpenTasks(organizationId, enqueue);

    if (findings.length > 0) {
      this.logger.warn(
        `Invoice reconciliation org=${organizationId} findings=${findings.length} enqueued=${processesEnqueued}`,
      );
    }

    return {
      organizationId,
      findingsCount: findings.length,
      processesEnqueued,
      findings,
    };
  }

  async runGlobal(): Promise<InvoiceProcessReconciliationReport> {
    const orgs = await this.prisma.organization.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
      take: 50,
    });

    const merged: InvoiceProcessReconciliationReport = {
      organizationId: null,
      findingsCount: 0,
      processesEnqueued: 0,
      findings: [],
    };

    for (const org of orgs) {
      const report = await this.runForOrganization(org.id);
      merged.findingsCount += report.findingsCount;
      merged.processesEnqueued += report.processesEnqueued;
      merged.findings.push(...report.findings);
    }

    return merged;
  }

  private async findBookingsWithoutInvoice(
    orgId: string,
    enqueue: (
      kind: string,
      processType: OrgInvoiceProcessType,
      entityType: OrgInvoiceProcessEntityType,
      entityId: string,
      message: string,
      payload?: Record<string, unknown>,
    ) => Promise<void>,
  ) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['CONFIRMED', 'ACTIVE', 'COMPLETED', 'PENDING'] },
      },
      select: { id: true },
      take: 100,
    });

    for (const booking of bookings) {
      const invoice = await this.prisma.orgInvoice.findFirst({
        where: {
          organizationId: orgId,
          bookingId: booking.id,
          type: 'OUTGOING_BOOKING',
          status: { notIn: ['VOID', 'CANCELLED', 'CREDITED'] },
        },
      });
      if (!invoice) {
        await enqueue(
          'booking_without_invoice',
          OrgInvoiceProcessType.BOOKING_INVOICE_CREATE,
          OrgInvoiceProcessEntityType.BOOKING,
          booking.id,
          'Buchung ohne erwartete Rechnung',
        );
      }
    }
  }

  private async findInvoicesWithoutDocument(
    orgId: string,
    enqueue: (
      kind: string,
      processType: OrgInvoiceProcessType,
      entityType: OrgInvoiceProcessEntityType,
      entityId: string,
      message: string,
      payload?: Record<string, unknown>,
    ) => Promise<void>,
  ) {
    const bundles = await this.prisma.bookingDocumentBundle.findMany({
      where: {
        organizationId: orgId,
        status: BUNDLE_STATUS.COMPLETE,
        bookingInvoiceDocumentId: null,
      },
      select: { bookingId: true },
      take: 50,
    });

    for (const bundle of bundles) {
      const invoice = await this.prisma.orgInvoice.findFirst({
        where: {
          organizationId: orgId,
          bookingId: bundle.bookingId,
          type: 'OUTGOING_BOOKING',
          status: { notIn: ['VOID', 'CANCELLED', 'CREDITED', 'DRAFT'] },
        },
      });
      if (invoice) {
        await enqueue(
          'invoice_without_document',
          OrgInvoiceProcessType.INVOICE_DOCUMENT_GENERATE,
          OrgInvoiceProcessEntityType.BOOKING,
          bundle.bookingId,
          'Rechnung ohne Dokument trotz abgeschlossenem Bundle',
          { bookingId: bundle.bookingId, documentType: DOCUMENT_TYPE.BOOKING_INVOICE },
        );
      }
    }
  }

  private async findDocumentsWithoutInvoiceLink(
    orgId: string,
    enqueue: (
      kind: string,
      processType: OrgInvoiceProcessType,
      entityType: OrgInvoiceProcessEntityType,
      entityId: string,
      message: string,
      payload?: Record<string, unknown>,
    ) => Promise<void>,
  ) {
    const docs = await this.prisma.generatedDocument.findMany({
      where: {
        organizationId: orgId,
        documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
        invoiceId: null,
        bookingId: { not: null },
        status: { not: 'VOID' },
      },
      select: { id: true, bookingId: true },
      take: 50,
    });

    for (const doc of docs) {
      await enqueue(
        'document_without_invoice_pointer',
        OrgInvoiceProcessType.INVOICE_DOCUMENT_LINK,
        OrgInvoiceProcessEntityType.DOCUMENT,
        doc.id,
        'Dokument ohne Rechnungspointer',
        { documentId: doc.id, bookingId: doc.bookingId },
      );
    }
  }

  private async findStuckOutboundEmails(
    orgId: string,
    enqueue: (
      kind: string,
      processType: OrgInvoiceProcessType,
      entityType: OrgInvoiceProcessEntityType,
      entityId: string,
      message: string,
      payload?: Record<string, unknown>,
    ) => Promise<void>,
  ) {
    const threshold = new Date(
      Date.now() - this.config.emailStuckSendingMinutes * 60_000,
    );
    const emails = await this.prisma.outboundEmail.findMany({
      where: {
        organizationId: orgId,
        status: OutboundEmailStatus.SENDING,
        updatedAt: { lt: threshold },
        invoiceId: { not: null },
      },
      select: { id: true },
      take: 25,
    });

    for (const email of emails) {
      await enqueue(
        'email_stuck_sending',
        OrgInvoiceProcessType.PROVIDER_STATUS_SYNC,
        OrgInvoiceProcessEntityType.OUTBOUND_EMAIL,
        email.id,
        'E-Mail-Versand hängt in SENDING',
      );
    }
  }

  private async findPaymentTotalMismatches(
    orgId: string,
    enqueue: (
      kind: string,
      processType: OrgInvoiceProcessType,
      entityType: OrgInvoiceProcessEntityType,
      entityId: string,
      message: string,
      payload?: Record<string, unknown>,
    ) => Promise<void>,
  ) {
    const invoices = await this.prisma.orgInvoice.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] },
        payments: { some: {} },
      },
      include: { payments: true },
      take: 100,
    });

    for (const invoice of invoices) {
      const paidSum = (invoice.payments ?? []).reduce((s, p) => s + p.amountCents, 0);
      if (paidSum !== invoice.paidCents) {
        await enqueue(
          'payment_total_mismatch',
          OrgInvoiceProcessType.PAYMENT_SYNC,
          OrgInvoiceProcessEntityType.INVOICE,
          invoice.id,
          'Zahlung vorhanden, Rechnungssumme nicht aktualisiert',
        );
      }
    }
  }

  private async findPaidInvoicesWithOpenTasks(
    orgId: string,
    enqueue: (
      kind: string,
      processType: OrgInvoiceProcessType,
      entityType: OrgInvoiceProcessEntityType,
      entityId: string,
      message: string,
      payload?: Record<string, unknown>,
    ) => Promise<void>,
  ) {
    const invoices = await this.prisma.orgInvoice.findMany({
      where: {
        organizationId: orgId,
        status: 'PAID',
        tasks: { some: { status: { not: 'DONE' } } },
      },
      select: { id: true },
      take: 50,
    });

    for (const invoice of invoices) {
      await enqueue(
        'paid_invoice_open_task',
        OrgInvoiceProcessType.LINKED_TASK_UPDATE,
        OrgInvoiceProcessEntityType.INVOICE,
        invoice.id,
        'Bezahlte Rechnung mit offener Zahlungsaufgabe',
      );
    }
  }
}
