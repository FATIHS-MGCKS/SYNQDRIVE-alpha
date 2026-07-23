import { collectBookingUpdatePermissionActions } from './booking-update-permission.util';

describe('collectBookingUpdatePermissionActions', () => {
  it('always includes booking.update', () => {
    expect(collectBookingUpdatePermissionActions({})).toEqual(['booking.update']);
  });

  it('adds schedule action for date fields', () => {
    expect(collectBookingUpdatePermissionActions({ startDate: '2026-01-01' })).toContain(
      'booking.update_schedule',
    );
  });

  it('adds customer action for customerId', () => {
    expect(collectBookingUpdatePermissionActions({ customerId: 'c1' })).toContain(
      'booking.update_customer',
    );
  });

  it('adds vehicle action for vehicleId', () => {
    expect(collectBookingUpdatePermissionActions({ vehicleId: 'v1' })).toContain(
      'booking.update_vehicle',
    );
  });

  it('adds confirm action for CONFIRMED status', () => {
    expect(collectBookingUpdatePermissionActions({ status: 'CONFIRMED' })).toContain(
      'booking.confirm',
    );
  });

  it('adds cancel action for CANCELLED status', () => {
    expect(collectBookingUpdatePermissionActions({ status: 'CANCELLED' })).toContain(
      'booking.cancel',
    );
  });

  it('adds mark_no_show action for NO_SHOW status', () => {
    expect(collectBookingUpdatePermissionActions({ status: 'NO_SHOW' })).toContain(
      'booking.mark_no_show',
    );
  });
});
