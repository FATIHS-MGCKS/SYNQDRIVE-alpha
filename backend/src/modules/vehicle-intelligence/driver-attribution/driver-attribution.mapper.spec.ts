import { DriverAttributionType } from '@prisma/client';
import {
  mapTripAttributionToDriverAttributionType,
  resolveDriverIdForAttribution,
} from './driver-attribution.mapper';

describe('driver-attribution.mapper', () => {
  it('maps explicit booking with confirmed driver separately from customer', () => {
    const type = mapTripAttributionToDriverAttributionType(
      { scope: 'BOOKING_ASSIGNED', attributionType: 'CONFIRMED_DRIVER' as any },
      {
        bookingCustomerId: 'corp-contact',
        assignedDriverId: 'employee-driver',
        actualDriverId: 'employee-driver',
      },
    );
    expect(type).toBe(DriverAttributionType.CONFIRMED_DRIVER);
    expect(
      resolveDriverIdForAttribution({
        roles: {
          actualDriverId: 'employee-driver',
          assignedDriverId: 'employee-driver',
        },
      }),
    ).toBe('employee-driver');
  });

  it('maps time-window hint without driver mirror', () => {
    const type = mapTripAttributionToDriverAttributionType(
      { scope: 'BOOKING_TIME_WINDOW_MATCH', attributionType: 'BOOKING_CUSTOMER' as any },
      {
        bookingCustomerId: 'cust-1',
        assignedDriverId: null,
        actualDriverId: null,
      },
    );
    expect(type).toBe(DriverAttributionType.TIME_WINDOW_MATCH);
    expect(
      resolveDriverIdForAttribution({
        roles: { actualDriverId: null, assignedDriverId: null },
      }),
    ).toBeNull();
  });
});
