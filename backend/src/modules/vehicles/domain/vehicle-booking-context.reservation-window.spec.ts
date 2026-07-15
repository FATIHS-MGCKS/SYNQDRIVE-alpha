import { WIZARD_DRAFT_MARKER } from '@modules/bookings/booking-wizard-draft.util';
import {
  computeReservationWindowBounds,
  isBindingReservationBooking,
  isWithinReservationWindow,
  resolveReservationWindowBooking,
} from './vehicle-booking-context.reservation-window';
import {
  EMPTY_HANDOVER_SIGNALS,
  type VehicleBookingQueryRow,
} from './vehicle-booking-context.types';

const TIMEZONE = 'Europe/Berlin';
const VEHICLE = 'vehicle-a';
const ORG = 'org-a';

function bookingRow(
  overrides: Partial<VehicleBookingQueryRow> & {
    id: string;
    status: VehicleBookingQueryRow['status'];
    startDate: Date;
    endDate: Date;
  },
): VehicleBookingQueryRow {
  return {
    vehicleId: VEHICLE,
    organizationId: ORG,
    kmIncluded: null,
    kmDriven: null,
    pickupStationId: null,
    returnStationId: null,
    notes: null,
    customerLabel: 'Customer',
    pickupStationName: null,
    returnStationName: null,
    handover: { ...EMPTY_HANDOVER_SIGNALS, ...overrides.handover },
    ...overrides,
  };
}

