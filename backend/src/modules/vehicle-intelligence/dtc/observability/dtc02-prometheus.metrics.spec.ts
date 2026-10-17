import { Registry } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  assertDtc02AdaptiveMetricLabelsForTests,
  assertDtc02MetricLabelsForTests,
  classifyProviderFailure,
  metricExpositionForbiddenLabelPattern,
  normalizeFanOutSkipReason,
  normalizePollOutcome,
  normalizeWebhookSkipReason,
  registerDtc02Metrics,
} from './dtc02-prometheus.metrics';

describe('dtc02-prometheus.metrics', () => {
  it('registers required DTC-02 metric names', async () => {
    const registry = new Registry();
    const handles = registerDtc02Metrics(registry);
    assertDtc02MetricLabelsForTests(handles);
    assertDtc02AdaptiveMetricLabelsForTests(handles);
    const text = await registry.metrics();
    expect(text).toContain('synqdrive_dtc02_scheduler_tick_total');
    expect(text).toContain('synqdrive_dtc02_adaptive_shadow_total');
    expect(text).toContain('synqdrive_dtc02_adaptive_plan_total');
    expect(text).toContain('synqdrive_dtc02_fan_out_skip_total');
    expect(text).toContain('synqdrive_dtc02_poll_outcome_total');
    expect(text).toContain('synqdrive_dtc02_webhook_total');
    expect(text).toContain('synqdrive_dtc02_outbox_pending');
    expect(text).toContain('synqdrive_dtc02_head_vls_divergence_vehicles');
    expect(text).not.toMatch(metricExpositionForbiddenLabelPattern());
  });

  it('normalizes skip and outcome labels to low cardinality', () => {
    expect(normalizeFanOutSkipReason('REGISTRY_LIFECYCLE_EXCLUDED')).toBe(
      'REGISTRY_LIFECYCLE_EXCLUDED',
    );
    expect(normalizeFanOutSkipReason('POLL_INELIGIBLE:FOO')).toBe('POLL_INELIGIBLE');
    expect(normalizeFanOutSkipReason('custom')).toBe('OTHER');
    expect(normalizeWebhookSkipReason('NOT_IN_COHORT_ALLOWLIST')).toBe(
      'NOT_IN_COHORT_ALLOWLIST',
    );
    expect(normalizePollOutcome('NOOP_ALREADY_APPLIED')).toBe('noop_already_applied');
    expect(normalizePollOutcome('APPLY_CONFIRMED_SNAPSHOT')).toBe('applied_snapshot');
  });

  it('classifies provider failures without vehicle identifiers', () => {
    expect(classifyProviderFailure('Request failed with status code 403')).toBe('auth_denied');
    expect(classifyProviderFailure('timeout of 15000ms exceeded')).toBe('provider_timeout');
    expect(classifyProviderFailure('socket hang up')).toBe('provider_error');
  });

  it('does not throw when TripMetricsService registry records DTC-02 counters', () => {
    const metrics = new TripMetricsService();
    const handles = registerDtc02Metrics(metrics.registry);
    expect(() => handles.schedulerTickTotal.inc({ result: 'success' })).not.toThrow();
  });
});
