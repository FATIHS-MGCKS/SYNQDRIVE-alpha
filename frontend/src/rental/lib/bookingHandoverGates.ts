import type { TodayBookingApiRow } from '../components/dashboard/dashboardTypes';
import { normalizeBookingStatus } from '../components/bookings/bookingStatus';
import type { VehicleHealthResponse } from '../../lib/api';

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
  reason?: string;
}

function gate(allowed: boolean, reason?: string): BookingHandoverGate {
  return allowed ? { allowed: true } : { allowed: false, reason };
}

/** Canonical pickup gate — shared by Rental booking detail and Operator today/quick views. */
export function deriveBookingPickupGate(input: BookingHandoverGateInput): BookingHandoverGate {
  const status = normalizeBookingStatus(input.statusEnum, input.status);
  if (status !== 'confirmed' && status !== 'pending') {
    return gate(false, 'Pickup nur bei bestätigter oder ausstehender Buchung möglich');
  }
  if (input.hasPickupProtocol) {
    return gate(false, 'Pickup-Protokoll bereits vorhanden');
  }
  if (input.rentalBlocked) {
    return gate(
      false,
      `Pickup nicht möglich: ${input.blockingReasons?.join(' · ') || 'Fahrzeug rental_blocked'}`,
    );
  }
  if (input.canStartRental === false) {
    return gate(
      false,
      input.eligibilityBlockingReasons?.join(' · ') || 'Kunde nicht mietberechtigt',
    );
  }
  return gate(true);
}

/** Canonical return gate — shared by Rental booking detail and Operator today/quick views. */
export function deriveBookingReturnGate(input: BookingHandoverGateInput): BookingHandoverGate {
  const status = normalizeBookingStatus(input.statusEnum, input.status);
  if (status !== 'active') {
    return gate(false, 'Return nicht möglich, weil Buchung nicht aktiv ist');
  }
  if (!input.hasPickupProtocol) {
    return gate(false, 'Return erst nach Pickup möglich');
  }
  if (input.hasReturnProtocol) {
    return gate(false, 'Rückgabe bereits erfasst');
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
