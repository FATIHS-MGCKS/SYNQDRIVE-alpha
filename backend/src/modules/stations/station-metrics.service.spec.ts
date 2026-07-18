import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { StationMetricsService } from './station-metrics.service';

const FORBIDDEN_LABELS = [
  'vehicle_id',
  'vin',
  'customer_id',
  'booking_id',
  'trip_id',
  'org_id',
  'organization_id',
  'station_id',
  'license_plate',
];

describe('StationMetricsService', () => {
  let tripMetrics: TripMetricsService;
  let metrics: StationMetricsService;

  beforeEach(() => {
    tripMetrics = new TripMetricsService();
    metrics = new StationMetricsService(tripMetrics);
  });

  it('exposes required Stations V2 metrics', async () => {
    metrics.recordScopeDenied({ gate: 'scope', reason: 'STATION_SCOPE_NO_STATIONS' });
    metrics.recordSummaryRequest('station');
    metrics.recordSummaryPartial({ surface: 'station', reason: 'incomplete_kpis' });
    metrics.recordAssignment({ kind: 'change_home', outcome: 'APPLIED' });
    metrics.recordAssignmentConflict({ kind: 'change_home', reason: 'version_conflict' });
    metrics.recordCurrentStationCorrection('APPLIED');
    metrics.recordTransfer({ command: 'plan', outcome: 'APPLIED' });
    metrics.recordBookingRule({ surface: 'pickup', outcome: 'BLOCKED', blockedReason: 'CLOSED' });
    metrics.recordBookingOverride('booking_rules');
    metrics.recordCapacityStatus('AVAILABLE');
    metrics.recordArchive('APPLIED');
    metrics.recordRestore('APPLIED');
    metrics.recordHttp({
      route: '/organizations/:orgId/stations/:id/summary',
      method: 'GET',
      statusCode: 200,
      durationSeconds: 0.12,
    });
    tripMetrics.setStationsTotalByStatus({ active: 3, inactive: 1, archived: 2 });

    const text = await tripMetrics.getMetrics();
    expect(text).toContain('synqdrive_stations_total');
    expect(text).toContain('synqdrive_station_scope_denied_total');
    expect(text).toContain('synqdrive_station_summary_requests_total');
    expect(text).toContain('synqdrive_station_summary_partial_total');
    expect(text).toContain('synqdrive_station_assignment_total');
    expect(text).toContain('synqdrive_station_assignment_conflict_total');
    expect(text).toContain('synqdrive_current_station_correction_total');
    expect(text).toContain('synqdrive_station_transfer_total');
    expect(text).toContain('synqdrive_station_booking_rule_total');
    expect(text).toContain('synqdrive_station_booking_rule_blocked_total');
    expect(text).toContain('synqdrive_station_booking_override_total');
    expect(text).toContain('synqdrive_station_capacity_status_total');
    expect(text).toContain('synqdrive_station_archive_total');
    expect(text).toContain('synqdrive_station_restore_total');
    expect(text).toContain('synqdrive_station_http_requests_total');
    expect(text).toContain('synqdrive_station_http_request_duration_seconds');
  });

  it('does not register forbidden high-cardinality labels', async () => {
    metrics.recordHttp({
      route: '/organizations/org-123/stations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      method: 'GET',
      statusCode: 403,
      durationSeconds: 0.01,
    });

    const text = await tripMetrics.getMetrics();
    for (const label of FORBIDDEN_LABELS) {
      expect(text).not.toMatch(new RegExp(`${label}=`));
    }
    expect(text).toContain('route="/organizations/:orgId/stations/:id"');
  });
});
