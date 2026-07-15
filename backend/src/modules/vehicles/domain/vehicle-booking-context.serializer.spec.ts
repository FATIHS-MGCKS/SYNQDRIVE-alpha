import { VehicleStatus } from '@prisma/client';
import {
  buildVehicleOperationalStateFromEngineInput,
} from './vehicle-operational-state.builder';
import {
  projectLegacyBookingDtoFromRefs,
  serializeFleetBookingContextBlock,
} from './vehicle-booking-context.serializer';
import {
  MATRIX_BOOKINGS,
  matrixEngineInput,
} from './vehicle-operational-state.engine.test-fixtures';
import { NEUTRAL_BOOKING_DISPLAY_LABEL } from './vehicle-booking-context.types';

describe('vehicle-booking-context.serializer', () => {
  function contextFrom(input: ReturnType<typeof matrixEngineInput>) {
    const output = buildVehicleOperationalStateFromEngineInput(input);
    const count = input.bookingState.futureBookingCount ?? 0;
    return {
      output,
      bookingContext: serializeFleetBookingContextBlock(
        output.bookingContext,
        count,
      ),
    };
  }

  it('serializes active rental only in activeBooking', () => {
    const { bookingContext } = contextFrom(
      matrixEngineInput({
        bookingState: {
          activeBooking: MATRIX_BOOKINGS.activeRental,
          reservationWindowBooking: null,
          nextBooking: null,
          futureBookingCount: 0,
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
        },
      }),
    );

    expect(bookingContext.activeBooking?.id).toBe('b-active');
    expect(bookingContext.activeBooking?.phase).toBe('active_rental');
    expect(bookingContext.reservedBooking).toBeNull();
    expect(bookingContext.nextBooking).toBeNull();
    expect(bookingContext.futureBookingCount).toBe(0);
  });

  it('serializes reservation window only in reservedBooking', () => {
    const { bookingContext } = contextFrom(
      matrixEngineInput({
        bookingState: {
          activeBooking: null,
          reservationWindowBooking: MATRIX_BOOKINGS.reservationWindow,
          nextBooking: null,
          futureBookingCount: 0,
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
        },
      }),
    );

    expect(bookingContext.reservedBooking?.id).toBe('b-window');
    expect(bookingContext.reservedBooking?.phase).toBe('pickup_window');
    expect(bookingContext.activeBooking).toBeNull();
    expect(bookingContext.reservedBooking?.pickupAt).toBe(
      MATRIX_BOOKINGS.reservationWindow.pickupAt,
    );
    expect(bookingContext.reservedBooking?.returnAt).toBe(
      MATRIX_BOOKINGS.reservationWindow.returnAt,
    );
  });

  it('serializes future nextBooking when no active or reserved slot', () => {
    const { bookingContext } = contextFrom(
      matrixEngineInput({
        bookingState: {
          activeBooking: null,
          reservationWindowBooking: null,
          nextBooking: MATRIX_BOOKINGS.nextInTwoWeeks,
          futureBookingCount: 0,
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
        },
      }),
    );

    expect(bookingContext.nextBooking?.id).toBe('b-future-2w');
    expect(bookingContext.nextBooking?.phase).toBe('future');
    expect(bookingContext.activeBooking).toBeNull();
    expect(bookingContext.reservedBooking).toBeNull();
  });

  it('keeps active and next separate without duplicate ids', () => {
    const { bookingContext } = contextFrom(
      matrixEngineInput({
        bookingState: {
          activeBooking: MATRIX_BOOKINGS.activeRental,
          reservationWindowBooking: null,
          nextBooking: MATRIX_BOOKINGS.nextInTwoWeeks,
          futureBookingCount: 1,
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
        },
      }),
    );

    expect(bookingContext.activeBooking?.id).toBe('b-active');
    expect(bookingContext.nextBooking?.id).toBe('b-future-2w');
    expect(bookingContext.futureBookingCount).toBe(1);
    expect(bookingContext.reservedBooking).toBeNull();
  });

  it('keeps reserved and next separate without duplicate ids', () => {
    const { bookingContext } = contextFrom(
      matrixEngineInput({
        bookingState: {
          activeBooking: null,
          reservationWindowBooking: MATRIX_BOOKINGS.reservationWindow,
          nextBooking: MATRIX_BOOKINGS.nextTomorrowPreWindow,
          futureBookingCount: 0,
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
        },
      }),
    );

    expect(bookingContext.reservedBooking?.id).toBe('b-window');
    expect(bookingContext.nextBooking?.id).toBe('b-tomorrow');
    expect(bookingContext.activeBooking).toBeNull();
  });

  it('projects legacy flat fields from the same refs including return/start instants', () => {
    const legacy = projectLegacyBookingDtoFromRefs(
      MATRIX_BOOKINGS.activeRental,
      MATRIX_BOOKINGS.reservationWindow,
    );

    expect(legacy.activeBookingId).toBe('b-active');
    expect(legacy.activeStartAt).toBe(MATRIX_BOOKINGS.activeRental.pickupAt);
    expect(legacy.activeReturnAt).toBe(MATRIX_BOOKINGS.activeRental.returnAt);
    expect(legacy.reservedBookingId).toBe('b-window');
    expect(legacy.reservedPickupAt).toBe(
      MATRIX_BOOKINGS.reservationWindow.pickupAt,
    );
    expect(legacy.reservedReturnAt).toBe(
      MATRIX_BOOKINGS.reservationWindow.returnAt,
    );
  });

  it('uses neutral booking label with diagnostic when display ref is missing', () => {
    const { bookingContext } = contextFrom(
      matrixEngineInput({
        vehicle: {
          id: 'v-matrix-1',
          organizationId: 'org-matrix',
          rawStatus: VehicleStatus.AVAILABLE,
        },
        bookingState: {
          activeBooking: {
            ...MATRIX_BOOKINGS.activeRental,
            bookingNumber: NEUTRAL_BOOKING_DISPLAY_LABEL,
            bookingNumberDiagnostic: 'MISSING_DISPLAY_REF',
          },
          reservationWindowBooking: null,
          nextBooking: null,
          futureBookingCount: 0,
          dataQualityState: 'RELIABLE',
          dataQualityReasons: [],
        },
      }),
    );

    expect(bookingContext.activeBooking?.bookingNumber).toBe('Booking');
    expect(bookingContext.activeBooking?.bookingNumber).not.toMatch(
      /^[0-9a-f-]{8,}$/i,
    );
    expect(bookingContext.activeBooking?.bookingNumberDiagnostic).toBe(
      'MISSING_DISPLAY_REF',
    );
  });
});
