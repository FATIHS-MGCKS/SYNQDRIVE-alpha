/**
 * Pure builders for canonical Auswertungen utilization model (Prompt 22/54).
 */
import type { EvaluationsMetricValue, EvaluationsTimePeriod } from './evaluations-analytics-primitives.contract';
import {
  UTILIZATION_FORECAST_STATUSES,
  UTILIZATION_OCCUPANCY_STATUSES,
  UTILIZATION_REALIZED_STATUSES,
  intervalsFromBookings,
  utilizationPercent,
  utilizationRangeMs,
  type UtilizationBookingInterval,
  type UtilizationTimeRange,
} from './evaluations-utilization-intervals';
import {
  EVALUATIONS_UTILIZATION_MODEL_VERSION,
  type EvaluationsUtilizationDataGap,
  type EvaluationsUtilizationDrillDown,
  type EvaluationsUtilizationMetric,
  type EvaluationsUtilizationMetricKey,
  type EvaluationsUtilizationMetricStatus,
  type EvaluationsUtilizationModelSummary,
  type EvaluationsUtilizationSnapshot,
  type EvaluationsUtilizationVehicleRow,
} from './evaluations-utilization-model.contract';

function metric(
  key: EvaluationsUtilizationMetricKey,
  label: string,
  formula: string,
  dataSources: string[],
  period: EvaluationsTimePeriod,
  status: EvaluationsUtilizationMetricStatus,
  coverage: EvaluationsUtilizationMetric['coverage'],
  valueMs: number | null,
  valuePercent: number | null,
  unit: EvaluationsUtilizationMetric['unit'],
  breakdown?: EvaluationsUtilizationMetric['breakdown'],
): EvaluationsUtilizationMetric {
  return {
    key,
    label,
    formula,
    dataSources,
    coverage,
    period,
    status,
    calculationVersion: EVALUATIONS_UTILIZATION_MODEL_VERSION,
    valueMs,
    valuePercent,
    unit,
    breakdown,
  };
}

function fleetCoverage(
  vehicles: EvaluationsUtilizationVehicleRow[],
  numeratorMs: number,
  denominatorMs: number,
  notes?: string,
): EvaluationsUtilizationMetric['coverage'] {
  const withData = vehicles.filter((v) => v.capacityMs > 0).length;
  return {
    numeratorMs,
    denominatorMs,
    vehicleCount: vehicles.length,
    vehiclesWithData: withData,
    percent: utilizationPercent(numeratorMs, denominatorMs),
    notes,
  };
}

function aggregateByDimension(
  vehicles: EvaluationsUtilizationVehicleRow[],
  dimension: 'VEHICLE_CLASS' | 'STATION',
  keyFn: (v: EvaluationsUtilizationVehicleRow) => { key: string; label: string } | null,
): EvaluationsUtilizationMetric['breakdown'] {
  const map = new Map<string, { label: string; rentedMs: number; capacityMs: number; count: number }>();
  for (const v of vehicles) {
    const dim = keyFn(v);
    if (!dim) continue;
    const row = map.get(dim.key) ?? { label: dim.label, rentedMs: 0, capacityMs: 0, count: 0 };
    row.rentedMs += v.rentedMs;
    row.capacityMs += Math.max(0, v.capacityMs - v.maintenanceMs - v.blockedMs);
    row.count += 1;
    map.set(dim.key, row);
  }
  return [...map.entries()].map(([key, row]) => ({
    dimension,
    key,
    label: row.label,
    rentedMs: row.rentedMs,
    capacityMs: row.capacityMs,
    utilizationPercent: utilizationPercent(row.rentedMs, row.capacityMs),
    vehicleCount: row.count,
  }));
}

