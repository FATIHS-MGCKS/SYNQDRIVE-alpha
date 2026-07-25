import type { BookingStatus } from '@prisma/client';
import type { FleetVehicleOperationalStateDto } from '@modules/vehicles/operational/fleet-operational-state.util';
import type {
  VehicleBookingContextBucket,
  VehicleBookingContextKind,
  VehicleBookingContextReasonCode,
  VehicleBookingDeadlineKind,
  VehicleBookingInconsistencyFlag,
  VehicleBookingProcessStep,
} from './vehicle-booking-context.constants';
import type {
  OverdueReturnExtensionStatus,
  OverdueReturnHandoverStatus,
  OverdueReturnReturnStatus,
} from '@modules/bookings/overdue-return/overdue-return-explanation.constants';

export interface VehicleBookingStationRef {
  readonly stationId: string | null;
  readonly stationName: string | null;
}

export interface VehicleBookingHandoverProtocolRef {
  readonly performedAt: Date;
}

export interface VehicleBookingContextRow {
  readonly id: string;
  readonly vehicleId: string;
  readonly status: BookingStatus;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly kmIncluded: number | null;
  readonly kmDriven: number | null;
  readonly pickupStationId: string | null;
  readonly returnStationId: string | null;
  readonly actualPickupStationId: string | null;
  readonly actualReturnStationId: string | null;
  readonly customer: { firstName: string; lastName: string; company: string | null };
  readonly originalScheduledReturnAt?: Date | null;
}

export interface VehicleBookingContextSnapshot {
  readonly bucket: VehicleBookingContextBucket;
  readonly bookingId: string;
  readonly bookingNumber: string;
  readonly bookingStatus: BookingStatus;
  readonly scheduledPickupAt: string;
  readonly scheduledReturnAt: string;
  readonly actualPickupAt: string | null;
  readonly actualReturnAt: string | null;
  readonly pickupStation: VehicleBookingStationRef;
  readonly returnStation: VehicleBookingStationRef;
  readonly extensionStatus: OverdueReturnExtensionStatus;
  readonly approvedExtensionUntil: string | null;
  readonly handoverStatus: OverdueReturnHandoverStatus;
  readonly returnStatus: OverdueReturnReturnStatus;
  readonly pickupOverdue: boolean;
  readonly returnOverdue: boolean;
  readonly customerDisplayName?: string | null;
}

export interface VehicleBookingOperationalContext {
  readonly vehicleId: string;
  readonly contextKind: VehicleBookingContextKind;
  readonly currentBooking: VehicleBookingContextSnapshot | null;
  readonly reservedBooking: VehicleBookingContextSnapshot | null;
  readonly upcomingBooking: VehicleBookingContextSnapshot | null;
  readonly futureBookingCount: number;
  readonly runtimeState: string;
  readonly operationalState: FleetVehicleOperationalStateDto | null;
  readonly openProcessSteps: readonly VehicleBookingProcessStep[];
  readonly nextRelevantDeadline: string | null;
  readonly nextRelevantDeadlineKind: VehicleBookingDeadlineKind | null;
  readonly pickupOverdue: boolean;
  readonly returnOverdue: boolean;
  readonly reasonCodes: readonly VehicleBookingContextReasonCode[];
  readonly inconsistencyFlags: readonly VehicleBookingInconsistencyFlag[];
  readonly source: string;
  readonly calculatedAt: string;
}

export interface BuildVehicleBookingOperationalContextInput {
  readonly vehicleId: string;
  readonly vehicleStatus: string;
  readonly operationalState: FleetVehicleOperationalStateDto | null;
  readonly runtimeState: string;
  readonly rows: readonly VehicleBookingContextRow[];
  readonly pickupProtocolByBookingId: ReadonlyMap<string, VehicleBookingHandoverProtocolRef>;
  readonly returnProtocolByBookingId: ReadonlyMap<string, VehicleBookingHandoverProtocolRef>;
  readonly fleetFlat: import('@modules/vehicles/vehicles.service').FleetVehicleBookingContextDto;
  readonly supplement: import('@modules/vehicles/operational/fleet-booking-context.util').FleetVehicleBookingSupplementDto;
  readonly stationMap: ReadonlyMap<string, string>;
  readonly fmtCustomer: (customer: VehicleBookingContextRow['customer']) => string;
  readonly orgTimezone: string;
  readonly now: Date;
  readonly includeCustomerDisplayName: boolean;
  readonly fleetContextLoadFailed?: boolean;
}
