import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationRetentionService } from './notification-retention.service';

@Injectable()
export class NotificationRetentionScheduler {
  private readonly logger = new Logger(NotificationRetentionScheduler.name);

  constructor(private readonly retention: NotificationRetentionService) {}

  @Cron('0 3 * * *')
  async scheduledRun(): Promise<void> {
    await this.retention.runOnce({ trigger: 'cron' });
  }
}
