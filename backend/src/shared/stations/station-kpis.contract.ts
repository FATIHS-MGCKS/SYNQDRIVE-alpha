import { VehicleStatus } from '@prisma/client';
import type { StationCapacityStatus } from './station-capacity-policy.contract';

export const STATION_KPIS_VERSION = 1 as const;

export const StationKpiMetricName = {
  HOME_FLEET_COUNT: 'homeFleetCount',
  CURRENT_ON_SITE_COUNT: 'currentOnSiteCount',
  FOREIGN_VEHICLES_ON_SITE_COUNT: 'foreignVehiclesOnSiteCount',
  EXPECTED_ARRIVAL_COUNT: 'expectedArrivalCount',
  CURRENTLY_RENTED_HOME_VEHICLES: 'currentlyRentedHomeVehicles',
  READY_TO_RENT_ON_SITE: 'readyToRentOnSite',
  BLOCKED_OR_MAINTENANCE_ON_SITE: 'blockedOrMaintenanceOnSite',
  PICKUPS_TODAY: 'pickupsToday',
  RETURNS_TODAY: 'returnsToday',
  OVERDUE_RETURNS: 'overdueReturns',
  INCOMING_TRANSFERS: 'incomingTransfers',
  OUTGOING_TRANSFERS: 'outgoingTransfers',
  OPEN_OPERATIONAL_TASKS: 'openOperationalTasks',
  CAPACITY_STATUS: 'capacityStatus',
} as const;

export type StationKpiMetricName =
  (typeof StationKpiMetricName)[keyof typeof StationKpiMetricName];

export const StationKpiReasonCode = {
  SCOPE_APPLIED: 'STATION_KPI_SCOPE_APPLIED',
  VEHICLE_SNAPSHOT_MISSING: 'STATION_KPI_VEHICLE_SNAPSHOT_MISSING',
  BOOKING_SNAPSHOT_MISSING: 'STATION_KPI_BOOKING_SNAPSHOT_MISSING',
  TRANSFER_SNAPSHOT_MISSING: 'STATION_KPI_TRANSFER_SNAPSHOT_MISSING',
  TASK_COUNT_MISSING: 'STATION_KPI_TASK_COUNT_MISSING',
  CAPACITY_PARTIAL: 'STATION_KPI_CAPACITY_PARTIAL',
  STATION_TIMEZONE_USED: 'STATION_KPI_STATION_TIMEZONE_USED',
  RUNTIME_VEHICLE_STATUS: 'STATION_KPI_RUNTIME_VEHICLE_STATUS',
  DEPRECATED_BOOKED_VEHICLES: 'STATION_KPI_DEPRECATED_BOOKED_VEHICLES',
} as const;

export type StationKpiReasonCode =
  (typeof StationKpiReasonCode)[keyof typeof StationKpiReasonCode];

export interface StationKpiReason {
  code: StationKpiReasonCode | string;
  message: string;
}

export interface StationKpiMetric<T> {
  value: T | null;
  known: boolean;
  partial?: boolean;
  reasons: StationKpiReason[];
}

export interface StationKpiVehicleSnapshot {
  id: string;
  homeStationId: string | null;
  currentStationId: string | null;
  expectedStationId: string | null;
  status: VehicleStatus;
}

export interface StationKpiBookingSnapshot {
  id: string;
  status: string;
  pickupStationId: string | null;
  returnStationId: string | null;
  startDate: string;
  endDate: string;
}

export interface StationKpiTransferSnapshot {
  id: string;
  fromStationId: string | null;
  toStationId: string;
  status: string;
}

export const ACTIVE_STATION_KPI_BOOKING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'ACTIVE',
] as const;

export const ACTIVE_STATION_KPI_TRANSFER_STATUSES = [
  'PLANNED',
  'READY',
  'IN_TRANSIT',
  'OVERDUE',
] as const;

export interface StationKpisScopeContext {
  applied: boolean;
  mode: 'ALL_STATIONS' | 'SCOPED_STATIONS';
  stationId: string;
}

export interface StationKpisEvaluationInput {
  stationId: string;
  timezone: string;
  evaluatedAt: string;
  configuredCapacity: number | null;
  scope: StationKpisScopeContext;
  vehicles?: StationKpiVehicleSnapshot[] | null;
  bookings?: StationKpiBookingSnapshot[] | null;
  transfers?: StationKpiTransferSnapshot[] | null;
  openOperationalTasksCount?: number | null;
}

export interface StationKpisResult {
  version: typeof STATION_KPIS_VERSION;
  stationId: string;
  evaluatedAt: string;
  timezone: string;
  calendarDay: string;
  scope: StationKpisScopeContext;
  metrics: {
    homeFleetCount: StationKpiMetric<number>;
    currentOnSiteCount: StationKpiMetric<number>;
    foreignVehiclesOnSiteCount: StationKpiMetric<number>;
    expectedArrivalCount: StationKpiMetric<number>;
    currentlyRentedHomeVehicles: StationKpiMetric<number>;
    readyToRentOnSite: StationKpiMetric<number>;
    blockedOrMaintenanceOnSite: StationKpiMetric<number>;
    pickupsToday: StationKpiMetric<number>;
    returnsToday: StationKpiMetric<number>;
    overdueReturns: StationKpiMetric<number>;
    incomingTransfers: StationKpiMetric<number>;
    outgoingTransfers: StationKpiMetric<number>;
    openOperationalTasks: StationKpiMetric<number>;
    capacityStatus: StationKpiMetric<StationCapacityStatus>;
  };
  /**
   * @deprecated Use `currentlyRentedHomeVehicles` for runtime RENTED home-fleet count,
   * or derive booking-based counts separately — never alias RENTED to bookedVehicles.
   */
  deprecatedAliases: {
    bookedVehicles: null;
  };
}

export interface StationKpisContractMetadata {
  version: typeof STATION_KPIS_VERSION;
  resolver: 'station-kpis.resolver';
  frontendRecomputation: false;
  vehicleTruth: 'runtime_status';
  todayBasis: 'station.timezone';
  metrics: readonly StationKpiMetricName[];
  deprecatedMetricNames: readonly ['bookedVehicles'];
}

export function getStationKpisContractMetadata(): StationKpisContractMetadata {
  return {
    version: STATION_KPIS_VERSION,
    resolver: 'station-kpis.resolver',
    frontendRecomputation: false,
    vehicleTruth: 'runtime_status',
    todayBasis: 'station.timezone',
    metrics: Object.values(StationKpiMetricName),
    deprecatedMetricNames: ['bookedVehicles'],
  };
}
