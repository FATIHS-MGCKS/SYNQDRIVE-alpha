import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@shared/database/prisma.service';
import { InvoicePaymentTaskService } from './invoice-payment-task.service';

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
  ) {}

  /** Daily at 01:15 UTC — transition open invoices past due date to OVERDUE. */
  @Cron('15 1 * * *')
  async markOverdueInvoices(): Promise<void> {
    const now = new Date();
    const result = await this.prisma.orgInvoice.updateMany({
      where: {
        dueDate: { lt: now },
        outstandingCents: { gt: 0 },
        status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID'] },
      },
      data: { status: 'OVERDUE' },
    });
    if (result.count > 0) {
      this.logger.log(`Marked ${result.count} invoice(s) as OVERDUE`);
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
