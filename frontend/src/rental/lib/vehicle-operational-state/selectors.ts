import {
  formatVehicleOperationalStatusLabel,
  type VehicleOperationalDisplayLocale,
} from './display';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
  type VehicleBookingContext,
  type VehicleBookingReference,
  type VehicleOperationalState,
  type VehicleOperationalStatus,
} from './types';

/** Minimal read-model for operational selectors — fleet, dashboard, vehicle detail. */
export type VehicleOperationalReadModel = {
  status: VehicleOperationalStatus;
  rawVehicleStatus?: string;
  operationalState?: VehicleOperationalState;
  bookingContext?: VehicleBookingContext;
  dataQualityState?: VehicleOperationalState['dataQualityState'];
  dataQualityReasons?: string[];
  isReliable?: boolean | null;
  reservedBookingId?: string | null;
  reservedCustomerName?: string | null;
  reservedPickupAt?: string | null;
  reservedReturnAt?: string | null;
  reservedPickupStationName?: string | null;
  reservedIsOverdue?: boolean;
  activeBookingId?: string | null;
  activeCustomerName?: string | null;
  activeStartAt?: string | null;
  activeReturnAt?: string | null;
  activeReturnStationName?: string | null;
  activeIsOverdue?: boolean;
};

const CANONICAL_STATUSES = new Set<VehicleOperationalStatus>(
  Object.values(VEHICLE_OPERATIONAL_STATUS),
);

function isCanonicalStatus(value: unknown): value is VehicleOperationalStatus {
  return typeof value === 'string' && CANONICAL_STATUSES.has(value as VehicleOperationalStatus);
}

function baseOperationalStatus(
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState' | 'status'>,
): VehicleOperationalStatus {
  const raw = vehicle.operationalState?.status ?? vehicle.status;
  return isCanonicalStatus(raw) ? raw : VEHICLE_OPERATIONAL_STATUS.UNKNOWN;
}

function legacyActiveBooking(vehicle: VehicleOperationalReadModel): VehicleBookingReference | null {
  if (!vehicle.activeBookingId) return null;
  return {
    bookingId: vehicle.activeBookingId,
    customerName: vehicle.activeCustomerName ?? null,
    pickupAt: vehicle.activeStartAt ?? null,
    returnAt: vehicle.activeReturnAt ?? null,
    pickupStationName: null,
    returnStationName: vehicle.activeReturnStationName ?? null,
    isOverdue: Boolean(vehicle.activeIsOverdue),
  };
}

function legacyReservedBooking(
  vehicle: VehicleOperationalReadModel,
): VehicleBookingReference | null {
  if (!vehicle.reservedBookingId) return null;
  return {
    bookingId: vehicle.reservedBookingId,
    customerName: vehicle.reservedCustomerName ?? null,
    pickupAt: vehicle.reservedPickupAt ?? null,
    returnAt: vehicle.reservedReturnAt ?? null,
    pickupStationName: vehicle.reservedPickupStationName ?? null,
    returnStationName: null,
    isOverdue: Boolean(vehicle.reservedIsOverdue),
  };
}

function resolveBookingContext(vehicle: VehicleOperationalReadModel): VehicleBookingContext {
  if (vehicle.bookingContext) return vehicle.bookingContext;
  return {
    activeBooking: legacyActiveBooking(vehicle),
    reservedBooking: legacyReservedBooking(vehicle),
    nextBooking: null,
    futureBookingCount: 0,
  };
}

function hasRawActiveBookingSignal(vehicle: VehicleOperationalReadModel): boolean {
  return Boolean(
    resolveBookingContext(vehicle).activeBooking?.bookingId || vehicle.activeBookingId,
  );
}

function hasRawReservedBookingSignal(vehicle: VehicleOperationalReadModel): boolean {
  return Boolean(
    resolveBookingContext(vehicle).reservedBooking?.bookingId || vehicle.reservedBookingId,
  );
}

function detectOperationalInconsistency(
  vehicle: VehicleOperationalReadModel,
  status: VehicleOperationalStatus,
): boolean {
  if (status === VEHICLE_OPERATIONAL_STATUS.AVAILABLE) {
    if (hasRawActiveBookingSignal(vehicle)) return true;
    if (hasRawReservedBookingSignal(vehicle)) return true;
  }
  if (status === VEHICLE_OPERATIONAL_STATUS.RESERVED && hasRawActiveBookingSignal(vehicle)) {
    return true;
  }
  if (status === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED && hasRawReservedBookingSignal(vehicle)) {
    const ctx = resolveBookingContext(vehicle);
    if (!hasRawActiveBookingSignal(vehicle) && ctx.reservedBooking) return true;
  }
  return false;
}

