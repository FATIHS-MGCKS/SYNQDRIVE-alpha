import { Test } from '@nestjs/testing';
import { VEHICLE_INTELLIGENCE_RENTAL_HEALTH_READ_PORT } from '@modules/vehicle-intelligence/ports/vehicle-intelligence-rental-health-read.port';
import { VehicleIntelligenceRentalHealthReadAdapter } from '@modules/rental-health/vehicle-intelligence-rental-health-read/vehicle-intelligence-rental-health-read.adapter';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { AiGetVehicleHealthSummaryTool } from './tools/get-vehicle-health-summary/ai-get-vehicle-health-summary.tool';

/**
 * Composition slice: mirrors AiModule import of VehicleIntelligenceRentalHealthReadModule
 * token binding + tool constructor inject. Full AiModule bootstrap is not run here
 * (Redis, Vehicles, VI forwardRef graph — see independent review evidence).
 */
describe('AiModule rental health read port — composition slice', () => {
  it('resolves port via useExisting adapter (same binding as VehicleIntelligenceRentalHealthReadModule)', async () => {
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

  it('AiGetVehicleHealthSummaryTool constructor accepts injected port token', () => {
    const port = { getVehicleHealth: jest.fn() };
    const tool = new AiGetVehicleHealthSummaryTool(
      {} as never,
      port,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(tool).toBeDefined();
  });
});