import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { BatteryV2JobObservabilityService } from './battery-v2-job-observability.service';
import { formatBatteryV2PipelineLog } from '../observability/battery-v2-pipeline-observability.util';

describe('BatteryV2JobObservabilityService', () => {
  let metrics: TripMetricsService;
  let service: BatteryV2JobObservabilityService;

  beforeEach(() => {
    metrics = new TripMetricsService();
    service = new BatteryV2JobObservabilityService(metrics);
  });

  it('logs processor events with fingerprints instead of raw keys', () => {
    const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);

    service.log({
      jobType: 'BATTERY_OBSERVATION_CLASSIFY',
      organizationId: 'clorg1234567890123456789012',
      vehicleId: 'clveh1234567890123456789012',
      idempotencyKey: 'obs:classify:secret-key',
      correlationId: 'corr-1',
      operation: 'completed',
    });

    const payload = JSON.parse(String(logSpy.mock.calls[0][0]));
    expect(payload.keyFp).toMatch(/^[a-f0-9]{12}$/);
    expect(payload).not.toHaveProperty('idempotencyKey');
    expect(payload.organizationId).toBe('clorg1234567890123456789012');
    expect(payload.vehicleId).toBe('clveh1234567890123456789012');
  });

  it('records completed jobs and processing duration on shared registry', async () => {
    service.recordCompleted('BATTERY_ASSESSMENT_RECOMPUTE');
    service.observeProcessingDuration('BATTERY_ASSESSMENT_RECOMPUTE', 1.25);

    const text = await metrics.getMetrics();
    expect(text).toMatch(
      /synqdrive_battery_jobs_total\{job_type="BATTERY_ASSESSMENT_RECOMPUTE",outcome="completed"\} 1/,
    );
    expect(text).toContain('synqdrive_battery_v2_job_processing_duration_seconds');
  });

  it('formats reconciliation logs without vehicle identifiers in reconciliation payload', () => {
    const line = formatBatteryV2PipelineLog({
      component: 'reconciliation',
      event: 'reconcile_completed',
      status: 'completed',
      reconciliation: {
        observationClassify: 1,
        restTargets: 2,
        tripStarts: 0,
        rechargeSegments: 0,
        assessments: 0,
        capabilityRefresh: 0,
        capabilitySignalLoss: 0,
        total: 3,
      },
    });
    const parsed = JSON.parse(line);
    expect(parsed.reconciliation.total).toBe(3);
    expect(parsed).not.toHaveProperty('vehicleId');
  });
});
