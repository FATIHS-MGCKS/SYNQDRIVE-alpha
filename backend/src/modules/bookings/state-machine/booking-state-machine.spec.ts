import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { BookingStatus } from '@prisma/client';
import {
  BOOKING_LIFECYCLE_STATUSES,
  BOOKING_STATUS_TRANSITIONS,
} from './booking-state-machine.constants';
import {
  findTransition,
  isTerminalBookingStatus,
  listAllowedBookingTransitions,
  resolveBookingStatusTransition,
} from './booking-state-machine';
import type { BookingStatusTrigger } from './booking-state-machine.types';

const ALL_STATUSES = [...BOOKING_LIFECYCLE_STATUSES] as BookingStatus[];
const TRIGGERS: BookingStatusTrigger[] = [
  'create',
  'confirm',
  'cancel',
  'pickup_handover',
  'return_handover',
  'mark_no_show',
  'admin_override',
];

function isAllowed(
  from: BookingStatus | null,
  to: BookingStatus,
  trigger: BookingStatusTrigger,
  preconditions?: { scheduledStartDate?: Date },
): boolean {
  try {
    resolveBookingStatusTransition({
      from: from as BookingStatus,
      to,
      trigger,
      preconditions,
    });
    return true;
  } catch {
    return false;
  }
}

describe('Booking state machine — transition matrix', () => {
  const explicit = listAllowedBookingTransitions();

  it('defines exactly 9 explicit transitions', () => {
    expect(explicit).toHaveLength(9);
    expect(Object.keys(BOOKING_STATUS_TRANSITIONS)).toHaveLength(9);
  });

  describe.each(explicit.map((t) => [t.key, t.from, t.to, t.trigger, t.permission] as const))(
    'allowed: %s (%s → %s via %s, permission %s)',
    (key, from, to, trigger) => {
      it('is discoverable via findTransition', () => {
        expect(findTransition(from, to, trigger)?.key).toBe(key);
      });

      it('passes resolveBookingStatusTransition', () => {
        const preconditions =
          key === 'mark_no_show'
            ? { scheduledStartDate: new Date('2020-01-01'), now: new Date() }
            : undefined;
        const result = resolveBookingStatusTransition({
          from: from as BookingStatus,
          to,
          trigger,
          preconditions,
        });
        expect(result.key).toBe(key);
      });
    },
  );

  describe('forbidden transitions (closed machine)', () => {
    const allowedSet = new Set(
      explicit.map((t) => `${t.from ?? 'null'}:${t.to}:${t.trigger}`),
    );

    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (from === to) continue;
        for (const trigger of TRIGGERS) {
          if (trigger === 'create' || trigger === 'admin_override') continue;
          const key = `${from}:${to}:${trigger}`;
          if (allowedSet.has(key)) continue;

          it(`rejects ${from} → ${to} via ${trigger}`, () => {
            expect(() =>
              resolveBookingStatusTransition({ from, to, trigger }),
            ).toThrow(ConflictException);
          });
        }
      }
    }
  });

  describe('create (from null)', () => {
    it('allows PENDING via create', () => {
      expect(findTransition(null, 'PENDING', 'create')?.key).toBe('create_pending');
    });

    it('allows CONFIRMED via create', () => {
      expect(findTransition(null, 'CONFIRMED', 'create')?.key).toBe('create_confirmed');
    });

    it('rejects ACTIVE via create', () => {
      expect(findTransition(null, 'ACTIVE', 'create')).toBeUndefined();
    });
  });

  describe('terminal states', () => {
    it.each(['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const)(
      '%s is terminal',
      (status) => {
        expect(isTerminalBookingStatus(status)).toBe(true);
      },
    );

    it('rejects reactivation COMPLETED → ACTIVE without override', () => {
      expect(() =>
        resolveBookingStatusTransition({
          from: 'COMPLETED',
          to: 'ACTIVE',
          trigger: 'admin_override',
        }),
      ).toThrow(ConflictException);
    });

    it('allows COMPLETED → ACTIVE with admin override', () => {
      const def = resolveBookingStatusTransition({
        from: 'COMPLETED',
        to: 'ACTIVE',
        trigger: 'admin_override',
        override: { hasPermission: true, reason: 'Data repair after failed handover sync' },
      });
      expect(def.permission).toBe('booking.override');
    });
  });

  describe('NO_SHOW preconditions', () => {
    it('requires pickup time to have passed', () => {
      const future = new Date(Date.now() + 86_400_000);
      expect(() =>
        resolveBookingStatusTransition({
          from: 'CONFIRMED',
          to: 'NO_SHOW',
          trigger: 'mark_no_show',
          preconditions: { scheduledStartDate: future, now: new Date() },
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('admin override guards', () => {
    it('requires override permission', () => {
      expect(() =>
        resolveBookingStatusTransition({
          from: 'CANCELLED',
          to: 'CONFIRMED',
          trigger: 'admin_override',
          override: { hasPermission: false, reason: 'Reopen cancelled booking for ops' },
        }),
      ).toThrow(ForbiddenException);
    });

    it('requires minimum reason length', () => {
      expect(() =>
        resolveBookingStatusTransition({
          from: 'CANCELLED',
          to: 'CONFIRMED',
          trigger: 'admin_override',
          override: { hasPermission: true, reason: 'short' },
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('pickup / return exclusivity', () => {
    it('ACTIVE only from CONFIRMED via pickup_handover', () => {
      expect(isAllowed('CONFIRMED', 'ACTIVE', 'pickup_handover')).toBe(true);
      expect(isAllowed('PENDING', 'ACTIVE', 'pickup_handover')).toBe(false);
      expect(isAllowed('CONFIRMED', 'ACTIVE', 'confirm')).toBe(false);
    });

    it('COMPLETED only from ACTIVE via return_handover', () => {
      expect(isAllowed('ACTIVE', 'COMPLETED', 'return_handover')).toBe(true);
      expect(isAllowed('CONFIRMED', 'COMPLETED', 'return_handover')).toBe(false);
    });
  });

  describe('cancel allowed sources', () => {
    it.each(['PENDING', 'CONFIRMED', 'ACTIVE'] as const)(
      'allows cancel from %s',
      (from) => {
        expect(isAllowed(from, 'CANCELLED', 'cancel')).toBe(true);
      },
    );

    it.each(['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const)(
      'forbids cancel from %s',
      (from) => {
        expect(isAllowed(from, 'CANCELLED', 'cancel')).toBe(false);
      },
    );
  });
});