function buildDataGaps(snapshot: EvaluationsUtilizationSnapshot): EvaluationsUtilizationDataGap[] {
  const gaps: EvaluationsUtilizationDataGap[] = [
    {
      category: 'TELEMETRY',
      reason:
        'Telemetry offline is tracked for coverage only — not interpreted as technical downtime.',
      suggestedSource: 'VehicleLatestState freshness / DIMO connection signals.',
    },
    {
      category: 'HISTORICAL_STATUS',
      reason:
        'Point-in-time operational snapshot uses deriveFleetStatusContext at period end; interval history for status transitions is not persisted.',
      suggestedSource: 'Status transition event log or ServiceCase downtime windows.',
    },
  ];

  if (snapshot.maintenanceFromSnapshotOnly > 0) {
    gaps.push({
      category: 'MAINTENANCE_INTERVALS',
      reason: `${snapshot.maintenanceFromSnapshotOnly} vehicle(s) use IN_SERVICE snapshot only — no ServiceCase downtime window.`,
      suggestedSource: 'ServiceCase.downtimeStart/downtimeEnd with blocksRental=true.',
    });
  }
  if (snapshot.blockedFromSnapshotOnly > 0) {
    gaps.push({
      category: 'BLOCKED_INTERVALS',
      reason: `${snapshot.blockedFromSnapshotOnly} vehicle(s) use OUT_OF_SERVICE snapshot only — no downtime window.`,
      suggestedSource: 'ServiceCase downtime or explicit blocked intervals.',
    });
  }
  if (snapshot.vehicles.some((v) => v.rentalBlocked)) {
    gaps.push({
      category: 'RENTAL_HEALTH',
      reason: 'Rental-health blocks affect rentability but not interval-based capacity unless paired with downtime.',
      suggestedSource: 'RentalHealth rental_blocked + cleaningStatus for ready-to-rent.',
    });
  }

  return gaps;
}

function vehicleDrillDown(
  vehicles: EvaluationsUtilizationVehicleRow[],
  filter: (v: EvaluationsUtilizationVehicleRow) => boolean,
  metricFields: Record<string, (v: EvaluationsUtilizationVehicleRow) => EvaluationsMetricValue>,
): EvaluationsUtilizationDrillDown['items'] {
  return vehicles
    .filter(filter)
    .map((v) => ({
      entityType: 'VEHICLE' as const,
      entityId: v.vehicleId,
      label: v.label,
      metrics: Object.fromEntries(
        Object.entries(metricFields).map(([k, fn]) => [k, fn(v)]),
      ),
    }));
}

