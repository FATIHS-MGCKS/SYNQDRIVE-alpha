import type { BookingStatus } from '@prisma/client';

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

export function compareBookingsByPickupStable(
  a: Pick<VehicleBookingQueryRow, 'startDate' | 'id'>,
  b: Pick<VehicleBookingQueryRow, 'startDate' | 'id'>,
): number {
  const timeDiff = a.startDate.getTime() - b.startDate.getTime();
  if (timeDiff !== 0) return timeDiff;
  return a.id.localeCompare(b.id);
}
