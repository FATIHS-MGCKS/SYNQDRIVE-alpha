import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  recordBatteryAssessment,
  recordBatteryCapabilitySignal,
  recordBatteryJob,
  recordBatteryJobDeadLetter,
  recordBatteryJobFailed,
  recordBatteryProviderDuplicate,
  recordBatteryProviderObservation,
  recordBatteryPublication,
  recordBatteryRestMeasurement,
  recordBatteryRestWindow,
  recordBatteryStartInsufficientCoverage,
  recordBatteryStartProxy,
  recordBatteryV2JobEnqueue,
  recordBatteryV2JobEnqueueSuppressed,
  recordBatteryV2PublicationAgeHours,
  recordBatteryV2PublicationCoverage,
  recordBatteryV2ReconciliationEnqueued,
  setBatteryV2VehiclesWithoutPublication,
  recordHvCapacityM2SessionCv,
  recordHvCapacityMethodConflict,
  recordHvCapacityObservation,
  recordHvCapacitySessionQualified,
  recordHvChargeSession,
  recordHvRechargeSegments,
} from './battery-v2-prometheus.metrics';

describe('battery-v2-prometheus.metrics', () => {
  let metrics: TripMetricsService;

  beforeEach(() => {
    metrics = new TripMetricsService();
  });

  it('exposes all required Battery V2 counters', async () => {
    const text = await metrics.getMetrics();
    const required = [
      'synqdrive_battery_provider_observation_total',
      'synqdrive_battery_provider_duplicate_total',
      'synqdrive_battery_jobs_total',
      'synqdrive_battery_jobs_failed_total',
      'synqdrive_battery_jobs_dead_letter_total',
      'synqdrive_battery_rest_windows_total',
      'synqdrive_battery_rest_measurements_total',
      'synqdrive_battery_rest_missed_total',
      'synqdrive_battery_rest_contaminated_total',
      'synqdrive_battery_start_proxy_total',
      'synqdrive_battery_start_insufficient_coverage_total',
      'synqdrive_hv_recharge_segments_total',
      'synqdrive_hv_charge_sessions_total',
      'synqdrive_hv_capacity_observations_total',
      'synqdrive_hv_capacity_sessions_qualified_total',
      'synqdrive_battery_assessments_total',
      'synqdrive_battery_publications_total',
      'synqdrive_battery_capability_signals_total',
      'synqdrive_hv_capacity_method_conflict_total',
      'synqdrive_hv_capacity_m2_session_cv',
      'synqdrive_battery_postgres_table_rows',
      'synqdrive_battery_v2_jobs_enqueue_total',
      'synqdrive_battery_v2_jobs_enqueue_suppressed_total',
      'synqdrive_battery_v2_reconciliation_enqueued_total',
      'synqdrive_battery_v2_publication_coverage_total',
      'synqdrive_battery_v2_publication_age_hours',
      'synqdrive_battery_v2_vehicles_without_publication',
    ];
    for (const name of required) {
      expect(text).toContain(name);
    }
  });

  it('increments provider observation and duplicate counters', async () => {
    recordBatteryProviderObservation(metrics, {
      signal: 'lv',
      outcome: 'NEW_OBSERVATION',
    });
    recordBatteryProviderDuplicate(metrics, {
      signal: 'hv',
      reason: 'DUPLICATE_OBSERVATION',
    });

    const text = await metrics.getMetrics();
    expect(text).toMatch(
      /synqdrive_battery_provider_observation_total\{signal="lv",outcome="NEW_OBSERVATION"\} 1/,
    );
    expect(text).toMatch(
      /synqdrive_battery_provider_duplicate_total\{signal="hv",reason="DUPLICATE_OBSERVATION"\} 1/,
    );
  });

  it('increments job lifecycle counters', async () => {
    recordBatteryJob(metrics, {
      jobType: 'BATTERY_ASSESSMENT_RECOMPUTE',
      outcome: 'enqueued',
    });
    recordBatteryJob(metrics, {
      jobType: 'BATTERY_ASSESSMENT_RECOMPUTE',
      outcome: 'completed',
    });
    recordBatteryJobFailed(metrics, {
      jobType: 'BATTERY_PUBLICATION_UPDATE',
      errorCode: 'PROVIDER_TIMEOUT',
    });
    recordBatteryJobDeadLetter(metrics, {
      jobType: 'BATTERY_PUBLICATION_UPDATE',
      errorCode: 'PROVIDER_TIMEOUT',
    });

    const text = await metrics.getMetrics();
    expect(text).toMatch(/synqdrive_battery_jobs_total\{job_type="BATTERY_ASSESSMENT_RECOMPUTE",outcome="enqueued"\} 1/);
    expect(text).toMatch(/synqdrive_battery_jobs_total\{job_type="BATTERY_ASSESSMENT_RECOMPUTE",outcome="completed"\} 1/);
    expect(text).toMatch(/synqdrive_battery_jobs_failed_total\{job_type="BATTERY_PUBLICATION_UPDATE",error_code="PROVIDER_TIMEOUT"\} 1/);
    expect(text).toMatch(/synqdrive_battery_jobs_dead_letter_total\{job_type="BATTERY_PUBLICATION_UPDATE",error_code="PROVIDER_TIMEOUT"\} 1/);
  });

  it('increments REST measurement counters including missed and contaminated', async () => {
    recordBatteryRestWindow(metrics, { window: 'session', outcome: 'opened' });
    recordBatteryRestMeasurement(metrics, { window: '60m', quality: 'VALID' });
    recordBatteryRestMeasurement(metrics, { window: '6h', quality: 'MISSED' });
    recordBatteryRestMeasurement(metrics, {
      window: '60m',
      quality: 'CONTAMINATED_BY_WAKE',
    });

    const text = await metrics.getMetrics();
    expect(text).toMatch(/synqdrive_battery_rest_windows_total\{window="session",outcome="opened"\} 1/);
    expect(text).toMatch(/synqdrive_battery_rest_measurements_total\{window="60m",quality="VALID"\} 1/);
    expect(text).toMatch(/synqdrive_battery_rest_missed_total\{window="6h"\} 1/);
    expect(text).toMatch(/synqdrive_battery_rest_contaminated_total\{window="60m"\} 1/);
  });

  it('increments start proxy and HV capacity counters', async () => {
    recordBatteryStartProxy(metrics, { outcome: 'persisted' });
    recordBatteryStartInsufficientCoverage(metrics);
    recordHvRechargeSegments(metrics, {
      trigger: 'snapshot_classify',
      outcome: 'success',
      count: 3,
    });
    recordHvChargeSession(metrics, {
      trigger: 'snapshot_classify',
      change: 'created',
      count: 2,
    });
    recordHvCapacityObservation(metrics, { quality: 'VALID' }, 4);
    recordHvCapacitySessionQualified(metrics, { qualified: true });

    const text = await metrics.getMetrics();
    expect(text).toMatch(/synqdrive_battery_start_proxy_total\{outcome="persisted"\} 1/);
    expect(text).toContain('synqdrive_battery_start_insufficient_coverage_total 1');
    expect(text).toMatch(/synqdrive_hv_recharge_segments_total\{trigger="snapshot_classify",outcome="success"\} 3/);
    expect(text).toMatch(/synqdrive_hv_charge_sessions_total\{trigger="snapshot_classify",change="created"\} 2/);
    expect(text).toMatch(/synqdrive_hv_capacity_observations_total\{quality="VALID"\} 4/);
    expect(text).toMatch(/synqdrive_hv_capacity_sessions_qualified_total\{qualified="true"\} 1/);
  });

  it('increments assessment and publication counters', async () => {
    recordBatteryAssessment(metrics, {
      scope: 'lv',
      mode: 'canonical',
      outcome: 'persisted',
    });
    recordBatteryPublication(metrics, {
      maturity: 'STABLE',
      outcome: 'persisted',
    });

    const text = await metrics.getMetrics();
    expect(text).toMatch(
      /synqdrive_battery_assessments_total\{scope="lv",mode="canonical",outcome="persisted"\} 1/,
    );
    expect(text).toMatch(
      /synqdrive_battery_publications_total\{maturity="STABLE",outcome="persisted"\} 1/,
    );
  });

  it('records pipeline enqueue, reconciliation, and publication observability metrics', async () => {
    recordBatteryV2JobEnqueue(metrics, {
      jobType: 'BATTERY_PUBLICATION_UPDATE',
      outcome: 'success',
    });
    recordBatteryV2JobEnqueue(metrics, {
      jobType: 'BATTERY_PUBLICATION_UPDATE',
      outcome: 'failed',
    });
    recordBatteryV2JobEnqueueSuppressed(metrics, {
      jobType: 'BATTERY_REST_TARGET_EVALUATE',
      reason: 'duplicate',
    });
    recordBatteryV2ReconciliationEnqueued(metrics, {
      category: 'rest_targets',
      count: 4,
    });
    recordBatteryV2PublicationCoverage(metrics, {
      scope: 'lv',
      state: 'published',
    });
    recordBatteryV2PublicationAgeHours(metrics, {
      maturity: 'STABLE',
      ageHours: 12,
    });
    setBatteryV2VehiclesWithoutPublication(metrics, { scope: 'lv', count: 7 });

    const text = await metrics.getMetrics();
    expect(text).toMatch(
      /synqdrive_battery_v2_jobs_enqueue_total\{job_type="BATTERY_PUBLICATION_UPDATE",outcome="success"\} 1/,
    );
    expect(text).toMatch(
      /synqdrive_battery_v2_jobs_enqueue_total\{job_type="BATTERY_PUBLICATION_UPDATE",outcome="failed"\} 1/,
    );
    expect(text).toMatch(
      /synqdrive_battery_v2_jobs_enqueue_suppressed_total\{job_type="BATTERY_REST_TARGET_EVALUATE",reason="duplicate"\} 1/,
    );
    expect(text).toMatch(
      /synqdrive_battery_v2_reconciliation_enqueued_total\{category="rest_targets"\} 4/,
    );
    expect(text).toMatch(
      /synqdrive_battery_v2_publication_coverage_total\{scope="lv",state="published"\} 1/,
    );
    expect(text).toContain('synqdrive_battery_v2_publication_age_hours_bucket');
    expect(text).toMatch(
      /synqdrive_battery_v2_vehicles_without_publication\{scope="lv"\} 7/,
    );
    expect(text).not.toMatch(/vehicle_id=/);
    expect(text).not.toMatch(/organization_id=/);
  });

  it('records capability, M2 CV, and method conflict metrics', async () => {
    recordBatteryCapabilitySignal(metrics, {
      signal: 'lv_voltage',
      status: 'AVAILABLE_WITH_DATA',
    });
    recordHvCapacityM2SessionCv(metrics, 0.012);
    recordHvCapacityMethodConflict(metrics, { conflict: true });
    recordHvCapacityMethodConflict(metrics, { conflict: false });

    const text = await metrics.getMetrics();
    expect(text).toMatch(
      /synqdrive_battery_capability_signals_total\{signal="lv_voltage",status="AVAILABLE_WITH_DATA"\} 1/,
    );
    expect(text).toContain('synqdrive_hv_capacity_m2_session_cv_bucket');
    expect(text).toMatch(
      /synqdrive_hv_capacity_method_conflict_total\{outcome="conflict"\} 1/,
    );
    expect(text).toMatch(
      /synqdrive_hv_capacity_method_conflict_total\{outcome="agree"\} 1/,
    );
  });
});
