import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { PhysicalStateShadowObservationRepository } from './physical-state-shadow-observation.repository';

@Injectable()
export class PhysicalStateShadowObservationRetentionScheduler {
  private readonly logger = new Logger(PhysicalStateShadowObservationRetentionScheduler.name);

  constructor(
    private readonly observationRepository: PhysicalStateShadowObservationRepository,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Cron('45 4 * * *')
  async pruneExpiredObservations(): Promise<void> {
    if (!this.leaderGuard.shouldRun('physical_state_shadow_observation_retention')) return;

    try {
      const deleted = await this.observationRepository.pruneExpiredObservations();
      if (deleted > 0) {
        this.logger.log({
          msg: 'physical_state_shadow_observation_retention_pruned',
          deletedCount: deleted,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn({
        msg: 'physical_state_shadow_observation_retention_prune_failed',
        error: message,
      });
    }
  }
}
