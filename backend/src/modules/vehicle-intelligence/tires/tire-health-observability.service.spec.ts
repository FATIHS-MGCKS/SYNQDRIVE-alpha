import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { formatTireHealthLog } from './tire-health-observability.util';
import { TireHealthObservabilityService } from './tire-health-observability.service';
import { TireMetricsService } from './tire-metrics.service';
import { emptyTirePressureContext } from './tire-pressure-context.builder';

describe('tire-health observability', () => {
  it('formats structured logs without vehicle identifiers', () => {
    const line = formatTireHealthLog({
      component: 'tire_recalculation',
      event: 'recalculate',
      status: 'deduplicated',
      reasonCode: 'identical_input_fingerprint',
      result: 'deduplicated',
    });
    const parsed = JSON.parse(line);
    expect(parsed.component).toBe('tire_recalculation');
    expect(parsed).not.toHaveProperty('vehicleId');
    expect(parsed).not.toHaveProperty('tripId');
    expect(parsed).not.toHaveProperty('vin');
  });

  it('exposes tire prometheus metrics on the shared registry', async () => {
    const tripMetrics = new TripMetricsService();
    const tireMetrics = new TireMetricsService(tripMetrics);
    const obs = new TireHealthObservabilityService(tireMetrics);

    obs.recordRecalculation({ result: 'success', durationMs: 120 });
    obs.recordTripUsageProcessed({
      tripId: 'trip-hidden',
      vehicleId: 'veh-hidden',
      attributionStatus: 'APPLIED',
      ledgerAction: 'CREATED',
    });
    obs.recordAlert({ action: 'created', alertType: 'TPMS_WARNING' });
    obs.recordRentalBlock({ level: 'HARD_BLOCK', reasonCode: 'MEASURED_TREAD_CRITICAL' });
    obs.recordPressureContext(emptyTirePressureContext());

    const text = await tripMetrics.getMetrics();
    expect(text).toContain('synqdrive_tire_recalculation_total');
    expect(text).toContain('synqdrive_tire_usage_processed_total');
    expect(text).toContain('synqdrive_tire_alert_total');
    expect(text).toContain('synqdrive_tire_rental_block_total');
    expect(text).toContain('synqdrive_tire_pressure_coverage_ratio');
    expect(text).not.toMatch(/vehicle_id=/);
    expect(text).not.toMatch(/trip_id=/);
  });
});
