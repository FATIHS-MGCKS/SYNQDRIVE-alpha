import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingDocumentBundleService } from '../booking-document-bundle.service';
import {
  BOOKING_DOCUMENT_GENERATION_ERROR_CODE,
  BOOKING_DOCUMENT_GENERATION_JOB_TYPE,
} from './booking-document-generation.constants';
import {
  BookingDocumentGenerationRetryableError,
  BookingDocumentGenerationTenantError,
  classifyBookingDocumentGenerationError,
} from './booking-document-generation.errors';
import { BookingDocumentGenerationRepository } from './booking-document-generation.repository';
import type { BookingDocumentGenerationBullJobData } from './booking-document-generation.types';
import { DOCUMENT_TYPE, type DocumentType } from '../documents.constants';

@Injectable()
export class BookingDocumentGenerationProcessorService {
  private readonly logger = new Logger(BookingDocumentGenerationProcessorService.name);

  constructor(
    private readonly repository: BookingDocumentGenerationRepository,
    private readonly bundle: BookingDocumentBundleService,
    private readonly config: ConfigService,
  ) {}

  private get generationEnabled(): boolean {
    return this.config.get<boolean>('documents.generationEnabled', true);
  }

  async processForWorker(data: BookingDocumentGenerationBullJobData): Promise<void> {
    const outcome = await this.processPersistentJob(data.organizationId, data.persistentJobId, data);
    if (outcome === 'retry') {
      throw new BookingDocumentGenerationRetryableError(
        BOOKING_DOCUMENT_GENERATION_ERROR_CODE.EXECUTION_FAILED,
        'Retryable booking document generation failure',
      );
    }
  }

  async processPersistentJob(
    organizationId: string,
    persistentJobId: string,
    payload?: BookingDocumentGenerationBullJobData,
  ): Promise<'completed' | 'retry' | 'failed_final'> {
    const job = await this.repository.findById(organizationId, persistentJobId);
    if (!job) {
      throw new Error(`Booking document generation job ${persistentJobId} not found`);
    }

    if (payload) {
      try {
        this.assertTenantPayload(job.organizationId, job.bookingId, payload);
      } catch (err) {
        const classified = classifyBookingDocumentGenerationError(err);
        await this.repository.markFailedFinal(organizationId, persistentJobId, classified.code, classified.message);
        return 'failed_final';
      }
    }

    if (this.repository.isTerminalStatus(job.status)) {
      this.logger.debug(`Skipping terminal job ${persistentJobId} status=${job.status}`);
      return job.status === 'SUCCEEDED' ? 'completed' : 'failed_final';
    }

    if (!this.generationEnabled) {
      await this.repository.markFailedFinal(
        organizationId,
        persistentJobId,
        BOOKING_DOCUMENT_GENERATION_ERROR_CODE.GENERATION_DISABLED,
        'Document generation is disabled',
      );
      return 'failed_final';
    }

    const inProgress = await this.repository.markProcessing(organizationId, persistentJobId);
    if (!inProgress) {
      return 'failed_final';
    }

    try {
      await this.executeJob(inProgress);
      await this.repository.markSucceeded(organizationId, persistentJobId);
      this.logger.log(
        `Booking document generation succeeded jobId=${persistentJobId} type=${inProgress.jobType} booking=${inProgress.bookingId}`,
      );
      return 'completed';
    } catch (err) {
      const classified = classifyBookingDocumentGenerationError(err);
      const attemptCount = inProgress.attemptCount;
      const maxAttempts = inProgress.maxAttempts;

      if (classified.retryable && attemptCount < maxAttempts) {
        await this.repository.markFailedRetryable(
          organizationId,
          persistentJobId,
          attemptCount,
          classified.code,
          classified.message,
        );
        this.logger.warn(
          `Booking document generation retryable failure jobId=${persistentJobId} attempt=${attemptCount}/${maxAttempts} code=${classified.code}`,
        );
        return 'retry';
      }

      await this.repository.markFailedFinal(organizationId, persistentJobId, classified.code, classified.message);
      this.logger.error(
        `Booking document generation failed final jobId=${persistentJobId} code=${classified.code} ${classified.message}`,
      );
      return 'failed_final';
    }
  }

  private assertTenantPayload(
    expectedOrgId: string,
    expectedBookingId: string,
    payload: BookingDocumentGenerationBullJobData,
  ): void {
    if (
      payload.organizationId !== expectedOrgId ||
      payload.bookingId !== expectedBookingId
    ) {
      throw new BookingDocumentGenerationTenantError(
        `Queue payload tenant mismatch: expected org=${expectedOrgId} booking=${expectedBookingId}`,
      );
    }
  }

  private async executeJob(job: {
    organizationId: string;
    bookingId: string;
    jobType: string;
    documentType: string | null;
    handoverProtocolId: string | null;
    requestedByUserId: string | null;
  }): Promise<void> {
    const orgId = job.organizationId;
    const bookingId = job.bookingId;
    const userId = job.requestedByUserId;

    switch (job.jobType) {
      case BOOKING_DOCUMENT_GENERATION_JOB_TYPE.INITIAL_BUNDLE:
        await this.bundle.generateInitialBundle(orgId, bookingId, userId);
        return;
      case BOOKING_DOCUMENT_GENERATION_JOB_TYPE.REGENERATE:
        if (!job.documentType) {
          throw new Error('documentType required for REGENERATE job');
        }
        await this.bundle.regenerate(orgId, bookingId, job.documentType as DocumentType, userId);
        return;
      case BOOKING_DOCUMENT_GENERATION_JOB_TYPE.PICKUP_PROTOCOL:
        if (!job.handoverProtocolId) {
          throw new Error('handoverProtocolId required for PICKUP_PROTOCOL job');
        }
        await this.bundle.generatePickupProtocolDocument(
          orgId,
          bookingId,
          job.handoverProtocolId,
          userId,
        );
        return;
      case BOOKING_DOCUMENT_GENERATION_JOB_TYPE.RETURN_PROTOCOL:
        if (!job.handoverProtocolId) {
          throw new Error('handoverProtocolId required for RETURN_PROTOCOL job');
        }
        await this.bundle.generateReturnProtocolDocument(
          orgId,
          bookingId,
          job.handoverProtocolId,
          userId,
        );
        return;
      case BOOKING_DOCUMENT_GENERATION_JOB_TYPE.FINAL_INVOICE:
        await this.bundle.generateFinalInvoiceAndDocument(orgId, bookingId, userId);
        return;
      default:
        throw new Error(`Unsupported job type: ${job.jobType}`);
    }
  }
}
