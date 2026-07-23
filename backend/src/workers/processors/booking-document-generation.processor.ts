import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BookingDocumentGenerationProcessorService } from '@modules/documents/booking-document-generation/booking-document-generation.processor.service';
import type { BookingDocumentGenerationBullJobData } from '@modules/documents/booking-document-generation/booking-document-generation.types';
import { QUEUE_NAMES } from '../queues/queue-names';

@Injectable()
@Processor(QUEUE_NAMES.BOOKING_DOCUMENT_GENERATION, {
  concurrency: 2,
  lockDuration: 180_000,
})
export class BookingDocumentGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(BookingDocumentGenerationProcessor.name);

  constructor(
    private readonly processorService: BookingDocumentGenerationProcessorService,
  ) {
    super();
  }

  async process(job: Job<BookingDocumentGenerationBullJobData>): Promise<void> {
    const { persistentJobId, organizationId, bookingId, jobType } = job.data;
    this.logger.log(
      `Booking document generation worker started bullJob=${job.id} persistentJobId=${persistentJobId} type=${jobType} booking=${bookingId}`,
    );
    await this.processorService.processForWorker(job.data);
    this.logger.debug(
      `Booking document generation worker finished persistentJobId=${persistentJobId}`,
    );
  }
}
