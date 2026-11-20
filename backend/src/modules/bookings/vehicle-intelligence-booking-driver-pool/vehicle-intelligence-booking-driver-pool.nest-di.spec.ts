import { Test } from '@nestjs/testing';
import { VEHICLE_INTELLIGENCE_BOOKING_DRIVER_POOL_PORT } from '@modules/vehicle-intelligence/ports/vehicle-intelligence-booking-driver-pool.port';
import { VehicleIntelligenceBookingDriverPoolAdapter } from './vehicle-intelligence-booking-driver-pool.adapter';

describe('VehicleIntelligenceBookingDriverPoolModule — token binding', () => {
  it('resolves VEHICLE_INTELLIGENCE_BOOKING_DRIVER_POOL_PORT to adapter (useExisting)', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        VehicleIntelligenceBookingDriverPoolAdapter,
        {
          provide: VEHICLE_INTELLIGENCE_BOOKING_DRIVER_POOL_PORT,
          useExisting: VehicleIntelligenceBookingDriverPoolAdapter,
        },
      ],
    }).compile();

    const port = moduleRef.get(VEHICLE_INTELLIGENCE_BOOKING_DRIVER_POOL_PORT);
    expect(port).toBeInstanceOf(VehicleIntelligenceBookingDriverPoolAdapter);
    await moduleRef.close();
  });
});