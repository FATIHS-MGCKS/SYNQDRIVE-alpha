import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigType } from '@nestjs/config';
import bookingDomainEventOutboxConfig from '@config/booking-domain-event-outbox.config';
import { BookingDomainEventOutboxRepository } from './booking-domain-event-outbox.repository';

@Injectable()
export class BookingDomainEventOutboxRetentionService {
  private readonly logger = new Logger(BookingDomainEventOutboxRetentionService.name);

  constructor(
    @Inject(bookingDomainEventOutboxConfig.KEY)
    private readonly config: ConfigType<typeof bookingDomainEventOutboxConfig>,
    private readonly outboxRepo: BookingDomainEventOutboxRepository,
  ) {}

  @Cron('15 3 * * *')
  async purgePublishedEvents(): Promise<void> {
    if (!this.config.enabled) return;
    const cutoff = new Date(
      Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000,
    );
    const result = await this.outboxRepo.deletePublishedOlderThan(cutoff);
    if (result.count > 0) {
      this.logger.log(
        `Purged ${result.count} published booking domain events older than ${cutoff.toISOString()}`,
      );
    }
  }
}
