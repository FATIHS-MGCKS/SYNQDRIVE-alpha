import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookingDetailDto } from '../../lib/api';
import {
  canOperatorMarkNoShow,
  formatOperatorBookingError,
  isSameLocalInstant,
  localDateTimeToIso,
  splitLocalDateTime,
  toLocalDateTimeInput,
} from './operatorBooking.utils';

describe('operator booking datetime helpers', () => {
  it('round-trips local datetime input without timezone drift for fixed instant', () => {
    const iso = '2026-07-15T14:30:00.000Z';
    const local = toLocalDateTimeInput(iso);
    expect(local).toMatch(/^2026-07-15T\d{2}:\d{2}$/);
    expect(isSameLocalInstant(iso, local)).toBe(true);
  });

  it('splits local datetime into date and time parts', () => {
    expect(splitLocalDateTime('2026-07-15T09:45')).toEqual({
      date: '2026-07-15',
      time: '09:45',
    });
    expect(splitLocalDateTime('')).toEqual({ date: '', time: '10:00' });
  });

  it('rejects invalid local datetime conversion', () => {
    expect(localDateTimeToIso('not-a-date')).toBeNull();
  });
});

describe('formatOperatorBookingError', () => {
  it('maps vehicle overlap to actionable title', () => {
    const formatted = formatOperatorBookingError('vehicle_booking_overlap: bereits gebucht');
    expect(formatted.title).toBe('Fahrzeug bereits gebucht');
  });

  it('maps customer eligibility blocks', () => {
    const formatted = formatOperatorBookingError('Kunde nicht freigegeben für Buchung');
    expect(formatted.title).toBe('Kunde nicht berechtigt');
  });

  it('falls back to generic failure title', () => {
    const formatted = formatOperatorBookingError('unexpected upstream failure');
    expect(formatted.title).toBe('Aktion fehlgeschlagen');
  });
});

describe('canOperatorMarkNoShow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function detail(partial: Partial<BookingDetailDto['core']> & Partial<BookingDetailDto['handover']>): BookingDetailDto {
    return {
      core: {
        id: 'bk-1',
        status: 'confirmed',
        statusEnum: 'CONFIRMED',
        startDate: '2026-07-15T10:00:00.000Z',
        endDate: '2026-07-16T10:00:00.000Z',
        ...(partial as BookingDetailDto['core']),
      },
      handover: {
        pickup: null,
        return: null,
        ...(partial as BookingDetailDto['handover']),
      },
    } as BookingDetailDto;
  }

  it('allows no-show after scheduled start for confirmed booking without pickup', () => {
    expect(canOperatorMarkNoShow(detail({}))).toEqual({ allowed: true });
  });

  it('blocks no-show when pickup already recorded', () => {
    expect(
      canOperatorMarkNoShow(
        detail({
          pickup: { id: 'proto-1' } as BookingDetailDto['handover']['pickup'],
        }),
      ),
    ).toEqual({ allowed: false, reason: 'Pickup bereits erfasst' });
  });

  it('blocks no-show before scheduled start', () => {
    expect(
      canOperatorMarkNoShow(
        detail({
          startDate: '2026-07-15T14:00:00.000Z',
        }),
      ),
    ).toEqual({ allowed: false, reason: 'Geplanter Abholzeitpunkt liegt noch in der Zukunft' });
  });
});
