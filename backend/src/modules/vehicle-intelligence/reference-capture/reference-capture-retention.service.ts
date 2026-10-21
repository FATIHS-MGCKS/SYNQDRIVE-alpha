import { Injectable } from '@nestjs/common';
import { ReferenceCaptureConfig } from './reference-capture.config';
import { ReferenceCaptureObservationRepository } from './reference-capture-observation.repository';
import type {
  ReferenceCaptureRetentionPolicy,
  ReferenceCaptureStressEstimate,
} from './reference-capture.types';

/** RP-045 retention policy + RP-010 volume/stress estimates. */
@Injectable()
export class ReferenceCaptureRetentionService {
  constructor(
    private readonly config: ReferenceCaptureConfig,
    private readonly observationRepository: ReferenceCaptureObservationRepository,
  ) {}

  getRetentionPolicy(broadFieldCount = 80): ReferenceCaptureRetentionPolicy {
    const retentionDays = this.config.getRetentionDays();
    const postgresMultiplier = this.config.getPostgresStorageMultiplier();
    const estimatedLogicalBytesPerObservation = 512;
    const estimatedObservationsPerMinutePerSignal = 60;
    const signals = Math.max(broadFieldCount, 1);
    const observationsPerHour = estimatedObservationsPerMinutePerSignal * 60 * signals;
    const estimatedLogicalBytesPerHourBroadCapture =
      estimatedLogicalBytesPerObservation * observationsPerHour;
    const estimatedPostgresBytesPerObservation = Math.round(
      estimatedLogicalBytesPerObservation * postgresMultiplier,
    );
    const estimatedPostgresBytesPerHourBroadCapture = Math.round(
      estimatedLogicalBytesPerHourBroadCapture * postgresMultiplier,
    );

    const schedulerEnabled = this.config.isRetentionSchedulerEnabled();

    return {
      retentionDays,
      justification:
        '180-day default aligns with manifest retentionRequirement for reference validation → replay → calibration cycle; configurable via REFERENCE_CAPTURE_RETENTION_DAYS',
      estimatedLogicalBytesPerObservation,
      estimatedPostgresBytesPerObservation,
      estimatedObservationsPerMinutePerSignal,
      estimatedLogicalBytesPerHourBroadCapture,
      estimatedPostgresBytesPerHourBroadCapture,
      retentionPurgeMechanism: schedulerEnabled
        ? 'ReferenceCaptureRetentionScheduler cron (04:30 UTC) → purgeExpiredObservations'
        : 'ReferenceCaptureRetentionService.purgeExpiredObservations — manual/on-demand only until REFERENCE_CAPTURE_RETENTION_SCHEDULER_ENABLED=true',
      retentionIndexStrategy:
        'reference_capture_observations.created_at B-tree index (migration 20260831200000); deleteMany WHERE created_at < cutoff',
    };
  }

  getStressEstimate(broadFieldCount = 80): ReferenceCaptureStressEstimate {
    const policy = this.getRetentionPolicy(broadFieldCount);
    const observationsPerMinute =
      policy.estimatedObservationsPerMinutePerSignal * Math.max(broadFieldCount, 1);
    const observationsPerHour = observationsPerMinute * 60;

    return {
      observationsPerMinute,
      observationsPerHour,
      estimatedLogicalBytesPerHour: policy.estimatedLogicalBytesPerHourBroadCapture,
      estimatedPostgresBytesPerHour: policy.estimatedPostgresBytesPerHourBroadCapture,
      batchSize: this.config.getBatchSize(),
      maxPendingObservations: this.config.getMaxPendingObservations(),
      backpressureStrategy:
        'In-memory pending queue capped at maxPendingObservations; durable flush in batchSize chunks with retry/backoff; reject new enqueue when cap exceeded; session FAILED on terminal persist failure',
    };
  }

  async purgeExpiredObservations(now = new Date()): Promise<{ deletedCount: number; cutoff: Date }> {
    const retentionDays = this.config.getRetentionDays();
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.observationRepository.deleteOlderThan(cutoff);
    return { deletedCount: result.count, cutoff };
  }
}
