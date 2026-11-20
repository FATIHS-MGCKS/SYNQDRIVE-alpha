import { Test } from '@nestjs/testing';
import { VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT } from '@modules/vehicle-intelligence/ports/vehicle-intelligence-rental-health-read.port';
import { VehicleIntelligenceRentalHealthReadAdapter } from '@modules/rental-health/vehicle-intelligence-rental-health-read/vehicle-intelligence-rental-health-read.adapter';

describe('AiModule rental health read port wiring (composition slice)', () => {
  it('resolves VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT via useExisting adapter', async () => {
    const rentalHealth = { getVehicleHealth: jest.fn() };
    const adapter = new VehicleIntelligenceRentalHealthReadAdapter(rentalHealth as never);

    const moduleRef = await Test.createTestingModule({
      providers: [
        VehicleIntelligenceRentalHealthReadAdapter,
        {
          provide: VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT,
          useExisting: VehicleIntelligenceRentalHealthReadAdapter,
        },
      ],
    })
      .overrideProvider(VehicleIntelligenceRentalHealthReadAdapter)
      .useValue(adapter)
      .compile();

    const port = moduleRef.get(VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT);
    expect(port).toBe(adapter);
  });
});