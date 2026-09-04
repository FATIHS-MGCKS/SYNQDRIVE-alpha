import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeFastGoTimeoutMs } from './reference-capture-fast-go.policy';
import {
  parseHfRecoveryPolicyV2ConfigFromEnv,
  PROVISIONAL_RECOVERY_OVERLAP_MS,
  PROVISIONAL_SETTLEMENT_DELAY_MS,
  PROVISIONAL_HF_POLL_INTERVAL_MS,
  resolveHfRecoveryPolicyForToken,
  type HfRecoveryPolicyV2Config,
} from './reference-capture-hf-recovery-v2.policy';

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

  getPrearmMaxAgeMs(): number {
    return this.configService.get<number>('referenceCapture.prearmMaxAgeMs') ?? 15 * 60 * 1000;
  }

  getFastGoFirstCycleTimeoutMs(): number {
    return normalizeFastGoTimeoutMs(
      this.configService.get<number>('referenceCapture.fastGoFirstCycleTimeoutMs'),
    );
  }

  /** Hard invariant: reference capture must never affect live trip FSM. */
  isTripDetectionAffected(): boolean {
    return false;
  }

  /** Hard invariant: reference capture must not replace production schedulers. */
  replacesProductionScheduler(): boolean {
    return false;
  }

  getHfRecoveryPolicyConfig(): HfRecoveryPolicyV2Config {
    return parseHfRecoveryPolicyV2ConfigFromEnv({
      HF_RECOVERY_POLICY_V2_ENABLED: this.configService.get<boolean>('referenceCapture.hfRecoveryPolicyV2Enabled')
        ? 'true'
        : 'false',
      HF_SETTLEMENT_DELAY_MS: String(
        this.configService.get<number>('referenceCapture.hfSettlementDelayMs') ??
          PROVISIONAL_SETTLEMENT_DELAY_MS,
      ),
      HF_RECOVERY_OVERLAP_MS: String(
        this.configService.get<number>('referenceCapture.hfRecoveryOverlapMs') ??
          PROVISIONAL_RECOVERY_OVERLAP_MS,
      ),
      HF_HISTORICAL_POLL_INTERVAL_MS: String(
        this.configService.get<number>('referenceCapture.hfHistoricalPollIntervalMs') ??
          PROVISIONAL_HF_POLL_INTERVAL_MS,
      ),
      HF_RECOVERY_SWEEP_ENABLED: this.configService.get<boolean>('referenceCapture.hfRecoverySweepEnabled')
        ? 'true'
        : 'false',
      HF_RECOVERY_SWEEP_INTERVAL_MS: String(
        this.configService.get<number>('referenceCapture.hfRecoverySweepIntervalMs'),
      ),
      HF_RECOVERY_SWEEP_LOOKBACK_MS: String(
        this.configService.get<number>('referenceCapture.hfRecoverySweepLookbackMs'),
      ),
      HF_RECOVERY_POLICY_V2_CANARY_ONLY: this.configService.get<boolean>(
        'referenceCapture.hfRecoveryPolicyV2CanaryOnly',
      )
        ? 'true'
        : 'false',
      HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS: (
        this.configService.get<number[]>('referenceCapture.hfRecoveryPolicyV2CanaryTokenIds') ?? []
      ).join(','),
      HF_AVAILABILITY_CALIBRATION_ENABLED: this.configService.get<boolean>(
        'referenceCapture.hfAvailabilityCalibrationEnabled',
      )
        ? 'true'
        : 'false',
    });
  }

  resolveHfRecoveryPolicyForToken(tokenId: number): HfRecoveryPolicyV2Config {
    return resolveHfRecoveryPolicyForToken(this.getHfRecoveryPolicyConfig(), tokenId);
  }
}
