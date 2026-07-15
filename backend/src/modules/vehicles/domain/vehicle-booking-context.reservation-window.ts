import { isWizardDraftBooking } from '@modules/bookings/booking-wizard-draft.util';
import {
  DEFAULT_TARIFF_TIMEZONE,
  zonedDateOnly,
  zonedStartOfDayToUtc,
} from '@modules/pricing/tariff-instant.util';
import { hasBelievablePickupEvidence } from './vehicle-active-rental.policy';
import type { VehicleBookingQueryRow } from './vehicle-booking-context.types';
import type { DataQualityReasonCode } from './vehicle-operational-state.engine.types';

export interface ReservationWindowResolveParams {
  evaluationAt: Date;
  organizationTimezone: string;
}

export interface ReservationWindowBounds {
  windowStart: Date;
  windowEnd: Date;
}

export interface ReservationWindowResolveResult {
  booking: VehicleBookingQueryRow | null;
  dataQualityReasons: DataQualityReasonCode[];
}

/**
 * Whether a PENDING/CONFIRMED row counts as a binding reservation for the
 * pickup window (architecture §3.4).
 *
 * - **CONFIRMED** — always binding.
 * - **PENDING** — binding for fleet/conflict purposes (`BLOCKING_BOOKING_STATUSES`),
 *   except ephemeral checkout wizard drafts (`[synq:wizard-draft]` in notes).
 * - Terminal statuses (CANCELLED, COMPLETED, NO_SHOW, ACTIVE) are excluded
 *   upstream; never pass them here.
 */
export function isBindingReservationBooking(
  row: Pick<VehicleBookingQueryRow, 'status' | 'notes'>,
): boolean {
  if (row.status === 'CONFIRMED') return true;
  if (row.status === 'PENDING') {
    return !isWizardDraftBooking({
      status: row.status,
      notes: row.notes ?? null,
    });
  }
  return false;
}

/** Calendar-day window bounds per architecture §3.4 (org IANA TZ, no server local). */
export function computeReservationWindowBounds(
  row: VehicleBookingQueryRow,
  organizationTimezone: string,
): ReservationWindowBounds {
  const tz = organizationTimezone.trim() || DEFAULT_TARIFF_TIMEZONE;
  const pickupDay = zonedDateOnly(row.startDate, tz);
  const windowStart = zonedStartOfDayToUtc(pickupDay, tz);

  const pickupCompletedAt = row.handover.pickupPerformedAt;
  const windowEnd =
    pickupCompletedAt != null &&
    pickupCompletedAt.getTime() < row.endDate.getTime()
      ? pickupCompletedAt
      : row.endDate;

  return { windowStart, windowEnd };
}

/**
 * True when `evaluationAt` lies in the half-open pickup reservation window
 * `[windowStart, windowEnd)` for a binding, not-yet-picked-up booking.
 */
export function isWithinReservationWindow(
  row: VehicleBookingQueryRow,
  params: ReservationWindowResolveParams,
): boolean {
  if (!isBindingReservationBooking(row)) return false;
  if (hasBelievablePickupEvidence(row.handover)) return false;

  const { windowStart, windowEnd } = computeReservationWindowBounds(
    row,
    params.organizationTimezone,
  );
  const t = params.evaluationAt.getTime();
  return t >= windowStart.getTime() && t < windowEnd.getTime();
}

/**
 * Resolves the single booking in the active pickup reservation window, if any.
 * Multiple simultaneous window matches → fail-closed (null + quality reason).
 */
export function resolveReservationWindowBooking(
  candidates: VehicleBookingQueryRow[],
  params: ReservationWindowResolveParams,
): ReservationWindowResolveResult {
  const inWindow = candidates.filter((b) => isWithinReservationWindow(b, params));

  if (inWindow.length === 0) {
    return { booking: null, dataQualityReasons: [] };
  }
  if (inWindow.length === 1) {
    return { booking: inWindow[0], dataQualityReasons: [] };
  }
  return {
    booking: null,
    dataQualityReasons: ['MULTIPLE_RESERVATION_WINDOW_BOOKINGS'],
  };
}
