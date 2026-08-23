import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CommunicationRetentionService } from './communication-retention.service';

@Injectable()
export class CommunicationRetentionScheduler {
  private readonly logger = new Logger(CommunicationRetentionScheduler.name);

  constructor(private readonly retention: CommunicationRetentionService) {}

  @Cron('30 3 * * *')
  async scheduledRun(): Promise<void> {
    await this.retention.runOnce({ trigger: 'cron' });
  }
}
