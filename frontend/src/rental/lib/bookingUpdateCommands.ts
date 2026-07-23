import { api } from '../../lib/api';

export type BookingFieldUpdates = {
  startDate?: string;
  endDate?: string;
  notes?: string;
  kmIncluded?: number;
  vehicleId?: string;
  customerId?: string;
  pickupStationId?: string;
  returnStationId?: string;
  pricingQuoteId?: string;
  pricingInput?: unknown;
};

function isVersionConflict(err: unknown): boolean {
  const code =
    (err as { response?: { data?: { code?: string } } })?.response?.data?.code ??
    (err as { code?: string })?.code;
  return code === 'BOOKING_VERSION_CONFLICT';
}

export function bookingVersionConflictMessage(err: unknown): string {
  if (isVersionConflict(err)) {
    return 'Die Buchung wurde zwischenzeitlich von einem anderen Benutzer geändert. Bitte neu laden.';
  }
  const msg =
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    (err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
  return String(msg);
}

/**
 * Applies booking edits via typed action endpoints with optimistic concurrency.
 * Returns the latest `updatedAt` from the server after all commands succeed.
 */
export async function applyBookingFieldUpdates(
  orgId: string,
  bookingId: string,
  expectedUpdatedAt: string,
  changes: BookingFieldUpdates,
  current?: {
    startDate?: string;
    endDate?: string;
    notes?: string | null;
    kmIncluded?: number | null;
    vehicleId?: string;
    customerId?: string;
    pickupStationId?: string | null;
    returnStationId?: string | null;
  },
): Promise<string> {
  let version = expectedUpdatedAt;
  const concurrency = () => ({ expectedUpdatedAt: version });

  const scheduleChanged =
    (changes.startDate && changes.startDate !== current?.startDate) ||
    (changes.endDate && changes.endDate !== current?.endDate);
  if (scheduleChanged) {
    const res = await api.bookings.updateSchedule(orgId, bookingId, {
      ...concurrency(),
      ...(changes.startDate ? { startDate: changes.startDate } : {}),
      ...(changes.endDate ? { endDate: changes.endDate } : {}),
      ...(changes.pricingQuoteId ? { pricingQuoteId: changes.pricingQuoteId } : {}),
    });
    version = (res as { updatedAt: string }).updatedAt ?? version;
  }

  if (changes.customerId && changes.customerId !== current?.customerId) {
    const res = await api.bookings.updateCustomer(orgId, bookingId, {
      ...concurrency(),
      customerId: changes.customerId,
    });
    version = (res as { updatedAt: string }).updatedAt ?? version;
  }

  if (changes.vehicleId && changes.vehicleId !== current?.vehicleId) {
    const res = await api.bookings.updateVehicle(orgId, bookingId, {
      ...concurrency(),
      vehicleId: changes.vehicleId,
      ...(changes.pricingQuoteId ? { pricingQuoteId: changes.pricingQuoteId } : {}),
    });
    version = (res as { updatedAt: string }).updatedAt ?? version;
  }

  const stationsChanged =
    (changes.pickupStationId && changes.pickupStationId !== current?.pickupStationId) ||
    (changes.returnStationId && changes.returnStationId !== current?.returnStationId);
  if (stationsChanged) {
    const res = await api.bookings.updateStations(orgId, bookingId, {
      ...concurrency(),
      ...(changes.pickupStationId ? { pickupStationId: changes.pickupStationId } : {}),
      ...(changes.returnStationId ? { returnStationId: changes.returnStationId } : {}),
    });
    version = (res as { updatedAt: string }).updatedAt ?? version;
  }

  if (changes.notes !== undefined && changes.notes !== (current?.notes ?? '')) {
    const res = await api.bookings.updateNotes(orgId, bookingId, {
      expectedUpdatedAt: version,
      customerNotes: changes.notes,
    });
    version = (res as { updatedAt: string }).updatedAt ?? version;
  }

  if (
    changes.kmIncluded !== undefined &&
    changes.kmIncluded !== (current?.kmIncluded ?? null)
  ) {
    const res = await api.bookings.updateOptions(orgId, bookingId, {
      ...concurrency(),
      kmIncluded: changes.kmIncluded,
      ...(changes.pricingInput ? { pricingInput: changes.pricingInput } : {}),
      ...(changes.pricingQuoteId ? { pricingQuoteId: changes.pricingQuoteId } : {}),
    });
    version = (res as { updatedAt: string }).updatedAt ?? version;
  }

  return version;
}
