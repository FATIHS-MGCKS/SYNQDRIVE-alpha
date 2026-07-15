import { describe, expect, it } from 'vitest';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
  selectActiveBooking,
  selectCanBeConsideredForRentalReadiness,
  selectFutureBookingCount,
  selectIsCurrentlyAvailable,
  selectIsCurrentlyRented,
  selectIsInPickupReservationWindow,
  selectIsStatusReliable,
  selectNextBooking,
  selectOperationalStatus,
  selectOperationalStatusLabel,
  selectOperationalStatusReason,
  selectReservedBooking,
  type VehicleOperationalReadModel,
} from './index';

const BOOKING_REF = {
  bookingId: 'bk-1',
  customerName: 'Max Mustermann',
  pickupAt: '2026-07-15T08:00:00.000Z',
  returnAt: '2026-07-16T08:00:00.000Z',
  pickupStationName: 'Berlin',
  returnStationName: 'Berlin',
  isOverdue: false,
};

function vehicle(
  overrides: Partial<VehicleOperationalReadModel> = {},
): VehicleOperationalReadModel {
  return {
    status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    isReliable: true,
    ...overrides,
  };
}

describe('selectOperationalStatus', () => {
  it.each([
    [VEHICLE_OPERATIONAL_STATUS.AVAILABLE, VEHICLE_OPERATIONAL_STATUS.AVAILABLE],
    [VEHICLE_OPERATIONAL_STATUS.RESERVED, VEHICLE_OPERATIONAL_STATUS.RESERVED],
    [VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED, VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED],
    [VEHICLE_OPERATIONAL_STATUS.MAINTENANCE, VEHICLE_OPERATIONAL_STATUS.MAINTENANCE],
    [VEHICLE_OPERATIONAL_STATUS.BLOCKED, VEHICLE_OPERATIONAL_STATUS.BLOCKED],
    [VEHICLE_OPERATIONAL_STATUS.UNKNOWN, VEHICLE_OPERATIONAL_STATUS.UNKNOWN],
  ])('returns canonical status %s', (status, expected) => {
    expect(
      selectOperationalStatus(
        vehicle({
          status,
          operationalState: {
            status,
            reason: null,
            source: 'test',
            effectiveFrom: null,
            effectiveUntil: null,
            derivedAt: null,
            dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
            dataQualityReasons: [],
            isReliable: true,
          },
        }),
      ),
    ).toBe(expected);
  });

  it('normalizes legacy flat display status when operationalState is absent', () => {
    expect(
      selectOperationalStatus(
        vehicle({
          status: 'Available' as unknown as typeof VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
        }),
      ),
    ).toBe(VEHICLE_OPERATIONAL_STATUS.AVAILABLE);
    expect(
      selectOperationalStatus(
        vehicle({
          status: 'Active Rented' as unknown as typeof VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
        }),
      ),
    ).toBe(VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED);
  });

  it('prefers operationalState.status over flat status', () => {
    expect(
      selectOperationalStatus(
        vehicle({
          status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
          operationalState: {
            status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
            reason: null,
            source: null,
            effectiveFrom: null,
            effectiveUntil: null,
            derivedAt: null,
            dataQualityState: null,
            dataQualityReasons: [],
            isReliable: true,
          },
        }),
      ),
    ).toBe(VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED);
  });

  it('returns UNKNOWN for unreliable AVAILABLE', () => {
    expect(
      selectOperationalStatus(
        vehicle({
          status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
          isReliable: false,
          operationalState: {
            status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
            reason: null,
            source: null,
            effectiveFrom: null,
            effectiveUntil: null,
            derivedAt: null,
            dataQualityState: VEHICLE_DATA_QUALITY_STATE.DEGRADED,
            dataQualityReasons: [],
            isReliable: false,
          },
        }),
      ),
    ).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
  });

  it('returns UNKNOWN on inconsistent legacy payload (AVAILABLE + active booking)', () => {
    expect(
      selectOperationalStatus(
        vehicle({
          status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
          activeBookingId: 'bk-active',
        }),
      ),
    ).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
  });

  it('returns UNKNOWN on inconsistent legacy payload (RESERVED + active booking)', () => {
    expect(
      selectOperationalStatus(
        vehicle({
          status: VEHICLE_OPERATIONAL_STATUS.RESERVED,
          activeBookingId: 'bk-active',
        }),
      ),
    ).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
  });
});

describe('selectOperationalStatusLabel', () => {
  it('delegates to display utility without embedding business strings', () => {
    expect(
      selectOperationalStatusLabel(
        vehicle({ status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED }),
        'de',
      ),
    ).toBe('Aktiv vermietet');
    expect(
      selectOperationalStatusLabel(
        vehicle({ status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN }),
        'en',
      ),
    ).toBe('Unknown');
  });
});

describe('selectOperationalStatusReason', () => {
  it('reads reason from operationalState', () => {
    expect(
      selectOperationalStatusReason({
        operationalState: {
          status: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
          reason: 'SCHEDULED_SERVICE',
          source: null,
          effectiveFrom: null,
          effectiveUntil: null,
          derivedAt: null,
          dataQualityState: null,
          dataQualityReasons: [],
          isReliable: true,
        },
      }),
    ).toBe('SCHEDULED_SERVICE');
  });
});

