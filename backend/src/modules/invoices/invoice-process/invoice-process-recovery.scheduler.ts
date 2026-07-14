import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import invoiceProcessConfig from '@config/invoice-process.config';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { InvoiceProcessOutboxService } from './invoice-process-outbox.service';
import { InvoiceProcessProcessorService } from './invoice-process-processor.service';
import { InvoiceProcessRepository } from './invoice-process.repository';

@Injectable()
export class InvoiceProcessRecoveryScheduler {
  private readonly logger = new Logger(InvoiceProcessRecoveryScheduler.name);
  private running = false;

  constructor(
    @Inject(invoiceProcessConfig.KEY)
    private readonly config: ConfigType<typeof invoiceProcessConfig>,
    private readonly repo: InvoiceProcessRepository,
    private readonly processor: InvoiceProcessProcessorService,
    private readonly outbox: InvoiceProcessOutboxService,
  ) {}

  @Interval(60_000)
  async pollDueProcesses(): Promise<void> {
    if (!RuntimeStatusRegistry.getWorkersEnabled()) return;
    if (!this.outbox.isEnabled()) return;
    if (this.running) return;

    this.running = true;
    try {
      const due = await this.repo.findDueBatch(this.config.pollBatchSize);
      if (due.length === 0) return;

      let completed = 0;
      let retry = 0;
      let manual = 0;

      for (const row of due) {
        const outcome = await this.processor.processById(row.id, row.organizationId);
        if (outcome === 'completed') completed += 1;
        if (outcome === 'retry') retry += 1;
        if (outcome === 'manual_review') manual += 1;
      }

      if (completed > 0 || retry > 0 || manual > 0) {
        this.logger.log(
          `Invoice process recovery batch=${due.length} completed=${completed} retry=${retry} manual=${manual}`,
        );
      }
    } finally {
      this.running = false;
    }
  }
}
