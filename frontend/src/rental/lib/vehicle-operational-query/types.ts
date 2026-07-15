import type { FleetStatusKey } from '../vehicle-status';

export type VehicleOperationalInvalidationReason =
  | 'booking-created'
  | 'booking-updated'
  | 'booking-cancelled'
  | 'booking-no-show'
  | 'handover-pickup'
  | 'handover-return'
  | 'vehicle-status-patch'
  | 'maintenance-patch';

export type VehicleOperationalOptimisticKind =
  | 'pickup'
  | 'return'
  | 'reserve'
  | 'release'
  | 'none';

export interface VehicleOperationalBookingContext {
  bookingId?: string;
  customerName?: string | null;
  pickupAt?: string | null;
  returnAt?: string | null;
  pickupStationName?: string | null;
  returnStationName?: string | null;
}

export interface InvalidateVehicleOperationalStateInput {
  orgId: string;
  vehicleIds: string[];
  /** When a booking vehicle is swapped, bust the previous assignment too. */
  previousVehicleIds?: string[];
  reason: VehicleOperationalInvalidationReason;
  optimistic?: VehicleOperationalOptimisticKind;
  bookingContext?: VehicleOperationalBookingContext;
}

export interface VehicleOperationalInvalidationContext
  extends InvalidateVehicleOperationalStateInput {
  allVehicleIds: string[];
  optimisticRollbackToken: string | null;
}

export interface FleetOperationalOptimisticPatch {
  status?: FleetStatusKey;
  reservedBookingId?: string | null;
  reservedCustomerName?: string | null;
  reservedPickupAt?: string | null;
  reservedPickupStationName?: string | null;
  reservedIsOverdue?: boolean;
  activeBookingId?: string | null;
  activeCustomerName?: string | null;
  activeReturnAt?: string | null;
  activeReturnStationName?: string | null;
  activeKmIncluded?: number | null;
  activeKmDriven?: number | null;
  activeIsOverdue?: boolean;
}
