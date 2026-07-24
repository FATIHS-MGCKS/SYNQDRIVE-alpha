import { ConflictException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import {
  resolveCancelTransition,
  resolvePatchStatusTransition,
} from './booking-lifecycle-status.matrix';

describe('Booking lifecycle runtime policy (matrix)', () => {
  it('blocks PATCH terminal transitions', () => {
    expect(resolvePatchStatusTransition('CONFIRMED', 'CANCELLED')).toMatchObject({
      allowed: false,
      code: 'BOOKING_TERMINAL_REQUIRES_DEDICATED_ACTION',
    });
    expect(resolvePatchStatusTransition('CONFIRMED', 'NO_SHOW')).toMatchObject({
      allowed: false,
      code: 'BOOKING_TERMINAL_REQUIRES_DEDICATED_ACTION',
    });
    expect(resolvePatchStatusTransition('CONFIRMED', 'COMPLETED')).toMatchObject({
      allowed: false,
      code: 'BOOKING_COMPLETION_REQUIRES_HANDOVER',
    });
  });

  it('blocks cancel on ACTIVE and COMPLETED', () => {
    expect(resolveCancelTransition('COMPLETED')).toMatchObject({
      allowed: false,
      code: 'BOOKING_CANCEL_TERMINAL',
    });
    expect(resolveCancelTransition('ACTIVE')).toMatchObject({
      allowed: false,
      code: 'BOOKING_CANCEL_ACTIVE',
    });
  });

  it('allows cancel from CONFIRMED and PENDING', () => {
    expect(resolveCancelTransition('CONFIRMED')).toEqual({ allowed: true });
    expect(resolveCancelTransition('PENDING')).toEqual({ allowed: true });
  });

  it('documents idempotent cancel on already-cancelled bookings', () => {
    const decision = resolveCancelTransition('CANCELLED');
    expect(decision.allowed).toBe(false);
    // Service returns existing row when status is already CANCELLED.
    expect(() => {
      if (decision.allowed) return;
      throw new ConflictException({ code: decision.code });
    }).toThrow(ConflictException);
  });
});
