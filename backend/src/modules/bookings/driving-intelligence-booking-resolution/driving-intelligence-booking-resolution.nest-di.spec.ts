import { Test } from '@nestjs/testing';
import { DRIVING_INTELLIGENCE_BOOKING_RESOLUTION_PORT } from '@modules/vehicle-intelligence/ports/driving-intelligence-booking-resolution.port';
import { DrivingIntelligenceBookingResolutionModule } from './driving-intelligence-booking-resolution.module';
import { DrivingIntelligenceBookingResolutionPrismaAdapter } from './driving-intelligence-booking-resolution.adapter';
import { PrismaService } from '@shared/database/prisma.service';

describe('DrivingIntelligenceBookingResolutionModule — minimal module graph', () => {
  it('binds DRIVING_INTELLIGENCE_BOOKING_RESOLUTION_PORT via module exports', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DrivingIntelligenceBookingResolutionModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ booking: { findFirst: jest.fn() } })
      .compile();

    const port = moduleRef.get(DRIVING_INTELLIGENCE_BOOKING_RESOLUTION_PORT);
    expect(port).toBeInstanceOf(DrivingIntelligenceBookingResolutionPrismaAdapter);
    expect(port).toBe(moduleRef.get(DrivingIntelligenceBookingResolutionPrismaAdapter));
    await moduleRef.close();
  });
});