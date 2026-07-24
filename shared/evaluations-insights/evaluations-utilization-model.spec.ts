import {
  detectOverlappingBlockingBookings,
  intervalsFromBookings,
  mergeIntervals,
  utilizationPercent,
  utilizationRangeMs,
  type UtilizationBookingInterval,
} from './evaluations-utilization-intervals';
import {
  buildUtilizationModelSummary,
  computeVehicleUtilization,
  utilizationModelSectionStatus,
} from './evaluations-utilization-model';
import { EVALUATIONS_UTILIZATION_MODEL_VERSION } from './evaluations-utilization-model.contract';

const period = {
  key: 'mtd',
  label: 'Month to date',
  from: '2026-06-01T00:00:00.000Z',
  to: '2026-06-11T00:00:00.000Z',
  timezone: 'Europe/Berlin',
};

const range = { fromMs: Date.parse(period.from), toMs: Date.parse(period.to) };
const rangeMs = utilizationRangeMs(range);

function booking(
  id: string,
  vehicleId: string,
  status: UtilizationBookingInterval['status'],
  start: string,
  end: string,
): UtilizationBookingInterval {
  return {
    bookingId: id,
    vehicleId,
    status,
    startMs: Date.parse(start),
    endMs: Date.parse(end),
  };
}

describe('evaluations-utilization-intervals (shared)', () => {
  it('mergeIntervals combines overlapping booking windows', () => {
    const merged = mergeIntervals([
      { startMs: 0, endMs: 100, bookingId: 'a' },
      { startMs: 50, endMs: 150, bookingId: 'b' },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.bookingIds).toEqual(['a', 'b']);
  });

  it('detectOverlappingBlockingBookings flags data errors on same vehicle', () => {
    const overlaps = detectOverlappingBlockingBookings(
      [
        booking('b1', 'v1', 'confirmed', '2026-06-01T00:00:00.000Z', '2026-06-06T00:00:00.000Z'),
        booking('b2', 'v1', 'active', '2026-06-05T00:00:00.000Z', '2026-06-10T00:00:00.000Z'),
      ],
      range,
    );
    expect(overlaps).toContain('b1');
    expect(overlaps).toContain('b2');
  });
});

describe('evaluations-utilization-model (shared)', () => {
  it('fully rented vehicle: utilization near 100%', () => {
    const util = computeVehicleUtilization({
      vehicleId: 'v1',
      label: 'AB-123',
      capacityMs: rangeMs,
      bookings: [
        booking('b1', 'v1', 'completed', '2026-06-01T00:00:00.000Z', '2026-06-11T00:00:00.000Z'),
      ],
      range,
      maintenanceIntervals: [],
      blockedIntervals: [],
      unplannedIntervals: [],
    });
    expect(util.rentedMs).toBe(rangeMs);
    expect(util.standstillMs).toBe(0);
  });

  it('partially rented vehicle: utilization between 0 and 100%', () => {
    const util = computeVehicleUtilization({
      vehicleId: 'v1',
      label: 'AB-123',
      capacityMs: rangeMs,
      bookings: [
        booking('b1', 'v1', 'completed', '2026-06-01T00:00:00.000Z', '2026-06-06T00:00:00.000Z'),
      ],
      range,
      maintenanceIntervals: [],
      blockedIntervals: [],
      unplannedIntervals: [],
    });
    expect(util.rentedMs).toBeGreaterThan(0);
    expect(util.rentedMs).toBeLessThan(rangeMs);
    expect(util.standstillMs).toBeGreaterThan(0);
  });

  it('maintenance time reduces net capacity', () => {
    const maintenanceMs = 2 * 24 * 60 * 60 * 1000;
    const util = computeVehicleUtilization({
      vehicleId: 'v1',
      label: 'AB-123',
      capacityMs: rangeMs,
      bookings: [],
      range,
      maintenanceIntervals: [{ startMs: range.fromMs, endMs: range.fromMs + maintenanceMs }],
      blockedIntervals: [],
      unplannedIntervals: [],
    });
    expect(util.maintenanceMs).toBe(maintenanceMs);
    expect(util.standstillMs).toBe(rangeMs - maintenanceMs);
  });

  it('blocked time is excluded from available capacity', () => {
    const blockedMs = 3 * 24 * 60 * 60 * 1000;
    const util = computeVehicleUtilization({
      vehicleId: 'v1',
      label: 'AB-123',
      capacityMs: rangeMs,
      bookings: [],
      range,
      maintenanceIntervals: [],
      blockedIntervals: [{ startMs: range.fromMs, endMs: range.fromMs + blockedMs }],
      unplannedIntervals: [],
    });
    expect(util.blockedMs).toBe(blockedMs);
    expect(util.standstillMs).toBe(rangeMs - blockedMs);
  });

  it('booked-not-realized counts forecast minus realized', () => {
    const util = computeVehicleUtilization({
      vehicleId: 'v1',
      label: 'AB-123',
      capacityMs: rangeMs,
      bookings: [
        booking('b1', 'v1', 'confirmed', '2026-06-01T00:00:00.000Z', '2026-06-08T00:00:00.000Z'),
      ],
      range,
      maintenanceIntervals: [],
      blockedIntervals: [],
      unplannedIntervals: [],
    });
    expect(util.bookedNotRealizedMs).toBeGreaterThan(0);
    expect(util.rentedMs).toBe(0);
  });

  it('buildUtilizationModelSummary includes drill-downs and formulas', () => {
    const rentedMs = Math.floor(rangeMs * 0.6);
    const summary = buildUtilizationModelSummary(
      {
        periodFromMs: range.fromMs,
        periodToMs: range.toMs,
        vehicles: [
          {
            vehicleId: 'v1',
            label: 'AB-1',
            homeStationId: 'st-berlin',
            homeStationName: 'Berlin',
            vehicleClassId: 'cls-1',
            vehicleClassName: 'Compact',
            prismaStatus: 'AVAILABLE',
            cleaningStatus: 'CLEAN',
            rentalBlocked: false,
            telemetryOffline: true,
            operationalToken: 'AVAILABLE',
            capacityMs: rangeMs,
            rentedMs,
            maintenanceMs: 0,
            blockedMs: 0,
            unplannedDowntimeMs: 0,
            bookedNotRealizedMs: 0,
            standstillMs: rangeMs - rentedMs,
            turnaroundMs: 0,
            turnaroundCount: 0,
          },
        ],
        overlappingBookingIds: ['b-overlap-1'],
        stationBottlenecks: [
          {
            stationId: 'st-berlin',
            stationName: 'Berlin',
            totalVehicles: 5,
            bookedVehicles: 4,
            availableVehicles: 1,
          },
        ],
        operationalSnapshot: {
          activeRented: 3,
          reserved: 1,
          available: 6,
          maintenance: 1,
          blocked: 0,
          unknown: 0,
          operationalUtilizationPercent: 30,
        },
        maintenanceFromDowntimeWindows: 0,
        maintenanceFromSnapshotOnly: 1,
        blockedFromDowntimeWindows: 0,
        blockedFromSnapshotOnly: 0,
      },
      period,
    );

    expect(summary.calculationVersion).toBe(EVALUATIONS_UTILIZATION_MODEL_VERSION);
    const fleetMetric = summary.metrics.find((m) => m.key === 'UTILIZATION_PER_VEHICLE');
    expect(fleetMetric?.formula).toContain('capacityMs');
    expect(fleetMetric?.status).toBe('PARTIAL');
    expect(summary.drillDowns.some((d) => d.metricKey === 'TELEMETRY_OFFLINE')).toBe(true);
    expect(summary.drillDowns.some((d) => d.metricKey === 'OVERLAPPING_BOOKINGS')).toBe(true);
    expect(summary.dataGaps.some((g) => g.category === 'TELEMETRY')).toBe(true);
    expect(utilizationModelSectionStatus(summary)).toBe('PARTIAL');
  });

  it('station breakdown aggregates utilization by home station', () => {
    const summary = buildUtilizationModelSummary(
      {
        periodFromMs: range.fromMs,
        periodToMs: range.toMs,
        vehicles: [
          {
            vehicleId: 'v1',
            label: 'A',
            homeStationId: 'st-1',
            homeStationName: 'Berlin',
            vehicleClassId: null,
            vehicleClassName: null,
            prismaStatus: 'AVAILABLE',
            cleaningStatus: 'CLEAN',
            rentalBlocked: false,
            telemetryOffline: false,
            operationalToken: 'AVAILABLE',
            capacityMs: rangeMs,
            rentedMs: rangeMs,
            maintenanceMs: 0,
            blockedMs: 0,
            unplannedDowntimeMs: 0,
            bookedNotRealizedMs: 0,
            standstillMs: 0,
            turnaroundMs: 0,
            turnaroundCount: 0,
          },
          {
            vehicleId: 'v2',
            label: 'B',
            homeStationId: 'st-2',
            homeStationName: 'Munich',
            vehicleClassId: null,
            vehicleClassName: null,
            prismaStatus: 'AVAILABLE',
            cleaningStatus: 'CLEAN',
            rentalBlocked: false,
            telemetryOffline: false,
            operationalToken: 'AVAILABLE',
            capacityMs: rangeMs,
            rentedMs: 0,
            maintenanceMs: 0,
            blockedMs: 0,
            unplannedDowntimeMs: 0,
            bookedNotRealizedMs: 0,
            standstillMs: rangeMs,
            turnaroundMs: 0,
            turnaroundCount: 0,
          },
        ],
        overlappingBookingIds: [],
        stationBottlenecks: [],
        operationalSnapshot: {
          activeRented: 1,
          reserved: 0,
          available: 1,
          maintenance: 0,
          blocked: 0,
          unknown: 0,
          operationalUtilizationPercent: 50,
        },
        maintenanceFromDowntimeWindows: 0,
        maintenanceFromSnapshotOnly: 0,
        blockedFromDowntimeWindows: 0,
        blockedFromSnapshotOnly: 0,
      },
      period,
    );

    const byStation = summary.metrics.find((m) => m.key === 'UTILIZATION_BY_STATION');
    expect(byStation?.breakdown).toHaveLength(2);
    expect(byStation?.breakdown?.find((b) => b.key === 'st-1')?.utilizationPercent).toBe(100);
  });

  it('intervalsFromBookings excludes cancelled bookings from occupancy', () => {
    const intervals = intervalsFromBookings(
      [
        booking('b1', 'v1', 'cancelled', '2026-06-01T00:00:00.000Z', '2026-06-10T00:00:00.000Z'),
        booking('b2', 'v1', 'completed', '2026-06-01T00:00:00.000Z', '2026-06-05T00:00:00.000Z'),
      ],
      range,
      ['completed'],
    );
    expect(intervals).toHaveLength(1);
    expect(utilizationPercent(intervals[0]!.endMs - intervals[0]!.startMs, rangeMs)).toBeGreaterThan(0);
  });
});
