import { Module } from '@nestjs/common';
import { WorkflowsModule } from '@modules/workflows/workflows.module';
import { BookingDomainEventOutboxCoreModule } from './booking-domain-event-outbox-core.module';
import { BookingDomainEventConsumerService } from './booking-domain-event-consumer.service';
import { BookingDomainEventOutboxProcessorService } from './booking-domain-event-outbox-processor.service';

@Module({
  imports: [BookingDomainEventOutboxCoreModule, WorkflowsModule],
  providers: [BookingDomainEventConsumerService, BookingDomainEventOutboxProcessorService],
  exports: [
    BookingDomainEventOutboxCoreModule,
    BookingDomainEventConsumerService,
    BookingDomainEventOutboxProcessorService,
  ],
})
export class BookingDomainEventOutboxModule {}
