import {
  BOOKING_LIFECYCLE_STATUSES,
  BOOKING_TERMINAL_STATUSES,
  bookingTerminalAllowsOnlyNotes,
  buildBookingLifecycleTransitionMatrix,
  resolveCancelTransition,
  resolveHandoverStatusTransition,
  resolveNoShowTransition,
  resolvePatchStatusTransition,
} from './booking-lifecycle-status.matrix';

describe('booking-lifecycle-status.matrix', () => {
  it('marks terminal statuses as notes-only mutable', () => {
    for (const status of BOOKING_TERMINAL_STATUSES) {
      expect(bookingTerminalAllowsOnlyNotes(status)).toBe(true);
    }
    expect(bookingTerminalAllowsOnlyNotes('CONFIRMED')).toBe(false);
  });

  it('forbids PATCH activation and completion — handover endpoints required', () => {
    expect(resolvePatchStatusTransition('CONFIRMED', 'ACTIVE')).toMatchObject({
      allowed: false,
      code: 'BOOKING_ACTIVATION_REQUIRES_HANDOVER',
    });
    expect(resolvePatchStatusTransition('ACTIVE', 'COMPLETED')).toMatchObject({
      allowed: false,
      code: 'BOOKING_COMPLETION_REQUIRES_HANDOVER',
    });
  });

  it('forbids PATCH cancel and no-show — dedicated endpoints required', () => {
    expect(resolvePatchStatusTransition('CONFIRMED', 'CANCELLED')).toMatchObject({
      allowed: false,
      code: 'BOOKING_TERMINAL_REQUIRES_DEDICATED_ACTION',
    });
    expect(resolvePatchStatusTransition('CONFIRMED', 'NO_SHOW')).toMatchObject({
      allowed: false,
      code: 'BOOKING_TERMINAL_REQUIRES_DEDICATED_ACTION',
    });
  });

  it('allows pending to confirmed via PATCH', () => {
    expect(resolvePatchStatusTransition('PENDING', 'CONFIRMED')).toEqual({ allowed: true });
  });

  it('enforces pickup handover preconditions', () => {
    expect(resolveHandoverStatusTransition('PICKUP', 'CONFIRMED')).toEqual({ allowed: true });
    expect(resolveHandoverStatusTransition('PICKUP', 'PENDING')).toMatchObject({
      allowed: false,
      code: 'HANDOVER_PICKUP_WRONG_STATUS',
    });
  });

  it('enforces return handover preconditions', () => {
    expect(resolveHandoverStatusTransition('RETURN', 'ACTIVE')).toEqual({ allowed: true });
    expect(resolveHandoverStatusTransition('RETURN', 'CONFIRMED')).toMatchObject({
      allowed: false,
      code: 'HANDOVER_RETURN_WRONG_STATUS',
    });
  });

  it('enforces no-show guardrails', () => {
    const past = Date.now() - 60_000;
    expect(
      resolveNoShowTransition({
        from: 'CONFIRMED',
        scheduledStartMs: past,
        nowMs: Date.now(),
      }),
    ).toEqual({ allowed: true });

    expect(
      resolveNoShowTransition({
        from: 'PENDING',
        scheduledStartMs: past,
        nowMs: Date.now(),
      }),
    ).toMatchObject({ allowed: false, code: 'BOOKING_NO_SHOW_WRONG_STATUS' });

    expect(
      resolveNoShowTransition({
        from: 'CONFIRMED',
        scheduledStartMs: Date.now() + 60_000,
        nowMs: Date.now(),
      }),
    ).toMatchObject({ allowed: false, code: 'BOOKING_NO_SHOW_TOO_EARLY' });
  });

  it('forbids cancel on terminal bookings and active rentals', () => {
    for (const status of BOOKING_TERMINAL_STATUSES) {
      expect(resolveCancelTransition(status)).toMatchObject({
        allowed: false,
        code: 'BOOKING_CANCEL_TERMINAL',
      });
    }
    expect(resolveCancelTransition('ACTIVE')).toMatchObject({
      allowed: false,
      code: 'BOOKING_CANCEL_ACTIVE',
    });
    expect(resolveCancelTransition('CONFIRMED')).toEqual({ allowed: true });
  });

  it('documents full transition matrix without unexpected holes', () => {
    const matrix = buildBookingLifecycleTransitionMatrix();
    expect(matrix.length).toBeGreaterThan(0);

    const allowedPickup = matrix.filter(
      (row) => row.action === 'PICKUP_HANDOVER' && row.allowed,
    );
    expect(allowedPickup).toEqual([
      expect.objectContaining({ from: 'CONFIRMED', to: 'ACTIVE' }),
    ]);

    const allowedReturn = matrix.filter(
      (row) => row.action === 'RETURN_HANDOVER' && row.allowed,
    );
    expect(allowedReturn).toEqual([
      expect.objectContaining({ from: 'ACTIVE', to: 'COMPLETED' }),
    ]);

    for (const status of BOOKING_LIFECYCLE_STATUSES) {
      expect(matrix.some((row) => row.from === status)).toBe(true);
    }
  });
});
