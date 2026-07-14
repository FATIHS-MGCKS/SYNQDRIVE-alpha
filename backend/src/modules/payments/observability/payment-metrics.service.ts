import { Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Gauge } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

/**
 * Low-cardinality Prometheus metrics for end-customer Connect payments.
 * Labels: outcome, event_type, reason — never org/booking/customer IDs.
 */
@Injectable()
export class PaymentMetricsService implements OnModuleInit {
  readonly checkoutCreation: Counter<string>;
  readonly webhookProcessing: Counter<string>;
  readonly reconciliationMismatch: Counter<string>;
  readonly paymentSuccess: Counter<string>;
  readonly paymentEmailFailure: Counter<string>;
  readonly refundFailure: Counter<string>;
  readonly unknownConnectedAccount: Counter<string>;
  readonly connectWebhookBacklog: Gauge<string>;
  readonly paymentEmailDeadLetter: Gauge<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.checkoutCreation = new Counter({
      name: 'synqdrive_payment_checkout_creation_total',
      help: 'Stripe Connect checkout session creation attempts',
      labelNames: ['result'],
      registers: [register],
    });

    this.webhookProcessing = new Counter({
      name: 'synqdrive_payment_webhook_processing_total',
      help: 'Connect webhook reconciliation outcomes',
      labelNames: ['event_type', 'outcome'],
      registers: [register],
    });

    this.reconciliationMismatch = new Counter({
      name: 'synqdrive_payment_reconciliation_mismatch_total',
      help: 'Payment reconciliation integrity mismatches detected',
      labelNames: ['kind'],
      registers: [register],
    });

    this.paymentSuccess = new Counter({
      name: 'synqdrive_payment_success_total',
      help: 'Successful end-customer payment reconciliations',
      labelNames: ['result'],
      registers: [register],
    });

    this.paymentEmailFailure = new Counter({
      name: 'synqdrive_payment_email_failure_total',
      help: 'Payment email outbox failures',
      labelNames: ['email_type'],
      registers: [register],
    });

    this.refundFailure = new Counter({
      name: 'synqdrive_payment_refund_failure_total',
      help: 'Payment refund failures',
      labelNames: ['reason'],
      registers: [register],
    });

    this.unknownConnectedAccount = new Counter({
      name: 'synqdrive_payment_unknown_connected_account_total',
      help: 'Connect webhooks with unresolved connected account',
      registers: [register],
    });

    this.connectWebhookBacklog = new Gauge({
      name: 'synqdrive_payment_connect_webhook_backlog',
      help: 'Count of Connect webhook events pending processing',
      labelNames: ['status'],
      registers: [register],
    });

    this.paymentEmailDeadLetter = new Gauge({
      name: 'synqdrive_payment_email_dead_letter',
      help: 'Payment email outbox dead-letter count',
      registers: [register],
    });
  }

  onModuleInit(): void {
    // Metrics registered in constructor via shared registry.
  }
}
