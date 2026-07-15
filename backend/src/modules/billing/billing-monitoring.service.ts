import { Injectable, Logger } from '@nestjs/common';
import {
  BillingDomainEventOutboxDeliveryStatus,
  BillingReconciliationDriftSeverity,
  StripeWebhookEventStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BILLING_RECONCILIATION_STUCK_WEBHOOK_MIN_AGE_MS } from './domain/billing-reconciliation';

export type BillingMonitoringAlertSeverity = 'info' | 'warning' | 'critical';

export interface BillingMonitoringAlert {
  code: string;
  severity: BillingMonitoringAlertSeverity;
  message: string;
  count: number;
}

@Injectable()
export class BillingMonitoringService {
  private readonly logger = new Logger(BillingMonitoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  async collectAlerts(): Promise<BillingMonitoringAlert[]> {
    const stuckBefore = new Date(Date.now() - BILLING_RECONCILIATION_STUCK_WEBHOOK_MIN_AGE_MS);
    const [failedWebhooks, deadLetterDeliveries, criticalDrifts, pendingOutbox] =
      await Promise.all([
        this.prisma.stripeWebhookEvent.count({
          where: {
            status: StripeWebhookEventStatus.FAILED,
            createdAt: { lte: stuckBefore },
          },
        }),
        this.prisma.billingDomainEventOutboxDelivery.count({
          where: { status: BillingDomainEventOutboxDeliveryStatus.DEAD_LETTER },
        }),
        this.prisma.billingReconciliationDrift.count({
          where: {
            resolvedAt: null,
            severity: BillingReconciliationDriftSeverity.CRITICAL,
          },
        }),
        this.prisma.billingDomainEventOutboxDelivery.count({
          where: {
            status: BillingDomainEventOutboxDeliveryStatus.PENDING,
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
          },
        }),
      ]);

    const alerts: BillingMonitoringAlert[] = [];

    if (failedWebhooks > 0) {
      alerts.push({
        code: 'BILLING_WEBHOOK_FAILED',
        severity: 'warning',
        message: 'Stripe billing webhooks stuck in FAILED status',
        count: failedWebhooks,
      });
    }
    if (deadLetterDeliveries > 0) {
      alerts.push({
        code: 'BILLING_OUTBOX_DEAD_LETTER',
        severity: 'critical',
        message: 'Billing outbox deliveries reached dead-letter state',
        count: deadLetterDeliveries,
      });
    }
    if (criticalDrifts > 0) {
      alerts.push({
        code: 'BILLING_RECONCILIATION_CRITICAL_DRIFT',
        severity: 'critical',
        message: 'Open billing reconciliation drifts with CRITICAL severity',
        count: criticalDrifts,
      });
    }
    if (pendingOutbox > 50) {
      alerts.push({
        code: 'BILLING_OUTBOX_BACKLOG',
        severity: 'warning',
        message: 'Billing outbox delivery backlog is elevated',
        count: pendingOutbox,
      });
    }

    return alerts;
  }

  async logAlerts(alerts: BillingMonitoringAlert[]): Promise<void> {
    for (const alert of alerts) {
      const payload = `${alert.code} count=${alert.count}: ${alert.message}`;
      if (alert.severity === 'critical') {
        this.logger.error(payload);
      } else if (alert.severity === 'warning') {
        this.logger.warn(payload);
      } else {
        this.logger.log(payload);
      }
    }
  }
}
