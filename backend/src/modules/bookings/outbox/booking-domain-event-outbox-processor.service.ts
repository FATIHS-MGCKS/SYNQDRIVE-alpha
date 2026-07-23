import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import bookingDomainEventOutboxConfig from '@config/booking-domain-event-outbox.config';
import { BookingDomainEventOutboxRepository } from './booking-domain-event-outbox.repository';
import { BookingDomainEventConsumerRouterService } from './consumers/booking-domain-event-consumer-router.service';
import { BookingPreparationStateService } from '../preparation/booking-preparation-state.service';
import { BookingDomainEventOutboxObservabilityService } from './booking-domain-event-outbox-observability.service';

@Injectable()
export class BookingDomainEventOutboxProcessorService {
  constructor(
    @Inject(bookingDomainEventOutboxConfig.KEY)
    private readonly config: ConfigType<typeof bookingDomainEventOutboxConfig>,
    private readonly outboxRepo: BookingDomainEventOutboxRepository,
    private readonly consumerRouter: BookingDomainEventConsumerRouterService,
    private readonly preparationState: BookingPreparationStateService,
    private readonly observability: BookingDomainEventOutboxObservabilityService,
  ) {}

  async processOutboxId(
    outboxId: string,
    workerId: string,
  ): Promise<'published' | 'retry' | 'dead_letter' | 'skipped'> {
    const started = Date.now();
    const claimed = await this.outboxRepo.claimForProcessing(outboxId, workerId);
    if (!claimed) return 'skipped';

    this.observability.logProcessStarted(claimed);

    try {
      await this.consumerRouter.processAllConsumers(claimed);
      await this.preparationState.reconcile(claimed.organizationId, claimed.aggregateId);
      await this.outboxRepo.markPublished(claimed.id);
      this.observability.recordPublished(claimed.eventType);
      this.observability.observeProcessingDuration((Date.now() - started) / 1000);
      this.observability.logCompleted(claimed);
      return 'published';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const result = await this.outboxRepo.markRetry(claimed.id, message);
      if (result.outcome === 'dead_letter') {
        this.observability.recordDeadLetter(claimed.eventType, message);
        this.observability.logDeadLetter(claimed, message);
        return 'dead_letter';
      }
      this.observability.recordRetry(claimed.eventType);
      this.observability.logRetry(claimed, message);
      return 'retry';
    }
  }
}
