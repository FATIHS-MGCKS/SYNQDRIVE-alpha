import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import rawFuelRefuelFallbackConfig from '@config/raw-fuel-refuel-fallback.config';
import { canExecuteRawRefuelCandidateRecovery } from '@config/raw-fuel-refuel-fallback.config';
import { RawRefuelCandidateRecoveryService } from '@modules/vehicle-intelligence/energy-events/raw-refuel-candidate/raw-refuel-candidate-recovery.service';
import { RawRefuelCandidateRecoveryRepository } from '@modules/vehicle-intelligence/energy-events/raw-refuel-candidate/raw-refuel-candidate-recovery.repository';
import { RawFuelRefuelFallbackMetricsService } from '@modules/vehicle-intelligence/energy-events/raw-fuel-refuel-fallback/raw-fuel-refuel-fallback-metrics.service';
import { PrismaService } from '@shared/database/prisma.service';

/**
 * F10.6.8-B — candidate-centric durable recovery (SKIP LOCKED claim, no trip rolling window).
 */
@Injectable()
export class RawRefuelCandidateRecoveryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RawRefuelCandidateRecoveryScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private inProgress = false;
  private readonly recoveryRepository: RawRefuelCandidateRecoveryRepository;

  constructor(
    @Inject(rawFuelRefuelFallbackConfig.KEY)
    private readonly config: ConfigType<typeof rawFuelRefuelFallbackConfig>,
    private readonly prisma: PrismaService,
    private readonly recoveryService: RawRefuelCandidateRecoveryService,
    @Optional() private readonly metrics?: RawFuelRefuelFallbackMetricsService,
  ) {
    this.recoveryRepository = new RawRefuelCandidateRecoveryRepository(prisma);
  }

  shouldStartRecoveryTimer(): boolean {
    return canExecuteRawRefuelCandidateRecovery(process.env);
  }

  onModuleInit(): void {
    if (!this.shouldStartRecoveryTimer()) {
      return;
    }

    const intervalMs = Math.max(30_000, this.config.candidateRecoveryIntervalMs);
    this.timer = setInterval(() => {
      void this.runRecoveryTick();
    }, intervalMs);
    this.logger.log(
      JSON.stringify({
        event: 'rfrf_candidate_recovery_timer_started',
        intervalMs,
        batchSize: this.config.candidateRecoveryBatchSize,
        claimStrategy: 'postgres_for_update_skip_locked',
      }),
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runRecoveryTick(): Promise<number> {
    if (!canExecuteRawRefuelCandidateRecovery(process.env)) {
      this.metrics?.recordCandidateRecoverySkippedDisabled();
      return 0;
    }
    if (this.inProgress) {
      return 0;
    }

    this.inProgress = true;
    const now = new Date();
    try {
      this.metrics?.recordCandidateRecoveryTick();
      const due = await this.recoveryRepository.countDueCandidates(now);
      this.metrics?.recordCandidateRecoveryDue(due);

      const batch = await this.recoveryService.runRecoveryBatch(
        this.config.candidateRecoveryBatchSize,
        now,
      );
      return batch.processed;
    } catch (error) {
      this.metrics?.recordCandidateRecoveryError();
      this.logger.error(
        JSON.stringify({
          event: 'rfrf_candidate_recovery_tick_failed',
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return 0;
    } finally {
      this.inProgress = false;
    }
  }
}
