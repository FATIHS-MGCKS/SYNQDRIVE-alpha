import { describe, expect, it } from 'vitest';
import {
  buildAgendaRiskHints,
  detectSystemConflicts,
  findOverlappingBookingIds,
  hasStationMismatch,
} from './vehicle-booking-risk.utils';
import type { VehicleAgendaBooking } from './vehicle-booking-agenda.utils';

function row(
  id: string,
  status: VehicleAgendaBooking['status'],
  start: string,
  end: string,
  overrides: Partial<VehicleAgendaBooking> = {},
): VehicleAgendaBooking {
  return {
    id,
    customerName: 'Kunde',
    status,
    startDate: new Date(start),
    endDate: new Date(end),
    pickupLocation: 'Station A',
    returnLocation: 'Station A',
    totalPriceCents: null,
    days: 3,
    hasPickup: false,
    hasReturn: false,
    isOverdue: false,
    needsPickup: false,
    needsReturn: false,
    ...overrides,
  };
}

describe('vehicle-booking-risk.utils', () => {
  it('finds no conflicts for empty bookings', () => {
    expect(detectSystemConflicts([])).toEqual([]);
    expect(findOverlappingBookingIds([])).toEqual(new Set());
  });

  it('detects overlapping blocking bookings', () => {
    const bookings = [
      row('b1', 'confirmed', '2026-06-10T10:00:00.000Z', '2026-06-15T10:00:00.000Z'),
      row('b2', 'pending', '2026-06-12T10:00:00.000Z', '2026-06-18T10:00:00.000Z'),
    ];
    const ids = findOverlappingBookingIds(bookings);
    expect(ids.has('b1')).toBe(true);
    expect(ids.has('b2')).toBe(true);
    expect(detectSystemConflicts(bookings)[0]?.id).toBe('overlap');
  });

  it('ignores cancelled and no-show for overlap detection', () => {
    const bookings = [
      row('b1', 'confirmed', '2026-06-10T10:00:00.000Z', '2026-06-15T10:00:00.000Z'),
      row('b2', 'cancelled', '2026-06-12T10:00:00.000Z', '2026-06-18T10:00:00.000Z'),
    ];
    expect(findOverlappingBookingIds(bookings).size).toBe(0);
  });

  it('detects active booking ending after next pickup', () => {
    const now = Date.parse('2026-06-09T12:00:00.000Z');
    const bookings = [
      row('active', 'active', '2026-06-05T10:00:00.000Z', '2026-06-14T10:00:00.000Z', {
        hasPickup: true,
      }),
      row('next', 'confirmed', '2026-06-12T10:00:00.000Z', '2026-06-18T10:00:00.000Z'),
    ];
    const conflicts = detectSystemConflicts(bookings, now);
    expect(conflicts.some((c) => c.id === 'active-after-pickup')).toBe(true);
  });

  it('detects overdue active booking', () => {
    const now = Date.parse('2026-06-20T12:00:00.000Z');
    const bookings = [
      row('active', 'active', '2026-06-05T10:00:00.000Z', '2026-06-10T10:00:00.000Z', {
        hasPickup: true,
      }),
    ];
    const conflicts = detectSystemConflicts(bookings, now);
    expect(conflicts.some((c) => c.id === 'overdue-active')).toBe(true);
    const hints = buildAgendaRiskHints(bookings, now);
    expect(hints.active?.[0]?.message).toContain('überfällig');
  });

  it('treats station mismatch as informational only', () => {
    const booking = row('b1', 'confirmed', '2026-06-10T10:00:00.000Z', '2026-06-15T10:00:00.000Z', {
      pickupLocation: 'Berlin',
      returnLocation: 'München',
    });
    expect(hasStationMismatch(booking)).toBe(true);
    const conflicts = detectSystemConflicts([booking]);
    const station = conflicts.find((c) => c.id === 'station-mismatch');
    expect(station?.severity).toBe('info');
  });
});
