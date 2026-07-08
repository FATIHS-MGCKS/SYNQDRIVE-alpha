import {
  buildTripSummaryWindow,
  dedupeActivityWindows,
  deriveIdleParkedWindows,
} from './activity-window-derive';

const ctx = {
  orgId: 'org-1',
  vehicleId: 'veh-1',
  tripId: 'trip-1',
  bookingId: null,
};

describe('activity-window-derive', () => {
  it('builds trip summary with activity when speed/odometer indicate movement', () => {
    const row = buildTripSummaryWindow(
      {
        ...ctx,
        windowStart: new Date('2026-06-25T09:00:00.000Z'),
        windowEnd: new Date('2026-06-25T10:00:00.000Z'),
      },
      { pointCount: 8, maxSpeedKmh: 42, odometerDeltaKm: 12.4 },
    );
    expect(row.activityType).toBe('trip_summary');
    expect(row.hasActivity).toBe(true);
    expect(row.confidence).toBe('HIGH');
  });

  it('derives parked windows from low-speed ignition-off snapshots', () => {
    const windows = deriveIdleParkedWindows(ctx, [
      {
        recordedAt: new Date('2026-06-25T10:00:00.000Z'),
        speedKmh: 0,
        isIgnitionOn: false,
        odometerKm: 10,
      },
      {
        recordedAt: new Date('2026-06-25T10:01:00.000Z'),
        speedKmh: 0,
        isIgnitionOn: false,
        odometerKm: 10,
      },
      {
        recordedAt: new Date('2026-06-25T10:02:00.000Z'),
        speedKmh: 0,
        isIgnitionOn: false,
        odometerKm: 10,
      },
    ]);

    expect(windows).toHaveLength(1);
    expect(windows[0].activityType).toBe('parked');
    expect(windows[0].evidenceSource).toBe('telemetry_snapshots');
  });

  it('dedupes identical windows', () => {
    const row = buildTripSummaryWindow(
      {
        ...ctx,
        windowStart: new Date('2026-06-25T09:00:00.000Z'),
        windowEnd: new Date('2026-06-25T10:00:00.000Z'),
      },
      { pointCount: 1, maxSpeedKmh: 0, odometerDeltaKm: 0 },
    );
    expect(dedupeActivityWindows([row, row])).toHaveLength(1);
  });
});
