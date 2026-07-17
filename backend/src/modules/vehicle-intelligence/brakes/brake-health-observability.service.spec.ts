import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { formatBrakeHealthLog } from './brake-health-observability.util';
import { BrakeHealthObservabilityService } from './brake-health-observability.service';
import { BrakeMetricsService } from './brake-metrics.service';

describe('brake-health observability', () => {
  it('formats structured logs without vehicle identifiers', () => {
    const line = formatBrakeHealthLog({
      component: 'brake_recalculation',
      event: 'recalculate',
      status: 'deduplicated',
      reasonCode: 'identical_input_fingerprint',
      result: 'deduplicated',
    });
    const parsed = JSON.parse(line);
    expect(parsed.component).toBe('brake_recalculation');
    expect(parsed).not.toHaveProperty('vehicleId');
    expect(parsed).not.toHaveProperty('tripId');
    expect(parsed).not.toHaveProperty('vin');
    expect(parsed).not.toHaveProperty('serviceEventId');
  });

  it('exposes brake prometheus metrics on the shared registry', async () => {
    const tripMetrics = new TripMetricsService();
    const brakeMetrics = new BrakeMetricsService(tripMetrics);
    const obs = new BrakeHealthObservabilityService(brakeMetrics);

    obs.recordRecalculation({ result: 'success', durationMs: 95, trigger: 'post_trip' });
    obs.recordInitialization({ result: 'success', source: 'registration' });
    obs.recordComponentInstallation({ component: 'FRONT_PADS', source: 'service' });
    obs.recordServiceApplication({ result: 'applied', kind: 'pads_service' });
    obs.recordSpecFallback('spec_fallback_anchor');
    obs.recordCoverage({
      coverageRatio: 0.72,
      coverageStatus: 'PARTIAL',
      underCoverageKm: 120,
      overCoverageKm: 0,
    });
    obs.recordEventIntake({ source: 'dimo', outcome: 'created' });
    obs.recordMeasurement('MANUAL_MEASUREMENT');
    obs.recordEvidence({ action: 'created', source: 'DTC_SIGNAL', category: 'SAFETY' });
    obs.recordTdiProcessing({ status: 'completed' });
    obs.recordSnapshot({ result: 'created' });
    obs.recordPredictionValidation({ errorMm: -0.3, linked: true });
    obs.recordAlert({ action: 'created', alertType: 'PAD_WARNING' });
    obs.recordRentalBlock({ level: 'HARD_BLOCK', reasonCode: 'MEASURED_PAD_CRITICAL' });
    obs.recordBackfill({ mode: 'dry_run', outcome: 'success' });
    obs.recordReconciliation({ action: 'ledger_reconcile', result: 'created:1' });

    const text = await tripMetrics.getMetrics();
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
    expect(text).not.toMatch(/vehicle_id=/);
    expect(text).not.toMatch(/trip_id=/);
    expect(text).not.toMatch(/vin=/);
  });
});
