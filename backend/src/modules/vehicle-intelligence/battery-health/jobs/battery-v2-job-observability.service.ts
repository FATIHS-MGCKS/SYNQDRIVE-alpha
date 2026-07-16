import { Injectable, Logger } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { BatteryMeasurementQuality } from '@prisma/client';
import type { BatteryV2JobType } from './battery-v2-job.types';
import type { BatteryV2JobErrorCode } from './battery-v2-job.errors';
import {
  recordLvRestShadowMeasurementMetrics,
  type LvRestShadowTargetWindow,
} from '../lv-rest-window/lv-rest-shadow-metrics';

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
    this.metrics.batteryV2JobsCompleted.inc({ job_type: jobType });
  }

  recordRetry(jobType: BatteryV2JobType, errorCode: BatteryV2JobErrorCode): void {
    this.metrics.batteryV2JobsRetry.inc({ job_type: jobType, error_code: errorCode });
  }

  recordFailed(jobType: BatteryV2JobType, errorCode: BatteryV2JobErrorCode): void {
    this.metrics.batteryV2JobsFailed.inc({ job_type: jobType, error_code: errorCode });
  }

  recordDeadLetter(jobType: BatteryV2JobType, errorCode: BatteryV2JobErrorCode): void {
    this.metrics.batteryV2JobsDeadLetter.inc({ job_type: jobType, error_code: errorCode });
  }

  setDeadLetterBacklog(count: number): void {
    this.metrics.batteryV2DeadLetterBacklog.set(count);
  }

  observeProcessingDuration(jobType: BatteryV2JobType, seconds: number): void {
    this.metrics.batteryV2JobProcessingDuration.observe({ job_type: jobType }, seconds);
  }

  recordLvRestShadowMeasurement(input: {
    targetType: LvRestShadowTargetWindow;
    quality: BatteryMeasurementQuality;
  }): void {
    recordLvRestShadowMeasurementMetrics(this.metrics, input);
  }
}
