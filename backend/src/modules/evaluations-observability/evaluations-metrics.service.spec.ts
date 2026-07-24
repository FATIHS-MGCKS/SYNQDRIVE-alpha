import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { EvaluationsMetricsService } from './evaluations-metrics.service';
import {
  recordApiRequest,
  recordDetectorRun,
  recordInsightsRun,
  recordKpiJump,
} from './evaluations-prometheus.metrics';

describe('EvaluationsMetricsService', () => {
  let tripMetrics: TripMetricsService;
  let evaluationsMetrics: EvaluationsMetricsService;

  beforeEach(() => {
    tripMetrics = new TripMetricsService();
    evaluationsMetrics = new EvaluationsMetricsService(tripMetrics);
  });

  it('registers synqdrive_evaluations_* metrics without forbidden labels', async () => {
    recordApiRequest(
      evaluationsMetrics,
      { route: 'dashboard_insights', method: 'GET', statusCode: 200, result: 'success' },
      0.12,
    );
    recordDetectorRun(evaluationsMetrics, 'STATION_SHORTAGE', 'success', 0.4);
    recordInsightsRun(evaluationsMetrics, 'scheduled', 'success', 3.2, 4);
    recordKpiJump(evaluationsMetrics, 'moderate');

    const text = await tripMetrics.getMetrics();
    expect(text).toContain('synqdrive_evaluations_api_request_duration_seconds');
    expect(text).toContain('synqdrive_evaluations_detector_runs_total');
    expect(text).toContain('synqdrive_evaluations_insights_runs_total');
    expect(text).toContain('synqdrive_evaluations_kpi_jump_total');
    expect(text).not.toMatch(/organization_id=/);
    expect(text).not.toMatch(/org_id=/);
  });
});
