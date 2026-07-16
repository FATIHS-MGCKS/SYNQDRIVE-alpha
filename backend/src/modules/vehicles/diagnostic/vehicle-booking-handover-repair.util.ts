import { VehicleStatus } from '@prisma/client';
import {
  activeBookingsForVehicle,
  hasCurrentReservationWindow,
  isLegacyReservationWindowBooking,
  type DiagnosticBookingRow,
} from './vehicle-booking-handover-diagnostic.util';
import { VBH_REPAIR_SCRIPT_VERSION } from './vehicle-booking-handover-repair.types';
import type {
  VbhRepairBookingRow,
  VbhRepairHandoverRow,
  VbhRepairOrgContext,
  VbhRepairVehicleRow,
} from './vehicle-booking-handover-repair.types';

export const DEFAULT_VBH_REPAIR_BATCH_SIZE = 20;

export function chunkRepairItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function isVehicleOperationalBlocked(status: VehicleStatus): boolean {
  return status === VehicleStatus.IN_SERVICE || status === VehicleStatus.OUT_OF_SERVICE;
}

export function toDiagnosticBookingRow(booking: VbhRepairBookingRow): DiagnosticBookingRow {
  return {
    id: booking.id,
    organizationId: booking.organizationId,
    vehicleId: booking.vehicleId,
    status: booking.status as DiagnosticBookingRow['status'],
    startDate: booking.startDate,
    endDate: booking.endDate,
    completedAt: booking.completedAt,
    cancelledAt: null,
    createdAt: booking.startDate,
  };
}

export function handoverByKind(
  handovers: VbhRepairHandoverRow[],
  kind: 'PICKUP' | 'RETURN',
): VbhRepairHandoverRow | null {
  return handovers.find((h) => h.kind === kind) ?? null;
}

export function canClearStaleReserved(
  vehicle: VbhRepairVehicleRow,
  bookings: VbhRepairBookingRow[],
  now: Date,
): { ok: true } | { ok: false; reason: string } {
  if (vehicle.status !== VehicleStatus.RESERVED) {
    return { ok: false, reason: 'Vehicle is not RESERVED' };
  }
  if (isVehicleOperationalBlocked(vehicle.status)) {
    return { ok: false, reason: 'Vehicle is in maintenance block status' };
  }
  const diagnosticBookings = bookings.map(toDiagnosticBookingRow);
  if (activeBookingsForVehicle(diagnosticBookings).length > 0) {
    return { ok: false, reason: 'ACTIVE booking exists' };
  }
  if (hasCurrentReservationWindow(diagnosticBookings, now)) {
    return { ok: false, reason: 'Reservation window booking exists' };
  }
  return { ok: true };
}

export function canClearStaleRentedAfterReturn(
  vehicle: VbhRepairVehicleRow,
  bookings: VbhRepairBookingRow[],
  handoversByBooking: Map<string, VbhRepairHandoverRow[]>,
): { ok: true; bookingId: string } | { ok: false; reason: string } {
  if (vehicle.status !== VehicleStatus.RENTED) {
    return { ok: false, reason: 'Vehicle is not RENTED' };
  }
  if (isVehicleOperationalBlocked(vehicle.status)) {
    return { ok: false, reason: 'Vehicle is in maintenance block status' };
  }
  const diagnosticBookings = bookings.map(toDiagnosticBookingRow);
  if (activeBookingsForVehicle(diagnosticBookings).length > 0) {
    return { ok: false, reason: 'ACTIVE booking still exists — resolve booking first' };
  }

  const completedWithReturn = bookings.filter((booking) => {
    if (booking.status !== 'COMPLETED') return false;
    const pickup = handoverByKind(handoversByBooking.get(booking.id) ?? [], 'PICKUP');
    const ret = handoverByKind(handoversByBooking.get(booking.id) ?? [], 'RETURN');
    return Boolean(pickup && ret);
  });

  if (completedWithReturn.length === 0) {
    return { ok: false, reason: 'No COMPLETED booking with both PICKUP and RETURN protocols' };
  }
  if (completedWithReturn.length > 1) {
    return { ok: false, reason: 'Multiple COMPLETED return cases — ambiguous vehicle release' };
  }

  return { ok: true, bookingId: completedWithReturn[0]!.id };
}

export function canCompleteBookingAfterReturn(
  booking: VbhRepairBookingRow,
  handovers: VbhRepairHandoverRow[],
): { ok: true; returnProtocol: VbhRepairHandoverRow; pickupProtocol: VbhRepairHandoverRow } | { ok: false; reason: string } {
  if (booking.status !== 'ACTIVE') {
    return { ok: false, reason: `Booking status is ${booking.status}, expected ACTIVE` };
  }
  const pickup = handoverByKind(handovers, 'PICKUP');
  const ret = handoverByKind(handovers, 'RETURN');
  if (!pickup) {
    return { ok: false, reason: 'Missing PICKUP protocol' };
  }
  if (!ret) {
    return { ok: false, reason: 'Missing RETURN protocol' };
  }
  return { ok: true, returnProtocol: ret, pickupProtocol: pickup };
}

export function canActivateBookingAfterPickup(
  booking: VbhRepairBookingRow,
  handovers: VbhRepairHandoverRow[],
): { ok: true; pickupProtocol: VbhRepairHandoverRow } | { ok: false; reason: string } {
  const pickup = handoverByKind(handovers, 'PICKUP');
  if (!pickup) {
    return { ok: false, reason: 'Missing PICKUP protocol' };
  }
  if (handoverByKind(handovers, 'RETURN')) {
    return { ok: false, reason: 'RETURN protocol already exists' };
  }
  if (booking.status !== 'CONFIRMED') {
    return { ok: false, reason: `Booking status is ${booking.status}, expected CONFIRMED for pickup repair` };
  }
  return { ok: true, pickupProtocol: pickup };
}

export function buildRepairAuditNote(ruleId: string, before: Record<string, unknown>, after: Record<string, unknown>): string {
  const stamp = new Date().toISOString();
  return `[VBH-REPAIR v${VBH_REPAIR_SCRIPT_VERSION} ${stamp}] rule=${ruleId} before=${JSON.stringify(before)} after=${JSON.stringify(after)}`;
}

export function appendRepairNote(existing: string | null | undefined, note: string): string {
  const base = existing?.trim();
  return base ? `${base}\n${note}` : note;
}

export function buildOrgRepairContext(input: {
  organizationId: string;
  vehicles: VbhRepairVehicleRow[];
  bookings: VbhRepairBookingRow[];
  handovers: VbhRepairHandoverRow[];
}): VbhRepairOrgContext {
  const bookingsByVehicle = new Map<string, VbhRepairBookingRow[]>();
  for (const booking of input.bookings) {
    const list = bookingsByVehicle.get(booking.vehicleId) ?? [];
    list.push(booking);
    bookingsByVehicle.set(booking.vehicleId, list);
  }

  const handoversByBooking = new Map<string, VbhRepairHandoverRow[]>();
  for (const handover of input.handovers) {
    const list = handoversByBooking.get(handover.bookingId) ?? [];
    list.push(handover);
    handoversByBooking.set(handover.bookingId, list);
  }

  return {
    organizationId: input.organizationId,
    vehicles: input.vehicles,
    bookings: input.bookings,
    handovers: input.handovers,
    bookingsByVehicle,
    handoversByBooking,
  };
}

export function hasOpenLifecycleBooking(bookings: VbhRepairBookingRow[], now: Date): boolean {
  return bookings.some(
    (b) =>
      b.status === 'ACTIVE' ||
      isLegacyReservationWindowBooking(toDiagnosticBookingRow(b), now),
  );
}
