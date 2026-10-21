import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CommunicationRetentionService } from './communication-retention.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

@Injectable()
export class CommunicationRetentionScheduler {
  private readonly logger = new Logger(CommunicationRetentionScheduler.name);

  constructor(
    private readonly retention: CommunicationRetentionService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Cron('30 3 * * *')
  async scheduledRun(): Promise<void> {
    if (!this.leaderGuard.shouldRun('communication_retention')) return;
    await this.retention.runOnce({ trigger: 'cron' });
  }
}