describe('vehicle-booking-context.reservation-window', () => {
  describe('isBindingReservationBooking', () => {
    it('treats CONFIRMED as binding', () => {
      expect(
        isBindingReservationBooking({ status: 'CONFIRMED', notes: null }),
      ).toBe(true);
    });

    it('treats non-wizard PENDING as binding', () => {
      expect(
        isBindingReservationBooking({ status: 'PENDING', notes: 'Anfrage' }),
      ).toBe(true);
    });

    it('excludes wizard checkout drafts from binding PENDING', () => {
      expect(
        isBindingReservationBooking({
          status: 'PENDING',
          notes: `${WIZARD_DRAFT_MARKER} checkout`,
        }),
      ).toBe(false);
    });
  });

  describe('computeReservationWindowBounds', () => {
    it('starts at org-calendar midnight on pickup day (KS FH 660E example)', () => {
      const startDate = new Date('2026-08-01T08:00:00.000Z'); // 10:00 CEST
      const { windowStart } = computeReservationWindowBounds(
        bookingRow({
          id: 'b-aug',
          status: 'CONFIRMED',
          startDate,
          endDate: new Date('2026-08-06T18:00:00.000Z'),
        }),
        TIMEZONE,
      );

      // 2026-08-01 00:00:00 Europe/Berlin (CEST, UTC+2)
      expect(windowStart.toISOString()).toBe('2026-07-31T22:00:00.000Z');
    });

    it('ends at pickup protocol when completed before return', () => {
      const pickupAt = new Date('2026-08-01T09:00:00.000Z');
      const { windowEnd } = computeReservationWindowBounds(
        bookingRow({
          id: 'b-picked',
          status: 'CONFIRMED',
          startDate: new Date('2026-08-01T08:00:00.000Z'),
          endDate: new Date('2026-08-06T18:00:00.000Z'),
          handover: {
            ...EMPTY_HANDOVER_SIGNALS,
            pickupPerformedAt: pickupAt,
          },
        }),
        TIMEZONE,
      );

      expect(windowEnd).toEqual(pickupAt);
    });
  });

  describe('isWithinReservationWindow', () => {
    it('pickup today — inside window after org midnight', () => {
      const startDate = new Date('2026-08-01T08:00:00.000Z'); // 10:00 CEST
      const row = bookingRow({
        id: 'b-today',
        status: 'CONFIRMED',
        startDate,
        endDate: new Date('2026-08-06T18:00:00.000Z'),
      });

      expect(
        isWithinReservationWindow(row, {
          evaluationAt: new Date('2026-08-01T06:00:00.000Z'), // 08:00 CEST
          organizationTimezone: TIMEZONE,
        }),
      ).toBe(true);
    });

    it('pickup tomorrow — before window on prior evaluation day', () => {
      const row = bookingRow({
        id: 'b-tomorrow',
        status: 'CONFIRMED',
        startDate: new Date('2026-08-02T08:00:00.000Z'),
        endDate: new Date('2026-08-07T18:00:00.000Z'),
      });

      expect(
        isWithinReservationWindow(row, {
          evaluationAt: new Date('2026-08-01T20:00:00.000Z'), // still Aug 1 in Berlin
          organizationTimezone: TIMEZONE,
        }),
      ).toBe(false);
    });

    it('pickup in two weeks — not in window mid-July', () => {
      const row = bookingRow({
        id: 'b-2w',
        status: 'CONFIRMED',
        startDate: new Date('2026-08-01T08:00:00.000Z'),
        endDate: new Date('2026-08-06T18:00:00.000Z'),
      });

      expect(
        isWithinReservationWindow(row, {
          evaluationAt: new Date('2026-07-15T12:00:00.000Z'),
          organizationTimezone: TIMEZONE,
        }),
      ).toBe(false);
    });

    it('before and after org midnight on pickup day', () => {
      const row = bookingRow({
        id: 'b-midnight',
        status: 'CONFIRMED',
        startDate: new Date('2026-08-01T08:00:00.000Z'),
        endDate: new Date('2026-08-06T18:00:00.000Z'),
      });

      // 23:59 CEST on July 31 → still before window
      expect(
        isWithinReservationWindow(row, {
          evaluationAt: new Date('2026-07-31T21:59:00.000Z'),
          organizationTimezone: TIMEZONE,
        }),
      ).toBe(false);

      // 00:01 CEST on Aug 1 → inside window
      expect(
        isWithinReservationWindow(row, {
          evaluationAt: new Date('2026-07-31T22:01:00.000Z'),
          organizationTimezone: TIMEZONE,
        }),
      ).toBe(true);
    });

    it('Europe/Berlin DST spring — window start on transition day', () => {
      const row = bookingRow({
        id: 'b-spring',
        status: 'CONFIRMED',
        startDate: new Date('2026-03-29T09:00:00.000Z'), // 10:00 CET→CEST day
        endDate: new Date('2026-04-02T18:00:00.000Z'),
      });

      const { windowStart } = computeReservationWindowBounds(row, TIMEZONE);
      expect(
        isWithinReservationWindow(row, {
          evaluationAt: new Date(windowStart.getTime() + 60_000),
          organizationTimezone: TIMEZONE,
        }),
      ).toBe(true);
    });

    it('Europe/Berlin DST fall — window start on transition day', () => {
      const row = bookingRow({
        id: 'b-fall',
        status: 'CONFIRMED',
        startDate: new Date('2026-10-25T09:00:00.000Z'),
        endDate: new Date('2026-10-30T18:00:00.000Z'),
      });

      const { windowStart } = computeReservationWindowBounds(row, TIMEZONE);
      expect(windowStart).toBeInstanceOf(Date);
      expect(
        isWithinReservationWindow(row, {
          evaluationAt: new Date(windowStart.getTime() + 60_000),
          organizationTimezone: TIMEZONE,
        }),
      ).toBe(true);
    });

    it('excludes booking after successful pickup evidence', () => {
      const row = bookingRow({
        id: 'b-picked-up',
        status: 'CONFIRMED',
        startDate: new Date('2026-08-01T08:00:00.000Z'),
        endDate: new Date('2026-08-06T18:00:00.000Z'),
        handover: {
          ...EMPTY_HANDOVER_SIGNALS,
          pickupPerformedAt: new Date('2026-08-01T09:00:00.000Z'),
        },
      });

      expect(
        isWithinReservationWindow(row, {
          evaluationAt: new Date('2026-08-01T10:00:00.000Z'),
          organizationTimezone: TIMEZONE,
        }),
      ).toBe(false);
    });

    it('excludes wizard draft PENDING even on pickup day', () => {
      const row = bookingRow({
        id: 'b-draft',
        status: 'PENDING',
        notes: WIZARD_DRAFT_MARKER,
        startDate: new Date('2026-08-01T08:00:00.000Z'),
        endDate: new Date('2026-08-06T18:00:00.000Z'),
      });

      expect(
        isWithinReservationWindow(row, {
          evaluationAt: new Date('2026-08-01T10:00:00.000Z'),
          organizationTimezone: TIMEZONE,
        }),
      ).toBe(false);
    });
  });

  describe('resolveReservationWindowBooking', () => {
    const evalOnPickupDay = new Date('2026-08-01T10:00:00.000Z');

    it('returns single in-window CONFIRMED booking', () => {
      const row = bookingRow({
        id: 'b-window',
        status: 'CONFIRMED',
        startDate: new Date('2026-08-01T08:00:00.000Z'),
        endDate: new Date('2026-08-06T18:00:00.000Z'),
      });

      const result = resolveReservationWindowBooking([row], {
        evaluationAt: evalOnPickupDay,
        organizationTimezone: TIMEZONE,
      });

      expect(result.booking?.id).toBe('b-window');
      expect(result.dataQualityReasons).toEqual([]);
    });

    it('returns null for future pickup outside window', () => {
      const row = bookingRow({
        id: 'b-future',
        status: 'CONFIRMED',
        startDate: new Date('2026-08-15T08:00:00.000Z'),
        endDate: new Date('2026-08-20T18:00:00.000Z'),
      });

      const result = resolveReservationWindowBooking([row], {
        evaluationAt: evalOnPickupDay,
        organizationTimezone: TIMEZONE,
      });

      expect(result.booking).toBeNull();
    });

    it('flags multiple bookings in the same window', () => {
      const sharedStart = new Date('2026-08-01T08:00:00.000Z');
      const result = resolveReservationWindowBooking(
        [
          bookingRow({
            id: 'b-a',
            status: 'CONFIRMED',
            startDate: sharedStart,
            endDate: new Date('2026-08-05T18:00:00.000Z'),
          }),
          bookingRow({
            id: 'b-b',
            status: 'CONFIRMED',
            startDate: sharedStart,
            endDate: new Date('2026-08-06T18:00:00.000Z'),
          }),
        ],
        {
          evaluationAt: evalOnPickupDay,
          organizationTimezone: TIMEZONE,
        },
      );

      expect(result.booking).toBeNull();
      expect(result.dataQualityReasons).toContain(
        'MULTIPLE_RESERVATION_WINDOW_BOOKINGS',
      );
    });

    it('ignores ACTIVE status rows passed in (caller filters, defensive)', () => {
      const row = bookingRow({
        id: 'b-active',
        status: 'ACTIVE',
        startDate: new Date('2026-08-01T08:00:00.000Z'),
        endDate: new Date('2026-08-06T18:00:00.000Z'),
      });

      const result = resolveReservationWindowBooking([row], {
        evaluationAt: evalOnPickupDay,
        organizationTimezone: TIMEZONE,
      });

      expect(result.booking).toBeNull();
    });

    it('ignores terminal NO_SHOW and CANCELLED when present in candidates', () => {
      const result = resolveReservationWindowBooking(
        [
          bookingRow({
            id: 'b-noshow',
            status: 'NO_SHOW',
            startDate: new Date('2026-08-01T08:00:00.000Z'),
            endDate: new Date('2026-08-06T18:00:00.000Z'),
          }),
          bookingRow({
            id: 'b-cancelled',
            status: 'CANCELLED',
            startDate: new Date('2026-08-01T08:00:00.000Z'),
            endDate: new Date('2026-08-06T18:00:00.000Z'),
          }),
        ],
        {
          evaluationAt: evalOnPickupDay,
          organizationTimezone: TIMEZONE,
        },
      );

      expect(result.booking).toBeNull();
    });
  });
});
