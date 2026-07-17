import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BatteryV2RetentionService } from '@modules/vehicle-intelligence/battery-health/retention/battery-v2-retention.service';

/**
 * Nightly Battery V2 retention — offset from generic data retention (03:30).
 * Does not run on module init / deploy; cron only.
 */
@Injectable()
export class BatteryV2RetentionScheduler {
  private readonly logger = new Logger(BatteryV2RetentionScheduler.name);

  constructor(private readonly retention: BatteryV2RetentionService) {}

  @Cron('0 4 * * *')
  async scheduledRun(): Promise<void> {
    const report = await this.retention.runOnce({ trigger: 'cron' });
    if (report.phases.length > 0) {
      this.logger.log(
        `Battery V2 retention cron — dryRun=${report.dryRun} deleted=${report.totals.deleted} aggregated=${report.totals.aggregated}`,
      );
    }
  }
}
