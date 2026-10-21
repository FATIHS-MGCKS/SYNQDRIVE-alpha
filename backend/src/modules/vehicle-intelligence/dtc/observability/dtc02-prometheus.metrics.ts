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

const ALLOWED_WEBHOOK_CAPABILITY = new Set([
  'CONFIRMED_COMPLETE',
  'PARTIAL',
  'STALE',
  'DUPLICATE',
  'UNKNOWN',
]);

const ALLOWED_ADAPTIVE_SHADOW_PHASES = new Set(['run', 'skipped_invalid_config', 'error']);

const ALLOWED_ADAPTIVE_PLAN_OUTCOMES = new Set([
  'defer_projected',
  'accelerate_projected',
  'legacy_parity',
  'excluded',
]);

const ALLOWED_ADAPTIVE_EVIDENCE_QUALITY = new Set(['high', 'medium', 'low', 'unknown']);

const ALLOWED_ADAPTIVE_FALLBACK_REASONS = new Set([
  'UNKNOWN_CAPABILITY',
  'PROVIDER_ERROR',
  'STALE_SOURCE',
  'UNRELIABLE_WEBHOOK',
  'PARTIAL_BLOCKS_COMPLETE',
  'CONSERVATIVE',
  'EXCLUDED_LIFECYCLE',
  'OTHER',
]);

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
  webhookCapabilityTotal: Counter<string>;
  adaptiveShadowTotal: Counter<string>;
  adaptivePlanTotal: Counter<string>;
  adaptiveFallbackTotal: Counter<string>;
  adaptiveProjectedReductionSeconds: Histogram<string>;
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

  const webhookCapabilityTotal = new Counter({
    name: 'synqdrive_dtc02_webhook_capability_total',
    help: 'DTC-02 P2 webhook ingress capability classification (no vehicle labels)',
    labelNames: ['classification'],
    registers: [registry],
  });

  const adaptiveShadowTotal = new Counter({
    name: 'synqdrive_dtc02_adaptive_shadow_total',
    help: 'DTC-02 P3 adaptive scheduler shadow batch phases (projected only)',
    labelNames: ['phase'],
    registers: [registry],
  });

  const adaptivePlanTotal = new Counter({
    name: 'synqdrive_dtc02_adaptive_plan_total',
    help: 'DTC-02 P3 adaptive poll plan outcomes (projected vs legacy 3h tick)',
    labelNames: ['outcome', 'evidence_quality'],
    registers: [registry],
  });

  const adaptiveFallbackTotal = new Counter({
    name: 'synqdrive_dtc02_adaptive_fallback_total',
    help: 'DTC-02 P3 adaptive planner legacy fallback reasons (normalized)',
    labelNames: ['reason'],
    registers: [registry],
  });

  const adaptiveProjectedReductionSeconds = new Histogram({
    name: 'synqdrive_dtc02_adaptive_projected_poll_reduction_seconds',
    help: 'Projected poll spacing reduction vs legacy next check (shadow only; not observed savings)',
    labelNames: ['kind'],
    buckets: [0, 300, 900, 1800, 3600, 7200, 10800],
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
    webhookCapabilityTotal,
    adaptiveShadowTotal,
    adaptivePlanTotal,
    adaptiveFallbackTotal,
    adaptiveProjectedReductionSeconds,
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
  for (const classification of ALLOWED_WEBHOOK_CAPABILITY) {
    handles.webhookCapabilityTotal.inc({ classification }, 0);
  }
}

export function normalizeWebhookCapabilityClassification(raw: string | undefined): string {
  const value = (raw ?? '').trim().toUpperCase();
  return ALLOWED_WEBHOOK_CAPABILITY.has(value) ? value : 'UNKNOWN';
}

export function normalizeAdaptivePlanOutcome(raw: string | undefined): string {
  const value = (raw ?? '').trim().toLowerCase();
  return ALLOWED_ADAPTIVE_PLAN_OUTCOMES.has(value) ? value : 'legacy_parity';
}

export function normalizeAdaptiveEvidenceQuality(raw: string | undefined): string {
  const value = (raw ?? '').trim().toLowerCase();
  return ALLOWED_ADAPTIVE_EVIDENCE_QUALITY.has(value) ? value : 'unknown';
}

export function normalizeAdaptiveFallbackReason(decisionReason: string | undefined): string {
  const r = (decisionReason ?? '').toUpperCase();
  if (r.includes('EXCLUDED')) return 'EXCLUDED_LIFECYCLE';
  if (r.includes('UNKNOWN_PROVIDER')) return 'UNKNOWN_CAPABILITY';
  if (r.includes('PROVIDER')) return 'PROVIDER_ERROR';
  if (r.includes('STALE') || r.includes('MISSING_SUCCESS')) return 'STALE_SOURCE';
  if (r.includes('UNRELIABLE_WEBHOOK')) return 'UNRELIABLE_WEBHOOK';
  if (r.includes('PARTIAL_WEBHOOK')) return 'PARTIAL_BLOCKS_COMPLETE';
  if (r.includes('FALLBACK') || r.includes('LEGACY')) return 'CONSERVATIVE';
  return 'OTHER';
}

export function classifyAdaptivePlanOutcome(input: {
  excluded: boolean;
  projectedPollReductionMs: number;
}): string {
  if (input.excluded) return 'excluded';
  if (input.projectedPollReductionMs >= 5 * 60_000) return 'defer_projected';
  if (input.projectedPollReductionMs <= -5 * 60_000) return 'accelerate_projected';
  return 'legacy_parity';
}

/** For tests: ensure metric exposition strings do not use forbidden label names. */
export function metricExpositionForbiddenLabelPattern(): RegExp {
  return /\bvehicle_id\b|\btoken_id\b|\bvin\b|\btenant_id\b/i;
}

export function assertDtc02AdaptiveMetricLabelsForTests(handles: Dtc02MetricsHandles): void {
  for (const phase of ALLOWED_ADAPTIVE_SHADOW_PHASES) {
    handles.adaptiveShadowTotal.inc({ phase }, 0);
  }
  for (const outcome of ALLOWED_ADAPTIVE_PLAN_OUTCOMES) {
    for (const evidence_quality of ALLOWED_ADAPTIVE_EVIDENCE_QUALITY) {
      handles.adaptivePlanTotal.inc({ outcome, evidence_quality }, 0);
    }
  }
  for (const reason of ALLOWED_ADAPTIVE_FALLBACK_REASONS) {
    handles.adaptiveFallbackTotal.inc({ reason }, 0);
  }
  handles.adaptiveProjectedReductionSeconds.observe({ kind: 'projected' }, 0);
}
