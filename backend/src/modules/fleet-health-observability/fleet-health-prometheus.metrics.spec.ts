import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { FleetHealthMetricsService } from './fleet-health-metrics.service';
import {
  classifyFleetHealthAvailability,
  recordFleetHealthRows,
  recordRentalHealthRequest,
  recordServiceCasesSnapshot,
} from './fleet-health-prometheus.metrics';
import type { FleetVehicleHealthRow } from '@modules/rental-health/rental-health-summary.types';

function stubModule(state: 'good' | 'warning' | 'critical' | 'unknown' = 'good') {
  return {
    state,
    reason: 'ok',
    last_updated_at: '2026-07-20T00:00:00.000Z',
    data_stale: false,
  };
}

function sampleRow(overrides: Partial<FleetVehicleHealthRow> = {}): FleetVehicleHealthRow {
  return {
    vehicle_id: 'v1',
    organization_id: 'org1',
    overall_state: 'good',
    availability: 'ready',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {
      battery: { ...stubModule('good'), evidence_type: 'measured' },
      tires: stubModule(),
      brakes: stubModule(),
      error_codes: stubModule(),
      service_compliance: stubModule(),
      complaints: stubModule(),
      vehicle_alerts: stubModule(),
    },
    generated_at: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('fleet-health prometheus metrics', () => {
  it('registers bounded fleet health metrics on shared registry', async () => {
    const tripMetrics = new TripMetricsService();
    new FleetHealthMetricsService(tripMetrics);
    const text = await tripMetrics.getMetrics();

    expect(text).toContain('synqdrive_fleet_health_rental_health_request_duration_seconds');
    expect(text).toContain('synqdrive_fleet_health_fleet_summary_duration_seconds');
    expect(text).toContain('synqdrive_fleet_health_module_status_total');
    expect(text).toContain('synqdrive_fleet_health_availability_total');
    expect(text).toContain('synqdrive_fleet_health_technical_blockade_total');
    expect(text).toContain('synqdrive_fleet_health_stale_module_total');
    expect(text).toContain('synqdrive_fleet_health_service_case_total');
    expect(text).toContain('synqdrive_fleet_health_blocking_service_case_total');
    expect(text).toContain('synqdrive_fleet_health_task_api_errors_total');
    expect(text).toContain('synqdrive_fleet_health_case_api_errors_total');
    expect(text).toContain('synqdrive_fleet_health_vendor_api_errors_total');
    expect(text).toContain('synqdrive_fleet_health_refresh_partial_failure_total');
    expect(text).toContain('synqdrive_fleet_health_health_task_ambiguous_legacy_match_total');
    expect(text).toContain('synqdrive_fleet_health_battery_publication_coverage_ratio');

    expect(text).not.toMatch(/vehicle_id=/);
    expect(text).not.toMatch(/org_id=/);
    expect(text).not.toMatch(/organization_id=/);
  });

  it('records module status, availability, and battery publication coverage', async () => {
    const tripMetrics = new TripMetricsService();
    const metrics = new FleetHealthMetricsService(tripMetrics);

    recordFleetHealthRows(metrics, [
      sampleRow({
        rental_blocked: true,
        modules: {
          ...sampleRow().modules,
          battery: {
            ...stubModule('warning'),
            evidence_type: 'legacy_unverified',
          },
        },
        data_partial: true,
      }),
      sampleRow({
        _error: 'timeout',
      }),
    ]);

    const text = await tripMetrics.getMetrics();
    expect(text).toMatch(/synqdrive_fleet_health_module_status_total\{module="battery",state="warning"\} 1/);
    expect(text).toMatch(/synqdrive_fleet_health_availability_total\{level="partial"\} 1/);
    expect(text).toMatch(/synqdrive_fleet_health_availability_total\{level="unavailable"\} 1/);
    expect(text).toMatch(/synqdrive_fleet_health_technical_blockade_total\{source="rental_health"\} 1/);
    expect(text).toMatch(/synqdrive_fleet_health_refresh_partial_failure_total\{source="summary_batch"\} 1/);
    expect(text).toContain('synqdrive_fleet_health_battery_publication_coverage_ratio');
  });

  it('records rental health request and service case snapshots', async () => {
    const tripMetrics = new TripMetricsService();
    const metrics = new FleetHealthMetricsService(tripMetrics);

    recordRentalHealthRequest(metrics, { route: 'fleet_page', result: 'success' }, 0.42);
    recordServiceCasesSnapshot(metrics, [
      { status: 'OPEN', blocksRental: true },
      { status: 'COMPLETED', blocksRental: false },
    ]);

    const text = await tripMetrics.getMetrics();
    expect(text).toMatch(/synqdrive_fleet_health_rental_health_request_duration_seconds_count\{route="fleet_page",result="success"\} 1/);
    expect(text).toMatch(/synqdrive_fleet_health_service_case_total\{status="OPEN"\} 1/);
    expect(text).toMatch(/synqdrive_fleet_health_blocking_service_case_total 1/);
  });

  it('classifies availability levels', () => {
    expect(classifyFleetHealthAvailability({})).toBe('ready');
    expect(classifyFleetHealthAvailability({ data_partial: true })).toBe('partial');
    expect(classifyFleetHealthAvailability({ cache_stale: true })).toBe('partial');
    expect(classifyFleetHealthAvailability({ _error: 'failed' })).toBe('unavailable');
  });
});
