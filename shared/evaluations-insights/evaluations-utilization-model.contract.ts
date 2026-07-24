/**
 * Canonical Auswertungen fleet utilization model (Prompt 22/54).
 * Time-weighted utilization aligned with runtime-state architecture — no parallel status definitions.
 */
import type { EvaluationsTimePeriod } from './evaluations-analytics-primitives.contract';
import type { EvaluationsMetricValue } from './evaluations-analytics-primitives.contract';

export const EVALUATIONS_UTILIZATION_MODEL_VERSION = 'utilization-model-v1';

export type EvaluationsUtilizationMetricStatus = 'OK' | 'PARTIAL' | 'UNAVAILABLE';

export type EvaluationsUtilizationMetricKey =
  | 'UTILIZATION_PER_VEHICLE'
  | 'UTILIZATION_BY_VEHICLE_CLASS'
  | 'UTILIZATION_BY_STATION'
  | 'RENTED_TIME'
  | 'AVAILABLE_TIME'
  | 'BLOCKED_TIME'
  | 'MAINTENANCE_TIME'
  | 'UNPLANNED_DOWNTIME'
  | 'TURNAROUND_TIME'
  | 'STANDSTILL_TIME'
  | 'BOOKED_NOT_REALIZED_TIME'
  | 'AVAILABLE_NOT_RENTABLE'
  | 'CAPACITY_BOTTLENECKS'
  | 'OPERATIONAL_SNAPSHOT_UTILIZATION';

export interface EvaluationsUtilizationCoverage {
  numeratorMs: number;
  denominatorMs: number;
  vehicleCount: number;
  vehiclesWithData: number;
  percent: number | null;
  notes?: string;
}

export interface EvaluationsUtilizationMetric {
  key: EvaluationsUtilizationMetricKey;
  label: string;
  formula: string;
  dataSources: string[];
  coverage: EvaluationsUtilizationCoverage;
  period: EvaluationsTimePeriod;
  status: EvaluationsUtilizationMetricStatus;
  calculationVersion: string;
  valueMs: number | null;
  valuePercent: number | null;
  unit: 'ms' | 'percent' | 'count';
  breakdown?: EvaluationsUtilizationBreakdownItem[];
}

export interface EvaluationsUtilizationBreakdownItem {
  dimension: 'VEHICLE' | 'VEHICLE_CLASS' | 'STATION';
  key: string;
  label: string;
  rentedMs: number;
  capacityMs: number;
  utilizationPercent: number | null;
  vehicleCount: number;
}

export interface EvaluationsUtilizationDrillDownEntity {
  entityType: 'VEHICLE' | 'BOOKING' | 'STATION';
  entityId: string;
  label: string;
  metrics: Record<string, EvaluationsMetricValue>;
}

export interface EvaluationsUtilizationDrillDown {
  metricKey: EvaluationsUtilizationMetricKey | 'OVERLAPPING_BOOKINGS' | 'TELEMETRY_OFFLINE';
  title: string;
  status: EvaluationsUtilizationMetricStatus;
  items: EvaluationsUtilizationDrillDownEntity[];
}

export interface EvaluationsUtilizationDataGap {
  category:
    | 'MAINTENANCE_INTERVALS'
    | 'BLOCKED_INTERVALS'
    | 'TELEMETRY'
    | 'RENTAL_HEALTH'
    | 'STATION_TRANSFER'
    | 'HISTORICAL_STATUS';
  reason: string;
  suggestedSource: string;
}

export interface EvaluationsUtilizationTotals {
  periodMs: number;
  fleetCapacityMs: number;
  rentedMs: number;
  availableMs: number;
  maintenanceMs: number;
  blockedMs: number;
  unplannedDowntimeMs: number;
  turnaroundMs: number;
  standstillMs: number;
  bookedNotRealizedMs: number;
  availableNotRentableCount: number;
  capacityBottleneckStations: number;
  overlappingBookingCount: number;
  telemetryOfflineCount: number;
}

export interface EvaluationsUtilizationOperationalSnapshot {
  /** Derived via deriveFleetStatusContext semantics (point-in-time at period end). */
  activeRented: number;
  reserved: number;
  available: number;
  maintenance: number;
  blocked: number;
  unknown: number;
  operationalUtilizationPercent: number | null;
}

export interface EvaluationsUtilizationModelSummary {
  calculationVersion: string;
  period: EvaluationsTimePeriod;
  totals: EvaluationsUtilizationTotals;
  operationalSnapshot: EvaluationsUtilizationOperationalSnapshot;
  metrics: EvaluationsUtilizationMetric[];
  drillDowns: EvaluationsUtilizationDrillDown[];
  dataGaps: EvaluationsUtilizationDataGap[];
}

/** Raw repository snapshot — no PII (labels use plate/internal ids only). */
export interface EvaluationsUtilizationVehicleRow {
  vehicleId: string;
  label: string;
  homeStationId: string | null;
  homeStationName: string | null;
  vehicleClassId: string | null;
  vehicleClassName: string | null;
  prismaStatus: string;
  cleaningStatus: string | null;
  rentalBlocked: boolean;
  telemetryOffline: boolean;
  operationalToken: string;
  capacityMs: number;
  rentedMs: number;
  maintenanceMs: number;
  blockedMs: number;
  unplannedDowntimeMs: number;
  bookedNotRealizedMs: number;
  standstillMs: number;
  turnaroundMs: number;
  turnaroundCount: number;
}

export interface EvaluationsUtilizationBookingRow {
  bookingId: string;
  vehicleId: string;
  status: string;
  startMs: number;
  endMs: number;
  stationId: string | null;
}

export interface EvaluationsUtilizationSnapshot {
  periodFromMs: number;
  periodToMs: number;
  vehicles: EvaluationsUtilizationVehicleRow[];
  overlappingBookingIds: string[];
  stationBottlenecks: Array<{
    stationId: string;
    stationName: string;
    totalVehicles: number;
    bookedVehicles: number;
    availableVehicles: number;
  }>;
  operationalSnapshot: EvaluationsUtilizationOperationalSnapshot;
  maintenanceFromDowntimeWindows: number;
  maintenanceFromSnapshotOnly: number;
  blockedFromDowntimeWindows: number;
  blockedFromSnapshotOnly: number;
}
