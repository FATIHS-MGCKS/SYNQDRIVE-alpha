import type { VehicleStateEngineBookingStateInput } from './vehicle-operational-state.engine.types';
import type {
  FleetBookingContextDto,
} from './vehicle-booking-context.serializer';
import type { FleetOperationalStateDto } from './vehicle-operational-state.serializer';

/** Batched inputs for canonical fleet operational projection — one load per request scope. */
export interface FleetOperationalContextBundle {
  organizationId: string;
  organizationTimezone: string;
  tripStateMap: Map<string, { state: any }>;
  bookingContextMap: Map<string, VehicleStateEngineBookingStateInput>;
  pickupOdoByBooking: Map<string, number>;
}

/** Multi-org batch result — platform admin lists vehicles across tenants. */
export interface FleetOperationalContextMultiOrgBundle {
  tripStateMap: Map<string, { state: any }>;
  bookingContextMap: Map<string, VehicleStateEngineBookingStateInput>;
  pickupOdoByBooking: Map<string, number>;
  organizationTimezoneByVehicleId: Map<string, string>;
  organizationIdByVehicleId: Map<string, string>;
}

/**
 * Compact operational read-model shared by station fleet, rental-rules picker,
 * and other surfaces that need canonical status without full fleet-list payload.
 */
export interface CompactOperationalVehicleDto {
  id: string;
  displayName: string;
  licensePlate: string | null;
  /** @deprecated Use `operationalState.status` */
  status: string;
  operationalState: FleetOperationalStateDto;
  bookingContext: FleetBookingContextDto;
}
