import { resolveBookingDriverPool } from './booking-allowed-drivers.util';

describe('booking-allowed-drivers.util', () => {
  it('builds pool from primary assigned driver and additional rows', () => {
    const pool = resolveBookingDriverPool({
      bookingCustomerId: 'corp-contract',
      assignedDriverId: 'driver-main',
      allowedRows: [
        { customerId: 'driver-main', role: 'PRIMARY' },
        { customerId: 'driver-extra', role: 'ADDITIONAL' },
      ],
    });

    expect(pool.primaryDriverId).toBe('driver-main');
    expect(pool.additionalDriverIds).toEqual(['driver-extra']);
    expect(pool.allowedDriverIds).toEqual(['driver-main', 'driver-extra']);
    expect(pool.bookingCustomerId).toBe('corp-contract');
  });

  it('falls back to assignedDriverId when no PRIMARY row exists', () => {
    const pool = resolveBookingDriverPool({
      bookingCustomerId: 'cust-1',
      assignedDriverId: 'legacy-primary',
      allowedRows: [{ customerId: 'driver-extra', role: 'ADDITIONAL' }],
    });

    expect(pool.primaryDriverId).toBe('legacy-primary');
    expect(pool.allowedDriverIds).toEqual(['legacy-primary', 'driver-extra']);
  });
});
