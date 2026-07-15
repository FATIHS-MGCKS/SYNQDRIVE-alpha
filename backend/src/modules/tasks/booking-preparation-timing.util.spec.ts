import { BOOKING_PREPARATION_TIMING_RULE } from './booking-preparation-timing.rules';
import {
  computeBookingPreparationTiming,
  isSignificantBookingPickupReschedule,
} from './booking-preparation-timing.util';

describe('computeBookingPreparationTiming', () => {
  const now = new Date('2026-07-15T12:00:00.000Z');

  it('schedules activation 48h before pickup when pickup is in 10 days', () => {
    const pickupAt = new Date('2026-07-25T10:00:00.000Z');
    const timing = computeBookingPreparationTiming(pickupAt, now, 'Europe/Berlin');

    expect(timing.scheduledActivatesAt.toISOString()).toBe('2026-07-23T10:00:00.000Z');
    expect(timing.activatesAt.toISOString()).toBe('2026-07-23T10:00:00.000Z');
    expect(timing.dueDate.toISOString()).toBe('2026-07-25T08:00:00.000Z');
    expect(timing.immediatelyActive).toBe(false);
    expect(timing.pickupDateOnly).toBe('2026-07-25');
  });

  it('activates immediately when pickup is in 12 hours (inside activation window)', () => {
    const pickupAt = new Date('2026-07-16T00:00:00.000Z');
    const timing = computeBookingPreparationTiming(pickupAt, now, 'Europe/Berlin');

    expect(timing.scheduledActivatesAt.getTime()).toBeLessThan(now.getTime());
    expect(timing.activatesAt).toEqual(now);
    expect(timing.immediatelyActive).toBe(true);
    expect(timing.dueDate.toISOString()).toBe('2026-07-15T22:00:00.000Z');
  });

  it('uses now for activation when pickup is in the past', () => {
    const pickupAt = new Date('2026-07-10T08:00:00.000Z');
    const timing = computeBookingPreparationTiming(pickupAt, now, 'Europe/Berlin');

    expect(timing.activatesAt).toEqual(now);
    expect(timing.dueDate.toISOString()).toBe('2026-07-10T06:00:00.000Z');
    expect(timing.immediatelyActive).toBe(true);
  });

  it('uses configured domain lead constants', () => {
    const pickupAt = new Date('2026-07-20T14:00:00.000Z');
    const timing = computeBookingPreparationTiming(pickupAt, now, 'Europe/Berlin');

    expect(
      pickupAt.getTime() - timing.scheduledActivatesAt.getTime(),
    ).toBe(BOOKING_PREPARATION_TIMING_RULE.activationLeadBeforePickupMs);
    expect(pickupAt.getTime() - timing.dueDate.getTime()).toBe(
      BOOKING_PREPARATION_TIMING_RULE.dueLeadBeforePickupMs,
    );
  });

  it('resolves pickup calendar date in org timezone across DST start (Europe/Berlin)', () => {
    const pickupAt = new Date('2026-03-29T15:00:00.000Z'); // 16:00 CET → 17:00 CEST
    const timing = computeBookingPreparationTiming(pickupAt, now, 'Europe/Berlin');
    expect(timing.pickupDateOnly).toBe('2026-03-29');
    expect(timing.scheduledActivatesAt.toISOString()).toBe('2026-03-27T15:00:00.000Z');
  });

  it('resolves pickup calendar date in org timezone across DST end (Europe/Berlin)', () => {
    const pickupAt = new Date('2026-10-25T16:00:00.000Z'); // 18:00 CEST → 17:00 CET
    const timing = computeBookingPreparationTiming(pickupAt, now, 'Europe/Berlin');
    expect(timing.pickupDateOnly).toBe('2026-10-25');
    expect(timing.scheduledActivatesAt.toISOString()).toBe('2026-10-23T16:00:00.000Z');
  });

  it('defaults to Europe/Berlin when timezone is blank', () => {
    const pickupAt = new Date('2026-07-20T10:00:00.000Z');
    const timing = computeBookingPreparationTiming(pickupAt, now, '   ');
    expect(timing.timeZone).toBe('Europe/Berlin');
  });
});

describe('isSignificantBookingPickupReschedule', () => {
  it('detects moves at or above the significant threshold', () => {
    const previous = new Date('2026-07-20T10:00:00.000Z');
    const next = new Date(
      previous.getTime() + BOOKING_PREPARATION_TIMING_RULE.significantRescheduleThresholdMs,
    );
    expect(isSignificantBookingPickupReschedule(previous, next)).toBe(true);
  });

  it('ignores minor pickup shifts', () => {
    const previous = new Date('2026-07-20T10:00:00.000Z');
    const next = new Date(previous.getTime() + 2 * 60 * 60 * 1000);
    expect(isSignificantBookingPickupReschedule(previous, next)).toBe(false);
  });
});
