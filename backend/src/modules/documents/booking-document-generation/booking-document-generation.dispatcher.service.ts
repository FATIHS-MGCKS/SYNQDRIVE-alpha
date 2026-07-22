import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import {
  BOOKING_DOCUMENT_GENERATION_BASE_BACKOFF_MS,
  BOOKING_DOCUMENT_GENERATION_BULL_JOB_NAME,
  BOOKING_DOCUMENT_GENERATION_DEFAULT_MAX_ATTEMPTS,
  BOOKING_DOCUMENT_GENERATION_JOB_TYPE,
} from './booking-document-generation.constants';
import {
  buildBookingDocumentGenerationBullJobId,
} from './booking-document-generation.contract';
import { BookingDocumentGenerationRepository } from './booking-document-generation.repository';
import type {
  BookingDocumentGenerationBullJobData,
  EnqueueBookingDocumentGenerationInput,
  EnqueueBookingDocumentGenerationResult,
} from './booking-document-generation.types';

@Injectable()
export class BookingDocumentGenerationDispatcherService {
  private readonly logger = new Logger(BookingDocumentGenerationDispatcherService.name);

  constructor(
    private readonly repository: BookingDocumentGenerationRepository,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_NAMES.BOOKING_DOCUMENT_GENERATION)
    private readonly queue: Queue<BookingDocumentGenerationBullJobData>,
  ) {}

  private get generationEnabled(): boolean {
    return this.config.get<boolean>('documents.generationEnabled', true);
  }

  async enqueueInitialBundle(
    organizationId: string,
    bookingId: string,
    requestedByUserId?: string | null,
  ): Promise<EnqueueBookingDocumentGenerationResult> {
    return this.enqueue({
      organizationId,
      bookingId,
      jobType: BOOKING_DOCUMENT_GENERATION_JOB_TYPE.INITIAL_BUNDLE,
      requestedByUserId,
      correlationId: `initial-bundle:${bookingId}`,
    });
  }

  async enqueuePickupProtocol(
    organizationId: string,
    bookingId: string,
    handoverProtocolId: string,
    requestedByUserId?: string | null,
  ): Promise<EnqueueBookingDocumentGenerationResult> {
    return this.enqueue({
      organizationId,
      bookingId,
      jobType: BOOKING_DOCUMENT_GENERATION_JOB_TYPE.PICKUP_PROTOCOL,
      handoverProtocolId,
      requestedByUserId,
      correlationId: `pickup:${handoverProtocolId}`,
    });
  }

  async enqueueReturnDocuments(
    organizationId: string,
    bookingId: string,
    handoverProtocolId: string,
    requestedByUserId?: string | null,
  ): Promise<EnqueueBookingDocumentGenerationResult> {
    const returnJob = await this.enqueue({
      organizationId,
      bookingId,
      jobType: BOOKING_DOCUMENT_GENERATION_JOB_TYPE.RETURN_PROTOCOL,
      handoverProtocolId,
      requestedByUserId,
      correlationId: `return:${handoverProtocolId}`,
    });
    const finalJob = await this.enqueue({
      organizationId,
      bookingId,
      jobType: BOOKING_DOCUMENT_GENERATION_JOB_TYPE.FINAL_INVOICE,
      requestedByUserId,
      correlationId: `final-invoice:${bookingId}`,
    });
    return finalJob.created ? finalJob : returnJob;
  }

  async enqueue(input: EnqueueBookingDocumentGenerationInput): Promise<EnqueueBookingDocumentGenerationResult> {
    if (!this.generationEnabled) {
      this.logger.warn(
        `Document generation disabled — skipping enqueue booking=${input.bookingId} type=${input.jobType}`,
      );
      const prepared = await this.repository.persistOrGet(input);
      return {
        jobId: prepared.job.id,
        idempotencyKey: prepared.idempotencyKey,
        created: prepared.created,
        deduplicated: prepared.deduplicated,
        enqueued: false,
        status: prepared.job.status,
      };
    }

    const prepared = await this.repository.persistOrGet(input);

    if (this.repository.shouldSkipEnqueue(prepared.job.status)) {
      return {
        jobId: prepared.job.id,
        idempotencyKey: prepared.idempotencyKey,
        created: prepared.created,
        deduplicated: prepared.deduplicated,
        enqueued: false,
        status: prepared.job.status,
      };
    }

    if (!canEnqueueQueue(this.logger, 'booking-document-generation')) {
      this.logger.warn(
        `Queue unavailable — job persisted PENDING booking=${input.bookingId} jobId=${prepared.job.id}`,
      );
      return {
        jobId: prepared.job.id,
        idempotencyKey: prepared.idempotencyKey,
        created: prepared.created,
        deduplicated: prepared.deduplicated,
        enqueued: false,
        status: prepared.job.status,
      };
    }

    const bullJobId = buildBookingDocumentGenerationBullJobId(prepared.job.id);
    const bullData: BookingDocumentGenerationBullJobData = {
      persistentJobId: prepared.job.id,
      organizationId: prepared.job.organizationId,
      bookingId: prepared.job.bookingId,
      jobType: prepared.job.jobType as EnqueueBookingDocumentGenerationInput['jobType'],
    };

    try {
      await this.queue.add(BOOKING_DOCUMENT_GENERATION_BULL_JOB_NAME, bullData, {
        jobId: bullJobId,
        removeOnComplete: true,
        removeOnFail: 50,
        attempts: BOOKING_DOCUMENT_GENERATION_DEFAULT_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: BOOKING_DOCUMENT_GENERATION_BASE_BACKOFF_MS },
      });
      await this.repository.markEnqueued(prepared.job.id, bullJobId);
      this.logger.log(
        `Enqueued booking document job type=${input.jobType} booking=${input.bookingId} jobId=${prepared.job.id}`,
      );
      return {
        jobId: prepared.job.id,
        idempotencyKey: prepared.idempotencyKey,
        created: prepared.created,
        deduplicated: prepared.deduplicated,
        enqueued: true,
        status: prepared.job.status,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already exists') || message.includes('duplicate')) {
        this.logger.debug(`Bull job ${bullJobId} already queued for jobId=${prepared.job.id}`);
        return {
          jobId: prepared.job.id,
          idempotencyKey: prepared.idempotencyKey,
          created: prepared.created,
          deduplicated: true,
          enqueued: false,
          status: prepared.job.status,
        };
      }
      this.logger.error(
        `Failed to enqueue booking document job jobId=${prepared.job.id}: ${message}`,
      );
      throw err;
    }
  }

  async manualRetry(organizationId: string, jobId: string, requestedByUserId?: string | null) {
    const job = await this.repository.findById(organizationId, jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    await this.repository.resetForManualRetry(jobId);
    return this.enqueue({
      organizationId: job.organizationId,
      bookingId: job.bookingId,
      jobType: job.jobType as EnqueueBookingDocumentGenerationInput['jobType'],
      documentType: job.documentType as EnqueueBookingDocumentGenerationInput['documentType'],
      handoverProtocolId: job.handoverProtocolId,
      requestedByUserId,
      correlationId: job.correlationId,
    });
  }

  listForBooking(organizationId: string, bookingId: string) {
    return this.repository.listForBooking(organizationId, bookingId);
  }
}
