import {
  EXP021_COVERAGE_FORCED_TRIP_IDS,
  selectTripsForCoverageDiagnostic,
} from '../exp021-coverage-diagnostic-selection';
import type { P21InventoryRow } from '../exp021-p21-p1-v2-multi-trip-selection';

function row(tripId: string, vehicleId: string, completedAt: string): P21InventoryRow {
  return {
    work_item_id: `wi-${tripId}`,
    trip_id: tripId,
    vehicle_id: vehicleId,
    pinned_snapshot_hash: 'hash',
    shadow_run_id: 'shadow',
    completed_at: new Date(completedAt),
    start_time: new Date(completedAt),
    duration_minutes: 45,
    interval_count: 100,
    stationary_band_count: 5,
  };
}

describe('selectTripsForCoverageDiagnostic', () => {
  it('includes forced production reference trips when present', () => {
    const forced = EXP021_COVERAGE_FORCED_TRIP_IDS[0];
    const inventory = [row(forced, 'v1', '2026-10-10T00:00:00Z'), row('other-trip', 'v2', '2026-10-11T00:00:00Z')];
    const { selected, forcedIncluded } = selectTripsForCoverageDiagnostic(inventory, { maxTrips: 20 });
    expect(forcedIncluded).toContain(forced);
    expect(selected.map((s) => s.trip_id)).toContain(forced);
  });
});
