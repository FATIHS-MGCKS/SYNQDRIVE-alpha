import { WIZARD_DRAFT_MARKER } from '@modules/bookings/booking-wizard-draft.util';
import {
  isRelevantFutureOccupancyBooking,
  resolveFutureOccupancy,
} from './vehicle-booking-context.future-occupancy';
import {
  EMPTY_HANDOVER_SIGNALS,
  type VehicleBookingQueryRow,
} from './vehicle-booking-context.types';

const VEHICLE = 'vehicle-a';
const ORG = 'org-a';
const EVAL = new Date('2026-07-15T12:00:00.000Z');

function row(
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
    handover: { ...EMPTY_HANDOVER_SIGNALS },
    ...overrides,
  };
}

describe('vehicle-booking-context.future-occupancy', () => {
  describe('isRelevantFutureOccupancyBooking', () => {
    it('accepts binding CONFIRMED with open interval', () => {
      expect(
        isRelevantFutureOccupancyBooking(
          row({
            id: 'b-1',
            status: 'CONFIRMED',
            startDate: new Date('2026-08-01T08:00:00.000Z'),
            endDate: new Date('2026-08-06T18:00:00.000Z'),
          }),
          EVAL,
        ),
      ).toBe(true);
    });

    it('rejects expired interval', () => {
      expect(
        isRelevantFutureOccupancyBooking(
          row({
            id: 'b-expired',
            status: 'CONFIRMED',
            startDate: new Date('2026-06-01T08:00:00.000Z'),
            endDate: new Date('2026-07-01T08:00:00.000Z'),
          }),
          EVAL,
        ),
      ).toBe(false);
    });

    it('rejects wizard draft PENDING', () => {
      expect(
        isRelevantFutureOccupancyBooking(
          row({
            id: 'b-draft',
            status: 'PENDING',
            notes: WIZARD_DRAFT_MARKER,
            startDate: new Date('2026-08-01T08:00:00.000Z'),
            endDate: new Date('2026-08-06T18:00:00.000Z'),
          }),
          EVAL,
        ),
      ).toBe(false);
    });

    it('rejects terminal cancelled row when passed defensively', () => {
      expect(
        isRelevantFutureOccupancyBooking(
          row({
            id: 'b-cancelled',
            status: 'CANCELLED',
            startDate: new Date('2026-08-01T08:00:00.000Z'),
            endDate: new Date('2026-08-06T18:00:00.000Z'),
          }),
          EVAL,
        ),
      ).toBe(false);
    });
  });

  describe('resolveFutureOccupancy', () => {
    it('returns null next and zero count when no future bookings', () => {
      const result = resolveFutureOccupancy([], {
        evaluationAt: EVAL,
        excludeBookingIds: [],
      });

      expect(result.nextRow).toBeNull();
      expect(result.futureBookingCount).toBe(0);
      expect(result.furtherRows).toEqual([]);
    });

    it('returns single future booking as next with zero tail count', () => {
      const booking = row({
        id: 'b-future',
        status: 'CONFIRMED',
        startDate: new Date('2026-08-01T08:00:00.000Z'),
        endDate: new Date('2026-08-06T18:00:00.000Z'),
      });

      const result = resolveFutureOccupancy([booking], {
        evaluationAt: EVAL,
        excludeBookingIds: [],
      });

      expect(result.nextRow?.id).toBe('b-future');
      expect(result.futureBookingCount).toBe(0);
    });

    it('sorts chronologically and counts further bookings', () => {
      const result = resolveFutureOccupancy(
        [
          row({
            id: 'b-later',
            status: 'CONFIRMED',
            startDate: new Date('2026-09-01T08:00:00.000Z'),
            endDate: new Date('2026-09-06T18:00:00.000Z'),
          }),
          row({
            id: 'b-first',
            status: 'CONFIRMED',
            startDate: new Date('2026-08-01T08:00:00.000Z'),
            endDate: new Date('2026-08-06T18:00:00.000Z'),
          }),
          row({
            id: 'b-mid',
            status: 'CONFIRMED',
            startDate: new Date('2026-08-15T08:00:00.000Z'),
            endDate: new Date('2026-08-20T18:00:00.000Z'),
          }),
        ],
        { evaluationAt: EVAL, excludeBookingIds: [] },
      );

      expect(result.nextRow?.id).toBe('b-first');
      expect(result.futureBookingCount).toBe(2);
      expect(result.furtherRows.map((b) => b.id)).toEqual(['b-mid', 'b-later']);
    });

    it('excludes active booking id from next selection', () => {
      const result = resolveFutureOccupancy(
        [
          row({
            id: 'b-active',
            status: 'ACTIVE',
            startDate: new Date('2026-07-10T08:00:00.000Z'),
            endDate: new Date('2026-07-25T18:00:00.000Z'),
          }),
          row({
            id: 'b-next',
            status: 'CONFIRMED',
            startDate: new Date('2026-08-01T08:00:00.000Z'),
            endDate: new Date('2026-08-06T18:00:00.000Z'),
          }),
        ],
        { evaluationAt: EVAL, excludeBookingIds: ['b-active'] },
      );

      expect(result.nextRow?.id).toBe('b-next');
    });

    it('excludes reservation-window booking without counting it as next', () => {
      const inWindow = row({
        id: 'b-window',
        status: 'CONFIRMED',
        startDate: new Date('2026-07-15T08:00:00.000Z'),
        endDate: new Date('2026-07-20T18:00:00.000Z'),
      });
      const later = row({
        id: 'b-later',
        status: 'CONFIRMED',
        startDate: new Date('2026-08-01T08:00:00.000Z'),
        endDate: new Date('2026-08-06T18:00:00.000Z'),
      });

      const result = resolveFutureOccupancy([inWindow, later], {
        evaluationAt: EVAL,
        excludeBookingIds: ['b-window'],
      });

      expect(result.nextRow?.id).toBe('b-later');
      expect(result.futureBookingCount).toBe(0);
    });

    it('uses stable id tie-break for same pickup instant', () => {
      const sameStart = new Date('2026-08-01T08:00:00.000Z');
      const result = resolveFutureOccupancy(
        [
          row({
            id: 'b-z',
            status: 'CONFIRMED',
            startDate: sameStart,
            endDate: new Date('2026-08-04T18:00:00.000Z'),
          }),
          row({
            id: 'b-a',
            status: 'CONFIRMED',
            startDate: sameStart,
            endDate: new Date('2026-08-05T18:00:00.000Z'),
          }),
        ],
        { evaluationAt: EVAL, excludeBookingIds: [] },
      );

      expect(result.nextRow?.id).toBe('b-a');
      expect(result.furtherRows[0]?.id).toBe('b-z');
    });
  });
});
