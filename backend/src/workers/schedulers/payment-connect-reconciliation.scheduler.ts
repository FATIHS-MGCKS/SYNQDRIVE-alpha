import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { PaymentConnectReconciliationService } from '@modules/payments/payment-connect-reconciliation.service';
import { formatPaymentLogPayload } from '@modules/payments/utils/payment-log.util';

/**
 * Periodic Connect payment reconciliation — reprocesses stuck webhooks,
 * expires checkouts, syncs account status, and emits integrity alerts.
 */
@Injectable()
export class PaymentConnectReconciliationScheduler {
  private readonly logger = new Logger(PaymentConnectReconciliationScheduler.name);
  private running = false;

  constructor(
    private readonly reconciliation: PaymentConnectReconciliationService,
  ) {}

  @Interval(5 * 60_000)
  async runReconciliation(): Promise<void> {
    if (!RuntimeStatusRegistry.getWorkersEnabled()) {
      return;
    }
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const result = await this.reconciliation.runPeriodicReconciliation();
      if (
        result.webhooksReprocessed > 0
        || result.expiredCheckouts > 0
        || result.accountsSynced > 0
        || result.alerts.length > 0
      ) {
        this.logger.log(
          formatPaymentLogPayload('PAYMENT_RECONCILE_RUN', {}, {
            webhooksReprocessed: result.webhooksReprocessed,
            webhooksFailed: result.webhooksFailed,
            expiredCheckouts: result.expiredCheckouts,
            accountsSynced: result.accountsSynced,
            alertCount: result.alerts.length,
          }),
        );
      }
    } catch (error) {
      this.logger.error(
        formatPaymentLogPayload('PAYMENT_RECONCILE_RUN_FAILED', {}, {
          error: error instanceof Error ? error.message : 'unknown',
        }),
      );
    } finally {
      this.running = false;
    }
  }
}