describe('selectIsStatusReliable', () => {
  it('is false when data quality is UNAVAILABLE', () => {
    expect(
      selectIsStatusReliable({
        operationalState: {
          status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
          reason: null,
          source: null,
          effectiveFrom: null,
          effectiveUntil: null,
          derivedAt: null,
          dataQualityState: VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE,
          dataQualityReasons: [],
          isReliable: true,
        },
      }),
    ).toBe(false);
  });
});

describe('availability and rental readiness selectors', () => {
  it('UNKNOWN is never available', () => {
    expect(selectIsCurrentlyAvailable(vehicle({ status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN }))).toBe(
      false,
    );
    expect(selectCanBeConsideredForRentalReadiness(vehicle({ status: VEHICLE_OPERATIONAL_STATUS.UNKNOWN }))).toBe(
      false,
    );
  });

  it('AVAILABLE + reliable is available and rental-ready', () => {
    const v = vehicle({ status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE, isReliable: true });
    expect(selectIsCurrentlyAvailable(v)).toBe(true);
    expect(selectCanBeConsideredForRentalReadiness(v)).toBe(true);
  });

  it('AVAILABLE without reliability is not available', () => {
    const v = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
      isReliable: false,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
        reason: null,
        source: null,
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: null,
        dataQualityState: VEHICLE_DATA_QUALITY_STATE.DEGRADED,
        dataQualityReasons: [],
        isReliable: false,
      },
    });
    expect(selectIsCurrentlyAvailable(v)).toBe(false);
  });

  it('selectIsInPickupReservationWindow follows RESERVED status only', () => {
    expect(
      selectIsInPickupReservationWindow(vehicle({ status: VEHICLE_OPERATIONAL_STATUS.RESERVED })),
    ).toBe(true);
    expect(
      selectIsInPickupReservationWindow(
        vehicle({
          status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
          bookingContext: {
            activeBooking: null,
            reservedBooking: null,
            nextBooking: BOOKING_REF,
            futureBookingCount: 1,
          },
        }),
      ),
    ).toBe(false);
  });

  it('selectIsCurrentlyRented requires ACTIVE_RENTED status', () => {
    expect(
      selectIsCurrentlyRented(
        vehicle({
          status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
          activeBookingId: 'bk-orphan',
        }),
      ),
    ).toBe(false);
    expect(
      selectIsCurrentlyRented(vehicle({ status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED })),
    ).toBe(true);
  });
});

describe('booking selectors', () => {
  it('selectActiveBooking returns booking only when status confirms ACTIVE_RENTED', () => {
    const rented = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
      bookingContext: {
        activeBooking: BOOKING_REF,
        reservedBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
      },
    });
    expect(selectActiveBooking(rented)?.bookingId).toBe('bk-1');

    const inconsistent = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
      bookingContext: {
        activeBooking: BOOKING_REF,
        reservedBooking: null,
        nextBooking: null,
        futureBookingCount: 0,
      },
    });
    expect(selectActiveBooking(inconsistent)).toBeNull();
  });

  it('selectReservedBooking returns booking only when status confirms RESERVED', () => {
    const reserved = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.RESERVED,
      bookingContext: {
        activeBooking: null,
        reservedBooking: BOOKING_REF,
        nextBooking: null,
        futureBookingCount: 0,
      },
    });
    expect(selectReservedBooking(reserved)?.bookingId).toBe('bk-1');

    const nextOnly = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
      bookingContext: {
        activeBooking: null,
        reservedBooking: null,
        nextBooking: BOOKING_REF,
        futureBookingCount: 1,
      },
    });
    expect(selectReservedBooking(nextOnly)).toBeNull();
  });

  it('selectNextBooking is independent from reserved window', () => {
    const v = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
      bookingContext: {
        activeBooking: null,
        reservedBooking: null,
        nextBooking: { ...BOOKING_REF, bookingId: 'bk-next' },
        futureBookingCount: 2,
      },
    });
    expect(selectNextBooking(v)?.bookingId).toBe('bk-next');
    expect(selectReservedBooking(v)).toBeNull();
    expect(selectFutureBookingCount(v)).toBe(2);
  });

  it('reads legacy flat booking fields when bookingContext is absent', () => {
    const legacy = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.RESERVED,
      reservedBookingId: 'bk-legacy',
      reservedCustomerName: 'Legacy Kunde',
      reservedPickupAt: '2026-07-15T09:00:00.000Z',
    });
    expect(selectReservedBooking(legacy)?.bookingId).toBe('bk-legacy');
    expect(selectReservedBooking(legacy)?.customerName).toBe('Legacy Kunde');
  });

  it('trusts ACTIVE_RENTED without booking id when operationalState confirms', () => {
    const v = vehicle({
      status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
      operationalState: {
        status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
        reason: 'ACTIVE_BOOKING',
        source: 'fleet-read-model',
        effectiveFrom: null,
        effectiveUntil: null,
        derivedAt: null,
        dataQualityState: VEHICLE_DATA_QUALITY_STATE.RELIABLE,
        dataQualityReasons: [],
        isReliable: true,
      },
    });
    expect(selectIsCurrentlyRented(v)).toBe(true);
    expect(selectActiveBooking(v)).toBeNull();
  });
});
