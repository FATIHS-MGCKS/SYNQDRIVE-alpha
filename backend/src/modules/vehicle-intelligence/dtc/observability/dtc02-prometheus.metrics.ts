import type { Registry } from 'prom-client';
import { Counter, Gauge, Histogram } from 'prom-client';

const ALLOWED_FAN_OUT_SKIP_REASONS = new Set([
  'REGISTRY_LIFECYCLE_EXCLUDED',
  'COHORT_GATE_INVALID_CONFIG',
  'NOT_IN_COHORT_ALLOWLIST',
  'MISSING_DIMO_TOKEN',
  'POLL_INELIGIBLE',
  'OTHER',
]);

const ALLOWED_WEBHOOK_SKIP_REASONS = new Set([
  'REGISTRY_LIFECYCLE_EXCLUDED',
  'COHORT_GATE_INVALID_CONFIG',
  'NOT_IN_COHORT_ALLOWLIST',
  'OTHER',
]);

const ALLOWED_POLL_PATHS = new Set(['legacy', 'safety01a', 'unknown']);
const ALLOWED_POLL_OUTCOMES = new Set([
  'success',
  'noop_already_applied',
  'refresh_source_watermark',
  'applied_snapshot',
  'rejected_snapshot',
  'skipped_ineligible',
  'skipped_admission',
  'auth_denied',
  'failure',
  'provider_timeout',
  'provider_error',
  'legacy_success',
  'legacy_failure',
  'unknown',
]);

const ALLOWED_WEBHOOK_PHASES = new Set([
  'received',
  'admitted',
  'rejected',
  'processed',
  'error',
]);

const ALLOWED_EVIDENCE = new Set(['legacy', 'partial', 'complete', 'unknown']);

export type Dtc02MetricsHandles = {
  schedulerTickTotal: Counter<string>;
  fanOutVehiclesTotal: Counter<string>;
  fanOutSkipTotal: Counter<string>;
  pollTotal: Counter<string>;
  pollOutcomeTotal: Counter<string>;
  providerRequestTotal: Counter<string>;
  pollDurationSeconds: Histogram<string>;
  webhookTotal: Counter<string>;
  webhookSkipTotal: Counter<string>;
  webhookEvidenceTotal: Counter<string>;
  outboxPending: Gauge<string>;
  outboxUnprocessedErrors: Gauge<string>;
  fleetFreshnessVehicles: Gauge<string>;
  headVlsDivergenceVehicles: Gauge<string>;
};

export function normalizeFanOutSkipReason(raw: string | undefined): string {
  const reason = (raw ?? '').trim();
  if (!reason) return 'OTHER';
  if (ALLOWED_FAN_OUT_SKIP_REASONS.has(reason)) return reason;
  if (reason.startsWith('POLL_INELIGIBLE') || reason.includes('INELIGIBLE')) {
    return 'POLL_INELIGIBLE';
  }
  return 'OTHER';
}

export function normalizeWebhookSkipReason(raw: string | undefined): string {
  const reason = (raw ?? '').trim();
  if (!reason) return 'OTHER';
  if (ALLOWED_WEBHOOK_SKIP_REASONS.has(reason)) return reason;
  return 'OTHER';
}

export function normalizePollPath(raw: string | undefined): string {
  const path = (raw ?? '').trim();
  return ALLOWED_POLL_PATHS.has(path) ? path : 'unknown';
}

export function normalizePollOutcome(raw: string | undefined): string {
  const outcome = (raw ?? '').trim();
  const lower = outcome.toLowerCase();
  if (ALLOWED_POLL_OUTCOMES.has(lower)) return lower;
  if (lower === 'noop_already_applied') return 'noop_already_applied';
  if (lower === 'refresh_source_watermark') return 'refresh_source_watermark';
  if (outcome.startsWith('REJECT_') || outcome.startsWith('APPLY_')) {
    if (outcome.startsWith('APPLY_')) return 'applied_snapshot';
    return 'rejected_snapshot';
  }
  return 'unknown';
}

export function classifyProviderFailure(errorMessage: string): 'auth_denied' | 'provider_timeout' | 'provider_error' {
  const msg = errorMessage.toLowerCase();
  if (msg.includes('403') || msg.includes('auth_denied')) return 'auth_denied';
  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('econnaborted')) {
    return 'provider_timeout';
  }
  return 'provider_error';
}

