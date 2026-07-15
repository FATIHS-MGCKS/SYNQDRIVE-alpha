import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { BILLING_OUTBOX_WORKER_INTERVAL_MS } from '../domain/billing-outbox';
import { BillingDomainEventEmailProcessorService } from './billing-domain-event-email.processor.service';

@Injectable()
export class BillingDomainEventEmailWorkerService {
  private readonly logger = new Logger(BillingDomainEventEmailWorkerService.name);
  private running = false;

  constructor(private readonly processor: BillingDomainEventEmailProcessorService) {}

  @Interval(BILLING_OUTBOX_WORKER_INTERVAL_MS)
  async runScheduled(): Promise<void> {
    if (!RuntimeStatusRegistry.getWorkersEnabled()) {
      return;
    }
    await this.runOnce(`billing-email:${randomUUID()}`);
  }

  async runOnce(workerId: string) {
    if (this.running) {
      return { processed: 0, skipped: true as const };
    }

    this.running = true;
    try {
      const results = await this.processor.processPendingBatch(workerId);
      const delivered = results.filter((row) => row.outcome === 'delivered').length;
      const skipped = results.filter((row) => row.outcome === 'skipped').length;
      const retried = results.filter((row) => row.outcome === 'retry').length;
      const deadLetter = results.filter((row) => row.outcome === 'dead_letter').length;
      if (delivered > 0 || skipped > 0 || retried > 0 || deadLetter > 0) {
        this.logger.log(
          `Billing email worker ${workerId}: delivered=${delivered} skipped=${skipped} retry=${retried} deadLetter=${deadLetter}`,
        );
      }
      return { processed: results.length, skipped: false as const, results };
    } finally {
      this.running = false;
    }
  }
}
