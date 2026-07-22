import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { IamDataRetentionWorkerService } from '../../modules/iam-data-retention/iam-data-retention-worker.service';

@Injectable()
export class IamDataRetentionScheduler {
  private readonly logger = new Logger(IamDataRetentionScheduler.name);

  constructor(
    private readonly worker: IamDataRetentionWorkerService,
    private readonly config: ConfigService,
  ) {}

  @Cron('0 4 * * *')
  async handleCron(): Promise<void> {
    const enabled = this.config.get<boolean>('iamDataRetention.enabled');
    if (!enabled) {
      return;
    }

    const dryRun = this.config.get<boolean>('iamDataRetention.dryRun');
    this.logger.log(`IAM data retention cron starting (dryRun=${dryRun})`);

    try {
      const result = await this.worker.run({ dryRun, trigger: 'cron' });
      this.logger.log(
        `IAM data retention cron finished: processed=${result.processed} errors=${result.errors.length}`,
      );
    } catch (error) {
      this.logger.error('IAM data retention cron failed', error);
    }
  }
}
