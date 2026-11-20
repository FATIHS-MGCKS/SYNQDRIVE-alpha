import { VehicleIntelligenceBookingDriverPoolAdapter } from './vehicle-intelligence-booking-driver-pool.adapter';
import {
  isDriverInBookingPool,
  resolveBookingDriverPool,
} from '../booking-allowed-drivers/booking-allowed-drivers.util';

describe('VehicleIntelligenceBookingDriverPoolAdapter', () => {
  const adapter = new VehicleIntelligenceBookingDriverPoolAdapter();

  it('matches resolveBookingDriverPool utility (PRIMARY + ADDITIONAL + dedup)', () => {
    const input = {
      bookingCustomerId: 'cust-1',
      assignedDriverId: 'assigned-fallback',
      allowedRows: [
        { customerId: 'primary-1', role: 'PRIMARY' as const },
        { customerId: 'add-1', role: 'ADDITIONAL' as const },
        { customerId: 'primary-1', role: 'ADDITIONAL' as const },
      ],
    };
    expect(adapter.resolveBookingDriverPool(input)).toEqual(resolveBookingDriverPool(input));
    expect(adapter.resolveBookingDriverPool(input).allowedDriverIds).toEqual(['primary-1', 'add-1']);
  });

  it('matches assignedDriverId fallback when no PRIMARY row', () => {
    const input = {
      bookingCustomerId: 'cust-1',
      assignedDriverId: 'driver-assigned',
      allowedRows: [{ customerId: 'add-1', role: 'ADDITIONAL' as const }],
    };
    const pool = adapter.resolveBookingDriverPool(input);
    expect(pool.primaryDriverId).toBe('driver-assigned');
    expect(pool).toEqual(resolveBookingDriverPool(input));
  });

  it('matches isDriverInBookingPool including empty-pool allow-all semantics', () => {
    const emptyPool = { allowedDriverIds: [] as string[] };
    expect(adapter.isDriverInBookingPool('any', emptyPool)).toBe(
      isDriverInBookingPool('any', emptyPool),
    );
    expect(adapter.isDriverInBookingPool(null, { allowedDriverIds: ['a'] })).toBe(false);
  });
});