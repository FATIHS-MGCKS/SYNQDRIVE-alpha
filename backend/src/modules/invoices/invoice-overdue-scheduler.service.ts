import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@shared/database/prisma.service';
import { InvoicePaymentTaskService } from './invoice-payment-task.service';
import { InvoiceOperationalNotificationService } from './invoice-operational-notification.service';

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
    @Optional()
    private readonly invoiceNotifications?: InvoiceOperationalNotificationService,
  ) {}

  /** Daily at 01:15 UTC — transition open invoices past due date to OVERDUE. */
  @Cron('15 1 * * *')
  async markOverdueInvoices(): Promise<void> {
    const now = new Date();
    const overdueCandidates = await this.prisma.orgInvoice.findMany({
      where: {
        dueDate: { lt: now },
        outstandingCents: { gt: 0 },
        status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID'] },
      },
      select: { id: true, organizationId: true },
    });

    if (overdueCandidates.length === 0) return;

    const result = await this.prisma.orgInvoice.updateMany({
      where: { id: { in: overdueCandidates.map((row) => row.id) } },
      data: { status: 'OVERDUE' },
    });

    this.logger.log(`Marked ${result.count} invoice(s) as OVERDUE`);
    await this.invoicePaymentTasks.refreshOpenPaymentCheckTasks({ now });

    for (const row of overdueCandidates) {
      await this.invoiceNotifications
        ?.syncOverdueInvoice(row.organizationId, row.id)
        .catch((err) => {
          this.logger.warn(
            `Overdue notification sync failed for invoice ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
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
