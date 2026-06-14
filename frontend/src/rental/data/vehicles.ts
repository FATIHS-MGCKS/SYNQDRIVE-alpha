export type VehicleDisplayState = 'MOVING' | 'IDLE' | 'PARKED';
export type VehicleOnlineStatus = 'ONLINE' | 'STANDBY' | 'OFFLINE';
export type VehicleDisplayIgnition = 'ON' | 'OFF' | 'UNKNOWN';
export type FleetMaintenanceReasonCode = 'SCHEDULED_SERVICE' | 'OPERATIONAL_BLOCK';

// V4.6.86 — Canonical fleet-status union. Every surface (rental dashboard,
// master/admin tables, booking flow, CSV exports) must compare against
// these exact labels. Introduced after audit showed master views were
// silently comparing against a legacy `'Rented'` literal the backend no
// longer emits, producing dead branches. Keep this type as the single
// source of truth and let TypeScript fail the build the next time
// someone drifts the label.
export type FleetStatus = 'Available' | 'Active Rented' | 'Reserved' | 'Maintenance';

export const FLEET_STATUSES: readonly FleetStatus[] = [
  'Available',
  'Reserved',
  'Active Rented',
  'Maintenance',
] as const;

export interface VehicleData {
  id: string;
  license: string;
  make?: string;
  model: string;
  year: number;
  station: string;
  // V4.7.04 — Canonical station identity propagated from the backend
  // (`vehicles.service.ts > mapToFleetVehicle`). The string `station`
  // field above is the human-readable name used by legacy filters; the
  // id is what we need to resolve the assigned `Station` (with
  // lat/lng/radius) for the home/away geofence badge in
  // `StatInlineDetail`. Both can be `null` for vehicles that have not
  // been assigned to a station yet.
  stationId?: string | null;
  fuelType: 'Petrol' | 'Diesel' | 'Electric' | 'Hybrid' | 'PHEV';
  status: FleetStatus;
  cleaningStatus: 'Clean' | 'Needs Cleaning';
  healthStatus: 'Good Health' | 'Warning' | 'Critical';
  online: boolean;
  lastSignal: string;
  badge: number;
  // Legacy numeric telemetry — always a number so existing aggregations /
  // CSV exports / counters keep working. New code MUST prefer the
  // nullable canonical fields below, which preserve "no data" as `null`.
  odometer: number;
  fuel: number;
  fuelLevel?: number | null;
  battery: number;
  speed: number;
  coolant: number;
  brakes: number;
  tires: number;
  engineOil: number;
  isElectric: boolean;
  hvBatteryCapacityKwh: number | null;
  lat?: number;
  lng?: number;
  // V4.6.85 — canonical null-preserving telemetry. When the vehicle has
  // never reported fuel/SoC/odometer, the backend returns `null` instead
  // of fabricating a `0`. UI components that care about empty-state
  // (FleetView table cells, StatInlineDetail popups) read these fields.
  odometerKm?: number | null;
  fuelPercent?: number | null;
  evSoc?: number | null;
  // Interpreted telemetry (from backend, centralized truth)
  signalAgeMs?: number;
  isFresh?: boolean;
  onlineStatus?: VehicleOnlineStatus;
  displayState?: VehicleDisplayState;
  displayIgnition?: VehicleDisplayIgnition;
  isLiveTracking?: boolean;
  // Fleet-specific
  alert?: string | null;
  // Documents
  leasingRate: string;
  insuranceCost: string;
  taxCost: string;
  totalMonthlyCost: string;
  /** Vehicle image for fleet lists / maps */
  imageUrl?: string | null;
  // V4.6.84/85 — canonical fleet-status context so every surface
  // (FleetView tabs, DashboardView widgets, StatInlineDetail) renders
  // from the same source of truth instead of local patchwork. All
  // fields are nullable.
  reservedBookingId?: string | null;
  reservedCustomerName?: string | null;
  reservedPickupAt?: string | null;
  // V4.6.94 — Booking endDate of the upcoming reservation — used by
  // the Reserved fleet-status card to show "for how long".
  reservedReturnAt?: string | null;
  reservedPickupStationName?: string | null;
  reservedIsOverdue?: boolean;
  activeBookingId?: string | null;
  activeCustomerName?: string | null;
  // V4.6.94 — Booking startDate; combined with `activeReturnAt` powers
  // the Active Rented time-progress bar.
  activeStartAt?: string | null;
  activeReturnAt?: string | null;
  activeReturnStationName?: string | null;
  activeKmIncluded?: number | null;
  activeKmDriven?: number | null;
  activeIsOverdue?: boolean;
  maintenanceReason?: string | null;
  maintenanceReasonCode?: FleetMaintenanceReasonCode | null;
  maintenanceUrgency?: 'planned' | 'urgent' | null;
}

// Simulated data removed - loaded from API via RentalApp
export const fleetVehicles: VehicleData[] = [];

export function getShortModel(model: string): string {
  return model.replace(/ \d{4}$/, '');
}

// V4.7.62 — Canonical "vehicle offline" predicate. A vehicle counts as
// offline once its last telemetry signal is ≥ 24h old, which the backend
// already encodes as `onlineStatus === 'OFFLINE'`
// (see `vehicle-state-interpreter.ts > STANDBY_THRESHOLD_MS`). Every
// surface (Fleet page Fleet-Status, Dashboard Fleet-Status, booking
// picker) reads this single helper so the "Last Signal 1 day → offline"
// rule never drifts between views.
//
// V4.7.63 — Also treat "Last Signal unavailable" as offline: a vehicle
// that has never reported telemetry (no `lastSignal` timestamp) and is
// not currently ONLINE/STANDBY is offline too (e.g. KS FH 660E). The
// `onlineStatus !== 'ONLINE'/'STANDBY'` guard means a freshly reporting
// vehicle can never be misclassified by the empty-signal branch.
export function isVehicleOffline(
  v: Pick<VehicleData, 'onlineStatus' | 'lastSignal'>,
): boolean {
  if (v.onlineStatus === 'OFFLINE') return true;
  if (
    v.onlineStatus !== 'ONLINE' &&
    v.onlineStatus !== 'STANDBY' &&
    !v.lastSignal
  ) {
    return true;
  }
  return false;
}

export const VEHICLE_OFFLINE_LABEL = 'Vehicle Offline - Check Device';