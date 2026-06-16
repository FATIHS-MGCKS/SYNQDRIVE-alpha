import type { BookingUiRow } from './bookingTypes';
import { normalizeBookingStatus, type BookingUiStatus } from './bookingStatus';
import type { BookingFiltersState } from './bookingTypes';

const BLOCKING: BookingUiStatus[] = ['pending', 'confirmed', 'active'];

export function bookingRef(id: string): string {
  return `BK-${String(id).slice(-6).toUpperCase()}`;
}

export function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function bookingStartIso(row: BookingUiRow): string {
  const raw = row._raw as { startDate?: string; startDateIso?: string } | undefined;
  return raw?.startDate ?? raw?.startDateIso ?? '';
}

export function bookingEndIso(row: BookingUiRow): string {
  const raw = row._raw as { endDate?: string; endDateIso?: string } | undefined;
  return raw?.endDate ?? raw?.endDateIso ?? '';
}

export function rowStatus(row: BookingUiRow): BookingUiStatus {
  const raw = row._raw as { statusEnum?: string } | undefined;
  return normalizeBookingStatus(raw?.statusEnum, row.status);
}

export function overlapsRange(
  start: Date,
  end: Date,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  return start < rangeEnd && end > rangeStart;
}

export function filterBookings(
  rows: BookingUiRow[],
  filters: BookingFiltersState,
): BookingUiRow[] {
  return rows.filter((row) => {
    const status = rowStatus(row);
    if (!filters.showTerminal && (status === 'cancelled' || status === 'no_show')) {
      return false;
    }
    if (filters.status !== 'all') {
      if (filters.status === 'active' && status !== 'active') return false;
      if (filters.status === 'confirmed' && status !== 'confirmed') return false;
      if (filters.status === 'pending' && status !== 'pending') return false;
      if (filters.status === 'completed' && status !== 'completed') return false;
      if (filters.status === 'cancelled' && status !== 'cancelled') return false;
      if (filters.status === 'no_show' && status !== 'no_show') return false;
    }
    if (filters.vehicleId && row.vehicleId !== filters.vehicleId) return false;
    if (filters.stationId) {
      const raw = row._raw as { pickupStationId?: string; returnStationId?: string } | undefined;
      const pickupId = raw?.pickupStationId;
      const returnId = raw?.returnStationId;
      if (pickupId !== filters.stationId && returnId !== filters.stationId) return false;
    }
    const start = parseIso(bookingStartIso(row));
    const end = parseIso(bookingEndIso(row));
    if (filters.dateFrom) {
      const from = parseIso(filters.dateFrom);
      if (from && end && end < from) return false;
    }
    if (filters.dateTo) {
      const to = parseIso(filters.dateTo);
      if (to && start && start > to) return false;
    }
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      const ref = bookingRef(row.id).toLowerCase();
      const hay = [
        row.customer,
        row.vehicle,
        row.plate,
        ref,
        row.id,
        row.notes,
        row.pickupLocation,
        row.returnLocation,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function bookingsForVehicleInRange(
  rows: BookingUiRow[],
  vehicleId: string,
  rangeStart: Date,
  rangeEnd: Date,
  excludeBookingId?: string,
): BookingUiRow[] {
  return rows.filter((row) => {
    if (row.id === excludeBookingId) return false;
    if (row.vehicleId !== vehicleId) return false;
    const status = rowStatus(row);
    if (!BLOCKING.includes(status)) return false;
    const start = parseIso(bookingStartIso(row));
    const end = parseIso(bookingEndIso(row));
    if (!start || !end) return false;
    return overlapsRange(start, end, rangeStart, rangeEnd);
  });
}

export function formatCents(cents: number | null | undefined, currency = 'EUR'): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: currency.toUpperCase() === 'EUR' ? 'EUR' : currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
