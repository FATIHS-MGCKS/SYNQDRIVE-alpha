import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { BillingDomainEventOutboxProcessorService } from './billing-domain-event-outbox.processor.service';
import { BILLING_OUTBOX_WORKER_INTERVAL_MS } from './domain/billing-outbox';

@Injectable()
export class BillingDomainEventOutboxWorkerService {
  private readonly logger = new Logger(BillingDomainEventOutboxWorkerService.name);
  private running = false;

  constructor(private readonly processor: BillingDomainEventOutboxProcessorService) {}

  @Interval(BILLING_OUTBOX_WORKER_INTERVAL_MS)
  async runScheduled(): Promise<void> {
    if (!RuntimeStatusRegistry.getWorkersEnabled()) {
      return;
    }
    await this.runOnce(`scheduler:${randomUUID()}`);
  }

  async runOnce(workerId: string) {
    if (this.running) {
      return { processed: 0, skipped: true as const };
    }

    this.running = true;
    try {
      const results = await this.processor.processPendingBatch(workerId);
      const delivered = results.filter((row) => row.outcome === 'delivered').length;
      const retried = results.filter((row) => row.outcome === 'retry').length;
      const deadLetter = results.filter((row) => row.outcome === 'dead_letter').length;
      if (delivered > 0 || retried > 0 || deadLetter > 0) {
        this.logger.log(
          `Billing outbox worker ${workerId}: delivered=${delivered} retry=${retried} deadLetter=${deadLetter}`,
        );
      }
      return { processed: results.length, skipped: false as const, results };
    } finally {
      this.running = false;
    }
  }
}
