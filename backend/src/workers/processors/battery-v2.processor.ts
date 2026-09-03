import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { observeQueueLag } from '@modules/observability/queue-lag.util';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { BatteryV2IdempotentExecutionService } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-idempotent-execution.service';
import { BatteryV2JobHandlerRegistry } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-handler.registry';
import { BatteryV2AssessDispatchReservationService } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-assess-dispatch-reservation.service';
import { BatteryV2JobDeadLetterService } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-dead-letter.service';
import { BatteryV2JobObservabilityService } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-observability.service';
import { classifyBatteryV2JobError } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-error.util';
import {
  BATTERY_V2_JOB_ERROR_CODES,
  BatteryV2JobProcessingError,
} from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job.errors';
import {
  LvRestAssessmentHandoffService,
} from '@modules/vehicle-intelligence/battery-health/lv-rest-window/lv-rest-assessment-handoff.service';
import { LV_REST_ASSESSMENT_HANDOFF_OUTCOME } from '@modules/vehicle-intelligence/battery-health/lv-rest-window/lv-rest-assessment-handoff.metadata';
import {
  fingerprintBatteryV2IdempotencyKey,
  fingerprintBatteryV2JobId,
  formatBatteryV2PipelineLog,
} from '@modules/vehicle-intelligence/battery-health/observability/battery-v2-pipeline-observability.util';
import {
  isBatteryV2JobType,
  validateBatteryV2JobPayload,
  BatteryV2JobValidationError,
} from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job.validation';
import type { BatteryV2JobPayload, BatteryV2JobType } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job.types';

function mapTerminalAssessHandoffOutcome(classified: {
  code: string;
  message: string;
}): (typeof LV_REST_ASSESSMENT_HANDOFF_OUTCOME)[keyof typeof LV_REST_ASSESSMENT_HANDOFF_OUTCOME] {
  const lower = classified.message.toLowerCase();
  if (
    classified.message.includes('54000') ||
    lower.includes('index row size') ||
    lower.includes('program_limit_exceeded')
  ) {
    return LV_REST_ASSESSMENT_HANDOFF_OUTCOME.PERSISTENCE_FAILED;
  }
  if (classified.code === BATTERY_V2_JOB_ERROR_CODES.PERMANENT_CONFIG) {
    return LV_REST_ASSESSMENT_HANDOFF_OUTCOME.UNSUPPORTED;
  }
  return LV_REST_ASSESSMENT_HANDOFF_OUTCOME.POLICY_SKIPPED;
}

@Injectable()
@Processor(QUEUE_NAMES.BATTERY_V2, {
  concurrency: 2,
  lockDuration: 180_000,
})
export class BatteryV2Processor extends WorkerHost {
  private readonly logger = new Logger(BatteryV2Processor.name);

  constructor(
    private readonly handlerRegistry: BatteryV2JobHandlerRegistry,
    private readonly idempotentExecution: BatteryV2IdempotentExecutionService,
    private readonly deadLetters: BatteryV2JobDeadLetterService,
    private readonly assessDispatchReservation: BatteryV2AssessDispatchReservationService,
    private readonly observability: BatteryV2JobObservabilityService,
    private readonly assessmentHandoff: LvRestAssessmentHandoffService,
    private readonly tripMetrics?: TripMetricsService,
  ) {
    super();
  }