export function registerDtc02Metrics(registry: Registry): Dtc02MetricsHandles {
  const schedulerTickTotal = new Counter({
    name: 'synqdrive_dtc02_scheduler_tick_total',
    help: 'Natural DTC scheduler fan-out ticks (BullMQ dtc-poll repeat job processed)',
    labelNames: ['result'],
    registers: [registry],
  });

  const fanOutVehiclesTotal = new Counter({
    name: 'synqdrive_dtc02_fan_out_vehicles_total',
    help: 'DTC fan-out per-vehicle disposition (low-cardinality aggregate)',
    labelNames: ['disposition'],
    registers: [registry],
  });

  const fanOutSkipTotal = new Counter({
    name: 'synqdrive_dtc02_fan_out_skip_total',
    help: 'DTC fan-out skips by normalized reason (no vehicle id labels)',
    labelNames: ['reason'],
    registers: [registry],
  });

  const pollTotal = new Counter({
    name: 'synqdrive_dtc02_poll_total',
    help: 'DTC poll job attempts by runtime path',
    labelNames: ['path', 'phase'],
    registers: [registry],
  });

  const pollOutcomeTotal = new Counter({
    name: 'synqdrive_dtc02_poll_outcome_total',
    help: 'DTC poll processing outcomes (includes noop and legacy)',
    labelNames: ['path', 'outcome'],
    registers: [registry],
  });

  const providerRequestTotal = new Counter({
    name: 'synqdrive_dtc02_provider_request_total',
    help: 'DIMO provider requests issued for DTC ingress only (poll path)',
    labelNames: ['ingress', 'result'],
    registers: [registry],
  });

  const pollDurationSeconds = new Histogram({
    name: 'synqdrive_dtc02_poll_duration_seconds',
    help: 'DTC per-vehicle poll processing duration',
    labelNames: ['path', 'result'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15, 30],
    registers: [registry],
  });

  const webhookTotal = new Counter({
    name: 'synqdrive_dtc02_webhook_total',
    help: 'DTC webhook obdDTCList handling phases',
    labelNames: ['phase'],
    registers: [registry],
  });

  const webhookSkipTotal = new Counter({
    name: 'synqdrive_dtc02_webhook_skip_total',
    help: 'DTC webhook skips by normalized admission reason',
    labelNames: ['reason'],
    registers: [registry],
  });

  const webhookEvidenceTotal = new Counter({
    name: 'synqdrive_dtc02_webhook_evidence_total',
    help: 'DTC webhook source evidence class (partial vs complete vs legacy)',
    labelNames: ['evidence'],
    registers: [registry],
  });

  const outboxPending = new Gauge({
    name: 'synqdrive_dtc02_outbox_pending',
    help: 'Unprocessed vehicle_dtc_snapshot_outbox rows',
    registers: [registry],
  });

  const outboxUnprocessedErrors = new Gauge({
    name: 'synqdrive_dtc02_outbox_unprocessed_errors',
    help: 'Outbox rows with last_error set and processed_at null',
    registers: [registry],
  });

  const fleetFreshnessVehicles = new Gauge({
    name: 'synqdrive_dtc02_fleet_freshness_vehicles',
    help: 'DIMO-linked vehicles by registry lifecycle and DTC freshness bucket (scheduler tick snapshot)',
    labelNames: ['lifecycle', 'freshness'],
    registers: [registry],
  });

  const headVlsDivergenceVehicles = new Gauge({
    name: 'synqdrive_dtc02_head_vls_divergence_vehicles',
    help: 'Vehicles where source-head last_poll_fetch_at differs from VLS last_dtc_poll_at',
    registers: [registry],
  });

  return {
    schedulerTickTotal,
    fanOutVehiclesTotal,
    fanOutSkipTotal,
    pollTotal,
    pollOutcomeTotal,
    providerRequestTotal,
    pollDurationSeconds,
    webhookTotal,
    webhookSkipTotal,
    webhookEvidenceTotal,
    outboxPending,
    outboxUnprocessedErrors,
    fleetFreshnessVehicles,
    headVlsDivergenceVehicles,
  };
}

export function safeMetricCall(fn: () => void): void {
  try {
    fn();
  } catch {
    // Metrics must never break DTC processing.
  }
}

export function assertDtc02MetricLabelsForTests(handles: Dtc02MetricsHandles): void {
  for (const reason of ALLOWED_FAN_OUT_SKIP_REASONS) {
    handles.fanOutSkipTotal.inc({ reason }, 0);
  }
  for (const phase of ALLOWED_WEBHOOK_PHASES) {
    handles.webhookTotal.inc({ phase }, 0);
  }
  for (const evidence of ALLOWED_EVIDENCE) {
    handles.webhookEvidenceTotal.inc({ evidence }, 0);
  }
}
