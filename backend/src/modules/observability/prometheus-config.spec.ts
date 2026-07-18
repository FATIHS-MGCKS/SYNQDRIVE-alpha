import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TripMetricsService } from './trip-metrics.service';
import { TireMetricsService } from '@modules/vehicle-intelligence/tires/tire-metrics.service';
import { BrakeMetricsService } from '@modules/vehicle-intelligence/brakes/brake-metrics.service';
import { StationMetricsService } from '@modules/stations/station-metrics.service';

const FORBIDDEN_LABELS = [
  'vehicle_id',
  'vin',
  'customer_id',
  'booking_id',
  'trip_id',
  'org_id',
  'organization_id',
  'station_id',
];

describe('TripMetricsService label cardinality', () => {
  let metrics: TripMetricsService;

  beforeEach(() => {
    metrics = new TripMetricsService();
    new TireMetricsService(metrics);
    new BrakeMetricsService(metrics);
    new StationMetricsService(metrics);
  });

  it('does not register forbidden high-cardinality labels', async () => {
    const text = await metrics.getMetrics();
    for (const label of FORBIDDEN_LABELS) {
      expect(text).not.toMatch(new RegExp(`${label}=`));
    }
  });

  it('exposes new ClickHouse and monitoring metrics', async () => {
    const text = await metrics.getMetrics();
    expect(text).toContain('synqdrive_clickhouse_query_duration_seconds');
    expect(text).toContain('synqdrive_clickhouse_schema_status');
    expect(text).toContain('synqdrive_clickhouse_migration_failures_total');
    expect(text).toContain('synqdrive_hf_mirror_enabled');
    expect(text).toContain('synqdrive_clickhouse_table_rows');
    expect(text).toContain('synqdrive_metrics_endpoint_requests_total');
    expect(text).toContain('synqdrive_queue_failed_jobs');
    expect(text).toContain('synqdrive_dimo_snapshot_poll_total');
    expect(text).toContain('synqdrive_document_extraction_jobs_total');
    expect(text).toContain('synqdrive_document_extraction_failures_total');
    expect(text).toContain('synqdrive_document_extraction_duration_seconds');
    expect(text).toContain('synqdrive_document_extraction_queue_age_seconds');
    expect(text).toContain('synqdrive_document_extraction_active_jobs');
    expect(text).toContain('synqdrive_tire_recalculation_total');
    expect(text).toContain('synqdrive_tire_usage_processed_total');
    expect(text).toContain('synqdrive_tire_alert_total');
    expect(text).toContain('synqdrive_tire_rental_block_total');
    expect(text).toContain('synqdrive_tire_snapshot_created_total');
    expect(text).toContain('synqdrive_battery_provider_observation_total');
    expect(text).toContain('synqdrive_battery_jobs_total');
    expect(text).toContain('synqdrive_battery_publications_total');
    expect(text).toContain('synqdrive_battery_capability_signals_total');
    expect(text).toContain('synqdrive_hv_capacity_method_conflict_total');
    expect(text).toContain('synqdrive_battery_postgres_table_rows');
    expect(text).toContain('synqdrive_brake_initialization_total');
    expect(text).toContain('synqdrive_brake_recalculation_total');
    expect(text).toContain('synqdrive_brake_recalculation_deduplicated_total');
    expect(text).toContain('synqdrive_brake_recalculation_duration_seconds');
    expect(text).toContain('synqdrive_brake_component_installation_total');
    expect(text).toContain('synqdrive_brake_service_scope_mismatch_total');
    expect(text).toContain('synqdrive_brake_spec_fallback_total');
    expect(text).toContain('synqdrive_brake_trip_coverage_ratio');
    expect(text).toContain('synqdrive_brake_trip_missing_impact_total');
    expect(text).toContain('synqdrive_brake_trip_overcoverage_total');
    expect(text).toContain('synqdrive_brake_neutral_gap_km');
    expect(text).toContain('synqdrive_brake_event_ingested_total');
    expect(text).toContain('synqdrive_brake_event_duplicate_prevented_total');
    expect(text).toContain('synqdrive_brake_measurement_total');
    expect(text).toContain('synqdrive_brake_prediction_error_mm');
    expect(text).toContain('synqdrive_brake_evidence_active');
    expect(text).toContain('synqdrive_brake_evidence_duplicate_total');
    expect(text).toContain('synqdrive_brake_alert_total');
    expect(text).toContain('synqdrive_brake_rental_block_total');
    expect(text).toContain('synqdrive_brake_backfill_conflict_total');
    expect(text).toContain('synqdrive_stations_total');
    expect(text).toContain('synqdrive_station_scope_denied_total');
    expect(text).toContain('synqdrive_station_summary_requests_total');
    expect(text).toContain('synqdrive_station_transfer_total');
    expect(text).toContain('synqdrive_station_http_request_duration_seconds');
  });
});

describe('Prometheus config files', () => {
  const root = join(__dirname, '../../../monitoring/prometheus');

  it('prometheus example config references protected metrics path and bearer auth', () => {
    const yaml = readFileSync(join(root, 'prometheus.yml.example'), 'utf8');
    expect(yaml).toContain('/api/v1/metrics');
    expect(yaml).toContain('bearer_token_file');
    expect(yaml).toContain('alerts.yml');
  });

  it('alert rules reference operational SynqDrive metrics', () => {
    const yaml = readFileSync(join(root, 'alerts.yml'), 'utf8');
    expect(yaml).toContain('SynqDriveMetricsScrapeDown');
    expect(yaml).toContain('synqdrive_clickhouse_configured');
    expect(yaml).toContain('synqdrive_enrichment_pending');
    expect(yaml).toContain('synqdrive_dimo_snapshot_poll_total');
    expect(yaml).toContain('DocumentExtractionQueueAgeHigh');
    expect(yaml).toContain('BatteryJobsFailingDespiteSnapshotSuccess');
    expect(yaml).toContain('BatteryV2DeadLetterJobsPresent');
    expect(yaml).toContain('synqdrive_battery_jobs_failed_total');
    expect(yaml).not.toContain('vehicle_id');
    expect(yaml).not.toContain('trip_id');
    expect(yaml).toContain('BrakeInitializationFailureRateHigh');
    expect(yaml).toContain('BrakeRecalculationQueueBacklog');
    expect(yaml).toContain('BrakeRecalculationFailureRateHigh');
    expect(yaml).toContain('BrakeMissingTdiSpike');
    expect(yaml).toContain('BrakeTripOvercoverage');
    expect(yaml).toContain('BrakeEvidenceProcessingFailure');
    expect(yaml).toContain('BrakeBackfillConflict');
    expect(yaml).toContain('BrakeHealthCurrentMissingAfterRegistration');
  });
});
