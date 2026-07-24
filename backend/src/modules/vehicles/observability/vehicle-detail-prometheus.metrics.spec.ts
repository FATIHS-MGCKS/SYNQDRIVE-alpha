import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { VehicleDetailMetricsService } from './vehicle-detail-metrics.service';
import {
  recordVehicleDetailLiveGpsSource,
  recordVehicleDetailProviderOutcome,
  recordVehicleDetailRequest,
} from './vehicle-detail-prometheus.metrics';

describe('vehicle-detail prometheus metrics', () => {
  it('registers bounded vehicle detail metrics on shared registry', async () => {
    const tripMetrics = new TripMetricsService();
    new VehicleDetailMetricsService(tripMetrics);
    const text = await tripMetrics.getMetrics();

    expect(text).toContain('synqdrive_vehicle_detail_request_total');
    expect(text).toContain('synqdrive_vehicle_detail_request_duration_seconds');
    expect(text).toContain('synqdrive_vehicle_detail_provider_outcome_total');
    expect(text).toContain('synqdrive_vehicle_detail_live_gps_source_total');
    expect(text).toContain('synqdrive_vehicle_detail_cache_outcome_total');
    expect(text).toContain('synqdrive_vehicle_detail_status_mutation_total');
    expect(text).toContain('synqdrive_vehicle_detail_permission_denied_total');

    expect(text).not.toMatch(/vehicle_id=/);
    expect(text).not.toMatch(/org_id=/);
    expect(text).not.toMatch(/latitude=/);
    expect(text).not.toMatch(/longitude=/);
  });

  it('records telemetry and live gps outcomes', async () => {
    const tripMetrics = new TripMetricsService();
    const metrics = new VehicleDetailMetricsService(tripMetrics);

    recordVehicleDetailRequest(metrics, { endpoint: 'telemetry', result: 'success' }, 0.12);
    recordVehicleDetailProviderOutcome(metrics, {
      endpoint: 'live_gps',
      outcome: 'cache_fallback',
    });
    recordVehicleDetailLiveGpsSource(metrics, 'cache');

    const text = await tripMetrics.getMetrics();
    expect(text).toContain('endpoint="telemetry",result="success"');
    expect(text).toContain('endpoint="live_gps",outcome="cache_fallback"');
    expect(text).toContain('source="cache"');
  });
});
