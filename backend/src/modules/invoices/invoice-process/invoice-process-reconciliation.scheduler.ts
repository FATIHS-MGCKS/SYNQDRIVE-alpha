import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import invoiceProcessConfig from '@config/invoice-process.config';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { InvoiceProcessOutboxService } from './invoice-process-outbox.service';
import { InvoiceProcessReconciliationService } from './invoice-process-reconciliation.service';

@Injectable()
export class InvoiceProcessReconciliationScheduler {
  private readonly logger = new Logger(InvoiceProcessReconciliationScheduler.name);
  private running = false;

  constructor(
    @Inject(invoiceProcessConfig.KEY)
    private readonly config: ConfigType<typeof invoiceProcessConfig>,
    private readonly reconciliation: InvoiceProcessReconciliationService,
    private readonly outbox: InvoiceProcessOutboxService,
  ) {}

  @Interval(15 * 60_000)
  async runPeriodicReconciliation(): Promise<void> {
    if (!RuntimeStatusRegistry.getWorkersEnabled()) return;
    if (!this.outbox.isEnabled()) return;
    if (this.running) return;

    this.running = true;
    try {
      const report = await this.reconciliation.runGlobal();
      if (report.findingsCount > 0) {
        this.logger.warn(
          `Invoice reconciliation findings=${report.findingsCount} enqueued=${report.processesEnqueued}`,
        );
      }
    } finally {
      this.running = false;
    }
  }
}
