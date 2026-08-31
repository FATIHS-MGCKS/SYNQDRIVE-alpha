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

  /** Hard invariant: reference capture must never affect live trip FSM. */
  isTripDetectionAffected(): boolean {
    return false;
  }

  /** Hard invariant: reference capture must not replace production schedulers. */
  replacesProductionScheduler(): boolean {
    return false;
  }
}
