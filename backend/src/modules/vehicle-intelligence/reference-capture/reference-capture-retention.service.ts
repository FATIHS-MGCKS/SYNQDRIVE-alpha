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
    const estimatedBytesPerObservation = 512;
    const estimatedObservationsPerMinutePerSignal = 60;
    const signals = Math.max(broadFieldCount, 1);
    const estimatedBytesPerHourBroadCapture =
      estimatedBytesPerObservation *
      estimatedObservationsPerMinutePerSignal *
      60 *
      signals;

    return {
      retentionDays,
      justification:
        '180-day default aligns with manifest retentionRequirement for reference validation → replay → calibration cycle; configurable via REFERENCE_CAPTURE_RETENTION_DAYS',
      estimatedBytesPerObservation,
      estimatedObservationsPerMinutePerSignal,
      estimatedBytesPerHourBroadCapture,
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
      estimatedBytesPerHour: policy.estimatedBytesPerHourBroadCapture,
      batchSize: this.config.getBatchSize(),
      maxPendingObservations: this.config.getMaxPendingObservations(),
      backpressureStrategy:
        'In-memory pending queue capped at maxPendingObservations; flush in batchSize chunks via createMany; reject new enqueue when cap exceeded',
    };
  }

  async purgeExpiredObservations(now = new Date()): Promise<{ deletedCount: number; cutoff: Date }> {
    const retentionDays = this.config.getRetentionDays();
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.observationRepository.deleteOlderThan(cutoff);
    return { deletedCount: result.count, cutoff };
  }
}