  async process(job: Job<BatteryV2JobPayload>): Promise<void> {
    const jobType = job.name;
    if (!isBatteryV2JobType(jobType)) {
      throw new BatteryV2JobValidationError(`Unknown Battery V2 job name: ${job.name}`, 'jobType');
    }

    const payload = validateBatteryV2JobPayload(jobType, job.data);
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;
    const started = Date.now();

    observeQueueLag(this.tripMetrics, QUEUE_NAMES.BATTERY_V2, job);

    const isAssessJob = jobType === 'BATTERY_ASSESSMENT_RECOMPUTE';
    if (isAssessJob) {
      await this.assessDispatchReservation.refresh(
        payload.vehicleId,
        payload.idempotencyKey,
      );
    }

    let releaseAssessReservation = false;
    try {
      const result = await this.idempotentExecution.execute({
        jobType: jobType as BatteryV2JobType,
        payload,
        handler: () => this.handlerRegistry.dispatch(jobType as BatteryV2JobType, payload),
      });

      if (result.skipped) {
        this.logger.debug(
          formatBatteryV2PipelineLog({
            component: 'processor',
            event: 'job_skipped',
            status: 'skipped',
            jobType,
            organizationId: payload.organizationId,
            vehicleId: payload.vehicleId,
            keyFp: fingerprintBatteryV2IdempotencyKey(payload.idempotencyKey),
            jobIdFp: job.id ? fingerprintBatteryV2JobId(String(job.id)) : undefined,
            correlationId: payload.correlationId,
          }),
        );
        if (
          result.skipReason === 'already_completed' &&
          jobType === 'BATTERY_ASSESSMENT_RECOMPUTE' &&
          payload.sourceEntityId
        ) {
          await this.assessmentHandoff.acknowledgeExecuted({
            organizationId: payload.organizationId,
            vehicleId: payload.vehicleId,
            measurementId: payload.sourceEntityId,
            outcome: LV_REST_ASSESSMENT_HANDOFF_OUTCOME.ASSESSMENT_PERSISTED,
          });
        }
      } else {
        this.observability.recordCompleted(jobType);
      }

      this.observability.observeProcessingDuration(
        jobType,
        (Date.now() - started) / 1000,
      );
      releaseAssessReservation = isAssessJob;
    } catch (err) {
      const classified = classifyBatteryV2JobError(err);
      const isFinalAttempt = attempt >= maxAttempts;

      if (isFinalAttempt) {
        await this.deadLetters.recordDeadLetter({
          organizationId: payload.organizationId,
          vehicleId: payload.vehicleId,
          jobType: jobType as BatteryV2JobType,
          idempotencyKey: payload.idempotencyKey,
          correlationId: payload.correlationId,
          errorCode: classified.code,
          errorMessage: classified.message,
          attempts: attempt,
        });
        this.observability.recordDeadLetter(jobType as BatteryV2JobType, classified.code);
        this.observability.logWarn({
          jobType: jobType as BatteryV2JobType,
          organizationId: payload.organizationId,
          vehicleId: payload.vehicleId,
          idempotencyKey: payload.idempotencyKey,
          correlationId: payload.correlationId,
          operation: 'dead_letter',
          attempt,
          maxAttempts,
          errorCode: classified.code,
        });

        if (
          !classified.retryable &&
          jobType === 'BATTERY_ASSESSMENT_RECOMPUTE' &&
          payload.sourceEntityId
        ) {
          await this.assessmentHandoff.acknowledgeTerminalFailure({
            organizationId: payload.organizationId,
            vehicleId: payload.vehicleId,
            measurementId: payload.sourceEntityId,
            outcome: mapTerminalAssessHandoffOutcome(classified),
            errorCode: classified.code,
            errorMessage: classified.message,
          });
          releaseAssessReservation = isAssessJob;
        }
      } else if (classified.retryable) {
        this.observability.recordRetry(jobType as BatteryV2JobType, classified.code);
        this.observability.logWarn({
          jobType: jobType as BatteryV2JobType,
          organizationId: payload.organizationId,
          vehicleId: payload.vehicleId,
          idempotencyKey: payload.idempotencyKey,
          correlationId: payload.correlationId,
          operation: 'retry_scheduled',
          attempt,
          maxAttempts,
          errorCode: classified.code,
        });
      } else {
        this.observability.recordFailed(jobType as BatteryV2JobType, classified.code);
      }

      if (!classified.retryable) {
        throw new UnrecoverableError(
          classified.message || classified.code || BATTERY_V2_JOB_ERROR_CODES.HANDLER_FAILED,
        );
      }

      throw new BatteryV2JobProcessingError({
        code: classified.code,
        message:
          classified.message || classified.code || BATTERY_V2_JOB_ERROR_CODES.HANDLER_FAILED,
        retryable: classified.retryable,
        jobType: jobType as BatteryV2JobType,
        cause: err,
      });
    } finally {
      if (releaseAssessReservation) {
        await this.assessDispatchReservation.release(
          payload.vehicleId,
          payload.idempotencyKey,
        );
      }
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<BatteryV2JobPayload> | undefined, err: Error): void {
    if (!job || !isBatteryV2JobType(job.name)) return;
    const classified = classifyBatteryV2JobError(err);
    const payload = job.data;
    this.logger.error(
      formatBatteryV2PipelineLog({
        component: 'processor',
        event: 'worker_failed',
        status: 'failed',
        jobType: job.name,
        organizationId: payload?.organizationId,
        vehicleId: payload?.vehicleId,
        keyFp: payload?.idempotencyKey
          ? fingerprintBatteryV2IdempotencyKey(payload.idempotencyKey)
          : undefined,
        jobIdFp: job.id ? fingerprintBatteryV2JobId(String(job.id)) : undefined,
        correlationId: payload?.correlationId,
        errorCode: classified.code,
        attempt: job.attemptsMade,
      }),
    );
  }
}
