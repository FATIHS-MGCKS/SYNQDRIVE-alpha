import { describe, expect, it } from 'vitest';
import type { OperatorTodayBookingItem } from '../lib/operatorData';
import {
  buildHandoverSuppressionKeys,
  dedupeHandoversExcludingDueNow,
  handoverItemKey,
} from './operatorTodayHandover.utils';

function handover(
  bookingId: string,
  kind: 'PICKUP' | 'RETURN',
): OperatorTodayBookingItem {
  return {
    bookingId,
    kind,
    vehicleId: 'vehicle-1',
    vehicleName: 'Golf',
    plate: 'M-AB 1',
    customerName: 'Max',
    station: 'Berlin',
    scheduledAt: '2026-07-25T10:00:00.000Z',
    timeLabel: '10:00',
    status: 'CONFIRMED',
    statusLabel: 'Bestätigt',
    isOverdue: false,
    isDueNow: kind === 'PICKUP',
    isDone: false,
    pickupGate: { allowed: true, reason: null },
    returnGate: { allowed: true, reason: null },
    raw: {} as OperatorTodayBookingItem['raw'],
  };
}

describe('operatorTodayHandover.utils', () => {
  it('builds stable handover keys without exposing raw ids in UI helpers', () => {
    expect(handoverItemKey({ bookingId: 'booking-1', kind: 'PICKUP' })).toBe('booking-1:PICKUP');
  });

  it('removes due-now handovers from the today section', () => {
    const dueNow = [handover('booking-1', 'PICKUP')];
    const pickupsToday = [handover('booking-1', 'PICKUP'), handover('booking-2', 'PICKUP')];
    const returnsToday = [handover('booking-3', 'RETURN')];

    const todayOnly = dedupeHandoversExcludingDueNow(pickupsToday, returnsToday, dueNow);

    expect(todayOnly.map((item) => item.bookingId)).toEqual(['booking-2', 'booking-3']);
  });

  it('deduplicates duplicate pickup/return rows in today handovers', () => {
    const pickupsToday = [handover('booking-2', 'PICKUP'), handover('booking-2', 'PICKUP')];
    const todayOnly = dedupeHandoversExcludingDueNow(pickupsToday, [], []);
    expect(todayOnly).toHaveLength(1);
  });

  it('builds suppression keys for overlapping task cards', () => {
    const keys = buildHandoverSuppressionKeys([
      handover('booking-1', 'PICKUP'),
      handover('booking-2', 'RETURN'),
    ]);
    expect(keys.has('booking-1:PICKUP')).toBe(true);
    expect(keys.has('booking-2:RETURN')).toBe(true);
  });
});
