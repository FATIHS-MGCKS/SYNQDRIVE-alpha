import { Test } from '@nestjs/testing';
import { AI_VEHICLE_BOOKING_CONTEXT_READ_PORT } from '@modules/ai/ports/ai-vehicle-booking-context-read.port';
import { AiVehicleBookingContextReadAdapter } from './ai-vehicle-booking-context-read.adapter';
import { VehicleBookingContextService } from '../vehicle-booking-context/vehicle-booking-context.service';

describe('AiVehicleBookingContextReadModule — token binding', () => {
  it('resolves AI_VEHICLE_BOOKING_CONTEXT_READ_PORT to the adapter (useExisting)', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AiVehicleBookingContextReadAdapter,
        {
          provide: VehicleBookingContextService,
          useValue: { getVehicleBookingOperationalContext: jest.fn() },
        },
        {
          provide: AI_VEHICLE_BOOKING_CONTEXT_READ_PORT,
          useExisting: AiVehicleBookingContextReadAdapter,
        },
      ],
    }).compile();

    const port = moduleRef.get(AI_VEHICLE_BOOKING_CONTEXT_READ_PORT);
    expect(port).toBeInstanceOf(AiVehicleBookingContextReadAdapter);
    await moduleRef.close();
  });
});