import type { TodayBookingApiRow } from '../components/dashboard/dashboardTypes';
import { normalizeBookingStatus } from '../components/bookings/bookingStatus';
import type { VehicleHealthResponse } from '../../lib/api';
import type { TranslationKey } from '../../i18n/translations/en';

export interface BookingHandoverGateInput {
  statusEnum?: string | null;
  status?: string | null;
  hasPickupProtocol: boolean;
  hasReturnProtocol: boolean;
  rentalBlocked?: boolean;
  blockingReasons?: string[];
  /** When omitted (e.g. today list), eligibility is not pre-checked in UI — backend remains authoritative. */
  canStartRental?: boolean | null;
  eligibilityBlockingReasons?: string[];
}

export interface BookingHandoverGate {
  allowed: boolean;
  reasonKey?: TranslationKey;
  reasonParams?: Record<string, string | number>;
}

function gate(
  allowed: boolean,
  reasonKey?: TranslationKey,
  reasonParams?: Record<string, string | number>,
): BookingHandoverGate {
  return allowed ? { allowed: true } : { allowed: false, reasonKey, reasonParams };
}

/** Canonical pickup gate — shared by Rental booking detail and Operator today/quick views. */
export function deriveBookingPickupGate(input: BookingHandoverGateInput): BookingHandoverGate {
  const status = normalizeBookingStatus(input.statusEnum, input.status);
  if (status !== 'confirmed' && status !== 'pending') {
    return gate(false, 'handover.gates.pickupWrongStatus');
  }
  if (input.hasPickupProtocol) {
    return gate(false, 'handover.gates.pickupProtocolExists');
  }
  if (input.rentalBlocked) {
    const reasons = input.blockingReasons?.join(' · ');
    if (reasons) {
      return gate(false, 'handover.gates.pickupBlockedWithReasons', { reasons });
    }
    return gate(false, 'handover.gates.pickupVehicleRentalBlocked');
  }
  if (input.canStartRental === false) {
    const reasons = input.eligibilityBlockingReasons?.join(' · ');
    if (reasons) {
      return gate(false, 'handover.gates.customerNotEligibleWithReasons', { reasons });
    }
    return gate(false, 'handover.gates.customerNotEligible');
  }
  return gate(true);
}

/** Canonical return gate — shared by Rental booking detail and Operator today/quick views. */
export function deriveBookingReturnGate(input: BookingHandoverGateInput): BookingHandoverGate {
  const status = normalizeBookingStatus(input.statusEnum, input.status);
  if (status !== 'active') {
    return gate(false, 'handover.gates.returnNotActive');
  }
  if (!input.hasPickupProtocol) {
    return gate(false, 'handover.gates.returnNeedsPickup');
  }
  if (input.hasReturnProtocol) {
    return gate(false, 'handover.gates.returnAlreadyRecorded');
  }
  return gate(true);
}

export function todayRowToPickupGateInput(
  row: TodayBookingApiRow,
  health?: VehicleHealthResponse | null,
): BookingHandoverGateInput {
  return {
    statusEnum: row.statusEnum,
    status: row.status,
    hasPickupProtocol: Boolean(row.pickupProtocol),
    hasReturnProtocol: Boolean(row.returnProtocol),
    rentalBlocked: Boolean(health?.rental_blocked),
    blockingReasons: health?.blocking_reasons,
  };
}

export function todayRowToReturnGateInput(row: TodayBookingApiRow): BookingHandoverGateInput {
  return {
    statusEnum: row.statusEnum,
    status: row.status,
    hasPickupProtocol: Boolean(row.pickupProtocol),
    hasReturnProtocol: Boolean(row.returnProtocol),
  };
}
