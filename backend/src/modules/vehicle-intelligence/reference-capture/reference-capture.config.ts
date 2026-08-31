import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ReferenceCaptureConfig {
  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return this.configService.get<boolean>('referenceCapture.enabled') === true;
  }

  getRetentionDays(): number {
    return this.configService.get<number>('referenceCapture.retentionDays') ?? 180;
  }

  getBatchSize(): number {
    return this.configService.get<number>('referenceCapture.batchSize') ?? 250;
  }

  getMaxPendingObservations(): number {
    return this.configService.get<number>('referenceCapture.maxPendingObservations') ?? 5000;
  }

  getCycleIntervalMs(): number {
    return this.configService.get<number>('referenceCapture.cycleIntervalMs') ?? 5000;
  }

  getMaxRecordingDurationMs(): number {
    return this.configService.get<number>('referenceCapture.maxRecordingDurationMs') ?? 14_400_000;
  }

  getSlowCycleEvery(): number {
    return this.configService.get<number>('referenceCapture.slowCycleEvery') ?? 6;
  }

  getPostgresStorageMultiplier(): number {
    return this.configService.get<number>('referenceCapture.postgresStorageMultiplier') ?? 2.5;
  }

  isRetentionSchedulerEnabled(): boolean {
    return this.configService.get<boolean>('referenceCapture.retentionSchedulerEnabled') === true;
  }

  getMaxTransientRetries(): number {
    return this.configService.get<number>('referenceCapture.maxTransientRetries') ?? 5;
  }

  getTransientRetryBaseDelayMs(): number {
    return this.configService.get<number>('referenceCapture.transientRetryBaseDelayMs') ?? 2000;
  }

  /** Hard invariant: reference capture must never affect live trip FSM. */
  isTripDetectionAffected(): boolean {
    return false;
  }

  /** Hard invariant: reference capture must not replace production schedulers. */
  replacesProductionScheduler(): boolean {
    return false;
  }
}
