import {
  EXP021_P21_REFERENCE_TRIP_EXCLUDED,
  durationBucket,
  selectTripsForMultiCompare,
  type P21InventoryRow,
} from '../exp021-p21-p1-v2-multi-trip-selection';

function row(partial: Partial<P21InventoryRow> & Pick<P21InventoryRow, 'trip_id' | 'vehicle_id'>): P21InventoryRow {
  return {
    work_item_id: `wi-${partial.trip_id}`,
    shadow_run_id: 'sr',
    pinned_snapshot_hash: 'hash',
    completed_at: partial.completed_at ?? new Date('2026-01-01T12:00:00Z'),
    start_time: partial.start_time ?? new Date('2026-01-01T10:00:00Z'),
    duration_minutes: partial.duration_minutes ?? 45,
    interval_count: partial.interval_count ?? 100,
    stationary_band_count: partial.stationary_band_count ?? 5,
    ...partial,
  };
}

describe('exp021 multi-trip selection', () => {
  it('excludes reference trip by default', () => {
    const inv = [
      row({ trip_id: EXP021_P21_REFERENCE_TRIP_EXCLUDED, vehicle_id: 'v1' }),
      row({ trip_id: 'trip-b', vehicle_id: 'v2' }),
    ];
    const picked = selectTripsForMultiCompare(inv);
    expect(picked.map((p) => p.trip_id)).toEqual(['trip-b']);
  });

  it('prefers a new vehicle on the second pick when scores tie', () => {
    const inv = [
      row({ trip_id: 't1', vehicle_id: 'v1', start_time: new Date('2026-01-01T10:00:00Z') }),
      row({
        trip_id: 't2',
        vehicle_id: 'v2',
        start_time: new Date('2026-01-01T11:00:00Z'),
        completed_at: new Date('2026-01-01T13:00:00Z'),
      }),
      row({
        trip_id: 't3',
        vehicle_id: 'v1',
        start_time: new Date('2026-01-01T12:00:00Z'),
        completed_at: new Date('2026-01-01T14:00:00Z'),
      }),
    ];
    const picked = selectTripsForMultiCompare(inv, { maxTrips: 2 });
    expect(picked.map((p) => p.trip_id).sort()).toEqual(['t2', 't3']);
    expect(new Set(picked.map((p) => p.vehicle_id)).size).toBe(2);
  });

  it('duration buckets classify predictably', () => {
    expect(durationBucket(10)).toBe('short');
    expect(durationBucket(60)).toBe('medium');
    expect(durationBucket(200)).toBe('long');
  });
});