/** Canonical operational status — never reads rawVehicleStatus; fail-closed on conflicts. */
export function selectOperationalStatus(
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState' | 'status'> &
    Partial<VehicleOperationalReadModel>,
): VehicleOperationalStatus {
  const status = baseOperationalStatus(vehicle);

  if (status === VEHICLE_OPERATIONAL_STATUS.UNKNOWN) {
    return VEHICLE_OPERATIONAL_STATUS.UNKNOWN;
  }

  if (!selectIsStatusReliable(vehicle)) {
    if (status === VEHICLE_OPERATIONAL_STATUS.AVAILABLE) {
      return VEHICLE_OPERATIONAL_STATUS.UNKNOWN;
    }
    if (
      vehicle.operationalState?.dataQualityState === VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE ||
      vehicle.dataQualityState === VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE
    ) {
      return VEHICLE_OPERATIONAL_STATUS.UNKNOWN;
    }
  }

  if (detectOperationalInconsistency(vehicle as VehicleOperationalReadModel, status)) {
    return VEHICLE_OPERATIONAL_STATUS.UNKNOWN;
  }

  return status;
}

export function selectOperationalStatusReason(
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState'>,
): string | null {
  return vehicle.operationalState?.reason ?? null;
}

export function selectIsStatusReliable(
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState' | 'isReliable' | 'dataQualityState'>,
): boolean {
  if (vehicle.operationalState?.dataQualityState === VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE) {
    return false;
  }
  if (vehicle.dataQualityState === VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE) {
    return false;
  }
  return vehicle.operationalState?.isReliable ?? Boolean(vehicle.isReliable ?? true);
}

export function selectOperationalStatusLabel(
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState' | 'status'> &
    Partial<VehicleOperationalReadModel>,
  locale: VehicleOperationalDisplayLocale = 'de',
): string {
  return formatVehicleOperationalStatusLabel(selectOperationalStatus(vehicle), locale);
}

/** UNKNOWN is never available. */
export function selectIsCurrentlyAvailable(
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState' | 'status'> &
    Partial<VehicleOperationalReadModel>,
): boolean {
  return (
    selectOperationalStatus(vehicle) === VEHICLE_OPERATIONAL_STATUS.AVAILABLE &&
    selectIsStatusReliable(vehicle)
  );
}

/** Pickup reservation window — canonical RESERVED status only (not nextBooking). */
export function selectIsInPickupReservationWindow(
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState' | 'status'> &
    Partial<VehicleOperationalReadModel>,
): boolean {
  return selectOperationalStatus(vehicle) === VEHICLE_OPERATIONAL_STATUS.RESERVED;
}

/** Active rental — confirmed by operational status, not booking id alone. */
export function selectIsCurrentlyRented(
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState' | 'status'> &
    Partial<VehicleOperationalReadModel>,
): boolean {
  return selectOperationalStatus(vehicle) === VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED;
}

export function selectActiveBooking(
  vehicle: VehicleOperationalReadModel,
): VehicleBookingReference | null {
  if (!selectIsCurrentlyRented(vehicle)) return null;
  return resolveBookingContext(vehicle).activeBooking;
}

export function selectReservedBooking(
  vehicle: VehicleOperationalReadModel,
): VehicleBookingReference | null {
  if (!selectIsInPickupReservationWindow(vehicle)) return null;
  return resolveBookingContext(vehicle).reservedBooking;
}

/** Future booking — independent from reserved pickup window. */
export function selectNextBooking(
  vehicle: VehicleOperationalReadModel,
): VehicleBookingReference | null {
  return resolveBookingContext(vehicle).nextBooking;
}

export function selectFutureBookingCount(vehicle: VehicleOperationalReadModel): number {
  return resolveBookingContext(vehicle).futureBookingCount;
}

/** Operational rental-readiness — AVAILABLE + reliable; never UNKNOWN. */
export function selectCanBeConsideredForRentalReadiness(
  vehicle: Pick<VehicleOperationalReadModel, 'operationalState' | 'status'> &
    Partial<VehicleOperationalReadModel>,
): boolean {
  return selectIsCurrentlyAvailable(vehicle);
}

export function selectOperationalState(
  vehicle: Pick<
    VehicleOperationalReadModel,
    'operationalState' | 'status' | 'dataQualityState' | 'isReliable' | 'dataQualityReasons'
  >,
): VehicleOperationalState {
  if (vehicle.operationalState) {
    return {
      ...vehicle.operationalState,
      status: selectOperationalStatus(vehicle),
      isReliable: selectIsStatusReliable(vehicle),
    };
  }
  return {
    status: selectOperationalStatus(vehicle),
    reason: null,
    source: null,
    effectiveFrom: null,
    effectiveUntil: null,
    derivedAt: null,
    dataQualityState: vehicle.dataQualityState ?? null,
    dataQualityReasons: vehicle.dataQualityReasons ?? [],
    isReliable: selectIsStatusReliable(vehicle),
  };
}

export function selectBookingContext(vehicle: VehicleOperationalReadModel): VehicleBookingContext {
  return {
    activeBooking: selectActiveBooking(vehicle),
    reservedBooking: selectReservedBooking(vehicle),
    nextBooking: selectNextBooking(vehicle),
    futureBookingCount: selectFutureBookingCount(vehicle),
  };
}
