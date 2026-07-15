import type { BookingStatus } from '@prisma/client';
import {
  assembleBookingContextMap,
  assembleVehicleBookingContext,
  compareBookingsByPickupStable,
} from './vehicle-booking-context.assembler';
import type { VehicleBookingQueryRow } from './vehicle-booking-context.types';

const EVALUATION_AT = new Date('2026-07-15T12:00:00.000Z');
const TIMEZONE = 'Europe/Berlin';
const ORG_A = 'org-a';
const VEHICLE_A = 'vehicle-a';
const VEHICLE_B = 'vehicle-b';

function row(
  overrides: Partial<VehicleBookingQueryRow> & {
    id: string;
    vehicleId?: string;
    status: BookingStatus;
    startDate: Date;
    endDate: Date;
  },
): VehicleBookingQueryRow {
  return {
    vehicleId: VEHICLE_A,
    organizationId: ORG_A,
    kmIncluded: null,
    kmDriven: null,
    pickupStationId: null,
    returnStationId: null,
    customerLabel: 'Test Customer',
    pickupStationName: null,
    returnStationName: null,
    ...overrides,
  };
}

function assembleForVehicle(
  bookings: VehicleBookingQueryRow[],
  vehicleId = VEHICLE_A,
) {
  return assembleVehicleBookingContext({
    vehicleId,
    bookings,
    evaluationAt: EVALUATION_AT,
    organizationTimezone: TIMEZONE,
  });
}

