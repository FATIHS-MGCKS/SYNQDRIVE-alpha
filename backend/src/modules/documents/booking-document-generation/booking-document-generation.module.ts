import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { DocumentsModule } from '../documents.module';
import { BookingDocumentGenerationRepository } from './booking-document-generation.repository';
import { BookingDocumentGenerationDispatcherService } from './booking-document-generation.dispatcher.service';
import { BookingDocumentGenerationProcessorService } from './booking-document-generation.processor.service';
import { BookingDocumentGenerationRecoveryScheduler } from './booking-document-generation.recovery.scheduler';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.BOOKING_DOCUMENT_GENERATION }),
    forwardRef(() => DocumentsModule),
  ],
  providers: [
    BookingDocumentGenerationRepository,
    BookingDocumentGenerationDispatcherService,
    BookingDocumentGenerationProcessorService,
    BookingDocumentGenerationRecoveryScheduler,
  ],
  exports: [
    BookingDocumentGenerationDispatcherService,
    BookingDocumentGenerationProcessorService,
    BookingDocumentGenerationRepository,
  ],
})
export class BookingDocumentGenerationModule {}
