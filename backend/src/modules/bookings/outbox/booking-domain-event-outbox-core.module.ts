import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { ObservabilityModule } from '@modules/observability/observability.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import bookingDomainEventOutboxConfig from '@config/booking-domain-event-outbox.config';
import { BookingDomainEventOutboxRepository } from './booking-domain-event-outbox.repository';
import { BookingDomainEventLifecycleService } from './booking-domain-event-lifecycle.service';
import { BookingDomainEventOutboxSchedulerService } from './booking-domain-event-outbox-scheduler.service';
import { BookingDomainEventOutboxObservabilityService } from './booking-domain-event-outbox-observability.service';
import { BookingDomainEventOutboxRetentionService } from './booking-domain-event-outbox-retention.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule.forFeature(bookingDomainEventOutboxConfig),
    ObservabilityModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.BOOKING_DOMAIN_EVENTS }),
  ],
  providers: [
    BookingDomainEventOutboxRepository,
    BookingDomainEventLifecycleService,
    BookingDomainEventOutboxObservabilityService,
    BookingDomainEventOutboxSchedulerService,
    BookingDomainEventOutboxRetentionService,
  ],
  exports: [
    BookingDomainEventOutboxRepository,
    BookingDomainEventLifecycleService,
    BookingDomainEventOutboxSchedulerService,
    BookingDomainEventOutboxObservabilityService,
  ],
})
export class BookingDomainEventOutboxCoreModule {}
