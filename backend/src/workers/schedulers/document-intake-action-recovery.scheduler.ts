import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import documentExtractionConfig from '@config/document-extraction.config';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import { DocumentIntakeActionRecoveryService } from '@modules/document-extraction/diagnostic/document-intake-action-recovery.service';
import { DocumentExtractionObservabilityService } from '@modules/document-extraction/document-extraction-observability.service';

/**
 * Recovers stale document action-plan apply lifecycles (APPLYING) and retries
 * only missing actions after downstream reconciliation.
 */
@Injectable()
export class DocumentIntakeActionRecoveryScheduler {
  private readonly logger = new Logger(DocumentIntakeActionRecoveryScheduler.name);
  private recoveryInProgress = false;

  constructor(
    private readonly recoveryService: DocumentIntakeActionRecoveryService,
    @Inject(documentExtractionConfig.KEY)
    private readonly config: ConfigType<typeof documentExtractionConfig>,
    private readonly observability: DocumentExtractionObservabilityService,
  ) {}

  @Interval(120_000)
  async recoverStaleActionApplies(): Promise<void> {
    if (!this.config.actionRecoveryEnabled) return;
    if (!this.config.queueEnabled) return;
    if (!canEnqueueQueue(this.logger, 'document-intake-action-recovery')) return;
    if (this.recoveryInProgress) return;

    this.recoveryInProgress = true;
    try {
      const results = await this.recoveryService.recoverStuckApplyingCandidates({
        dryRun: false,
        limit: this.config.actionRecoveryBatchSize,
        olderThan: new Date(Date.now() - this.config.staleApplyingThresholdMs),
      });
      const succeeded = results.filter((row) => row.success).length;
      const failed = results.length - succeeded;
      for (let i = 0; i < succeeded; i += 1) {
        this.observability.recordRecovery({ kind: 'action', outcome: 'recovered' });
      }
      for (let i = 0; i < failed; i += 1) {
        this.observability.recordRecovery({ kind: 'action', outcome: 'skipped' });
      }
      if (results.length > 0) {
        this.logger.warn(
          `[DocIntakeActionRecovery] processed=${results.length} succeeded=${succeeded}`,
        );
      }
    } finally {
      this.recoveryInProgress = false;
    }
  }
}
