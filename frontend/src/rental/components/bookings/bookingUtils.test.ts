import { describe, expect, it } from 'vitest';
import { filterBookings, bookingRef } from './bookingUtils';
import type { BookingUiRow } from '../../lib/entityMappers';

function row(over: Partial<BookingUiRow> & { id: string }): BookingUiRow {
  return {
    id: over.id,
    vehicleId: over.vehicleId ?? 'veh-1',
    customerId: over.customerId ?? 'cust-1',
    customer: over.customer ?? 'Test Kunde',
    customerPhone: over.customerPhone ?? '',
    vehicle: over.vehicle ?? 'VW Golf',
    plate: over.plate ?? 'M-AB 123',
    startDate: over.startDate ?? '10.07.2026',
    endDate: over.endDate ?? '12.07.2026',
    startTime: over.startTime ?? '08:00',
    endTime: over.endTime ?? '08:00',
    startMonth: over.startMonth ?? 6,
    startYear: over.startYear ?? 2026,
    startDay: over.startDay ?? 10,
    endDay: over.endDay ?? 12,
    endMonth: over.endMonth ?? 6,
    endYear: over.endYear ?? 2026,
    pickupLocation: over.pickupLocation ?? 'Hauptstation',
    returnLocation: over.returnLocation ?? 'Hauptstation',
    revenue: over.revenue ?? '€267',
    status: over.status ?? 'confirmed',
    bookingRef: over.bookingRef ?? bookingRef(over.id),
    insurance: over.insurance ?? '',
    paymentMethod: over.paymentMethod ?? '',
    fuelLevel: over.fuelLevel ?? '',
    mileageStart: over.mileageStart ?? null,
    mileageEnd: over.mileageEnd ?? null,
    notes: over.notes ?? '',
    includedKm: over.includedKm ?? 300,
    drivenKm: over.drivenKm ?? null,
    drivingScore: over.drivingScore ?? null,
    drivingBehavior: null,
    abuseDetection: null,
    bookingSource: over.bookingSource ?? 'manual',
    bookedBy: over.bookedBy ?? '',
    pickupHandoverBy: over.pickupHandoverBy ?? null,
    returnHandoverBy: over.returnHandoverBy ?? null,
    pickupProtocol: over.pickupProtocol ?? null,
    returnProtocol: over.returnProtocol ?? null,
    _raw: over._raw ?? {
      statusEnum: 'CONFIRMED',
      startDate: '2026-07-10T08:00:00.000Z',
      endDate: '2026-07-12T08:00:00.000Z',
    },
  };
}

describe('bookingUtils filterBookings', () => {
  const rows: BookingUiRow[] = [
    row({ id: 'bk-confirmed', status: 'confirmed', _raw: { statusEnum: 'CONFIRMED', startDate: '2026-07-10T08:00:00.000Z', endDate: '2026-07-12T08:00:00.000Z' } }),
    row({ id: 'bk-cancelled', status: 'cancelled', _raw: { statusEnum: 'CANCELLED', startDate: '2026-07-01T08:00:00.000Z', endDate: '2026-07-03T08:00:00.000Z' } }),
    row({ id: 'bk-active', status: 'active', vehicleId: 'veh-2', _raw: { statusEnum: 'ACTIVE', startDate: '2026-07-15T08:00:00.000Z', endDate: '2026-07-18T08:00:00.000Z' } }),
  ];

  it('filters by status', () => {
    const filtered = filterBookings(rows, {
      search: '',
      status: 'active',
      vehicleId: null,
      stationId: null,
      dateFrom: null,
      dateTo: null,
      showTerminal: true,
    });
    expect(filtered.map((r) => r.id)).toEqual(['bk-active']);
  });

  it('hides terminal bookings by default', () => {
    const filtered = filterBookings(rows, {
      search: '',
      status: 'all',
      vehicleId: null,
      stationId: null,
      dateFrom: null,
      dateTo: null,
      showTerminal: false,
    });
    expect(filtered.some((r) => r.id === 'bk-cancelled')).toBe(false);
  });

  it('filters by search query (booking ref)', () => {
    const ref = bookingRef('bk-confirmed').toLowerCase();
    const filtered = filterBookings(rows, {
      search: ref,
      status: 'all',
      vehicleId: null,
      stationId: null,
      dateFrom: null,
      dateTo: null,
      showTerminal: true,
    });
    expect(filtered.map((r) => r.id)).toEqual(['bk-confirmed']);
  });
});
