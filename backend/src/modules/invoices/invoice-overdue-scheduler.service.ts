import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@shared/database/prisma.service';
import { InvoicePaymentTaskService } from './invoice-payment-task.service';
import { WorkflowEventOutboxEmitterService } from '@modules/workflows/outbox/workflow-event-outbox-emitter.service';
import { buildInvoiceTimingOccurrenceId } from '@modules/workflows/outbox/workflow-event-occurrence.util';

/**
 * Persists overdue invoice status so eligibility queries and notifications
 * align with list UI overdue semantics (not only read-time computation).
 */
@Injectable()
export class InvoiceOverdueSchedulerService {
  private readonly logger = new Logger(InvoiceOverdueSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicePaymentTasks: InvoicePaymentTaskService,
    private readonly workflowEmitter: WorkflowEventOutboxEmitterService,
  ) {}

  /** Daily at 01:15 UTC — transition open invoices past due date to OVERDUE. */
  @Cron('15 1 * * *')
  async markOverdueInvoices(): Promise<void> {
    const now = new Date();
    const candidates = await this.prisma.orgInvoice.findMany({
      where: {
        dueDate: { lt: now },
        outstandingCents: { gt: 0 },
        status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID'] },
      },
      select: {
        id: true,
        organizationId: true,
        dueDate: true,
        outstandingCents: true,
        bookingId: true,
        customerId: true,
      },
      take: 500,
    });

    let marked = 0;
    for (const invoice of candidates) {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.orgInvoice.updateMany({
          where: {
            id: invoice.id,
            status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID'] },
          },
          data: { status: 'OVERDUE' },
        });
        if (updated.count === 0) return;

        const dueAt = invoice.dueDate?.toISOString() ?? now.toISOString();
        const daysOverdue = invoice.dueDate
          ? Math.max(0, Math.floor((now.getTime() - invoice.dueDate.getTime()) / 86_400_000))
          : 0;
        const dueDateOnly = dueAt.slice(0, 10);

        await this.workflowEmitter.enqueueInTransaction(tx, {
          group: 'billing',
          organizationId: invoice.organizationId,
          eventType: 'invoice.overdue',
          source: 'billing',
          entityType: 'invoice',
          entityId: invoice.id,
          correlationId: `billing-invoice:${invoice.id}`,
          occurrenceId: buildInvoiceTimingOccurrenceId('invoice.overdue', invoice.id, dueDateOnly),
          payload: {
            invoiceId: invoice.id,
            dueAt,
            daysOverdue,
            amountCents: invoice.outstandingCents,
            ...(invoice.bookingId ? { bookingId: invoice.bookingId } : {}),
            ...(invoice.customerId ? { customerId: invoice.customerId } : {}),
          },
        });
        marked += 1;
      });
    }

    if (marked > 0) {
      this.logger.log(`Marked ${marked} invoice(s) as OVERDUE with workflow outbox events`);
      await this.invoicePaymentTasks.refreshOpenPaymentCheckTasks({ now });
    }
  }

  /** Revert OVERDUE when fully paid (safety net after manual payment sync). */
  @Cron('45 1 * * *')
  async reconcileStaleOverdue(): Promise<void> {
    const result = await this.prisma.orgInvoice.updateMany({
      where: {
        status: 'OVERDUE',
        outstandingCents: { lte: 0 },
      },
      data: { status: 'PAID' },
    });
    if (result.count > 0) {
      this.logger.log(`Reconciled ${result.count} fully paid OVERDUE invoice(s) to PAID`);
    }
  }

  /** Hourly refresh of open payment-check task timing/priority (due-today escalation). */
  @Cron('15 * * * *')
  async refreshOpenPaymentCheckTasks(): Promise<void> {
    const count = await this.invoicePaymentTasks.refreshOpenPaymentCheckTasks();
    if (count > 0) {
      this.logger.log(`Refreshed ${count} invoice payment-check task(s)`);
    }
  }
}
