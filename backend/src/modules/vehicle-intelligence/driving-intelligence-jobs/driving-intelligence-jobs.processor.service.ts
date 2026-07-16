import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { DrivingAnalysisStageOrchestratorService } from '../driving-analysis-stage/driving-analysis-stage.orchestrator.service';
import {
  DRIVING_INTELLIGENCE_JOB_ERROR_CODES,
  DrivingIntelligenceJobRetryableError,
  classifyDrivingIntelligenceJobError,
} from './driving-intelligence-jobs.errors';
import { DrivingIntelligenceJobHandlerRegistry } from './driving-intelligence-jobs.handler.registry';
import { DrivingIntelligenceJobRepository } from './driving-intelligence-jobs.repository';
import {
  computeNextRetryAt,
  isEligibleForRetry,
  shouldDeadLetter,
} from './driving-intelligence-jobs.retry-policy';

export type DrivingIntelligenceJobProcessOutcome =
  | { result: 'completed' }
  | { result: 'retry'; errorCode: string; message: string }
  | { result: 'dead_letter'; errorCode: string; message: string };

@Injectable()
export class DrivingIntelligenceJobProcessorService {
  private readonly logger = new Logger(DrivingIntelligenceJobProcessorService.name);

  constructor(
    private readonly repository: DrivingIntelligenceJobRepository,
    private readonly handlerRegistry: DrivingIntelligenceJobHandlerRegistry,
    @Optional() private readonly stageOrchestrator?: DrivingAnalysisStageOrchestratorService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  async processPersistentJob(
    organizationId: string,
    persistentJobId: string,
  ): Promise<DrivingIntelligenceJobProcessOutcome> {
    const job = await this.repository.findById(organizationId, persistentJobId);
    if (!job) {
      throw new NotFoundException(`Driving intelligence job ${persistentJobId} not found`);
    }

    if (this.repository.isTerminalStatus(job.status)) {
      this.logger.debug(
        `Skipping driving intelligence job ${persistentJobId} — terminal status ${job.status}`,
      );
      return job.status === 'COMPLETED'
        ? { result: 'completed' }
        : { result: 'dead_letter', errorCode: job.errorCode ?? 'DEAD_LETTER', message: job.errorMessage ?? '' };
    }

    const inProgress = await this.repository.markInProgress(persistentJobId);

    try {
      await this.handlerRegistry.dispatch(inProgress);
      await this.repository.markCompleted(persistentJobId);
      await this.stageOrchestrator?.onJobCompleted(
        organizationId,
        inProgress.analysisRunId,
        inProgress.jobType,
      );
      this.tripMetrics?.drivingIntelligenceJobCompleted.inc({ job_type: inProgress.jobType });
      this.logger.log(
        `Driving intelligence job completed: id=${persistentJobId} type=${inProgress.jobType}`,
      );
      return { result: 'completed' };
    } catch (err) {
      const classified = classifyDrivingIntelligenceJobError(err);
      const attemptCount = inProgress.attemptCount;
      const maxAttempts = inProgress.maxAttempts;

      if (
        isEligibleForRetry(attemptCount, maxAttempts, classified.code) &&
        !shouldDeadLetter(attemptCount, maxAttempts)
      ) {
        await this.repository.markRetryScheduled(
          persistentJobId,
          attemptCount,
          classified.code,
          classified.message,
        );
        this.tripMetrics?.drivingIntelligenceJobRetry.inc({
          job_type: inProgress.jobType,
          error_code: classified.code,
        });
        this.logger.warn(
          `Driving intelligence job retry scheduled: id=${persistentJobId} type=${inProgress.jobType} ` +
            `attempt=${attemptCount}/${maxAttempts} code=${classified.code} next=${computeNextRetryAt(attemptCount).toISOString()}`,
        );
        return {
          result: 'retry',
          errorCode: classified.code,
          message: classified.message,
        };
      }

      const deadLetterCode = shouldDeadLetter(attemptCount, maxAttempts)
        ? DRIVING_INTELLIGENCE_JOB_ERROR_CODES.MAX_ATTEMPTS_EXCEEDED
        : classified.code;

      await this.repository.markDeadLetter(persistentJobId, deadLetterCode, classified.message);
      await this.stageOrchestrator?.onJobFailed(
        organizationId,
        inProgress.analysisRunId,
        inProgress.jobType,
        deadLetterCode,
        classified.message,
      );
      this.tripMetrics?.drivingIntelligenceJobDeadLetter.inc({
        job_type: inProgress.jobType,
        error_code: deadLetterCode,
      });
      this.logger.error(
        `Driving intelligence job dead-lettered: id=${persistentJobId} type=${inProgress.jobType} code=${deadLetterCode} ${classified.message}`,
      );
      return {
        result: 'dead_letter',
        errorCode: deadLetterCode,
        message: classified.message,
      };
    }
  }

  /** Used by BullMQ worker — re-throws retryable failures for queue backoff. */
  async processPersistentJobForWorker(
    organizationId: string,
    persistentJobId: string,
  ): Promise<void> {
    const outcome = await this.processPersistentJob(organizationId, persistentJobId);
    if (outcome.result === 'retry') {
      throw new DrivingIntelligenceJobRetryableError(
        outcome.errorCode as any,
        outcome.message,
      );
    }
  }
}
