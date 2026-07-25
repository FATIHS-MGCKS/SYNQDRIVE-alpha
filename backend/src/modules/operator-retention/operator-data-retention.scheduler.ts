import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OperatorDataRetentionService } from './operator-data-retention.service';

/** Nightly operator evidence retention — cron only, not on deploy. */
@Injectable()
export class OperatorDataRetentionScheduler {
  private readonly logger = new Logger(OperatorDataRetentionScheduler.name);

  constructor(private readonly retention: OperatorDataRetentionService) {}

  @Cron('0 5 * * *')
  async scheduledRun(): Promise<void> {
    const report = await this.retention.runOnce({ trigger: 'cron' });
    if (report.phases.length > 0) {
      this.logger.log(
        `Operator data retention cron — dryRun=${report.dryRun} affected=${report.totals.affected} candidates=${report.totals.candidates}`,
      );
    }
  }
}