describe('vehicle-booking-context.assembler', () => {
  describe('compareBookingsByPickupStable', () => {
    it('sorts by pickup time then stable id', () => {
      const sameStart = new Date('2026-08-01T10:00:00.000Z');
      const sorted = [
        row({
          id: 'b-z',
          status: 'CONFIRMED',
          startDate: sameStart,
          endDate: new Date('2026-08-05T10:00:00.000Z'),
        }),
        row({
          id: 'b-a',
          status: 'CONFIRMED',
          startDate: sameStart,
          endDate: new Date('2026-08-05T10:00:00.000Z'),
        }),
        row({
          id: 'b-mid',
          status: 'CONFIRMED',
          startDate: new Date('2026-08-02T10:00:00.000Z'),
          endDate: new Date('2026-08-06T10:00:00.000Z'),
        }),
      ].sort(compareBookingsByPickupStable);

      expect(sorted.map((b) => b.id)).toEqual(['b-a', 'b-z', 'b-mid']);
    });
  });

  describe('table-driven booking context assembly', () => {
    type CaseExpect = {
      activeId?: string | null;
      reservationId?: string | null;
      nextId?: string | null;
      futureCount?: number;
      activePhase?: string;
      nextPhase?: string;
    };

    const cases: Array<{
      name: string;
      bookings: VehicleBookingQueryRow[];
      expect: CaseExpect;
    }> = [
      {
        name: 'active booking',
        bookings: [
          row({
            id: 'b-active',
            status: 'ACTIVE',
            startDate: new Date('2026-07-10T08:00:00.000Z'),
            endDate: new Date('2026-07-20T18:00:00.000Z'),
            kmDriven: 120,
          }),
        ],
        expect: {
          activeId: 'b-active',
          reservationId: null,
          nextId: null,
          futureCount: 0,
          activePhase: 'active_rental',
        },
      },
      {
        name: 'one future booking',
        bookings: [
          row({
            id: 'b-future',
            status: 'CONFIRMED',
            startDate: new Date('2026-08-01T10:00:00.000Z'),
            endDate: new Date('2026-08-06T18:00:00.000Z'),
          }),
        ],
        expect: {
          activeId: null,
          reservationId: null,
          nextId: 'b-future',
          futureCount: 0,
          nextPhase: 'future',
        },
      },
      {
        name: 'multiple future bookings',
        bookings: [
          row({
            id: 'b-future-2',
            status: 'CONFIRMED',
            startDate: new Date('2026-09-01T10:00:00.000Z'),
            endDate: new Date('2026-09-06T18:00:00.000Z'),
          }),
          row({
            id: 'b-future-1',
            status: 'CONFIRMED',
            startDate: new Date('2026-08-01T10:00:00.000Z'),
            endDate: new Date('2026-08-06T18:00:00.000Z'),
          }),
        ],
        expect: {
          activeId: null,
          nextId: 'b-future-1',
          futureCount: 1,
        },
      },
      {
        name: 'cancelled booking omitted from input rows',
        bookings: [],
        expect: {
          activeId: null,
          nextId: null,
          futureCount: 0,
        },
      },
      {
        name: 'same start time picks stable id',
        bookings: [
          row({
            id: 'b-same-z',
            status: 'CONFIRMED',
            startDate: new Date('2026-08-01T10:00:00.000Z'),
            endDate: new Date('2026-08-03T10:00:00.000Z'),
          }),
          row({
            id: 'b-same-a',
            status: 'CONFIRMED',
            startDate: new Date('2026-08-01T10:00:00.000Z'),
            endDate: new Date('2026-08-04T10:00:00.000Z'),
          }),
        ],
        expect: {
          nextId: 'b-same-a',
          futureCount: 1,
        },
      },
      {
        name: 'active booking excludes same id from next',
        bookings: [
          row({
            id: 'b-active',
            status: 'ACTIVE',
            startDate: new Date('2026-07-10T08:00:00.000Z'),
            endDate: new Date('2026-07-20T18:00:00.000Z'),
          }),
          row({
            id: 'b-future',
            status: 'CONFIRMED',
            startDate: new Date('2026-08-01T10:00:00.000Z'),
            endDate: new Date('2026-08-06T18:00:00.000Z'),
          }),
        ],
        expect: {
          activeId: 'b-active',
          nextId: 'b-future',
          futureCount: 0,
        },
      },
      {
        name: 'return completed — no operational rows',
        bookings: [],
        expect: {
          activeId: null,
          nextId: null,
          futureCount: 0,
        },
      },
      {
        name: 'expired CONFIRMED not in future queue',
        bookings: [
          row({
            id: 'b-expired',
            status: 'CONFIRMED',
            startDate: new Date('2026-06-01T10:00:00.000Z'),
            endDate: new Date('2026-07-01T10:00:00.000Z'),
          }),
        ],
        expect: {
          nextId: null,
          futureCount: 0,
        },
      },
    ];

    it.each(cases)('$name', ({ bookings, expect: exp }) => {
      const state = assembleForVehicle([...bookings]);
      expect(state.activeBooking?.id ?? null).toBe(exp.activeId ?? null);
      expect(state.reservationWindowBooking?.id ?? null).toBe(
        exp.reservationId ?? null,
      );
      expect(state.nextBooking?.id ?? null).toBe(exp.nextId ?? null);
      expect(state.futureBookingCount).toBe(exp.futureCount ?? 0);
      if (exp.activePhase) {
        expect(state.activeBooking?.phase).toBe(exp.activePhase);
      }
      if (exp.nextPhase) {
        expect(state.nextBooking?.phase).toBe(exp.nextPhase);
      }
      expect(state.dataQualityState).toBe('RELIABLE');
    });
  });

  describe('tenant / vehicle separation', () => {
    it('does not mix bookings across vehicle ids', () => {
      const bookings = [
        row({
          id: 'b-v1',
          vehicleId: VEHICLE_A,
          status: 'ACTIVE',
          startDate: new Date('2026-07-10T08:00:00.000Z'),
          endDate: new Date('2026-07-20T18:00:00.000Z'),
        }),
        row({
          id: 'b-v2',
          vehicleId: VEHICLE_B,
          status: 'CONFIRMED',
          startDate: new Date('2026-08-01T10:00:00.000Z'),
          endDate: new Date('2026-08-06T18:00:00.000Z'),
        }),
      ];

      const map = assembleBookingContextMap({
        vehicleIds: [VEHICLE_A, VEHICLE_B],
        bookings,
        evaluationAt: EVALUATION_AT,
        organizationTimezone: TIMEZONE,
      });

      expect(map.get(VEHICLE_A)?.activeBooking?.id).toBe('b-v1');
      expect(map.get(VEHICLE_A)?.nextBooking).toBeNull();
      expect(map.get(VEHICLE_B)?.activeBooking).toBeNull();
      expect(map.get(VEHICLE_B)?.nextBooking?.id).toBe('b-v2');
    });

    it('scopes assembly to requested vehicleId even when extra rows present', () => {
      const bookings = [
        row({
          id: 'b-other-vehicle',
          vehicleId: VEHICLE_B,
          status: 'CONFIRMED',
          startDate: new Date('2026-08-01T10:00:00.000Z'),
          endDate: new Date('2026-08-06T18:00:00.000Z'),
        }),
      ];

      const state = assembleForVehicle(bookings, VEHICLE_A);
      expect(state.activeBooking).toBeNull();
      expect(state.nextBooking).toBeNull();
    });
  });

  describe('data quality signals', () => {
    it('flags multiple ACTIVE bookings while picking earliest', () => {
      const state = assembleForVehicle([
        row({
          id: 'b-active-2',
          status: 'ACTIVE',
          startDate: new Date('2026-07-12T08:00:00.000Z'),
          endDate: new Date('2026-07-22T18:00:00.000Z'),
        }),
        row({
          id: 'b-active-1',
          status: 'ACTIVE',
          startDate: new Date('2026-07-10T08:00:00.000Z'),
          endDate: new Date('2026-07-20T18:00:00.000Z'),
        }),
      ]);

      expect(state.activeBooking?.id).toBe('b-active-1');
      expect(state.dataQualityReasons).toContain('MULTIPLE_ACTIVE_BOOKINGS');
    });
  });

  describe('reservation window placeholder (Prompt 10)', () => {
    it('leaves reservationWindowBooking null until window logic lands', () => {
      const state = assembleForVehicle([
        row({
          id: 'b-pickup-today',
          status: 'CONFIRMED',
          startDate: new Date('2026-07-15T08:00:00.000Z'),
          endDate: new Date('2026-07-20T18:00:00.000Z'),
        }),
      ]);

      expect(state.reservationWindowBooking).toBeNull();
      expect(state.nextBooking?.id).toBe('b-pickup-today');
      expect(state.nextBooking?.phase).toBe('future');
    });
  });
});
