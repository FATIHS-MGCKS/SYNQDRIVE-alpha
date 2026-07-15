import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { BillingReconciliationService } from '@modules/billing/billing-reconciliation.service';
import { BillingMonitoringService } from '@modules/billing/billing-monitoring.service';

const DEFAULT_BILLING_RECONCILIATION_INTERVAL_MS = 6 * 60 * 60_000;

@Injectable()
export class BillingReconciliationScheduler {
  private readonly logger = new Logger(BillingReconciliationScheduler.name);
  private running = false;

  constructor(
    private readonly reconciliation: BillingReconciliationService,
    private readonly monitoring: BillingMonitoringService,
    private readonly configService: ConfigService,
  ) {}

  @Interval(DEFAULT_BILLING_RECONCILIATION_INTERVAL_MS)
  async runScheduledReconciliation(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    if (!RuntimeStatusRegistry.getWorkersEnabled()) {
      return;
    }
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const result = await this.reconciliation.runPeriodicReconciliation();
      const alerts = await this.monitoring.collectAlerts();
      await this.monitoring.logAlerts(alerts);

      if (
        result.scanned > 0
        || result.driftCount > 0
        || result.errorCount > 0
        || alerts.length > 0
      ) {
        this.logger.log(
          `Billing reconciliation run ${result.runId}: status=${result.status} scanned=${result.scanned} drifts=${result.driftCount} errors=${result.errorCount} alerts=${alerts.length}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Billing reconciliation scheduler failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }

  private isEnabled(): boolean {
    return this.configService.get<boolean>('billingReconciliation.schedulerEnabled') !== false;
  }
}
