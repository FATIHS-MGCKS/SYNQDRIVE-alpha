import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DocumentRetentionService } from '@modules/document-extraction/document-retention.service';

/** Nightly document retention — does not run on deploy; cron only. */
@Injectable()
export class DocumentRetentionScheduler {
  private readonly logger = new Logger(DocumentRetentionScheduler.name);

  constructor(private readonly retention: DocumentRetentionService) {}

  @Cron('30 4 * * *')
  async scheduledRun(): Promise<void> {
    const report = await this.retention.runOnce({ trigger: 'cron' });
    if (report.phases.length > 0) {
      this.logger.log(
        `Document retention cron — dryRun=${report.dryRun} affected=${report.totals.affected} candidates=${report.totals.candidates}`,
      );
    }
  }
}
