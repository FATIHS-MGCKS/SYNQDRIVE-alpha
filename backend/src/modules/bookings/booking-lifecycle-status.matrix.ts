import type { BookingStatus } from '@prisma/client';

/** Canonical Prisma booking lifecycle statuses — no legacy aliases. */
export const BOOKING_LIFECYCLE_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const satisfies readonly BookingStatus[];

export type BookingLifecycleStatus = (typeof BOOKING_LIFECYCLE_STATUSES)[number];

export const BOOKING_TERMINAL_STATUSES = [
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const satisfies readonly BookingStatus[];

export type BookingTerminalStatus = (typeof BOOKING_TERMINAL_STATUSES)[number];

export type BookingLifecycleAction =
  | 'PATCH_UPDATE'
  | 'CANCEL'
  | 'NO_SHOW'
  | 'PICKUP_HANDOVER'
  | 'RETURN_HANDOVER';

export type BookingLifecycleTransitionDecision = {
  allowed: boolean;
  code?: string;
  reason?: string;
};

const TERMINAL = new Set<BookingStatus>(BOOKING_TERMINAL_STATUSES);

/** Whether a booking in `status` may receive non-notes field updates. */
export function bookingTerminalAllowsOnlyNotes(status: BookingStatus): boolean {
  return TERMINAL.has(status);
}

/** PATCH `status` transitions that BookingsService.update permits directly. */
export function resolvePatchStatusTransition(
  from: BookingStatus,
  to: BookingStatus,
): BookingLifecycleTransitionDecision {
  if (from === to) {
    return { allowed: true };
  }

  if (TERMINAL.has(from)) {
    return {
      allowed: false,
      code: 'BOOKING_TERMINAL_IMMUTABLE',
      reason: `Terminal booking ${from} cannot change status via PATCH`,
    };
  }

  if (to === 'ACTIVE') {
    return {
      allowed: false,
      code: 'BOOKING_ACTIVATION_REQUIRES_HANDOVER',
      reason: 'Status ACTIVE requires pickup handover via POST /bookings/:id/handover/pickup',
    };
  }

  if (to === 'COMPLETED') {
    return {
      allowed: false,
      code: 'BOOKING_COMPLETION_REQUIRES_HANDOVER',
      reason: 'Status COMPLETED requires return handover via POST /bookings/:id/handover/return',
    };
  }

  if (to === 'CANCELLED' || to === 'NO_SHOW') {
    return {
      allowed: false,
      code: 'BOOKING_TERMINAL_REQUIRES_DEDICATED_ACTION',
      reason: `Status ${to} requires dedicated endpoint, not PATCH`,
    };
  }

  const allowedPatchTargets: Partial<Record<BookingStatus, BookingStatus[]>> = {
    PENDING: ['CONFIRMED', 'PENDING'],
    CONFIRMED: ['CONFIRMED', 'PENDING'],
    ACTIVE: ['ACTIVE'],
  };

  const targets = allowedPatchTargets[from];
  if (!targets || !targets.includes(to)) {
    return {
      allowed: false,
      code: 'BOOKING_STATUS_TRANSITION_FORBIDDEN',
      reason: `PATCH transition ${from} → ${to} is not allowed`,
    };
  }

  return { allowed: true };
}

export function resolveHandoverStatusTransition(
  kind: 'PICKUP' | 'RETURN',
  from: BookingStatus,
): BookingLifecycleTransitionDecision {
  const expectedFrom: BookingStatus = kind === 'PICKUP' ? 'CONFIRMED' : 'ACTIVE';
  if (from !== expectedFrom) {
    return {
      allowed: false,
      code:
        kind === 'PICKUP'
          ? 'HANDOVER_PICKUP_WRONG_STATUS'
          : 'HANDOVER_RETURN_WRONG_STATUS',
      reason:
        kind === 'PICKUP'
          ? `Pickup requires CONFIRMED, got ${from}`
          : `Return requires ACTIVE, got ${from}`,
    };
  }
  return { allowed: true };
}

export function resolveNoShowTransition(input: {
  from: BookingStatus;
  scheduledStartMs: number;
  nowMs: number;
}): BookingLifecycleTransitionDecision {
  if (input.from !== 'CONFIRMED') {
    return {
      allowed: false,
      code: 'BOOKING_NO_SHOW_WRONG_STATUS',
      reason: `No-show requires CONFIRMED, got ${input.from}`,
    };
  }
  if (input.scheduledStartMs > input.nowMs) {
    return {
      allowed: false,
      code: 'BOOKING_NO_SHOW_TOO_EARLY',
      reason: 'No-show only after scheduled pickup time',
    };
  }
  return { allowed: true };
}

export function resolveCancelTransition(from: BookingStatus): BookingLifecycleTransitionDecision {
  if (TERMINAL.has(from)) {
    return {
      allowed: false,
      code: 'BOOKING_CANCEL_TERMINAL',
      reason: `Cannot cancel terminal booking ${from}`,
    };
  }
  return { allowed: true };
}

export function buildBookingLifecycleTransitionMatrix(): Array<{
  action: BookingLifecycleAction;
  from: BookingStatus;
  to: BookingStatus;
  allowed: boolean;
  code?: string;
}> {
  const rows: Array<{
    action: BookingLifecycleAction;
    from: BookingStatus;
    to: BookingStatus;
    allowed: boolean;
    code?: string;
  }> = [];

  for (const from of BOOKING_LIFECYCLE_STATUSES) {
    for (const to of BOOKING_LIFECYCLE_STATUSES) {
      if (from === to) continue;
      const patch = resolvePatchStatusTransition(from, to);
      rows.push({
        action: 'PATCH_UPDATE',
        from,
        to,
        allowed: patch.allowed,
        code: patch.code,
      });
    }

    const cancel = resolveCancelTransition(from);
    rows.push({
      action: 'CANCEL',
      from,
      to: 'CANCELLED',
      allowed: cancel.allowed,
      code: cancel.code,
    });

    const noShow = resolveNoShowTransition({
      from,
      scheduledStartMs: Date.now() - 60_000,
      nowMs: Date.now(),
    });
    rows.push({
      action: 'NO_SHOW',
      from,
      to: 'NO_SHOW',
      allowed: noShow.allowed,
      code: noShow.code,
    });

    for (const kind of ['PICKUP', 'RETURN'] as const) {
      const to: BookingStatus = kind === 'PICKUP' ? 'ACTIVE' : 'COMPLETED';
      const handover = resolveHandoverStatusTransition(kind, from);
      rows.push({
        action: kind === 'PICKUP' ? 'PICKUP_HANDOVER' : 'RETURN_HANDOVER',
        from,
        to,
        allowed: handover.allowed,
        code: handover.code,
      });
    }
  }

  return rows;
}
