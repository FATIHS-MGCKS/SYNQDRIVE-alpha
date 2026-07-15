import {
  computeBookingPickupTiming,
  computeBookingReturnTiming,
  isSignificantBookingPickupReschedule,
  isSignificantBookingReturnReschedule,
} from './booking-pickup-return-timing.util';
import { BOOKING_PICKUP_TIMING_RULE, BOOKING_RETURN_TIMING_RULE } from './booking-pickup-return-timing.rules';

describe('booking-pickup-return-timing.util', () => {
  const now = new Date('2026-07-15T12:00:00.000Z');

  describe('computeBookingPickupTiming', () => {
    it('activates 2h before pickup and is due at pickup', () => {
      const pickupAt = new Date('2026-07-25T10:00:00.000Z');
      const timing = computeBookingPickupTiming(pickupAt, now, 'Europe/Berlin');

      expect(timing.activatesAt).toEqual(new Date('2026-07-25T08:00:00.000Z'));
      expect(timing.dueDate).toEqual(pickupAt);
      expect(timing.priority).toBe('NORMAL');
      expect(timing.isOverdue).toBe(false);
    });

    it('activates immediately when within lead window', () => {
      const pickupAt = new Date('2026-07-15T13:00:00.000Z');
      const timing = computeBookingPickupTiming(pickupAt, now, 'Europe/Berlin');

      expect(timing.activatesAt).toEqual(now);
      expect(timing.immediatelyActive).toBe(true);
    });

    it('escalates priority when pickup is overdue', () => {
      const pickupAt = new Date('2026-07-15T11:00:00.000Z');
      const timing = computeBookingPickupTiming(pickupAt, now, 'Europe/Berlin');

      expect(timing.isOverdue).toBe(true);
      expect(timing.priority).toBe(BOOKING_PICKUP_TIMING_RULE.overduePriority);
    });

    it('escalates to CRITICAL when pickup is late beyond threshold', () => {
      const pickupAt = new Date('2026-07-13T11:00:00.000Z');
      const timing = computeBookingPickupTiming(pickupAt, now, 'Europe/Berlin');

      expect(timing.priority).toBe('CRITICAL');
      expect(timing.isOverdue).toBe(true);
    });
  });

  describe('computeBookingReturnTiming', () => {
    it('activates 24h before return and is due at return', () => {
      const returnAt = new Date('2026-07-25T10:00:00.000Z');
      const timing = computeBookingReturnTiming(returnAt, now, 'Europe/Berlin');

      expect(timing.activatesAt).toEqual(new Date('2026-07-24T10:00:00.000Z'));
      expect(timing.dueDate).toEqual(returnAt);
      expect(timing.priority).toBe('NORMAL');
    });

    it('escalates priority when return is overdue', () => {
      const returnAt = new Date('2026-07-15T11:00:00.000Z');
      const timing = computeBookingReturnTiming(returnAt, now, 'Europe/Berlin');

      expect(timing.isOverdue).toBe(true);
      expect(timing.priority).toBe(BOOKING_RETURN_TIMING_RULE.overduePriority);
    });
  });

  describe('reschedule significance', () => {
    it('detects significant pickup reschedule', () => {
      const prev = new Date('2026-07-25T10:00:00.000Z');
      const next = new Date('2026-07-27T10:00:00.000Z');
      expect(isSignificantBookingPickupReschedule(prev, next)).toBe(true);
    });

    it('ignores minor pickup reschedule', () => {
      const prev = new Date('2026-07-25T10:00:00.000Z');
      const next = new Date('2026-07-25T12:00:00.000Z');
      expect(isSignificantBookingPickupReschedule(prev, next)).toBe(false);
    });

    it('detects significant return reschedule', () => {
      const prev = new Date('2026-07-25T10:00:00.000Z');
      const next = new Date('2026-07-28T10:00:00.000Z');
      expect(isSignificantBookingReturnReschedule(prev, next)).toBe(true);
    });
  });
});
