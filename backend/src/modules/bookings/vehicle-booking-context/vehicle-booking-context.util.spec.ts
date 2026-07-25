import type { BookingStatus } from '@prisma/client';
import { emptyFleetBookingContext } from '@modules/vehicles/operational/fleet-booking-context.util';
import { buildFleetOperationalStateDto } from '@modules/vehicles/operational/fleet-operational-state.util';
import { buildVehicleBookingOperationalContext } from './vehicle-booking-context.util';
import {
  VEHICLE_BOOKING_CONTEXT_KIND,
  VEHICLE_BOOKING_CONTEXT_REASON_CODE,
  VEHICLE_BOOKING_INCONSISTENCY_FLAG,
  VEHICLE_BOOKING_PROCESS_STEP,
} from './vehicle-booking-context.constants';
import type { VehicleBookingContextRow } from './vehicle-booking-context.types';

const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';
const BOOKING_ACTIVE = '33333333-3333-4333-8333-333333333333';
const BOOKING_RESERVED = '44444444-4444-4444-8444-444444444444';
const BOOKING_UPCOMING = '55555555-5555-4555-8555-555555555555';

function row(
  overrides: Partial<VehicleBookingContextRow> & { id: string },
): VehicleBookingContextRow {
  const start = new Date('2026-07-20T08:00:00.000Z');
  const end = new Date('2026-07-24T10:00:00.000Z');
  return {
    vehicleId: VEHICLE_ID,
    status: 'ACTIVE' as BookingStatus,
    startDate: start,
    endDate: end,
    kmIncluded: null,
    kmDriven: null,
    pickupStationId: 'pickup-station',
    returnStationId: 'return-station',
    actualPickupStationId: null,
    actualReturnStationId: null,
    customer: { firstName: 'Max', lastName: 'Mustermann', company: null },
    originalScheduledReturnAt: end,
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<Parameters<typeof buildVehicleBookingOperationalContext>[0]> = {},
) {
  const now = new Date('2026-07-24T12:00:00.000Z');
  const rows: VehicleBookingContextRow[] = [...(overrides.rows ?? [])];
  const fleetFlat = overrides.fleetFlat ?? emptyFleetBookingContext();
  const supplement = overrides.supplement ?? {
    nextBookingId: null,
    nextBookingCustomerName: null,
    nextBookingPickupAt: null,
    nextBookingReturnAt: null,
    nextBookingPickupStationName: null,
    futureBookingCount: 0,
  };

  return {
    vehicleId: VEHICLE_ID,
    vehicleStatus: 'AVAILABLE',
    operationalState: buildFleetOperationalStateDto({ displayStatus: 'Available' }),
    runtimeState: 'Available',
    rows,
    pickupProtocolByBookingId: overrides.pickupProtocolByBookingId ?? new Map(),
    returnProtocolByBookingId: overrides.returnProtocolByBookingId ?? new Map(),
    fleetFlat,
    supplement,
    stationMap: overrides.stationMap ?? new Map([['return-station', 'Hannover']]),
    fmtCustomer: () => 'Max Mustermann',
    orgTimezone: 'Europe/Berlin',
    now,
    includeCustomerDisplayName: false,
    ...overrides,
  };
}

describe('buildVehicleBookingOperationalContext', () => {
  it('describes active booking with overdue return', () => {
    const active = row({ id: BOOKING_ACTIVE, endDate: new Date('2026-07-24T10:00:00.000Z') });
    const fleetFlat = {
      ...emptyFleetBookingContext(),
      activeBookingId: BOOKING_ACTIVE,
      activeIsOverdue: true,
    };
    const pickup = new Map([[BOOKING_ACTIVE, { performedAt: new Date('2026-07-20T08:30:00.000Z') }]]);

    const result = buildVehicleBookingOperationalContext(
      baseInput({
        rows: [active],
        fleetFlat,
        pickupProtocolByBookingId: pickup,
      }),
    );

    expect(result.contextKind).toBe(VEHICLE_BOOKING_CONTEXT_KIND.ACTIVE_RENTED);
    expect(result.currentBooking?.bookingId).toBe(BOOKING_ACTIVE);
    expect(result.returnOverdue).toBe(true);
    expect(result.openProcessSteps).toContain(VEHICLE_BOOKING_PROCESS_STEP.RETURN_OVERDUE);
    expect(result.reasonCodes).toContain(
      VEHICLE_BOOKING_CONTEXT_REASON_CODE.RETURN_OVERDUE,
    );
  });

  it('describes upcoming booking when no active or reserved', () => {
    const upcoming = row({
      id: BOOKING_UPCOMING,
      status: 'PENDING',
      startDate: new Date('2026-08-01T08:00:00.000Z'),
      endDate: new Date('2026-08-05T10:00:00.000Z'),
    });

    const result = buildVehicleBookingOperationalContext(
      baseInput({
        rows: [upcoming],
        supplement: {
          nextBookingId: BOOKING_UPCOMING,
          nextBookingCustomerName: 'Max Mustermann',
          nextBookingPickupAt: upcoming.startDate.toISOString(),
          nextBookingReturnAt: upcoming.endDate.toISOString(),
          nextBookingPickupStationName: 'Hannover',
          futureBookingCount: 1,
        },
      }),
    );

    expect(result.contextKind).toBe(VEHICLE_BOOKING_CONTEXT_KIND.UPCOMING);
    expect(result.upcomingBooking?.bookingId).toBe(BOOKING_UPCOMING);
    expect(result.currentBooking).toBeNull();
  });

  it('respects approved extension via endDate patch', () => {
    const originalEnd = new Date('2026-07-24T10:00:00.000Z');
    const extendedEnd = new Date('2026-07-25T10:00:00.000Z');
    const active = row({
      id: BOOKING_ACTIVE,
      endDate: extendedEnd,
      originalScheduledReturnAt: originalEnd,
    });

    const result = buildVehicleBookingOperationalContext(
      baseInput({
        rows: [active],
        fleetFlat: { ...emptyFleetBookingContext(), activeBookingId: BOOKING_ACTIVE },
        pickupProtocolByBookingId: new Map([
          [BOOKING_ACTIVE, { performedAt: new Date('2026-07-20T08:30:00.000Z') }],
        ]),
      }),
    );

    expect(result.currentBooking?.extensionStatus).toBe('APPLIED_VIA_END_DATE_PATCH');
    expect(result.returnOverdue).toBe(false);
    expect(result.reasonCodes).toContain(VEHICLE_BOOKING_CONTEXT_REASON_CODE.EXTENSION_APPLIED);
  });

  it('flags completed return with booking still active', () => {
    const active = row({ id: BOOKING_ACTIVE });
    const ret = new Map([[BOOKING_ACTIVE, { performedAt: new Date('2026-07-24T11:00:00.000Z') }]]);

    const result = buildVehicleBookingOperationalContext(
      baseInput({
        rows: [active],
        fleetFlat: { ...emptyFleetBookingContext(), activeBookingId: BOOKING_ACTIVE },
        returnProtocolByBookingId: ret,
      }),
    );

    expect(result.inconsistencyFlags).toContain(
      VEHICLE_BOOKING_INCONSISTENCY_FLAG.RETURN_COMPLETED_BOOKING_STILL_ACTIVE,
    );
    expect(result.currentBooking?.returnStatus).toBe('COMPLETED');
    expect(result.returnOverdue).toBe(false);
  });

  it('describes reserved booking with pickup overdue', () => {
    const reserved = row({
      id: BOOKING_RESERVED,
      status: 'CONFIRMED',
      startDate: new Date('2026-07-24T09:00:00.000Z'),
      endDate: new Date('2026-07-26T10:00:00.000Z'),
    });
    const fleetFlat = {
      ...emptyFleetBookingContext(),
      reservedBookingId: BOOKING_RESERVED,
      reservedIsOverdue: true,
    };

    const result = buildVehicleBookingOperationalContext(
      baseInput({
        rows: [reserved],
        fleetFlat,
      }),
    );

    expect(result.contextKind).toBe(VEHICLE_BOOKING_CONTEXT_KIND.RESERVED);
    expect(result.reservedBooking?.pickupOverdue).toBe(true);
    expect(result.pickupOverdue).toBe(true);
    expect(result.reasonCodes).toContain(VEHICLE_BOOKING_CONTEXT_REASON_CODE.PICKUP_OVERDUE);
  });

  it('returns none when no open booking', () => {
    const result = buildVehicleBookingOperationalContext(baseInput({ rows: [] }));

    expect(result.contextKind).toBe(VEHICLE_BOOKING_CONTEXT_KIND.NONE);
    expect(result.reasonCodes).toContain(VEHICLE_BOOKING_CONTEXT_REASON_CODE.NO_OPEN_BOOKING);
  });

  it('flags multiple active bookings', () => {
    const a1 = row({ id: BOOKING_ACTIVE, status: 'ACTIVE' });
    const a2 = row({
      id: BOOKING_RESERVED,
      status: 'ACTIVE',
      startDate: new Date('2026-07-19T08:00:00.000Z'),
    });

    const result = buildVehicleBookingOperationalContext(
      baseInput({
        rows: [a1, a2],
        fleetFlat: { ...emptyFleetBookingContext(), activeBookingId: BOOKING_ACTIVE },
      }),
    );

    expect(result.inconsistencyFlags).toContain(
      VEHICLE_BOOKING_INCONSISTENCY_FLAG.MULTIPLE_ACTIVE_BOOKINGS,
    );
  });

  it('includes customer display name only when requested', () => {
    const active = row({ id: BOOKING_ACTIVE });
    const withCustomer = buildVehicleBookingOperationalContext(
      baseInput({
        rows: [active],
        fleetFlat: { ...emptyFleetBookingContext(), activeBookingId: BOOKING_ACTIVE },
        includeCustomerDisplayName: true,
      }),
    );
    expect(withCustomer.currentBooking?.customerDisplayName).toBe('Max Mustermann');

    const withoutCustomer = buildVehicleBookingOperationalContext(
      baseInput({
        rows: [active],
        fleetFlat: { ...emptyFleetBookingContext(), activeBookingId: BOOKING_ACTIVE },
        includeCustomerDisplayName: false,
      }),
    );
    expect(withoutCustomer.currentBooking?.customerDisplayName).toBeUndefined();
  });
});
