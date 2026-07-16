import type { FleetVehicleBookingContextDto } from '../vehicles.service';

export const FLEET_STATUS_DERIVATION = Symbol('FLEET_STATUS_DERIVATION');

export interface FleetStatusDerivationPort {
  deriveFleetStatusContext(input: {
    vehicle: {
      id?: string;
      status: string | null | undefined;
      licensePlate?: string | null;
      tankCapacityLiters?: number | null;
    };
    state: {
      odometerKm?: number | null;
      evSoc?: number | null;
      fuelLevelRelative?: number | null;
      fuelLevelAbsolute?: number | null;
      rawPayloadJson?: unknown;
    } | null;
    bookingCtx: FleetVehicleBookingContextDto | null;
    pickupOdoByBooking: Map<string, number>;
  }): {
    status: string;
    maintenanceCtx: unknown;
    bookingDto: FleetVehicleBookingContextDto;
    liveKmDriven: number | null;
    odometerKm: number | null;
    fuelPercent: number | null;
    evSoc: number | null;
  };
}
