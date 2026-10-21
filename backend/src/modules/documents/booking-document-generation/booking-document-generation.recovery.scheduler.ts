import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingDocumentGenerationDispatcherService } from './booking-document-generation.dispatcher.service';
import { BookingDocumentGenerationRepository } from './booking-document-generation.repository';
import { BOOKING_DOCUMENT_GENERATION_STATUS } from './booking-document-generation.constants';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

@Injectable()
export class BookingDocumentGenerationRecoveryScheduler {
  private readonly logger = new Logger(BookingDocumentGenerationRecoveryScheduler.name);

  constructor(
    private readonly repository: BookingDocumentGenerationRepository,
    private readonly dispatcher: BookingDocumentGenerationDispatcherService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async recoverPendingJobs(): Promise<void> {
    if (!this.leaderGuard.shouldRun('booking_document_generation_recovery_minute')) return;
    const jobs = await this.repository.findRetryableJobs(25);
    for (const job of jobs) {
      try {
        await this.dispatcher.enqueue({
          organizationId: job.organizationId,
          bookingId: job.bookingId,
          jobType: job.jobType as never,
          documentType: job.documentType as never,
          handoverProtocolId: job.handoverProtocolId,
          requestedByUserId: job.requestedByUserId,
          correlationId: job.correlationId,
        });
      } catch (err) {
        this.logger.warn(
          `Recovery enqueue failed jobId=${job.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async recoverStaleProcessing(): Promise<void> {
    if (!this.leaderGuard.shouldRun('booking_document_generation_recovery_five_minute')) return;
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
    const stale = await this.repository.findStaleProcessingJobs(staleBefore, 25);
    for (const job of stale) {
      await this.repository.markFailedRetryable(
        job.id,
        job.attemptCount,
        'STALE_PROCESSING',
        'Job processing exceeded stale threshold — scheduled for retry',
      );
      this.logger.warn(`Recovered stale processing jobId=${job.id} booking=${job.bookingId}`);
    }
  }
}
