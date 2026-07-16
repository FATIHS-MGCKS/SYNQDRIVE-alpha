import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  recordBatteryAssessment,
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
});
