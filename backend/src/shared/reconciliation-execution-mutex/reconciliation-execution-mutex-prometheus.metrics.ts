import type { Registry } from 'prom-client';
import { Counter, Histogram } from 'prom-client';

export interface ReconciliationExecutionMutexMetricsHandles {
  acquireTotal: Counter<string>;
  skippedTotal: Counter<string>;
  renewTotal: Counter<string>;
  releaseTotal: Counter<string>;
  heldDurationMs: Histogram<string>;
}

export function registerReconciliationExecutionMutexMetrics(
  registry: Registry,
): ReconciliationExecutionMutexMetricsHandles {
  const acquireTotal = new Counter({
    name: 'synqdrive_reconciliation_mutex_acquire_total',
    help: 'Reconciliation execution mutex acquire attempts',
    labelNames: ['reconciliation_type', 'result'],
    registers: [registry],
  });

  const skippedTotal = new Counter({
    name: 'synqdrive_reconciliation_mutex_skipped_total',
    help: 'Reconciliation executions skipped due to active lock or Redis outage',
    labelNames: ['reconciliation_type', 'reason'],
    registers: [registry],
  });

  const renewTotal = new Counter({
    name: 'synqdrive_reconciliation_mutex_renew_total',
    help: 'Reconciliation execution mutex lease renew attempts',
    labelNames: ['reconciliation_type', 'result'],
    registers: [registry],
  });

  const releaseTotal = new Counter({
    name: 'synqdrive_reconciliation_mutex_release_total',
    help: 'Reconciliation execution mutex release attempts',
    labelNames: ['reconciliation_type', 'result'],
    registers: [registry],
  });

  const heldDurationMs = new Histogram({
    name: 'synqdrive_reconciliation_mutex_held_duration_ms',
    help: 'Reconciliation execution mutex hold duration in milliseconds',
    labelNames: ['reconciliation_type'],
    buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000, 60_000, 120_000],
    registers: [registry],
  });

  return {
    acquireTotal,
    skippedTotal,
    renewTotal,
    releaseTotal,
    heldDurationMs,
  };
}
