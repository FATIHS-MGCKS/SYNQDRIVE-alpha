import { Injectable, Logger } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { BatteryMeasurementQuality } from '@prisma/client';
import type { BatteryV2JobType } from './battery-v2-job.types';
import type { BatteryV2JobErrorCode } from './battery-v2-job.errors';
import {
  recordBatteryJob,
  recordBatteryJobDeadLetter,
  recordBatteryJobFailed,
  recordBatteryRestMeasurement,
  toBatteryRestWindowLabel,
} from '../observability/battery-v2-prometheus.metrics';

export interface BatteryV2JobLogEvent {
  jobType: BatteryV2JobType;
  organizationId: string;
  vehicleId: string;
  idempotencyKey: string;
  correlationId: string;
  operation: string;
  attempt?: number;
  maxAttempts?: number;
  errorCode?: BatteryV2JobErrorCode;
}

@Injectable()
export class BatteryV2JobObservabilityService {
  private readonly logger = new Logger(BatteryV2JobObservabilityService.name);

  constructor(private readonly metrics: TripMetricsService) {}

  log(event: BatteryV2JobLogEvent): void {
    this.logger.log({
      msg: `battery.v2.${event.operation}`,
      jobType: event.jobType,
      organizationId: event.organizationId,
      vehicleId: event.vehicleId,
      idempotencyKey: event.idempotencyKey,
      correlationId: event.correlationId,
      attempt: event.attempt,
      maxAttempts: event.maxAttempts,
      errorCode: event.errorCode,
    });
  }

  logWarn(event: BatteryV2JobLogEvent): void {
    this.logger.warn({
      msg: `battery.v2.${event.operation}`,
      jobType: event.jobType,
      organizationId: event.organizationId,
      vehicleId: event.vehicleId,
      idempotencyKey: event.idempotencyKey,
      correlationId: event.correlationId,
      attempt: event.attempt,
      maxAttempts: event.maxAttempts,
      errorCode: event.errorCode,
    });
  }

  recordCompleted(jobType: BatteryV2JobType): void {
    recordBatteryJob(this.metrics, { jobType, outcome: 'completed' });
  }

  recordRetry(jobType: BatteryV2JobType, errorCode: BatteryV2JobErrorCode): void {
    this.metrics.batteryV2JobsRetry.inc({ job_type: jobType, error_code: errorCode });
  }

  recordFailed(jobType: BatteryV2JobType, errorCode: BatteryV2JobErrorCode): void {
    recordBatteryJobFailed(this.metrics, { jobType, errorCode });
  }

  recordDeadLetter(jobType: BatteryV2JobType, errorCode: BatteryV2JobErrorCode): void {
    recordBatteryJobDeadLetter(this.metrics, { jobType, errorCode });
  }

  setDeadLetterBacklog(count: number): void {
    this.metrics.batteryV2DeadLetterBacklog.set(count);
  }

  observeProcessingDuration(jobType: BatteryV2JobType, seconds: number): void {
    this.metrics.batteryV2JobProcessingDuration.observe({ job_type: jobType }, seconds);
  }

  recordLvRestShadowMeasurement(input: {
    targetType: 'REST_60M' | 'REST_6H';
    quality: BatteryMeasurementQuality;
  }): void {
    recordBatteryRestMeasurement(this.metrics, {
      window: toBatteryRestWindowLabel(input.targetType),
      quality: input.quality,
    });
  }
}