export function buildUtilizationModelSummary(
  snapshot: EvaluationsUtilizationSnapshot,
  period: EvaluationsTimePeriod,
): EvaluationsUtilizationModelSummary {
  const vehicles = snapshot.vehicles;
  const periodMs = utilizationRangeMs({ fromMs: snapshot.periodFromMs, toMs: snapshot.periodToMs });

  const fleetCapacityMs = vehicles.reduce((s, v) => s + v.capacityMs, 0);
  const rentedMs = vehicles.reduce((s, v) => s + v.rentedMs, 0);
  const maintenanceMs = vehicles.reduce((s, v) => s + v.maintenanceMs, 0);
  const blockedMs = vehicles.reduce((s, v) => s + v.blockedMs, 0);
  const unplannedDowntimeMs = vehicles.reduce((s, v) => s + v.unplannedDowntimeMs, 0);
  const bookedNotRealizedMs = vehicles.reduce((s, v) => s + v.bookedNotRealizedMs, 0);
  const standstillMs = vehicles.reduce((s, v) => s + v.standstillMs, 0);
  const turnaroundMs = vehicles.reduce((s, v) => s + v.turnaroundMs, 0);

  const netCapacityMs = Math.max(
    0,
    fleetCapacityMs - maintenanceMs - blockedMs,
  );
  const availableMs = Math.max(0, netCapacityMs - rentedMs);

  const availableNotRentableCount = vehicles.filter(
    (v) =>
      v.operationalToken === 'AVAILABLE' &&
      (v.cleaningStatus !== 'CLEAN' || v.rentalBlocked),
  ).length;

  const totals = {
    periodMs,
    fleetCapacityMs,
    rentedMs,
    availableMs,
    maintenanceMs,
    blockedMs,
    unplannedDowntimeMs,
    turnaroundMs,
    standstillMs,
    bookedNotRealizedMs,
    availableNotRentableCount,
    capacityBottleneckStations: snapshot.stationBottlenecks.length,
    overlappingBookingCount: snapshot.overlappingBookingIds.length,
    telemetryOfflineCount: vehicles.filter((v) => v.telemetryOffline).length,
  };

  const classBreakdown =
    aggregateByDimension(vehicles, 'VEHICLE_CLASS', (v) =>
      v.vehicleClassId
        ? { key: v.vehicleClassId, label: v.vehicleClassName ?? v.vehicleClassId }
        : null,
    ) ?? [];
  const stationBreakdown =
    aggregateByDimension(vehicles, 'STATION', (v) =>
      v.homeStationId
        ? { key: v.homeStationId, label: v.homeStationName ?? v.homeStationId }
        : null,
    ) ?? [];

  const partialNote =
    snapshot.maintenanceFromSnapshotOnly > 0 || snapshot.blockedFromSnapshotOnly > 0
      ? 'Some maintenance/blocked time uses point-in-time vehicle status only.'
      : undefined;

  const metrics: EvaluationsUtilizationMetric[] = [
    metric(
      'UTILIZATION_PER_VEHICLE',
      'Fleet utilization (time-weighted)',
      'SUM(rentedMs) / SUM(capacityMs - maintenanceMs - blockedMs) per vehicle in period',
      ['Booking intervals', 'ServiceCase downtime', 'Vehicle.status (fallback)'],
      period,
      partialNote ? 'PARTIAL' : 'OK',
      fleetCoverage(vehicles, rentedMs, netCapacityMs, partialNote),
      rentedMs,
      utilizationPercent(rentedMs, netCapacityMs),
      'percent',
    ),
    metric(
      'UTILIZATION_BY_VEHICLE_CLASS',
      'Utilization by vehicle class',
      'SUM(rentedMs) / SUM(net capacityMs) grouped by Vehicle.rentalCategoryId',
      ['Booking intervals', 'Vehicle.rentalCategoryId'],
      period,
      classBreakdown.length > 0 ? 'OK' : 'PARTIAL',
      fleetCoverage(vehicles, rentedMs, netCapacityMs),
      rentedMs,
      utilizationPercent(rentedMs, netCapacityMs),
      'percent',
      classBreakdown,
    ),
    metric(
      'UTILIZATION_BY_STATION',
      'Utilization by station',
      'SUM(rentedMs) / SUM(net capacityMs) grouped by Vehicle.homeStationId',
      ['Booking intervals', 'Vehicle.homeStationId'],
      period,
      stationBreakdown.length > 0 ? 'OK' : 'PARTIAL',
      fleetCoverage(vehicles, rentedMs, netCapacityMs),
      rentedMs,
      utilizationPercent(rentedMs, netCapacityMs),
      'percent',
      stationBreakdown,
    ),
    metric(
      'RENTED_TIME',
      'Rented time',
      'SUM merged booking intervals (ACTIVE, COMPLETED) within period',
      ['Booking.startDate/endDate', 'Booking.status'],
      period,
      'OK',
      fleetCoverage(vehicles, rentedMs, netCapacityMs),
      rentedMs,
      utilizationPercent(rentedMs, netCapacityMs),
      'ms',
    ),
    metric(
      'AVAILABLE_TIME',
      'Available capacity time',
      'SUM(capacityMs - maintenanceMs - blockedMs - rentedMs)',
      ['Period window', 'Booking intervals', 'Downtime windows'],
      period,
      partialNote ? 'PARTIAL' : 'OK',
      fleetCoverage(vehicles, availableMs, netCapacityMs),
      availableMs,
      utilizationPercent(availableMs, netCapacityMs),
      'ms',
    ),
    metric(
      'MAINTENANCE_TIME',
      'Maintenance time',
      'SUM(ServiceCase downtime where blocksRental) OR IN_SERVICE snapshot fallback',
      ['ServiceCase.downtimeStart/End', 'Vehicle.status IN_SERVICE'],
      period,
      snapshot.maintenanceFromSnapshotOnly > 0 ? 'PARTIAL' : 'OK',
      fleetCoverage(vehicles, maintenanceMs, fleetCapacityMs),
      maintenanceMs,
      utilizationPercent(maintenanceMs, fleetCapacityMs),
      'ms',
    ),
    metric(
      'BLOCKED_TIME',
      'Blocked time',
      'SUM(ServiceCase downtime for OUT_OF_SERVICE) OR OUT_OF_SERVICE snapshot fallback',
      ['ServiceCase.downtimeStart/End', 'Vehicle.status OUT_OF_SERVICE'],
      period,
      snapshot.blockedFromSnapshotOnly > 0 ? 'PARTIAL' : 'OK',
      fleetCoverage(vehicles, blockedMs, fleetCapacityMs),
      blockedMs,
      utilizationPercent(blockedMs, fleetCapacityMs),
      'ms',
    ),
    metric(
      'UNPLANNED_DOWNTIME',
      'Unplanned downtime',
      'SUM(ServiceCase REPAIR/DIAGNOSTIC downtime overlapping period',
      ['ServiceCase category REPAIR/DIAGNOSTIC', 'downtimeStart/End'],
      period,
      unplannedDowntimeMs > 0 ? 'OK' : 'PARTIAL',
      fleetCoverage(vehicles, unplannedDowntimeMs, fleetCapacityMs),
      unplannedDowntimeMs,
      utilizationPercent(unplannedDowntimeMs, fleetCapacityMs),
      'ms',
    ),
    metric(
      'TURNAROUND_TIME',
      'Turnaround time between rentals',
      'SUM(gap between COMPLETED/ACTIVE booking end and next booking start)',
      ['Booking intervals per vehicle'],
      period,
      'OK',
      fleetCoverage(
        vehicles,
        turnaroundMs,
        netCapacityMs,
        'Gaps between consecutive realized bookings only.',
      ),
      turnaroundMs,
      null,
      'ms',
    ),
    metric(
      'STANDSTILL_TIME',
      'Standstill (idle within available capacity)',
      'SUM(net capacity - rented) per vehicle',
      ['Derived from capacity and booking intervals'],
      period,
      partialNote ? 'PARTIAL' : 'OK',
      fleetCoverage(vehicles, standstillMs, netCapacityMs),
      standstillMs,
      utilizationPercent(standstillMs, netCapacityMs),
      'ms',
    ),
    metric(
      'BOOKED_NOT_REALIZED_TIME',
      'Booked but not realized time',
      'SUM(PENDING/CONFIRMED booking intervals excluding realized overlap',
      ['Booking.status PENDING/CONFIRMED'],
      period,
      'OK',
      fleetCoverage(vehicles, bookedNotRealizedMs, netCapacityMs),
      bookedNotRealizedMs,
      utilizationPercent(bookedNotRealizedMs, netCapacityMs),
      'ms',
    ),
    metric(
      'AVAILABLE_NOT_RENTABLE',
      'Available but not rentable vehicles',
      'COUNT vehicles operational AVAILABLE with cleaning!=CLEAN or rental_blocked',
      ['deriveFleetStatusContext', 'cleaningStatus', 'RentalHealth rental_blocked'],
      period,
      'OK',
      {
        numeratorMs: availableNotRentableCount,
        denominatorMs: vehicles.length,
        vehicleCount: vehicles.length,
        vehiclesWithData: vehicles.length,
        percent: utilizationPercent(availableNotRentableCount, vehicles.length),
      },
      null,
      null,
      'count',
    ),
    metric(
      'CAPACITY_BOTTLENECKS',
      'Capacity bottlenecks (stations)',
      'COUNT stations where available vehicles <= shortage threshold with upcoming demand',
      ['Station vehicle counts', 'CONFIRMED/ACTIVE bookings'],
      period,
      'OK',
      {
        numeratorMs: snapshot.stationBottlenecks.length,
        denominatorMs: stationBreakdown.length,
        vehicleCount: vehicles.length,
        vehiclesWithData: vehicles.length,
        percent: null,
      },
      null,
      null,
      'count',
    ),
    metric(
      'OPERATIONAL_SNAPSHOT_UTILIZATION',
      'Operational snapshot utilization',
      'activeRented / (activeRented + available + reserved) at period end via deriveFleetStatusContext',
      ['deriveFleetStatusContext', 'buildBookingContextMap'],
      period,
      'OK',
      {
        numeratorMs: snapshot.operationalSnapshot.activeRented,
        denominatorMs:
          snapshot.operationalSnapshot.activeRented +
          snapshot.operationalSnapshot.available +
          snapshot.operationalSnapshot.reserved,
        vehicleCount: vehicles.length,
        vehiclesWithData: vehicles.length,
        percent: snapshot.operationalSnapshot.operationalUtilizationPercent,
        notes: 'Point-in-time snapshot — distinct from time-weighted utilization.',
      },
      null,
      snapshot.operationalSnapshot.operationalUtilizationPercent,
      'percent',
    ),
  ];

  const drillDowns: EvaluationsUtilizationDrillDown[] = [
    {
      metricKey: 'UTILIZATION_PER_VEHICLE',
      title: 'Vehicles by utilization',
      status: 'OK',
      items: vehicleDrillDown(vehicles, () => true, {
        rentedMs: (v) => ({ kind: 'duration', valueMs: v.rentedMs }),
        utilizationPercent: (v) => ({
          kind: 'percent',
          value:
            utilizationPercent(
              v.rentedMs,
              Math.max(0, v.capacityMs - v.maintenanceMs - v.blockedMs),
            ) ?? 0,
        }),
        operationalStatus: (v) => ({ kind: 'text', value: v.operationalToken }),
      }),
    },
    {
      metricKey: 'MAINTENANCE_TIME',
      title: 'Vehicles in maintenance',
      status: snapshot.maintenanceFromSnapshotOnly > 0 ? 'PARTIAL' : 'OK',
      items: vehicleDrillDown(vehicles, (v) => v.maintenanceMs > 0, {
        maintenanceMs: (v) => ({ kind: 'duration', valueMs: v.maintenanceMs }),
        status: (v) => ({ kind: 'text', value: v.prismaStatus }),
      }),
    },
    {
      metricKey: 'BLOCKED_TIME',
      title: 'Blocked vehicles',
      status: snapshot.blockedFromSnapshotOnly > 0 ? 'PARTIAL' : 'OK',
      items: vehicleDrillDown(vehicles, (v) => v.blockedMs > 0, {
        blockedMs: (v) => ({ kind: 'duration', valueMs: v.blockedMs }),
        status: (v) => ({ kind: 'text', value: v.prismaStatus }),
      }),
    },
    {
      metricKey: 'AVAILABLE_NOT_RENTABLE',
      title: 'Available but not rentable',
      status: 'OK',
      items: vehicleDrillDown(
        vehicles,
        (v) =>
          v.operationalToken === 'AVAILABLE' &&
          (v.cleaningStatus !== 'CLEAN' || v.rentalBlocked),
        {
          cleaningStatus: (v) => ({ kind: 'text', value: v.cleaningStatus ?? 'unknown' }),
          rentalBlocked: (v) => ({ kind: 'text', value: v.rentalBlocked ? 'yes' : 'no' }),
        },
      ),
    },
    {
      metricKey: 'CAPACITY_BOTTLENECKS',
      title: 'Station capacity bottlenecks',
      status: 'OK',
      items: snapshot.stationBottlenecks.map((s) => ({
        entityType: 'STATION' as const,
        entityId: s.stationId,
        label: s.stationName,
        metrics: {
          totalVehicles: { kind: 'count', value: s.totalVehicles },
          bookedVehicles: { kind: 'count', value: s.bookedVehicles },
          availableVehicles: { kind: 'count', value: s.availableVehicles },
        },
      })),
    },
    {
      metricKey: 'OVERLAPPING_BOOKINGS',
      title: 'Overlapping blocking bookings (data errors)',
      status: snapshot.overlappingBookingIds.length > 0 ? 'PARTIAL' : 'OK',
      items: snapshot.overlappingBookingIds.map((id) => ({
        entityType: 'BOOKING' as const,
        entityId: id,
        label: id,
        metrics: {
          issue: { kind: 'text', value: 'Overlapping blocking booking intervals' },
        },
      })),
    },
    {
      metricKey: 'TELEMETRY_OFFLINE',
      title: 'Telemetry offline (informational)',
      status: 'PARTIAL',
      items: vehicleDrillDown(vehicles, (v) => v.telemetryOffline, {
        note: () => ({
          kind: 'text',
          value: 'Offline telemetry — not counted as downtime',
        }),
      }),
    },
  ];

  return {
    calculationVersion: EVALUATIONS_UTILIZATION_MODEL_VERSION,
    period,
    totals,
    operationalSnapshot: snapshot.operationalSnapshot,
    metrics,
    drillDowns,
    dataGaps: buildDataGaps(snapshot),
  };
}

