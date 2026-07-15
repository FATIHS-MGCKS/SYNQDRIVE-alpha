import { VehicleStatus } from '@prisma/client';
import type {
  CanonicalOperationalStatus,
  DataQualityReasonCode,
  OperationalReasonCode,
  VehicleStateEngineInput,
} from './vehicle-operational-state.engine.types';

export type RawStatusGuardEventKind =
  | 'ghost_legacy_persisted'
  | 'raw_available_mismatch'
  | 'legacy_raw_unreliable_booking';

export interface RawStatusGuardLogEvent {
  msg: string;
  kind: RawStatusGuardEventKind;
  organizationId: string;
  vehicleId: string;
  rawStatus: string;
  operationalStatus: string;
  reasonCode: OperationalReasonCode;
}

export function isLegacyRentalRawStatus(
  raw: VehicleStatus | string | null | undefined,
): boolean {
  return raw === VehicleStatus.RENTED || raw === VehicleStatus.RESERVED;
}

function isActiveRentalConsistent(
  activeBooking: VehicleStateEngineInput['bookingState']['activeBooking'],
): boolean {
  if (!activeBooking) return false;
  return (
    activeBooking.phase === 'active_rental' || activeBooking.status === 'ACTIVE'
  );
}

function isReservationWindowConsistent(
  reservationWindowBooking: VehicleStateEngineInput['bookingState']['reservationWindowBooking'],
): boolean {
  if (!reservationWindowBooking) return false;
  return (
    reservationWindowBooking.phase === 'pickup_window' ||
    reservationWindowBooking.status === 'PENDING' ||
    reservationWindowBooking.status === 'CONFIRMED'
  );
}

export function buildGhostLegacyRawWarning(
  vehicle: Pick<VehicleStateEngineInput['vehicle'], 'id' | 'licensePlate'>,
  ghostLabel: 'Active Rented' | 'Reserved',
  rawStatus: string,
): string {
  return `[fleet-status] Ghost ${ghostLabel} state on vehicle ${
    vehicle.id ?? vehicle.licensePlate ?? '<unknown>'
  }: Vehicle.status is ${rawStatus} but booking truth does not match. Operational state is Unknown (no demotion to Available).`;
}

export function buildRawAvailableMismatchWarning(
  vehicle: Pick<VehicleStateEngineInput['vehicle'], 'id' | 'licensePlate'>,
  operationalLabel: 'Active Rented' | 'Reserved',
): string {
  return `[fleet-status] Raw AVAILABLE mismatch on vehicle ${
    vehicle.id ?? vehicle.licensePlate ?? '<unknown>'
  }: Vehicle.status is AVAILABLE but derived operational state is ${operationalLabel} from booking truth.`;
}

/**
 * Rule 5 — legacy raw RENTED/RESERVED with unreliable booking context.
 */
export function resolveLegacyRawWithUnreliableBooking(
  input: VehicleStateEngineInput,
): OperationalReasonCode | null {
  if (!isLegacyRentalRawStatus(input.vehicle.rawStatus)) return null;
  const quality = input.bookingState.dataQualityState;
  if (quality === 'UNAVAILABLE' || quality === 'DEGRADED') {
    return 'BOOKING_DATA_UNAVAILABLE';
  }
  return null;
}

/**
 * Rules 2 & 4 — legacy raw without matching booking truth (RELIABLE data only).
 */
export function detectLegacyRawStatusInconsistency(
  input: VehicleStateEngineInput,
): OperationalReasonCode | null {
  const { bookingState, vehicle } = input;
  if (bookingState.dataQualityState !== 'RELIABLE') return null;

  const active = bookingState.activeBooking ?? null;
  const reserved = bookingState.reservationWindowBooking ?? null;

  if (
    vehicle.rawStatus === VehicleStatus.RENTED &&
    !isActiveRentalConsistent(active)
  ) {
    return 'RAW_STATUS_INCONSISTENT';
  }
  if (
    vehicle.rawStatus === VehicleStatus.RESERVED &&
    !isReservationWindowConsistent(reserved) &&
    !isActiveRentalConsistent(active)
  ) {
    return 'RAW_STATUS_INCONSISTENT';
  }
  return null;
}

/**
 * Rules 6 & 7 — raw AVAILABLE but booking-derived ACTIVE_RENTED / RESERVED.
 */
export function detectRawAvailableMismatch(
  input: VehicleStateEngineInput,
  derivedStatus: CanonicalOperationalStatus,
): {
  warning: string | null;
  extraQualityReasons: DataQualityReasonCode[];
} {
  if (input.vehicle.rawStatus !== VehicleStatus.AVAILABLE) {
    return { warning: null, extraQualityReasons: [] };
  }
  if (derivedStatus === 'ACTIVE_RENTED') {
    return {
      warning: buildRawAvailableMismatchWarning(input.vehicle, 'Active Rented'),
      extraQualityReasons: ['RAW_STATUS_INCONSISTENT'],
    };
  }
  if (derivedStatus === 'RESERVED') {
    return {
      warning: buildRawAvailableMismatchWarning(input.vehicle, 'Reserved'),
      extraQualityReasons: ['RAW_STATUS_INCONSISTENT'],
    };
  }
  return { warning: null, extraQualityReasons: [] };
}

export function buildRawStatusGuardLogEvent(
  params: Omit<RawStatusGuardLogEvent, 'msg'> & { msg?: string },
): RawStatusGuardLogEvent {
  return {
    msg: params.msg ?? 'fleet vehicle raw status guard',
    ...params,
  };
}

export function appendUniqueReason(
  reasons: DataQualityReasonCode[],
  code: DataQualityReasonCode,
): DataQualityReasonCode[] {
  if (reasons.includes(code)) return reasons;
  return [...reasons, code];
}

export function legacyRawQualityTags(
  rawStatus: VehicleStatus | string,
): DataQualityReasonCode[] {
  const tags: DataQualityReasonCode[] = [];
  if (rawStatus === VehicleStatus.RENTED) {
    tags.push('RAW_STATUS_LEGACY_RENTED');
  }
  if (rawStatus === VehicleStatus.RESERVED) {
    tags.push('RAW_STATUS_LEGACY_RESERVED');
  }
  return tags;
}
