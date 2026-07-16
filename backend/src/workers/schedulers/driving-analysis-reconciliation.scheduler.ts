import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DrivingAnalysisReconciliationService } from '@modules/vehicle-intelligence/driving-analysis-reconciliation/driving-analysis-reconciliation.service';

/**
 * Periodic driving analysis reconciliation (P20).
 * Does not interact with trip detection — post-trip / analysis gaps only.
 */
@Injectable()
export class DrivingAnalysisReconciliationScheduler implements OnModuleInit {
  private readonly logger = new Logger(DrivingAnalysisReconciliationScheduler.name);
  private running = false;

  constructor(
    @Optional()
    private readonly reconciliation?: DrivingAnalysisReconciliationService,
  ) {}

  onModuleInit() {
    this.logger.log('Driving analysis reconciliation scheduler active');
  }

  @Interval(600_000)
  async runReconciliation(): Promise<void> {
    if (!this.reconciliation || this.running) return;
    this.running = true;
    try {
      const result = await this.reconciliation.runPeriodicReconciliation();
      if (result.findings.length > 0) {
        this.logger.log(
          `Driving analysis reconciliation tick: findings=${result.findings.length} enqueued=${result.actionsEnqueued}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Driving analysis reconciliation tick failed: ${message}`);
    } finally {
      this.running = false;
    }
  }
}