export function utilizationModelSectionStatus(
  summary: EvaluationsUtilizationModelSummary,
): 'OK' | 'PARTIAL' | 'UNAVAILABLE' {
  const statuses = summary.metrics.map((m) => m.status);
  if (statuses.every((s) => s === 'UNAVAILABLE')) return 'UNAVAILABLE';
  if (statuses.some((s) => s === 'PARTIAL')) return 'PARTIAL';
  return 'OK';
}

/** Compute per-vehicle utilization from raw booking + downtime inputs (pure). */
export function computeVehicleUtilization(input: {
  vehicleId: string;
  label: string;
  capacityMs: number;
  bookings: UtilizationBookingInterval[];
  range: UtilizationTimeRange;
  maintenanceIntervals: Array<{ startMs: number; endMs: number }>;
  blockedIntervals: Array<{ startMs: number; endMs: number }>;
  unplannedIntervals: Array<{ startMs: number; endMs: number }>;
}): Pick<
  EvaluationsUtilizationVehicleRow,
  | 'rentedMs'
  | 'maintenanceMs'
  | 'blockedMs'
  | 'unplannedDowntimeMs'
  | 'bookedNotRealizedMs'
  | 'standstillMs'
  | 'turnaroundMs'
  | 'turnaroundCount'
> {
  const rentedIntervals = intervalsFromBookings(
    input.bookings,
    input.range,
    UTILIZATION_REALIZED_STATUSES,
  );
  const forecastOnly = intervalsFromBookings(
    input.bookings.filter((b) => b.status === 'pending' || b.status === 'confirmed'),
    input.range,
    ['pending', 'confirmed'],
  );
  const realizedMerged = intervalsFromBookings(
    input.bookings,
    input.range,
    UTILIZATION_REALIZED_STATUSES,
  );

  const rentedMs = rentedIntervals.reduce((s, iv) => s + (iv.endMs - iv.startMs), 0);
  const maintenanceMs = sumClamped(input.maintenanceIntervals, input.range);
  const blockedMs = sumClamped(input.blockedIntervals, input.range);
  const unplannedDowntimeMs = sumClamped(input.unplannedIntervals, input.range);
  const bookedNotRealizedMs = Math.max(
    0,
    forecastOnly.reduce((s, iv) => s + (iv.endMs - iv.startMs), 0) -
      realizedMerged.reduce((s, iv) => s + (iv.endMs - iv.startMs), 0),
  );

  const netCapacity = Math.max(0, input.capacityMs - maintenanceMs - blockedMs);
  const standstillMs = Math.max(0, netCapacity - rentedMs);

  const sorted = [...input.bookings]
    .filter((b) => UTILIZATION_REALIZED_STATUSES.includes(b.status))
    .sort((a, b) => a.endMs - b.endMs);
  let turnaroundMs = 0;
  let turnaroundCount = 0;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const gap = sorted[i + 1]!.startMs - sorted[i]!.endMs;
    if (gap > 0) {
      turnaroundMs += gap;
      turnaroundCount += 1;
    }
  }

  return {
    rentedMs,
    maintenanceMs,
    blockedMs,
    unplannedDowntimeMs,
    bookedNotRealizedMs,
    standstillMs,
    turnaroundMs,
    turnaroundCount,
  };
}

function sumClamped(
  intervals: Array<{ startMs: number; endMs: number }>,
  range: UtilizationTimeRange,
): number {
  let total = 0;
  for (const iv of intervals) {
    const start = Math.max(iv.startMs, range.fromMs);
    const end = Math.min(iv.endMs, range.toMs);
    if (end > start) total += end - start;
  }
  return total;
}

export function mapBookingStatus(status: string): UtilizationBookingInterval['status'] | null {
  switch (status) {
    case 'PENDING':
      return 'pending';
    case 'CONFIRMED':
      return 'confirmed';
    case 'ACTIVE':
      return 'active';
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
      return 'cancelled';
    case 'NO_SHOW':
      return 'no_show';
    default:
      return null;
  }
}
