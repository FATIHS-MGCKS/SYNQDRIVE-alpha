/**
 * Canonical frontend domain types for vehicle operational state.
 * Internal enum values are machine tokens — never UI display strings.
 */

export const VEHICLE_OPERATIONAL_STATUS = {
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  ACTIVE_RENTED: 'ACTIVE_RENTED',
  MAINTENANCE: 'MAINTENANCE',
  BLOCKED: 'BLOCKED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type VehicleOperationalStatus =
  (typeof VEHICLE_OPERATIONAL_STATUS)[keyof typeof VEHICLE_OPERATIONAL_STATUS];

export const VEHICLE_DATA_QUALITY_STATE = {
  RELIABLE: 'RELIABLE',
  DEGRADED: 'DEGRADED',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type VehicleDataQualityState =
  (typeof VEHICLE_DATA_QUALITY_STATE)[keyof typeof VEHICLE_DATA_QUALITY_STATE];

export interface VehicleOperationalState {
  status: VehicleOperationalStatus;
  reason: string | null;
  source: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  derivedAt: string | null;
  dataQualityState: VehicleDataQualityState | null;
  dataQualityReasons: string[];
  isReliable: boolean;
}

export interface VehicleBookingReference {
  bookingId: string;
  customerName: string | null;
  pickupAt: string | null;
  returnAt: string | null;
  pickupStationName: string | null;
  returnStationName: string | null;
  isOverdue: boolean;
}

export interface VehicleBookingContext {
  activeBooking: VehicleBookingReference | null;
  reservedBooking: VehicleBookingReference | null;
  nextBooking: VehicleBookingReference | null;
  futureBookingCount: number;
}

/** Dashboard / operator tab keys — operational statuses shown as fleet buckets. */
export const VEHICLE_OPERATIONAL_TAB_STATUSES = [
  VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
  VEHICLE_OPERATIONAL_STATUS.RESERVED,
  VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
  VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
] as const;

export type VehicleOperationalTabStatus =
  (typeof VEHICLE_OPERATIONAL_TAB_STATUSES)[number];
