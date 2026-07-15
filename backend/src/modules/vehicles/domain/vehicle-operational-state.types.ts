import { VehicleStatus } from '@prisma/client';

/**
 * V2 extraction (Prompt 6/43) — shared fleet operational-state contracts.
 * Pure types/constants used by `vehicle-operational-state.builder.ts` and
 * re-exported from `VehiclesService` for API DTO compatibility.
 */

/** Rental Fleet/Dashboard visible status labels (V1 semantics). */
export type FleetVisibleStatusLabel =
  | 'Available'
  | 'Reserved'
  | 'Active Rented'
  | 'Maintenance';

export const RENTAL_STATUS_MAP: Record<VehicleStatus, FleetVisibleStatusLabel> = {
  AVAILABLE: 'Available',
  RENTED: 'Active Rented',
  RESERVED: 'Reserved',
  IN_SERVICE: 'Maintenance',
  OUT_OF_SERVICE: 'Maintenance',
};

export interface FleetVehicleBookingContextDto {
  reservedBookingId: string | null;
  reservedCustomerName: string | null;
  reservedPickupAt: string | null;
  reservedReturnAt: string | null;
  reservedPickupStationName: string | null;
  reservedIsOverdue: boolean;
  activeBookingId: string | null;
  activeCustomerName: string | null;
  activeStartAt: string | null;
  activeReturnAt: string | null;
  activeReturnStationName: string | null;
  activeKmIncluded: number | null;
  activeKmDriven: number | null;
  activeIsOverdue: boolean;
}

export type FleetMaintenanceReasonCode =
  | 'SCHEDULED_SERVICE'
  | 'OPERATIONAL_BLOCK';

export interface FleetVehicleMaintenanceContextDto {
  maintenanceReason: string | null;
  maintenanceReasonCode: FleetMaintenanceReasonCode | null;
  maintenanceUrgency: 'planned' | 'urgent' | null;
}

export const EMPTY_BOOKING_CONTEXT: FleetVehicleBookingContextDto = {
  reservedBookingId: null,
  reservedCustomerName: null,
  reservedPickupAt: null,
  reservedReturnAt: null,
  reservedPickupStationName: null,
  reservedIsOverdue: false,
  activeBookingId: null,
  activeCustomerName: null,
  activeStartAt: null,
  activeReturnAt: null,
  activeReturnStationName: null,
  activeKmIncluded: null,
  activeKmDriven: null,
  activeIsOverdue: false,
};

export interface VehicleOperationalTelemetryState {
  odometerKm?: number | null;
  evSoc?: number | null;
  fuelLevelRelative?: number | null;
  fuelLevelAbsolute?: number | null;
  rawPayloadJson?: unknown;
}

export interface VehicleOperationalStateInput {
  vehicle: {
    id?: string;
    status: VehicleStatus | string | null | undefined;
    licensePlate?: string | null;
    tankCapacityLiters?: number | null;
  };
  state: VehicleOperationalTelemetryState | null;
  bookingCtx: FleetVehicleBookingContextDto | null;
  pickupOdoByBooking: Map<string, number>;
}

export interface VehicleOperationalStateResult {
  status: FleetVisibleStatusLabel | string;
  maintenanceCtx: FleetVehicleMaintenanceContextDto;
  bookingDto: FleetVehicleBookingContextDto;
  liveKmDriven: number | null;
  odometerKm: number | null;
  fuelPercent: number | null;
  evSoc: number | null;
  /** Set when a ghost RENTED/RESERVED DB row is demoted to Available. */
  ghostStateWarning: string | null;
}
