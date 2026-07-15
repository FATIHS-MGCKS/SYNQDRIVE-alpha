import type { BookingStatus } from '@prisma/client';
import type { FleetBookingNumberDiagnostic } from './vehicle-operational-state.engine.types';

/** Handover signals loaded alongside booking rows (no UI labels). */
export interface VehicleBookingHandoverSignals {
  /** Canonical actual pickup instant — PICKUP protocol `performedAt`. */
  pickupPerformedAt: Date | null;
  /** Canonical actual return instant — RETURN protocol `performedAt`. */
  returnPerformedAt: Date | null;
  /** Set on successful return handover (`Booking.completedAt`). */
  completedAt: Date | null;
  actualPickupStationId: string | null;
  actualReturnStationId: string | null;
}

export const EMPTY_HANDOVER_SIGNALS: VehicleBookingHandoverSignals = {
  pickupPerformedAt: null,
  returnPerformedAt: null,
  completedAt: null,
  actualPickupStationId: null,
  actualReturnStationId: null,
};

/**
 * Normalized booking row loaded by `VehiclesService.buildBookingContextMap`.
 * No UI labels — display formatting happens at API projection time.
 */
export interface VehicleBookingQueryRow {
  id: string;
  vehicleId: string;
  organizationId: string;
  status: BookingStatus;
  startDate: Date;
  endDate: Date;
  kmIncluded: number | null;
  kmDriven: number | null;
  pickupStationId: string | null;
  returnStationId: string | null;
  /** Used to exclude ephemeral wizard checkout drafts from binding PENDING. */
  notes: string | null;
  /** Optional human booking reference when persisted (not derived from UUID). */
  displayRef?: string | null;
  customerLabel: string;
  pickupStationName: string | null;
  returnStationName: string | null;
  handover: VehicleBookingHandoverSignals;
}

export interface AssembleVehicleBookingContextParams {
  vehicleId: string;
  organizationId: string;
  bookings: VehicleBookingQueryRow[];
  evaluationAt: Date;
  organizationTimezone: string;
}

export interface AssembleBookingContextMapParams {
  organizationId: string;
  vehicleIds: string[];
  bookings: VehicleBookingQueryRow[];
  evaluationAt: Date;
  organizationTimezone: string;
}

export function formatBookingCustomerLabel(customer: {
  firstName: string;
  lastName: string;
  company: string | null;
}): string {
  const personal = `${customer.firstName} ${customer.lastName}`.trim();
  if (customer.company && customer.company.trim().length > 0) {
    return personal ? `${personal} · ${customer.company}` : customer.company;
  }
  return personal || customer.company || '';
}

/** Diagnostic when no persisted display reference exists for a booking. */
export type { FleetBookingNumberDiagnostic } from './vehicle-operational-state.engine.types';

export const NEUTRAL_BOOKING_DISPLAY_LABEL = 'Booking';

/**
 * Resolves operator-visible booking number.
 * Never exposes raw UUID fragments (no BK-{uuid-suffix} fallback).
 */
export function resolveFleetBookingDisplayNumber(input: {
  explicitRef?: string | null;
}): {
  bookingNumber: string;
  bookingNumberDiagnostic: FleetBookingNumberDiagnostic | null;
} {
  const ref = input.explicitRef?.trim();
  if (ref) {
    return { bookingNumber: ref, bookingNumberDiagnostic: null };
  }
  return {
    bookingNumber: NEUTRAL_BOOKING_DISPLAY_LABEL,
    bookingNumberDiagnostic: 'MISSING_DISPLAY_REF',
  };
}

/**
 * @deprecated Use {@link resolveFleetBookingDisplayNumber} — UUID suffix refs are forbidden.
 */
export function formatBookingDisplayNumber(_bookingId: string): string {
  return NEUTRAL_BOOKING_DISPLAY_LABEL;
}

export function compareBookingsByPickupStable(
  a: Pick<VehicleBookingQueryRow, 'startDate' | 'id'>,
  b: Pick<VehicleBookingQueryRow, 'startDate' | 'id'>,
): number {
  const timeDiff = a.startDate.getTime() - b.startDate.getTime();
  if (timeDiff !== 0) return timeDiff;
  return a.id.localeCompare(b.id);
}
