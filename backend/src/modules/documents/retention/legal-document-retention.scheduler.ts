import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LegalDocumentRetentionService } from './legal-document-retention.service';

/** Nightly legal document retention purge — cron only, not on deploy. */
@Injectable()
export class LegalDocumentRetentionScheduler {
  private readonly logger = new Logger(LegalDocumentRetentionScheduler.name);

  constructor(private readonly retention: LegalDocumentRetentionService) {}

  @Cron('45 4 * * *')
  async scheduledRun(): Promise<void> {
    const report = await this.retention.runOnce({ trigger: 'cron' });
    if (report.phases.length > 0) {
      this.logger.log(
        `Legal document retention cron — dryRun=${report.dryRun} affected=${report.totals.affected} failed=${report.totals.failed}`,
      );
    }
  }
}
