import { Test, type TestingModule } from '@nestjs/testing';
import { DrivingIntelligenceJobRepository } from '@modules/vehicle-intelligence/driving-intelligence-jobs/driving-intelligence-jobs.repository';
import { DRIVING_INTELLIGENCE_BOOKING_RESOLUTION_PORT } from '@modules/vehicle-intelligence/ports/driving-intelligence-booking-resolution.port';
import { DrivingIntelligenceBookingResolutionModule } from './driving-intelligence-booking-resolution.module';
import { DrivingIntelligenceBookingResolutionPrismaAdapter } from './driving-intelligence-booking-resolution.adapter';
import { PrismaService } from '@shared/database/prisma.service';

describe('DrivingIntelligenceBookingResolution — scoped runtime DI', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [DrivingIntelligenceBookingResolutionModule],
      providers: [
        DrivingIntelligenceJobRepository,
        {
          provide: PrismaService,
          useValue: {
            vehicle: { findFirst: jest.fn() },
            vehicleTrip: { findFirst: jest.fn() },
            drivingAnalysisRun: { findFirst: jest.fn() },
            drivingIntelligenceJob: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            booking: { findFirst: jest.fn() },
          },
        },
      ],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('resolves DRIVING_INTELLIGENCE_BOOKING_RESOLUTION_PORT as adapter from the module', () => {
    const port = moduleRef.get(DRIVING_INTELLIGENCE_BOOKING_RESOLUTION_PORT);
    const adapter = moduleRef.get(DrivingIntelligenceBookingResolutionPrismaAdapter);
    expect(port).toBe(adapter);
    expect(port).toBeInstanceOf(DrivingIntelligenceBookingResolutionPrismaAdapter);
  });

  it('injects DRIVING_INTELLIGENCE_BOOKING_RESOLUTION_PORT into DrivingIntelligenceJobRepository', () => {
    const port = moduleRef.get(DRIVING_INTELLIGENCE_BOOKING_RESOLUTION_PORT);
    const jobRepo = moduleRef.get(DrivingIntelligenceJobRepository);
    expect(jobRepo).toBeInstanceOf(DrivingIntelligenceJobRepository);
    expect((jobRepo as unknown as { bookingResolution: unknown }).bookingResolution).toBe(port);
  });
});