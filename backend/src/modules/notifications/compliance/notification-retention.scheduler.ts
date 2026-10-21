import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationRetentionService } from './notification-retention.service';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';

@Injectable()
export class NotificationRetentionScheduler {
  private readonly logger = new Logger(NotificationRetentionScheduler.name);

  constructor(
    private readonly retention: NotificationRetentionService,
    private readonly leaderGuard: SchedulerLeaderGuardService,
  ) {}

  @Cron('0 3 * * *')
  async scheduledRun(): Promise<void> {
    if (!this.leaderGuard.shouldRun('notification_retention')) return;
    await this.retention.runOnce({ trigger: 'cron' });
  }
}
