import { Test } from '@nestjs/testing';
import { VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT } from '@modules/vehicle-intelligence/ports/vehicle-intelligence-rental-health-read.port';
import { VehicleIntelligenceRentalHealthReadAdapter } from './vehicle-intelligence-rental-health-read.adapter';
import { RentalHealthService } from '../rental-health.service';

describe('VehicleIntelligenceRentalHealthReadModule — token binding', () => {
  it('resolves VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT to the adapter (useExisting)', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        VehicleIntelligenceRentalHealthReadAdapter,
        {
          provide: RentalHealthService,
          useValue: { getVehicleHealth: jest.fn() },
        },
        {
          provide: VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT,
          useExisting: VehicleIntelligenceRentalHealthReadAdapter,
        },
      ],
    }).compile();

    const port = moduleRef.get(VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT);
    expect(port).toBeInstanceOf(VehicleIntelligenceRentalHealthReadAdapter);
    await moduleRef.close();
  });
});