import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { observeQueueLag } from '@modules/observability/queue-lag.util';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { BatteryV2IdempotentExecutionService } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-idempotent-execution.service';
import { BatteryV2JobHandlerRegistry } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-handler.registry';
import { BatteryV2JobDeadLetterService } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-dead-letter.service';
import { BatteryV2JobObservabilityService } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-observability.service';
import { classifyBatteryV2JobError } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job-error.util';
import {
  isBatteryV2JobType,
  validateBatteryV2JobPayload,
  BatteryV2JobValidationError,
} from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job.validation';
import type { BatteryV2JobPayload, BatteryV2JobType } from '@modules/vehicle-intelligence/battery-health/jobs/battery-v2-job.types';

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
    private readonly observability: BatteryV2JobObservabilityService,
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

    try {
      const result = await this.idempotentExecution.execute({
        jobType: jobType as BatteryV2JobType,
        payload,
        handler: () => this.handlerRegistry.dispatch(jobType as BatteryV2JobType, payload),
      });

      if (result.skipped) {
        this.logger.debug(
          `Battery V2 job skipped (already completed): ${jobType} key=${payload.idempotencyKey}`,
        );
      } else {
        this.observability.recordCompleted(jobType);
      }

      this.observability.observeProcessingDuration(
        jobType,
        (Date.now() - started) / 1000,
      );
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
        throw new UnrecoverableError(classified.message);
      }

      throw err instanceof Error ? err : new Error(classified.message);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<BatteryV2JobPayload> | undefined, err: Error): void {
    if (!job || !isBatteryV2JobType(job.name)) return;
    const classified = classifyBatteryV2JobError(err);
    this.logger.error(
      `Battery V2 worker failed job=${job.name} vehicle=${job.data?.vehicleId} attempts=${job.attemptsMade} code=${classified.code}`,
    );
  }
}
